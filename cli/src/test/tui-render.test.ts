/**
 * The frame, checked as a picture rather than as a string.
 *
 * Two invariants carry most of the weight. A frame is exactly as many lines as
 * the terminal is tall, and no line is wider than it is: break either and the
 * terminal wraps, every row below shifts, and the next frame paints over the
 * mess rather than replacing it — which looks like a dozen different bugs and
 * is always this one. The width has to be measured with the colours stripped,
 * since that is the width the terminal sees.
 */
import { describe, it, expect } from 'vitest';
import { TOOLS } from '../catalog';
import { docLines, headerFit, pageSize, render } from '../tui/render';
import { makeTheme, plain } from '../tui/theme';
import {
  GROUPS,
  applyResult,
  initialState,
  reduce,
  visibleTools,
  type Key,
  type State,
} from '../tui/state';

const theme = makeTheme('none');
const colour = makeTheme('true');
const VERSION = '9.9.9';

const key = (name: string, extra: Partial<Key> = {}): Key => ({ name, seq: name, ...extra });
const press = (state: State, names: (string | Key)[], page = 20): State => {
  let s = state;
  for (const k of names) s = reduce(s, typeof k === 'string' ? key(k) : k, page).state;
  return s;
};
const type = (text: string): Key[] => [...text].map((c) => ({ name: c, seq: c }));

const frame = (s: State, width = 120, height = 32, t = theme) => render(s, t, { width, height }, VERSION);
const text = (s: State, width = 120, height = 32) => frame(s, width, height).join('\n');

/* Every terminal anyone is likely to have, plus two nobody should. */
const SIZES: [number, number][] = [
  [200, 60],
  [120, 32],
  [104, 30],
  [90, 26],
  [80, 24],
  [60, 20],
  [46, 16],
  [30, 10],
  [20, 6],
];

describe('the frame fits the terminal', () => {
  const states: [string, State][] = [
    ['the list', initialState()],
    ['filtered', press(initialState(), ['/', ...type('json')])],
    ['categories', press(initialState(), ['f'])],
    ['docs', press(initialState(), ['d'])],
    ['input', press(initialState(), ['return'])],
    ['output', applyResult(press(initialState(), ['return']), { text: 'x'.repeat(400), failed: false, ms: 2 })],
    ['help', press(initialState(), ['?'])],
    ['a command', press(initialState(), [':', ...type('offline')])],
  ];

  for (const [what, state] of states) {
    for (const [width, height] of SIZES) {
      it(`${what} at ${width}x${height}`, () => {
        for (const t of [theme, colour]) {
          const lines = render(state, t, { width, height }, VERSION);
          expect(lines).toHaveLength(Math.max(6, height));
          for (const line of lines) expect(plain(line).length).toBeLessThanOrEqual(Math.max(28, width));
        }
      });
    }
  }
});

describe('what the header says', () => {
  it('reports the catalogue, the tool count and the version', () => {
    const out = plain(text(initialState()));
    expect(out).toMatch(new RegExp(`Tools:\\s+${TOOLS.length}\\b`));
    // The local count came out of the header when 89 of 100 went local:
    // a near-constant is noise, and the docs pane says where each tool runs.
    expect(out).not.toContain('local)');
    expect(out).toContain(VERSION);
    expect(out).toContain('redbison.dev');
  });

  it('counts what the filter left, not the whole catalogue', () => {
    const s = press(initialState(), ['/', ...type('base64')]);
    const out = plain(text(s));
    expect(out).toContain(`[${visibleTools(s).length}]`);
    expect(out).not.toContain(`Tools(all)[${TOOLS.length}]`);
  });

  it('names the category it is showing', () => {
    expect(plain(text(press(initialState(), ['2'])))).toContain(`Tools(${GROUPS[1]})`);
  });

  it('says plainly when offline is on, because it changes what runs', () => {
    expect(plain(text(press(initialState(), ['x'])))).toContain('on, nothing is sent');
  });

  it('drops the logo and the second hint column before truncating either', () => {
    // The word with .dev on it is 53 columns, so a wide terminal gets
    // everything, a 120 keeps the logo and the first column of hints, and
    // narrower falls back to the monogram rather than a half-drawn word.
    expect(headerFit(200)).toEqual({ menu: 2, logo: 'full' });
    expect(headerFit(134)).toEqual({ menu: 2, logo: 'full' });
    expect(headerFit(120)).toEqual({ menu: 1, logo: 'full' });
    expect(headerFit(100)).toEqual({ menu: 2, logo: 'short' });
    expect(headerFit(80).menu).toBeLessThanOrEqual(1);
    expect(headerFit(60)).toEqual({ menu: 0, logo: 'short' });
    expect(headerFit(40).logo).toBeNull();
  });

  it('never puts the logo in the terminal\'s last cell', () => {
    /*
     * The bug this exists for was invisible to every other check: the line
     * measured exactly the right width, so the frame tests passed, and the
     * final ▀ of the v in .dev was clipped on screen anyway. A terminal's
     * last column is not a column to draw in. The header is already inset a
     * space on the left; this is the same margin on the right.
     */
    for (let width = 40; width <= 220; width += 1) {
      const shape = headerFit(width);
      if (!shape.logo) continue;
      const rows = frame(initialState(), width, 32, colour).slice(0, 6).map(plain);
      for (const [i, row] of rows.entries()) {
        expect(row.length, `width ${width} row ${i}`).toBe(width);
        expect(row.endsWith(' '), `width ${width} row ${i} touches the last cell`).toBe(true);
      }
      // And it is really the whole word, not a word that fits by being cut.
      expect(rows.join('\n'), `width ${width}`).not.toContain('…');
    }
  });

  it('draws the logo whenever headerFit promises one', () => {
    // The fit and the draw each had their own idea of the budget. When they
    // disagree the logo is promised and then silently not drawn, which looks
    // like the logo randomly disappearing at certain terminal widths.
    for (let width = 40; width <= 220; width += 1) {
      const shape = headerFit(width);
      if (!shape.logo) continue;
      const rows = frame(initialState(), width, 32, theme).slice(0, 6).map(plain);
      expect(rows.some((r) => r.includes('█')), `width ${width} promised ${shape.logo}`).toBe(true);
    }
  });

  it('starts every row of the logo in the same column', () => {
    /*
     * The bottom three rows are wider than the top three, because .dev hangs
     * off the end of them. The block is placed by the width of its widest
     * row, so unless the short rows are padded to match, the word steps
     * sideways down the screen. Nothing else notices: every line is still
     * the right length.
     */
    const wide = frame(initialState(), 200, 32);
    const starts = wide.slice(0, 6).map((l) => plain(l).indexOf('█'));
    expect(starts.every((s) => s > 0)).toBe(true);
    expect(new Set(starts).size).toBe(1);
  });

  it('gives the frame to the list when the terminal is short', () => {
    const short = frame(initialState(), 100, 14);
    expect(plain(short[0])).toContain('Tools(');
    expect(pageSize({ width: 100, height: 14 })).toBeGreaterThan(1);
  });
});

describe('the list', () => {
  it('shows a row per tool, without a where column', () => {
    const out = plain(text(initialState()));
    expect(out).toContain('json-format');
    expect(out).not.toContain('WHERE');
    expect(out).not.toMatch(/\bserver\b/);
  });

  it('paints the cursor row and only the cursor row', () => {
    const lines = frame(press(initialState(), ['down']), 120, 32, colour);
    const highlighted = lines.filter((l) => l.includes('\x1b[48;2;0;255;255m'));
    expect(highlighted).toHaveLength(1);
    expect(plain(highlighted[0])).toContain(visibleTools(initialState())[1].id);
  });

  it('keeps the highlight on the cursor once the list has scrolled', () => {
    /*
     * The row index inside the window is not the index in the list, and an
     * interface that confuses the two highlights one tool while enter runs
     * another. Nothing on screen would look wrong, which is what makes it
     * worth a test of its own: the unscrolled case passes either way.
     */
    const page = pageSize({ width: 120, height: 32 });
    for (const steps of [0, 5, 37, 74]) {
      const s = press(initialState(), Array(steps).fill('down'), page);
      const lines = frame(s, 120, 32, colour);
      const highlighted = lines.filter((l) => l.includes('\x1b[48;2;0;255;255m') && !plain(l).startsWith('<'));
      expect(highlighted, `${steps} rows down`).toHaveLength(1);
      expect(plain(highlighted[0]), `${steps} rows down`).toContain(visibleTools(s)[s.cursor].id);
    }
  });

  it('closes every colour it opens, so nothing leaks past the line', () => {
    for (const line of frame(initialState(), 120, 32, colour)) {
      const opens = (line.match(/\x1b\[(?:1m|38;2|48;2)/g) ?? []).length;
      const resets = (line.match(/\x1b\[0m/g) ?? []).length;
      expect(resets).toBeGreaterThanOrEqual(opens ? 1 : 0);
      if (opens) expect(line.endsWith(' ') || line.includes('\x1b[0m')).toBe(true);
    }
  });

  it('says so when the filter matches nothing instead of showing an empty box', () => {
    const out = plain(text(press(initialState(), ['/', ...type('qqqqq')])));
    expect(out).toContain('Nothing matches');
  });

  it('shows the row the cursor is on even far down the list', () => {
    const page = pageSize({ width: 120, height: 32 });
    const s = press(initialState(), Array(60).fill('down'), page);
    const wanted = visibleTools(s)[s.cursor].id;
    expect(plain(text(s))).toContain(wanted);
  });
});

describe('the panes', () => {
  it('documents the selected tool, with its source of truth on the web', () => {
    const s = press(initialState(), ['/', ...type('jwt-decode'), 'return', 'd']);
    const out = plain(text(s));
    expect(out).toContain('jwt-decode');
    expect(out).toContain('https://redbison.dev/');
    expect(out).toContain('Over MCP');
  });

  it('says where a tool runs, in the words the site uses', () => {
    const local = press(initialState(), ['/', ...type('json-format'), 'return', 'd']);
    expect(plain(text(local))).toContain('the input never leaves it');
    const server = press(initialState(), ['/', ...type('js-beautify'), 'return', 'd']);
    expect(plain(text(server))).toContain('the input is sent');
  });

  it('shows the options a tool takes and what they are set to', () => {
    const s = press(initialState(), ['/', ...type('json-format'), 'return', 'd']);
    const out = plain(text(s));
    expect(out).toContain('--indent');
    expect(out).toContain('indent=2');
  });

  it('shows the answer and how long it took', () => {
    const run = press(initialState(), ['/', ...type('json-format'), 'return', 'd', 'return']);
    const done = applyResult(run, { text: '{\n  "a": 1\n}', failed: false, ms: 7 });
    const out = plain(text(done));
    expect(out).toContain('answered in 7ms');
    expect(out).toContain('"a": 1');
  });

  it('wraps a long answer rather than cutting it off', () => {
    const run = press(initialState(), ['return']);
    const done = applyResult(run, { text: 'word '.repeat(200), failed: false, ms: 1 });
    const body = plain(text(done, 100, 40));
    expect(body.split('\n').filter((l) => l.includes('word')).length).toBeGreaterThan(4);
  });

  it('scrolls a long answer', () => {
    const run = press(initialState(), ['return']);
    const done = applyResult(run, { text: Array.from({ length: 80 }, (_, i) => `line ${i}`).join('\n'), failed: false, ms: 1 });
    const top = plain(text(done));
    const scrolled = plain(text(press(done, ['pagedown', 'pagedown'])));
    expect(top).toContain('line 0');
    expect(scrolled).not.toContain('line 0\n');
    expect(scrolled).toContain('line 45');
  });

  it('lists every key on the help page', () => {
    const out = plain(text(press(initialState(), ['?'])));
    for (const k of ['search as you type', 'command', 'quit', 'offline', 'copy the answer']) expect(out).toContain(k);
  });
});

describe('the prompts', () => {
  it('shows what is being typed, with a cursor', () => {
    const out = plain(text(press(initialState(), ['/', ...type('uu')])));
    expect(out).toContain('/uu█');
  });

  it('marks a command differently from a filter', () => {
    expect(plain(text(press(initialState(), [':', ...type('q')])))).toContain('>q█');
  });
});

/*
 * Found by review, every one of them passing the suite above while being
 * wrong on screen. They share a shape: a line that is not the size the frame
 * promised, which the terminal resolves by wrapping and smearing.
 */
describe('nothing can make the frame the wrong size', () => {
  it('a multi-line input never becomes extra physical lines', () => {
    /*
     * Nineteen tools have a multi-line example, and opening one loads it into
     * the input prompt. Passed straight through, the newline made draw()
     * write 34 lines into a 32-row terminal.
     */
    const s = press(initialState(), ['/', ...type('csv-to-json'), 'return', 'd', 'return']);
    expect(s.input).toContain('\n');
    const lines = frame(s, 100, 32);
    expect(lines).toHaveLength(32);
    expect(lines.join('\n').split('\n')).toHaveLength(32);
    expect(plain(lines.join(''))).toContain('⏎');
  });

  it('strips any control character a tool\'s output could carry', () => {
    const run = press(initialState(), ['return']);
    const done = applyResult(run, { text: 'a\tb\r\nc\u0007d', failed: false, ms: 1 });
    const lines = frame(done, 80, 24);
    expect(lines).toHaveLength(24);
    expect(lines.join('\n')).not.toMatch(/[\t\u0007]/);
  });

  it('is exactly as wide as the terminal, even an absurd one', () => {
    // A floor of 28 here meant a 20-column terminal got 28-column lines,
    // which wrap, which makes the frame taller than the screen.
    for (const [width, height] of [[20, 10], [12, 8], [6, 6]] as const) {
      const lines = frame(initialState(), width, height);
      expect(lines, `${width}x${height}`).toHaveLength(height);
      for (const l of lines) expect(plain(l).length, `${width}x${height}`).toBe(width);
    }
  });

  it('keeps the example command intact in a narrow pane', () => {
    /*
     * The command is built with slice(0, width - 40), which goes negative
     * under 40 columns — and a negative end cuts from the other end of the
     * string, so the example came out quietly shortened with no ellipsis to
     * say so. Checked on the pane's own lines, since at this width the
     * example sits below the fold of a 24-row frame.
     */
    const s = press(initialState(), ['/', ...type('json-format'), 'return', 'd']);
    for (const width of [34, 28, 20]) {
      const lines = docLines(s, theme, width).map((segs) => segs.map((x) => x.text).join(''));
      const command = lines.find((l) => l.includes('$ redbison'));
      expect(command, `${width} columns`).toContain('$ redbison json-format');
    }
  });
});

describe('the window follows the cursor', () => {
  it('shows the highlighted row after the terminal shrinks under it', () => {
    /*
     * The cursor can be well down the list when a resize arrives. Clamping
     * only the stored scroll drew a page with no highlight on it at all,
     * while enter still ran the tool that was no longer on screen.
     */
    const big = { width: 120, height: 40 };
    let s = press(initialState(), Array(28).fill('down'), pageSize(big));
    const wanted = visibleTools(s)[s.cursor].id;
    const shrunk = frame(s, 120, 20, colour);
    expect(plain(shrunk.join('\n'))).toContain(wanted);
    const highlighted = shrunk.filter((l) => l.includes('\x1b[48;2;0;255;255m') && !plain(l).startsWith('<'));
    expect(highlighted).toHaveLength(1);
    expect(plain(highlighted[0])).toContain(wanted);
  });
});

describe('the breadcrumbs', () => {
  it('follow where you are', () => {
    expect(plain(text(initialState()))).toContain('<tools>');
    expect(plain(text(press(initialState(), ['2'])))).toContain(`<${GROUPS[1].toLowerCase()}>`);
    expect(plain(text(press(initialState(), ['d'])))).toContain(`<${TOOLS[0].id}>`);
    expect(plain(text(press(initialState(), ['?'])))).toContain('<help>');
  });

  it('carry the last message', () => {
    const s = press(initialState(), [':', ...type('nonsense'), 'return']);
    expect(plain(text(s))).toContain('nonsense');
  });
});

describe('the key strip on the bottom line', () => {
  const bottom = (s: State, width = 120, height = 32) => plain(frame(s, width, height, colour).at(-1)!);

  it('names the copy key at every width a terminal actually is', () => {
    /*
     * The header's second hint column needs 133 columns before it is drawn,
     * so at 80 or 120 the top of the screen shows category numbers and no
     * action keys at all. That is why the copy key was asked for by someone
     * who already had it, and why this strip may not quietly disappear.
     */
    for (const width of [80, 100, 120, 160, 200]) {
      const line = bottom(initialState(), width);
      expect(line, `${width} columns`).toContain('y copy');
      expect(line, `${width} columns`).toContain('d docs');
      expect(line.length, `${width} columns: exact width`).toBe(width);
    }
  });

  it('says which thing y would copy', () => {
    expect(bottom(initialState())).toContain('y copy cmd');
    const done = applyResult(press(initialState(), ['d', 'return']), { text: 'ok', failed: false, ms: 1 });
    // The status takes the line while it is showing; the strip is what is
    // there the rest of the time, so clear it the way a keypress would.
    expect(bottom({ ...done, status: null })).toContain('y copy answer');
  });

  it('gives the line up to a message rather than fighting it for room', () => {
    const s = press(initialState(), [':', ...type('nonsense'), 'return']);
    const line = bottom(s);
    expect(line).toContain('nonsense');
    expect(line).not.toContain('y copy');
  });

  it('drops whole hints when the terminal is too narrow for them', () => {
    // Truncated to "y cop…" it would read as a bug rather than as a hint.
    for (const width of [30, 44, 52, 60, 70]) {
      const line = bottom(initialState(), width);
      expect(line.length, `${width} columns`).toBe(width);
      expect(line, `${width} columns`).not.toMatch(/[a-z]…/);
    }
  });

  it('offers the way out on the help page, not the keys it is already listing', () => {
    const line = bottom(press(initialState(), ['?']));
    expect(line).toContain('esc back');
    expect(line).not.toContain('d docs');
  });
});
