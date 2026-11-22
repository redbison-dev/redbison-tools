/**
 * The picture, as an array of lines. Pure: state in, strings out.
 *
 * Every line is padded and truncated by its *visible* width, measured with the
 * colours stripped, because a line that counts escape codes as characters
 * wraps on a narrow terminal and shifts every row below it. The layout drops
 * parts of itself as the terminal narrows — the logo first, then the group
 * column, then the second key column — rather than wrapping, since a wrapped
 * full-screen interface is unreadable.
 *
 * The shape is owed to k9s and the other open-source terminal applications
 * that showed what command line UX can be: an information block and key
 * hints at the top with the logo on the right, a framed table with a counted
 * title, and a crumb trail along the bottom.
 */
import { TOOLS, type CliTool } from '../catalog';
import { optionsFor } from '../options';
import { EXAMPLES } from '../examples';
import {
  GROUPS,
  commandFor,
  currentExtra,
  optionLine,
  selectedTool,
  visibleTools,
  type State,
} from './state';
import { plain, type Paint, type Theme } from './theme';

export type Size = { width: number; height: number };

/* The logo, 6 rows of 4-wide glyphs. Block letters rather than a bison,
 * because every terminal can draw a filled rectangle and half of them cannot
 * draw a curve the same way twice. */
const GLYPHS: Record<string, string[]> = {
  R: ['███ ', '█  █', '███ ', '█ █ ', '█  █', '█  █'],
  E: ['████', '█   ', '███ ', '█   ', '█   ', '████'],
  D: ['███ ', '█  █', '█  █', '█  █', '█  █', '███ '],
  B: ['███ ', '█  █', '███ ', '█  █', '█  █', '███ '],
  I: ['███ ', ' █  ', ' █  ', ' █  ', ' █  ', '███ '],
  S: [' ███', '█   ', '███ ', '   █', '   █', '███ '],
  O: ['███ ', '█  █', '█  █', '█  █', '█  █', '███ '],
  N: ['█  █', '██ █', '█ ██', '█  █', '█  █', '█  █'],
};

function word(letters: string): string[] {
  return [0, 1, 2, 3, 4, 5].map((row) =>
    [...letters].map((ch) => GLYPHS[ch][row]).join(' '),
  );
}

/*
 * `.dev`, at half the height of the word it follows.
 *
 * Drawn on the same six-row grid and then folded in two with half blocks:
 * ▀ for a pixel in the top half of the cell, ▄ for the bottom, █ for both.
 * That keeps the full vertical detail of the letterforms in three character
 * rows, which a three-row font drawn directly cannot — a 'd' and an 'e' three
 * cells tall are the same blob. Tried both; this is the one that reads.
 */
const SMALL_PIXELS: Record<string, string[]> = {
  '.': ['.', '.', '.', '.', '.', '#'],
  d: ['..#', '..#', '###', '#.#', '#.#', '###'],
  e: ['...', '...', '###', '#.#', '##.', '.##'],
  v: ['...', '...', '#.#', '#.#', '#.#', '.#.'],
};

function fold(rows: string[]): string[] {
  const out: string[] = [];
  for (let r = 0; r < rows.length; r += 2) {
    let line = '';
    for (let c = 0; c < rows[r].length; c += 1) {
      const top = rows[r][c] === '#';
      const bottom = rows[r + 1][c] === '#';
      line += top && bottom ? '█' : top ? '▀' : bottom ? '▄' : ' ';
    }
    out.push(line);
  }
  return out;
}

function smallWord(letters: string): string[] {
  const glyphs = [...letters].map((ch) => fold(SMALL_PIXELS[ch]));
  return [0, 1, 2].map((row) => glyphs.map((g) => g[row]).join(' '));
}

/**
 * The word in block capitals with `.dev` sitting on its baseline.
 *
 * Every row is padded to the same width: the header places the logo by the
 * width of its first row, and ragged rows would step the whole block
 * diagonally across the top of the screen.
 */
function lockup(letters: string, suffix?: string): string[] {
  const main = word(letters);
  if (!suffix) return main;
  const small = smallWord(suffix);
  const width = main[0].length + 1 + Math.max(...small.map((s) => s.length));
  return main.map((row, i) => {
    const tail = i >= 3 ? ` ${small[i - 3]}` : '';
    return (row + tail).padEnd(width, ' ');
  });
}

const LOGO_FULL = lockup('REDBISON', '.dev');
const LOGO_SHORT = lockup('RB');

export const HEADER_HEIGHT = 7;

const visible = (s: string) => plain(s).length;

/*
 * A newline inside a line is a frame one line too tall, and the terminal
 * scrolls and smears every frame after it. Nineteen of the hundred tools have
 * a multi-line example, which the input prompt preloads, so this is the
 * normal case rather than an exotic one. Tabs move the cursor an unknowable
 * distance, so they go too. Replaced visibly rather than dropped: the text
 * being edited really does contain a newline and the user should see that.
 */
const NEWLINE = '⏎';

export function oneLine(s: string): string {
  return s.replace(/\r?\n/g, NEWLINE).replace(/\t/g, ' ').replace(/[\x00-\x1f\x7f]/g, '');
}

function trunc(raw: string, width: number): string {
  if (width <= 0) return '';
  const s = oneLine(raw);
  return s.length <= width ? s : `${s.slice(0, Math.max(0, width - 1))}…`;
}

const pad = (s: string, width: number) => s + ' '.repeat(Math.max(0, width - s.length));

/** Fit a painted line to the terminal: never longer, always exactly as wide. */
function fit(segments: { text: string; paint?: Paint }[], width: number): string {
  let used = 0;
  const out: string[] = [];
  for (const seg of segments) {
    if (used >= width) break;
    const text = trunc(seg.text, width - used);
    if (!text) continue;
    out.push(seg.paint ? seg.paint(text) : text);
    used += text.length;
  }
  if (used < width) out.push(' '.repeat(width - used));
  return out.join('');
}

/* ------------------------------------------------------------------ header */

function infoBlock(state: State, theme: Theme, version: string): { text: string; paint?: Paint }[][] {
  // An extra brings its own figures: a score, a tally, a lap count. The rows
  // that describe the catalogue would all be noise under a game of snake.
  const here = currentExtra(state);
  const extraRows: [string, string, Paint][] = here
    ? [
        ['Catalogue', 'redbison.dev', theme.infoVal] as [string, string, Paint],
        ['Screen', here.extra.title, theme.infoVal] as [string, string, Paint],
        ...(here.extra.info?.(here.es) ?? []).slice(0, 3).map(([k, v]): [string, string, Paint] => [k, v, theme.infoVal]),
        ['Version', version, theme.infoVal] as [string, string, Paint],
      ].slice(0, 6)
    : [];
  const rows: [string, string, Paint][] = here
    ? extraRows
    : [
        ['Catalogue', 'redbison.dev', theme.infoVal],
        ['Tools', String(TOOLS.length), theme.infoVal],
        ['Showing', `${state.group ?? (state.localOnly ? 'local only' : 'all tools')} [${visibleTools(state).length}]`, theme.infoVal],
        ['Filter', state.filter ? `/${state.filter}` : '—', state.filter ? theme.filter : theme.dim],
        ['Offline', state.offline ? 'on, nothing is sent' : 'off', state.offline ? theme.ok : theme.dim],
        ['Version', version, theme.infoVal],
      ];
  return rows.map(([k, v, paint]) => [
    { text: pad(`${k}:`, 11), paint: theme.infoKey },
    { text: v, paint },
  ]);
}

const MENU_COL = 26;

function menuBlock(
  state: State,
  theme: Theme,
): { left: { text: string; paint?: Paint }[][]; right: { text: string; paint?: Paint }[][] } {
  const group = (n: number) => GROUPS[n - 1] ?? '';
  // Both columns start at a fixed offset, so the hints read as two columns
  // rather than as ragged text. 26 fits the longest category name with a gap
  // after it; the right column's labels are kept inside 14.
  const cell = (k: string, label: string, width: number, paint: Paint) => [
    { text: `<${k}> `, paint },
    { text: pad(trunc(label, width - 6), width - 4), paint: theme.menuText },
  ];
  const num = (k: string, label: string) => cell(k, label, MENU_COL, theme.menuNumKey);
  const key = (k: string, label: string) => cell(k, label, MENU_COL, theme.menuKey);
  const right = (k: string, label: string) => cell(k, label, MENU_RIGHT, theme.menuKey);

  const left = [
    num('0', 'all tools'),
    num('1', group(1)),
    num('2', group(2)),
    num('3', group(3)),
    num('4', group(4)),
    key('f', 'all categories'),
  ];
  /*
   * This column is the first thing the layout drops: it needs 133 columns to
   * appear at all, because the logo is kept ahead of it. So nothing may live
   * only here — a key whose only home is this column is a key most people
   * never see. The always-visible strip is on the bottom line instead.
   */
  const hints = [
    right('↵', state.mode === 'docs' ? 'run this tool' : 'run'),
    right('d', 'documentation'),
    right('/', 'search'),
    right(':', 'command'),
    right('o', 'web page'),
    right('?', 'every key'),
  ];
  return { left, right: hints };
}

const INFO_WIDTH = 34;
const MENU_RIGHT = 19;

/*
 * One column kept clear to the right of the logo.
 *
 * Without it the logo ended in the terminal's last cell: the line measured
 * exactly right, every test passed, and the final ▀ of the `v` in `.dev` was
 * clipped on screen. The header is already inset one space on the left, so
 * this is the margin it always should have had on the right.
 */
const RIGHT_MARGIN = 1;

/**
 * What fits across the top at this width.
 *
 * The logo is kept ahead of the second column of key hints, which repeat what
 * the help page and the panes already say, and every piece is dropped whole
 * rather than truncated: "<o> open on the we…" reads as a bug.
 */
export function headerFit(width: number): { menu: 0 | 1 | 2; logo: null | 'short' | 'full' } {
  const full = LOGO_FULL[0].length;
  const short = LOGO_SHORT[0].length;

  // Every budget below counts the margin, so the width that decides a logo
  // fits is the same width that draws it. Counting it in one place only is
  // how a logo gets promised here and then silently dropped by header().
  const logo: null | 'short' | 'full' =
    width >= INFO_WIDTH + MENU_COL + full + 1 + RIGHT_MARGIN
      ? 'full'
      : width >= INFO_WIDTH + short + 1 + RIGHT_MARGIN
        ? 'short'
        : null;
  const logoWidth = logo === 'full' ? full : logo === 'short' ? short : 0;
  const logoSpan = logoWidth ? logoWidth + RIGHT_MARGIN : 0;

  const menu: 0 | 1 | 2 =
    width >= INFO_WIDTH + MENU_COL + MENU_RIGHT + logoSpan + 1
      ? 2
      : width >= INFO_WIDTH + MENU_COL + logoSpan + 1
        ? 1
        : 0;
  return { menu, logo };
}

function header(state: State, theme: Theme, size: Size, version: string): string[] {
  const info = infoBlock(state, theme, version);
  const menu = menuBlock(state, theme);
  const shape = headerFit(size.width);
  const logo = shape.logo === 'full' ? LOGO_FULL : shape.logo === 'short' ? LOGO_SHORT : null;
  const logoWidth = logo ? logo[0].length : 0;

  const lines: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    const segs: { text: string; paint?: Paint }[] = [{ text: ' ' }];
    const infoRow = info[i] ?? [];
    let used = 1;
    for (const s of infoRow) {
      segs.push(s);
      used += s.text.length;
    }
    if (shape.menu >= 1) {
      segs.push({ text: ' '.repeat(Math.max(1, INFO_WIDTH - used + 1)) });
      used = INFO_WIDTH + 1;
      for (const s of menu.left[i] ?? []) {
        segs.push(s);
        used += s.text.length;
      }
    }
    if (shape.menu === 2) {
      for (const s of menu.right[i] ?? []) {
        segs.push(s);
        used += s.text.length;
      }
    }
    if (logo) {
      const gap = size.width - used - logoWidth - RIGHT_MARGIN;
      if (gap >= 0) {
        segs.push({ text: ' '.repeat(gap) });
        segs.push({ text: logo[i], paint: theme.logo });
      }
    }
    lines.push(fit(segs, size.width));
  }
  lines.push(' '.repeat(size.width));
  return lines;
}

/* ------------------------------------------------------------------- frame */

function titleBar(state: State, theme: Theme, width: number): string {
  const here = currentExtra(state);
  const what = here
    ? here.extra.title
    : state.mode === 'groups' ? 'Categories' : state.mode === 'help' ? 'Help' : state.mode === 'docs' ? 'Docs' : state.mode === 'output' ? 'Output' : state.mode === 'input' ? 'Input' : 'Tools';
  const scope = here
    ? `:${here.extra.id}`
    : state.mode === 'help'
      ? 'keys'
      : state.mode === 'docs' || state.mode === 'output' || state.mode === 'input'
        ? state.selected ?? ''
        : state.mode === 'groups'
          ? 'all'
          : state.group ?? (state.localOnly ? 'local' : 'all');
  const count =
    state.mode === 'groups' ? GROUPS.length : state.mode === 'list' ? visibleTools(state).length : null;

  const segs: { text: string; paint?: Paint }[] = [
    { text: '┌─ ', paint: theme.border },
    { text: what, paint: theme.title },
    { text: '(', paint: theme.border },
    { text: scope, paint: theme.titleHi },
    { text: ')', paint: theme.border },
  ];
  if (count !== null) segs.push({ text: `[${count}]`, paint: theme.counter });
  if (state.filter) segs.push({ text: ` /${state.filter}`, paint: theme.filter });
  segs.push({ text: ' ' });

  const used = segs.reduce((n, s) => n + s.text.length, 0);
  segs.push({ text: '─'.repeat(Math.max(0, width - used - 1)), paint: theme.border });
  segs.push({ text: '┐', paint: theme.border });
  return fit(segs, width);
}

function bottomBar(theme: Theme, width: number): string {
  return fit([{ text: `└${'─'.repeat(Math.max(0, width - 2))}┘`, paint: theme.border }], width);
}

/** One framed content line: border, content, border. */
function framed(content: { text: string; paint?: Paint }[], theme: Theme, width: number): string {
  const inner = width - 2;
  let used = 0;
  const segs: { text: string; paint?: Paint }[] = [{ text: '│', paint: theme.border }];
  for (const s of content) {
    if (used >= inner) break;
    const text = trunc(s.text, inner - used);
    if (!text) continue;
    segs.push({ text, paint: s.paint });
    used += text.length;
  }
  if (used < inner) segs.push({ text: ' '.repeat(inner - used) });
  segs.push({ text: '│', paint: theme.border });
  return fit(segs, width);
}

/* -------------------------------------------------------------------- list */

type Columns = { name: number; group: number };

function columnsFor(width: number): Columns {
  const inner = width - 4;
  const name = Math.min(22, Math.max(12, Math.floor(inner * 0.2)));
  const group = inner >= 78 ? 21 : 0;
  return { name, group };
}

function toolRow(tool: CliTool, cols: Columns, theme: Theme, cursor: boolean): { text: string; paint?: Paint }[] {
  const cells: { text: string; paint?: Paint }[] = [
    { text: ` ${pad(trunc(tool.id, cols.name), cols.name)} `, paint: cursor ? undefined : theme.row },
  ];
  if (cols.group) cells.push({ text: `${pad(trunc(tool.group, cols.group - 1), cols.group)} `, paint: cursor ? undefined : theme.dim });
  cells.push({ text: tool.summary, paint: cursor ? undefined : theme.body });
  return cells;
}

function listBody(state: State, theme: Theme, width: number, rows: number): string[] {
  const cols = columnsFor(width);
  const out: string[] = [];

  const headerCells: { text: string; paint?: Paint }[] = [
    { text: ` ${pad('NAME', cols.name)} `, paint: theme.header },
  ];
  if (cols.group) headerCells.push({ text: `${pad('CATEGORY', cols.group)} `, paint: theme.header });
  headerCells.push({ text: 'WHAT IT DOES', paint: theme.header });
  out.push(framed(headerCells, theme, width));

  const tools = visibleTools(state);
  const body = rows - 1;
  if (!tools.length) {
    out.push(framed([{ text: '  Nothing matches that. esc clears the filter.', paint: theme.warn }], theme, width));
    while (out.length < rows) out.push(framed([{ text: '' }], theme, width));
    return out;
  }

  /*
   * The cursor decides the window, not the stored scroll. The terminal can be
   * resized between keystrokes, and a redraw that only clamps `scroll` showed
   * a page with no highlighted row on it at all — while enter still ran the
   * tool that was no longer on screen.
   */
  let start = Math.max(0, Math.min(state.scroll, Math.max(0, tools.length - body)));
  if (state.cursor < start) start = state.cursor;
  if (state.cursor >= start + body) start = state.cursor - body + 1;
  start = Math.max(0, Math.min(start, Math.max(0, tools.length - body)));

  for (let i = 0; i < body; i += 1) {
    const tool = tools[start + i];
    if (!tool) {
      out.push(framed([{ text: '' }], theme, width));
      continue;
    }
    const isCursor = start + i === state.cursor;
    const cells = toolRow(tool, cols, theme, isCursor);
    if (isCursor) {
      // One painted block, so the highlight runs the full width. Building it
      // from coloured cells leaves gaps where the padding falls.
      const text = cells.map((c) => c.text).join('');
      out.push(framed([{ text: pad(trunc(text, width - 2), width - 2), paint: theme.cursor }], theme, width));
    } else {
      out.push(framed(cells, theme, width));
    }
  }
  return out;
}

function groupBody(state: State, theme: Theme, width: number, rows: number): string[] {
  const out: string[] = [];
  out.push(
    framed(
      [
        { text: ` ${pad('#', 3)}${pad('CATEGORY', 26)}`, paint: theme.header },
        { text: `${pad('TOOLS', 7)}${pad('LOCAL', 7)}WHAT IS IN IT`, paint: theme.header },
      ],
      theme,
      width,
    ),
  );
  for (let i = 0; i < rows - 1; i += 1) {
    const group = GROUPS[state.scroll + i];
    if (!group) {
      out.push(framed([{ text: '' }], theme, width));
      continue;
    }
    const inGroup = TOOLS.filter((t) => t.group === group);
    const local = inGroup.filter((t) => t.offline).length;
    const sample = inGroup.slice(0, 4).map((t) => t.id).join(', ');
    const text = ` ${pad(String(GROUPS.indexOf(group) + 1), 3)}${pad(group, 26)}${pad(String(inGroup.length), 7)}${pad(String(local), 7)}${sample}`;
    if (state.scroll + i === state.cursor) {
      out.push(framed([{ text: pad(trunc(text, width - 2), width - 2), paint: theme.cursor }], theme, width));
    } else {
      out.push(
        framed(
          [
            { text: ` ${pad(String(GROUPS.indexOf(group) + 1), 3)}`, paint: theme.menuNumKey },
            { text: pad(group, 26), paint: theme.row },
            { text: pad(String(inGroup.length), 7), paint: theme.counter },
            { text: pad(String(local), 7), paint: theme.local },
            { text: sample, paint: theme.body },
          ],
          theme,
          width,
        ),
      );
    }
  }
  return out;
}

/* -------------------------------------------------------- reading the panes */

function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  for (const raw of text.split('\n')) {
    if (raw.length <= width) {
      out.push(raw);
      continue;
    }
    let line = raw;
    while (line.length > width) {
      let cut = line.lastIndexOf(' ', width);
      if (cut <= 0) cut = width;
      out.push(line.slice(0, cut));
      line = line.slice(cut).replace(/^ /, '');
    }
    out.push(line);
  }
  return out;
}

type Doc = { text: string; paint?: Paint }[];

export function docLines(state: State, theme: Theme, width: number): Doc[] {
  const tool = selectedTool(state);
  if (!tool) return [[{ text: 'Nothing selected.', paint: theme.warn }]];
  const lines: Doc[] = [];
  const kv = (k: string, v: string) => lines.push([{ text: `  ${pad(k, 16)}`, paint: theme.docKey }, { text: v, paint: theme.docVal }]);

  lines.push([{ text: `  ${tool.title}`, paint: theme.title }]);
  for (const l of wrap(tool.summary, width - 4)) lines.push([{ text: `  ${l}`, paint: theme.body }]);
  lines.push([{ text: '' }]);

  // The line y copies, down to the options currently set, so what is on
  // screen and what lands on the clipboard cannot disagree.
  kv('Command', commandFor(tool.id, state.options));
  kv('Category', tool.group);
  kv(
    'Where it runs',
    tool.offline ? 'your machine — the input never leaves it' : 'redbison.dev — the input is sent, nothing is stored',
  );
  kv('Input', tool.kind === 'insert' ? 'none: it generates' : 'an argument, a file, or a pipe');
  kv('On the web', tool.url);
  if (tool.mcp) kv('Over MCP', tool.mcp.name);

  const opts = optionsFor(tool.id);
  lines.push([{ text: '' }]);
  if (opts.length) {
    lines.push([{ text: '  Options', paint: theme.title }]);
    for (const o of opts) {
      const bits: string[] = [o.describe];
      if (o.values?.length) bits.push(`one of ${o.values.map((v) => v.value).join(', ')}`);
      if (o.defaultValue !== undefined) bits.push(`default ${JSON.stringify(o.defaultValue)}`);
      if (o.required) bits.push('required');
      lines.push([
        { text: `  ${pad(`--${o.key}`, 16)}`, paint: theme.docKey },
        { text: bits.join('; '), paint: theme.body },
      ]);
    }
    lines.push([{ text: '' }]);
    lines.push([
      { text: '  Now set to  ', paint: theme.docKey },
      { text: optionLine(state.options) || '(defaults)', paint: theme.docVal },
      { text: '   p edits them', paint: theme.dim },
    ]);
    lines.push([{ text: '' }]);
  } else {
    lines.push([{ text: '  Takes no options.', paint: theme.dim }]);
    lines.push([{ text: '' }]);
  }

  const ex = EXAMPLES[tool.id];
  if (ex) {
    lines.push([{ text: '  Example', paint: theme.title }]);
    const flags = Object.entries(ex.args ?? {}).map(([k, v]) => `--${k} ${v}`).join(' ');
    const arg = tool.kind === 'insert' ? '' : ` ${JSON.stringify(ex.input.split('\n')[0].slice(0, Math.max(12, width - 40)))}`;
    lines.push([{ text: `  $ redbison ${tool.id}${flags ? ` ${flags}` : ''}${arg}`, paint: theme.ok }]);
    for (const l of ex.output.split('\n').slice(0, 8)) {
      for (const w of wrap(l, width - 6)) lines.push([{ text: `  ${w}`, paint: theme.body }]);
    }
    lines.push([{ text: '' }]);
  }

  lines.push([
    { text: '  enter', paint: theme.menuKey },
    { text: ' run it   ', paint: theme.body },
    { text: 'e', paint: theme.menuKey },
    { text: ' edit the input   ', paint: theme.body },
    { text: 'p', paint: theme.menuKey },
    { text: ' options   ', paint: theme.body },
    { text: 'y', paint: theme.menuKey },
    { text: ' copy the command   ', paint: theme.body },
    { text: 'o', paint: theme.menuKey },
    { text: ' web   ', paint: theme.body },
    { text: 'esc', paint: theme.menuKey },
    { text: ' back', paint: theme.body },
  ]);
  return lines;
}

function outputLines(state: State, theme: Theme, width: number): Doc[] {
  if (state.running) return [[{ text: '  Running…', paint: theme.ok }]];
  const out = state.output;
  if (!out) return [[{ text: '  Nothing has been run yet.', paint: theme.dim }]];
  const paint = out.failed ? theme.error : theme.body;
  const lines: Doc[] = [
    [
      { text: `  ${out.tool}`, paint: theme.title },
      { text: out.failed ? '  refused the input' : `  answered in ${out.ms}ms`, paint: out.failed ? theme.error : theme.ok },
    ],
    [{ text: '' }],
  ];
  for (const l of wrap(out.text, width - 4)) lines.push([{ text: `  ${l}`, paint }]);
  lines.push([{ text: '' }]);
  lines.push([
    { text: '  y', paint: theme.menuKey },
    { text: out.failed ? ' copy the message   ' : ' copy the answer   ', paint: theme.body },
    { text: 'e', paint: theme.menuKey },
    { text: ' change the input   ', paint: theme.body },
    { text: 'enter', paint: theme.menuKey },
    { text: ' run again   ', paint: theme.body },
    { text: 'esc', paint: theme.menuKey },
    { text: ' back', paint: theme.body },
  ]);
  return lines;
}

function inputLines(state: State, theme: Theme, width: number): Doc[] {
  const tool = selectedTool(state);
  if (!tool) return [[{ text: 'Nothing selected.', paint: theme.warn }]];
  const editing = state.prompt?.kind ?? 'input';
  const lines: Doc[] = [
    [{ text: `  ${tool.title}`, paint: theme.title }],
    [{ text: `  ${tool.summary}`, paint: theme.body }],
    [{ text: '' }],
    [
      { text: '  Options  ', paint: theme.docKey },
      { text: optionLine(state.options) || '(defaults)', paint: editing === 'options' ? theme.ok : theme.docVal },
    ],
    [{ text: '' }],
    [{ text: '  Input', paint: theme.docKey }],
  ];
  for (const l of wrap(state.input || '(empty)', width - 4)) {
    lines.push([{ text: `  ${l}`, paint: state.input ? theme.docVal : theme.dim }]);
  }
  lines.push([{ text: '' }]);
  lines.push([
    { text: '  enter', paint: theme.menuKey },
    { text: ' run   ', paint: theme.body },
    { text: 'ctrl-u', paint: theme.menuKey },
    { text: ' clear   ', paint: theme.body },
    { text: 'esc', paint: theme.menuKey },
    { text: ' back', paint: theme.body },
  ]);
  if (!tool.offline) {
    lines.push([{ text: '' }]);
    lines.push([
      {
        text: state.offline
          ? '  Offline is on and this tool runs on the server, so it will refuse.'
          : '  This tool sends the input to redbison.dev. Nothing else is sent.',
        paint: state.offline ? theme.warn : theme.dim,
      },
    ]);
  }
  return lines;
}

const KEYS: [string, string][] = [
  ['↑ ↓ j k', 'move'],
  ['g / G', 'first / last'],
  ['ctrl-d ctrl-u', 'half a page'],
  ['pgup pgdn', 'a page'],
  ['enter', 'run the selected tool'],
  ['d', 'documentation for it'],
  ['e', 'edit the input before running'],
  ['p', 'edit the options'],
  ['y', 'copy the answer, or the command when there is no answer'],
  ['o', 'open the tool on redbison.dev'],
  ['/', 'search as you type, by keyword as well as name; esc clears it'],
  [':', 'command: a tool id, a category, offline, help, q'],
  ['0 - 9', 'jump to a category; 0 is all of them'],
  ['f', 'the category list'],
  ['l', 'only the tools that need no network'],
  ['x', 'offline: refuse to send anything'],
  ['?', 'this page'],
  ['q, ctrl-c', 'quit'],
];

function helpLines(theme: Theme): Doc[] {
  const lines: Doc[] = [
    [{ text: '  Keys', paint: theme.title }],
    [{ text: '' }],
  ];
  for (const [k, what] of KEYS) {
    lines.push([
      { text: `  ${pad(k, 16)}`, paint: theme.menuKey },
      { text: what, paint: theme.body },
    ]);
  }
  lines.push([{ text: '' }]);
  lines.push([{ text: '  Extras', paint: theme.title }]);
  lines.push([
    { text: '  :games', paint: theme.menuKey },
    { text: '  a clock, a stopwatch, a coin, a splitter, and four games', paint: theme.body },
  ]);
  lines.push([
    { text: '  ', paint: theme.menuKey },
    { text: '  each has its own command too: :snake, :clock, :random 1 100 3', paint: theme.dim },
  ]);
  lines.push([{ text: '' }]);
  lines.push([{ text: '  Everything here is also a command line:', paint: theme.title }]);
  lines.push([{ text: '    redbison json-format --indent 4 @data.json', paint: theme.ok }]);
  lines.push([{ text: '    redbison --list | grep local', paint: theme.ok }]);
  lines.push([{ text: '' }]);
  lines.push([{ text: '  Docs: https://redbison.dev/cli', paint: theme.docVal }]);
  return lines;
}

function paneBody(state: State, theme: Theme, width: number, rows: number): string[] {
  const content =
    state.mode === 'help'
      ? helpLines(theme)
      : state.mode === 'output'
        ? outputLines(state, theme, width)
        : state.mode === 'input'
          ? inputLines(state, theme, width)
          : docLines(state, theme, width);

  const start = Math.max(0, Math.min(state.pane, Math.max(0, content.length - rows)));
  const out: string[] = [];
  for (let i = 0; i < rows; i += 1) {
    out.push(framed(content[start + i] ?? [{ text: '' }], theme, width));
  }
  return out;
}

/* ------------------------------------------------------------------ extras */

/**
 * An extra draws its own content; the chrome around it — the frame, the
 * title, the crumbs, the key strip — stays this module's, so a game sits in
 * exactly the box a tool list does.
 */
function extraBody(state: State, theme: Theme, width: number, rows: number): string[] {
  const here = currentExtra(state);
  if (!here) return Array.from({ length: rows }, () => framed([{ text: '' }], theme, width));
  const content = here.extra.render(here.es, theme, width, rows);
  const out: string[] = [];
  for (let i = 0; i < rows; i += 1) {
    out.push(framed(content[i] ?? [{ text: '' }], theme, width));
  }
  return out;
}

/* ------------------------------------------------------------------ footer */

/**
 * The keys that have to be visible at every width.
 *
 * The header's second hint column needs 133 columns before it is drawn, so on
 * an ordinary 80- or 120-column terminal the top of the screen offers category
 * numbers and nothing else: no run, no docs, and no copy. That is how the copy
 * key came to be asked for by someone who already had it. These go on the
 * bottom line, which is one row the frame already spends, right-aligned so the
 * crumb trail keeps the left.
 */
function keyStrip(state: State): [string, string][] {
  const here = currentExtra(state);
  if (here) return here.extra.hints?.(here.es) ?? [['esc', 'back']];
  if (state.mode === 'help') return [['esc', 'back'], ['q', 'quit']];
  // Named for what it copies right now, because "copy" alone left people
  // guessing whether it meant the answer or the row.
  const copy: [string, string] = ['y', state.mode === 'output' && state.output ? 'copy answer' : 'copy cmd'];
  return [['↵', 'run'], ['d', 'docs'], copy, ['/', 'search'], ['?', 'keys']];
}

function crumbs(state: State, theme: Theme, width: number): string {
  const here = currentExtra(state);
  const trail: string[] = here ? ['extras', here.extra.id] : [state.mode === 'groups' ? 'categories' : 'tools'];
  if (!here) {
    if (state.group) trail.push(state.group.toLowerCase());
    if (state.localOnly) trail.push('local');
    if (state.selected && state.mode !== 'list' && state.mode !== 'groups') trail.push(state.selected);
    if (state.mode === 'help') trail.push('help');
  }

  const segs: { text: string; paint?: Paint }[] = [];
  trail.forEach((c, i) => {
    const last = i === trail.length - 1;
    segs.push({ text: `<${c}>`, paint: last ? theme.crumbActive : theme.crumb });
    segs.push({ text: ' ' });
  });

  const used = segs.reduce((n, s) => n + s.text.length, 0);
  const status = state.status;
  if (status && used < width - 4) {
    const paint =
      status.kind === 'error' ? theme.error : status.kind === 'warn' ? theme.warn : status.kind === 'ok' ? theme.ok : theme.dim;
    const room = width - used - 1;
    segs.push({ text: trunc(status.text, room), paint });
    return fit(segs, width);
  }

  // No status to report, so the room goes to the keys. Dropped whole from the
  // left when it does not fit, rather than truncated: "y cop…" reads as a bug.
  const strip = keyStrip(state);
  for (let from = 0; from < strip.length; from += 1) {
    const shown = strip.slice(from);
    const needed = shown.reduce((n, [k, label]) => n + k.length + label.length + 3, 0);
    if (used + needed + 1 > width) continue;
    segs.push({ text: ' '.repeat(width - used - needed - 1) });
    for (const [k, label] of shown) {
      segs.push({ text: k, paint: theme.menuKey });
      segs.push({ text: ` ${label}  `, paint: theme.dim });
    }
    break;
  }
  return fit(segs, width);
}

function promptLine(state: State, theme: Theme, width: number): string | null {
  if (!state.prompt) return null;
  const { kind, text } = state.prompt;
  const sign = kind === 'filter' ? '/' : kind === 'command' ? '>' : kind === 'options' ? 'options> ' : 'input> ';
  const hint =
    kind === 'command'
      ? '   a tool id, a category, offline, help, q'
      : kind === 'filter'
        ? '   a name, or what you want it to do; enter keeps it, esc clears'
        : kind === 'options'
          ? '   key=value, space separated'
          : '   enter runs it';
  return fit(
    [
      { text: ' ' },
      { text: sign, paint: kind === 'filter' ? theme.filter : theme.prompt },
      { text, paint: theme.docVal },
      { text: '█', paint: theme.prompt },
      { text: hint, paint: theme.dim },
    ],
    width,
  );
}

/* -------------------------------------------------------------------- main */

/** How many tool rows the table has room for, which the reducer needs too. */
export function pageSize(size: Size): number {
  const head = size.height >= 18 ? HEADER_HEIGHT : 0;
  return Math.max(1, size.height - head - 4);
}

export function render(state: State, theme: Theme, size: Size, version: string): string[] {
  // The contract is "exactly as wide as the terminal". A floor here meant a
  // narrower terminal got lines too long for it, which wraps, which makes the
  // frame taller than the screen — the failure this whole module is arranged
  // to avoid. Four is where the borders themselves stop fitting.
  const width = Math.max(4, size.width);
  const height = Math.max(6, size.height);
  const lines: string[] = [];

  if (height >= 18) lines.push(...header(state, theme, { width, height }, version));

  const prompt = promptLine(state, theme, width);
  if (prompt) lines.push(prompt);

  const bodyRows = Math.max(1, height - lines.length - 3);
  lines.push(titleBar(state, theme, width));
  if (state.mode === 'list') lines.push(...listBody(state, theme, width, bodyRows));
  else if (state.mode === 'groups') lines.push(...groupBody(state, theme, width, bodyRows));
  else if (state.mode === 'extra') lines.push(...extraBody(state, theme, width, bodyRows));
  else lines.push(...paneBody(state, theme, width, bodyRows));
  lines.push(bottomBar(theme, width));
  lines.push(crumbs(state, theme, width));

  // The frame is a fixed size: too many lines scroll the terminal and leave a
  // trail of old frames, too few leave the previous frame's tail on screen.
  while (lines.length < height) lines.push(' '.repeat(width));
  return lines.slice(0, height).map((l) => (visible(l) > width ? fit([{ text: plain(l) }], width) : l));
}
