/**
 * The whole interface as a value, and one pure function that moves it.
 *
 * Nothing here touches a terminal, a clock or the network. A keystroke goes in
 * and a new state comes out, with any side effect named rather than performed,
 * which is what lets the tests drive the entire interface — filter, navigate,
 * run a tool, read the output, back out — without a pty. The imperative shell
 * in app.ts is then small enough to read in one sitting, which is where the
 * bugs would otherwise hide.
 *
 * Two arguments carry the impurity in from the edges instead: `seed`, which
 * only the extras use and which defaults to Date.now() for the real shell
 * while every test passes its own, and the `now` handed to tickExtra.
 */
import { TOOLS, GROUP_ORDER, byId, type CliTool } from '../catalog';
import { optionsFor } from '../options';
import { EXAMPLES } from '../examples';
import { coerce, ArgError } from '../args';
import { searchTools } from '../search';
import { extraById, EXTRA_GROUP, EXTRA_ROWS, type AnyExtra } from './extras';

export type Key = {
  name: string;
  ctrl?: boolean;
  shift?: boolean;
  meta?: boolean;
  /** The raw characters, which is what typing into a prompt uses. */
  seq?: string;
};

export type Mode = 'list' | 'groups' | 'docs' | 'input' | 'output' | 'help' | 'extra';

export type PromptKind = 'filter' | 'command' | 'input' | 'options';

export type Status = { text: string; kind: 'info' | 'ok' | 'warn' | 'error' };

export type State = {
  mode: Mode;
  /** The group being shown, or null for the whole catalogue. */
  group: string | null;
  filter: string;
  localOnly: boolean;
  /** Refuse the network, the same promise `--offline` makes. */
  offline: boolean;
  prompt: { kind: PromptKind; text: string } | null;
  cursor: number;
  scroll: number;
  /** Scroll offset for the reading panes: docs, output, help. */
  pane: number;
  selected: string | null;
  options: Record<string, string | number | boolean>;
  input: string;
  output: { tool: string; text: string; failed: boolean; ms: number } | null;
  status: Status | null;
  running: boolean;
  quit: boolean;
  /** The extra on screen while mode is 'extra', with its own state. */
  extra: { id: string; es: unknown } | null;
};

export type Effect =
  | { kind: 'run'; tool: string; input: string; options: Record<string, string | number | boolean>; offline: boolean }
  | { kind: 'open'; url: string }
  | { kind: 'copy'; text: string }
  | { kind: 'quit' };

export type Step = { state: State; effect?: Effect };

export const GROUPS: string[] = [...GROUP_ORDER].filter((g) => TOOLS.some((t) => t.group === g));

export function initialState(): State {
  return {
    mode: 'list',
    group: null,
    filter: '',
    localOnly: false,
    offline: false,
    prompt: null,
    cursor: 0,
    scroll: 0,
    pane: 0,
    selected: null,
    options: {},
    input: '',
    output: null,
    status: null,
    running: false,
    quit: false,
    extra: null,
  };
}

/**
 * The tools the list is showing, after the group, the local filter and `/`.
 *
 * `/` is the same search `redbison search` runs: it matches the tool's
 * keywords as well as its name, so "unix timestamp" finds epoch and "pretty
 * print" finds the formatters, while initials like `b64` and `jsf` still find
 * what someone who knows the catalogue is reaching for.
 */
export function visibleTools(state: State): CliTool[] {
  // The extras ride at the end of the whole catalogue and under their own
  // reserved category, as ordinary rows: the default screen is the only place
  // everybody looks, and anything only reachable through a keystroke or a
  // command goes unfound.
  let tools: CliTool[] =
    state.group === EXTRA_GROUP
      ? EXTRA_ROWS
      : state.group
        ? TOOLS.filter((t) => t.group === state.group)
        : [...TOOLS, ...EXTRA_ROWS];
  if (state.localOnly) tools = tools.filter((t) => t.offline);
  if (!state.filter.trim()) return tools;
  return searchTools(state.filter, tools).map((hit) => hit.tool);
}

/** The extra a list row stands for, or undefined for a real tool. */
function extraUnderCursor(s: State): AnyExtra | undefined {
  const row = s.mode === 'groups' ? null : visibleTools(s)[s.cursor] ?? null;
  return row?.group === EXTRA_GROUP ? extraById(row.id) : undefined;
}

/** How many rows the current list view has, whatever it is listing. */
export function rowCount(state: State): number {
  // The categories view carries one synthetic row after the real groups:
  // Extras, which selects the Extras category like any other row. That is
  // where someone who has not read the help finds the clock and the games.
  return state.mode === 'groups' ? GROUPS.length + 1 : visibleTools(state).length;
}

export function selectedTool(state: State): CliTool | null {
  return state.selected ? byId(state.selected) ?? null : null;
}

/** Defaults for a tool, which is what the run starts from. */
export function defaultOptions(toolId: string): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const o of optionsFor(toolId)) {
    if (o.defaultValue !== undefined) out[o.key] = o.defaultValue as string | number | boolean;
  }
  /*
   * The worked example's own arguments, because they are what makes the
   * example produce the output the docs pane shows — but only the ones the
   * tool declares. Two examples (hash-compare's `algorithm`, cron-build's
   * `hours`) carry an argument that is not in the shared option spec, and
   * seeding it here would have the picker send an option the command line
   * refuses: two routes to the same tool that disagree about what is valid.
   */
  const declared = new Set(optionsFor(toolId).map((o) => o.key));
  for (const [k, v] of Object.entries(EXAMPLES[toolId]?.args ?? {})) {
    if (!declared.has(k)) continue;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = v;
    /*
     * A list arrives from the example as an array and goes to the tool as the
     * comma-separated string the command line takes — `--templates node,macos`.
     * Dropping it instead was not a cosmetic loss: `templates` and `stops` are
     * *required*, so enter on gitignore and css-gradient refused with "needs
     * --templates" every time, and the only way to find out what to type was
     * to open the options editor and read the spec.
     */
    else if (Array.isArray(v) && v.every((x) => typeof x === 'string' || typeof x === 'number')) {
      out[k] = v.join(',');
    }
  }
  return out;
}

/**
 * `indent=4 variant=url` from the options line.
 *
 * Validated through the same `coerce` the command line uses, so the terminal
 * and the TUI refuse exactly the same values. A typo names the options the
 * tool does take rather than being ignored, which matters most for the tools
 * where a wrong option produces a plausible wrong answer.
 */
export function parseOptionLine(
  toolId: string,
  line: string,
): { options: Record<string, string | number | boolean>; error?: string } {
  const specs = optionsFor(toolId);
  const options: Record<string, string | number | boolean> = {};
  for (const pair of splitOptions(line)) {
    const [key, ...rest] = pair.split('=');
    const raw = unquote(rest.join('='));
    const spec = specs.find((o) => o.key === key.replace(/^--/, ''));
    if (!spec) {
      const takes = specs.length ? specs.map((o) => `--${o.key}`).join(', ') : 'no options';
      return { options, error: `${toolId} takes ${takes}, not --${key.replace(/^--/, '')}.` };
    }
    if (raw === '') {
      if (spec.type === 'boolean') {
        options[spec.key] = true;
        continue;
      }
      return { options, error: `--${spec.key} needs a value, as ${spec.key}=something.` };
    }
    try {
      options[spec.key] = coerce(spec, raw);
    } catch (e) {
      return { options, error: e instanceof ArgError ? e.message : String(e) };
    }
  }
  return { options };
}

/**
 * Splitting the options line, respecting quotes.
 *
 * A plain split on whitespace loses any value that contains a space, and the
 * values that contain one are exactly the ones where losing it changes the
 * answer: `lines-to-comma` separates with `", "`, and dropping the space
 * turns `a, b, c` into `a,b,c` on a screen the user never edited.
 */
function splitOptions(line: string): string[] {
  return line.trim().match(/(?:[^\s"]|"(?:[^"\\]|\\.)*")+/g) ?? [];
}

/** Undo the quoting optionLine applies, including escaped quotes. */
const unquote = (s: string) =>
  s.startsWith('"') && s.endsWith('"') && s.length >= 2
    ? s.slice(1, -1).replace(/\\(["\\])/g, '$1')
    : s;

/**
 * The options line as it is shown and edited.
 *
 * A value with a space, a quote or nothing in it is quoted, and quotes inside
 * it are escaped rather than removed: `json-schema-validate` defaults to a
 * schema that is itself JSON, and stripping its quotes produced a line that
 * parsed back into something that is not a schema at all. Accepting the line
 * unedited must be a no-op; anything else is a wrong answer the user had no
 * way to see coming.
 */
export function optionLine(options: Record<string, string | number | boolean>): string {
  return Object.entries(options)
    .map(([k, v]) => {
      const value = String(v);
      if (!/[\s"\\]|^$/.test(value)) return `${k}=${value}`;
      return `${k}="${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    })
    .join(' ');
}

/**
 * The command line that reproduces what the picker would run.
 *
 * This is what `y` yanks when there is no answer on screen yet, because the
 * thing worth pasting into a script or a note is the command, not the tool's
 * name. Options the user has not changed are left off: a line carrying every
 * default is longer, no clearer, and pins values the tool is free to improve.
 * Values are single-quoted when they need it, so the line can be pasted into a
 * shell unedited — which is the only reason to copy it.
 */
export function commandFor(
  toolId: string,
  options: Record<string, string | number | boolean> = {},
): string {
  const specs = optionsFor(toolId);
  const parts = [`redbison ${toolId}`];
  for (const spec of specs) {
    const value = options[spec.key];
    if (value === undefined) continue;
    if (spec.defaultValue !== undefined && value === spec.defaultValue) continue;
    if (spec.type === 'boolean') {
      if (value) parts.push(`--${spec.key}`);
      continue;
    }
    parts.push(`--${spec.key} ${shellQuote(String(value))}`);
  }
  return parts.join(' ');
}

const shellQuote = (s: string) =>
  /^[A-Za-z0-9_.,:/@=+-]+$/.test(s) && s !== '' ? s : `'${s.replace(/'/g, `'\\''`)}'`;

/**
 * What `y` copies: whatever the view is showing.
 *
 * In the output pane that is the answer, including a refusal — the error text
 * is the thing someone wants to paste into a search or a bug report, and
 * refusing to copy it was a dead key at the exact moment the user needed it.
 * Everywhere else there is no answer, so it is the command for the tool under
 * the bar. One rule, and the status line names what went to the clipboard so
 * it is never a silent guess.
 */
export function yankFrom(s: State): { text: string; what: string } | null {
  if (s.mode === 'output' && s.output) {
    return {
      text: s.output.text,
      what: s.output.failed ? `${s.output.tool}'s error message` : `the answer from ${s.output.tool}`,
    };
  }
  // The help page is showing keys, not a tool. The list cursor is still
  // sitting on one behind it, and copying that would be yanking something
  // the screen is not showing.
  if (s.mode === 'help' || s.mode === 'groups') return null;
  const tool = s.mode === 'list' ? underCursor(s) : selectedTool(s) ?? underCursor(s);
  if (!tool) return null;
  /*
   * The same rule startRun uses, for the same reason: `options` belong to
   * `selected`, which outlives the pane it was set in. Reading them for
   * whatever is under the bar copies a value from an unrelated tool whenever
   * the two share an option name — `lorem --count 3` after visiting
   * random-name, with the 3 nowhere on screen. What y copies is what enter
   * would run, always.
   */
  const options = s.selected === tool.id ? s.options : defaultOptions(tool.id);
  return { text: commandFor(tool.id, options), what: `the command for ${tool.id}` };
}

function yank(s: State): Step {
  const got = yankFrom(s);
  if (!got) {
    return {
      state: {
        ...s,
        status: {
          text: s.mode === 'groups' ? 'Open a category first, then y copies the command.' : 'Nothing to copy here.',
          kind: 'warn',
        },
      },
    };
  }
  return {
    state: { ...s, status: { text: `Copied ${got.what}.`, kind: 'ok' } },
    effect: { kind: 'copy', text: got.text },
  };
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Keeps the cursor on a real row and the window around the cursor. */
function reframe(s: State, page: number): State {
  const total = rowCount(s);
  const cursor = total === 0 ? 0 : clamp(s.cursor, 0, total - 1);
  const size = Math.max(1, page);
  let scroll = s.scroll;
  if (cursor < scroll) scroll = cursor;
  if (cursor >= scroll + size) scroll = cursor - size + 1;
  scroll = clamp(scroll, 0, Math.max(0, total - size));
  return { ...s, cursor, scroll };
}

function move(s: State, by: number, page: number): State {
  const total = rowCount(s);
  if (total === 0) return s;
  return reframe({ ...s, cursor: clamp(s.cursor + by, 0, total - 1) }, page);
}

/**
 * The tool a key pressed in the list should act on: the highlighted one.
 *
 * In the category list the cursor indexes the categories, not the tools, so
 * there is no highlighted tool at all and the answer is nothing. Indexing the
 * tool list with that cursor is how `d` on "Formatters" opened the
 * documentation for an unrelated tool.
 */
function underCursor(s: State): CliTool | null {
  if (s.mode === 'groups') return null;
  return visibleTools(s)[s.cursor] ?? null;
}

function openSelected(s: State, mode: Mode): State {
  const tool = underCursor(s);
  if (!tool) {
    return {
      ...s,
      status: {
        text: s.mode === 'groups' ? 'Pick a category with enter first.' : 'Nothing selected.',
        kind: 'warn',
      },
    };
  }
  return {
    ...s,
    mode,
    selected: tool.id,
    pane: 0,
    options: defaultOptions(tool.id),
    input: EXAMPLES[tool.id]?.input ?? '',
    status: null,
  };
}

/**
 * Enter: run a generator straight away, otherwise ask for the input first.
 *
 * From the list it is always the highlighted tool. `selected` is what the
 * docs and output panes are showing and it outlives leaving them, so
 * preferring it meant that once you had opened any tool's documentation,
 * every later enter from the list ran that tool instead of the one under the
 * bar — with the right name nowhere on screen.
 */
function startRun(s: State, seed: number): Step {
  // Enter on an extra's row opens the extra: there is nothing to run, and the
  // docs/input machinery below only knows catalogue tools.
  const ex = s.mode === 'list' ? extraUnderCursor(s) : undefined;
  if (ex) return { state: openExtra(s, ex, seed) };
  const tool = s.mode === 'list' ? underCursor(s) : s.selected ? byId(s.selected) : underCursor(s);
  if (!tool) return { state: { ...s, status: { text: 'Nothing selected.', kind: 'warn' } } };
  const base: State = {
    ...s,
    selected: tool.id,
    options: s.selected === tool.id ? s.options : defaultOptions(tool.id),
    input: s.selected === tool.id ? s.input : EXAMPLES[tool.id]?.input ?? '',
    status: null,
  };
  if (tool.kind === 'insert') return fire({ ...base, input: '' });
  return { state: { ...base, mode: 'input', prompt: { kind: 'input', text: base.input }, pane: 0 } };
}

/** Hand the run to the shell, which is the only part that is not pure. */
function fire(s: State): Step {
  const tool = s.selected ? byId(s.selected) : null;
  if (!tool) return { state: s };
  return {
    state: { ...s, mode: 'output', prompt: null, running: true, output: null, pane: 0, status: null },
    effect: { kind: 'run', tool: tool.id, input: s.input, options: s.options, offline: s.offline },
  };
}

/** What the shell calls when the run comes back. */
export function applyResult(
  s: State,
  result: { text: string; failed: boolean; ms: number },
): State {
  return {
    ...s,
    running: false,
    mode: 'output',
    // Whatever was being typed is finished with: leaving the prompt open
    // would put a stale input line above the answer it produced.
    prompt: null,
    pane: 0,
    output: { tool: s.selected ?? '', text: result.text, failed: result.failed, ms: result.ms },
    status: result.failed
      ? { text: 'The tool refused that input. y copies the message.', kind: 'error' }
      : { text: `Done in ${result.ms}ms. y copies it, esc goes back.`, kind: 'ok' },
  };
}

/* ------------------------------------------------------------------ extras */

/** The extra on screen, with its handlers, or null. */
export function currentExtra(s: State): { extra: AnyExtra; es: unknown } | null {
  if (s.mode !== 'extra' || !s.extra) return null;
  const extra = extraById(s.extra.id);
  return extra ? { extra, es: s.extra.es } : null;
}

function openExtra(s: State, extra: AnyExtra, seed: number, arg?: string): State {
  return {
    ...s,
    mode: 'extra',
    prompt: null,
    status: null,
    extra: { id: extra.id, es: extra.init(seed, arg || undefined) },
  };
}

/**
 * The shell calls this on the extra's own clock. Everything the extra does
 * with the time happens in its tick; nothing else in this module sees a
 * clock.
 */
export function tickExtra(s: State, now: number): State {
  const here = currentExtra(s);
  if (!here?.extra.tick) return s;
  return { ...s, extra: { id: here.extra.id, es: here.extra.tick(here.es, now) } };
}

/** How often the shell should tick the current screen, or null for never. */
export function extraTickMs(s: State): number | null {
  return currentExtra(s)?.extra.tickMs ?? null;
}

/** A keystroke while an extra is up: escape leaves, : commands, the rest is its. */
function extraKey(s: State, key: Key, seed: number): Step {
  const here = currentExtra(s);
  if (!here) return { state: { ...s, mode: 'list', extra: null } };
  if (key.name === 'escape') return { state: { ...s, mode: 'list', extra: null, status: null } };
  if (key.name === ':' || key.seq === ':') return { state: { ...s, prompt: { kind: 'command', text: '' }, status: null } };
  const step = here.extra.key(here.es, key);
  if ('exit' in step) return { state: { ...s, mode: 'list', extra: null, status: null } };
  if ('switch' in step) {
    const to = extraById(step.switch);
    return { state: to ? openExtra(s, to, seed) : s };
  }
  return { state: { ...s, extra: { id: here.extra.id, es: step.es } } };
}

/** `:` commands, which are the fast path for people who know what they want. */
export function runCommand(s: State, raw: string, page: number, seed = Date.now()): Step {
  const step = runCommandInner(s, raw, page, seed);
  // A command that lands anywhere else is also how an extra is left.
  const st = step.state;
  return st.mode !== 'extra' && st.extra ? { ...step, state: { ...st, extra: null } } : step;
}

function runCommandInner(s: State, raw: string, page: number, seed: number): Step {
  const text = raw.trim().replace(/^:/, '');
  const [verb, ...rest] = text.split(/\s+/);
  const arg = rest.join(' ');
  const base: State = { ...s, prompt: null, status: null };

  if (!verb) return { state: base };

  switch (verb.toLowerCase()) {
    case 'q':
    case 'quit':
    case 'exit':
      return { state: { ...base, quit: true }, effect: { kind: 'quit' } };
    case 'help':
    case '?':
      return { state: { ...base, mode: 'help', pane: 0 } };
    case 'groups':
    case 'group':
    case 'cat':
    case 'categories':
      return { state: reframe({ ...base, mode: 'groups', cursor: 0, scroll: 0 }, page) };
    case 'all':
      return { state: reframe({ ...base, mode: 'list', group: null, filter: '', localOnly: false, cursor: 0, scroll: 0 }, page) };
    case 'local':
      return { state: reframe({ ...base, mode: 'list', localOnly: true, cursor: 0, scroll: 0 }, page) };
    case 'offline': {
      const on = arg === '' ? !s.offline : /^(on|true|yes|1)$/i.test(arg);
      return {
        state: {
          ...base,
          offline: on,
          status: { text: on ? 'Offline: the server tools will refuse rather than send.' : 'Offline off.', kind: 'info' },
        },
      };
    }
    default:
      break;
  }

  // The extras answer to their id and their aliases, with whatever followed
  // as the argument: `:random 1 100 3`, `:split 4`.
  const wanted = extraById(verb);
  if (wanted) return { state: openExtra(base, wanted, seed, arg) };

  const tool = byId(text);
  if (tool) {
    const inList = visibleTools(base).findIndex((t) => t.id === tool.id);
    const moved = inList >= 0 ? { ...base, cursor: inList } : { ...base, group: null, filter: '', localOnly: false, cursor: Math.max(0, visibleTools({ ...base, group: null, filter: '', localOnly: false }).findIndex((t) => t.id === tool.id)) };
    return {
      state: reframe(
        { ...moved, mode: 'docs', selected: tool.id, pane: 0, options: defaultOptions(tool.id), input: EXAMPLES[tool.id]?.input ?? '' },
        page,
      ),
    };
  }

  const group = [...GROUPS, EXTRA_GROUP].find((g) => g.toLowerCase().startsWith(text.toLowerCase()));
  if (group) {
    return { state: reframe({ ...base, mode: 'list', group, cursor: 0, scroll: 0 }, page) };
  }

  return { state: { ...base, status: { text: `No tool, group or command called "${text}".`, kind: 'error' } } };
}

const PRINTABLE = /^[\x20-\x7e]$/;

/** Typing into the one-line prompts. */
function editPrompt(s: State, key: Key, page: number, seed: number): Step {
  const prompt = s.prompt!;
  const text = prompt.text;

  if (key.name === 'escape' || (key.ctrl && key.name === 'g')) {
    if (prompt.kind === 'filter') {
      return { state: reframe({ ...s, prompt: null, filter: '', cursor: 0, scroll: 0 }, page) };
    }
    if (prompt.kind === 'input' || prompt.kind === 'options') {
      return { state: { ...s, prompt: null, mode: s.selected ? 'docs' : 'list', pane: 0 } };
    }
    return { state: { ...s, prompt: null } };
  }

  if (key.name === 'return' || key.name === 'enter') {
    if (prompt.kind === 'filter') return { state: { ...s, prompt: null } };
    if (prompt.kind === 'command') return runCommand(s, text, page, seed);
    if (prompt.kind === 'options') {
      const parsed = parseOptionLine(s.selected ?? '', text);
      if (parsed.error) {
        return { state: { ...s, status: { text: parsed.error, kind: 'error' } } };
      }
      return {
        state: {
          ...s,
          options: parsed.options,
          prompt: { kind: 'input', text: s.input },
          status: { text: 'Options set. Enter runs it.', kind: 'ok' },
        },
      };
    }
    return fire({ ...s, input: text });
  }

  if (key.name === 'backspace') {
    const next = text.slice(0, -1);
    return commitPrompt(s, next, page);
  }
  if (key.ctrl && key.name === 'u') return commitPrompt(s, '', page);
  if (key.ctrl && key.name === 'w') {
    return commitPrompt(s, text.replace(/\S+\s*$/, ''), page);
  }

  // Paste and ordinary typing arrive the same way; a paste is one chunk of
  // printable characters, so take the whole sequence rather than one letter.
  const seq = key.seq ?? '';
  if (seq && [...seq].every((c) => PRINTABLE.test(c))) return commitPrompt(s, text + seq, page);
  if (key.name === 'space') return commitPrompt(s, `${text} `, page);

  return { state: s };
}

function commitPrompt(s: State, text: string, page: number): Step {
  const prompt = { ...s.prompt!, text };
  if (prompt.kind === 'filter') {
    // Filtering live is the point: the list narrows as you type.
    return { state: reframe({ ...s, prompt, filter: text, cursor: 0, scroll: 0 }, page) };
  }
  if (prompt.kind === 'input') return { state: { ...s, prompt, input: text } };
  return { state: { ...s, prompt } };
}

/**
 * One keystroke.
 *
 * `page` is how many rows the list has room for, which only the renderer
 * knows; passing it in keeps this function free of terminal size.
 */
export function reduce(state: State, key: Key, page = 20, seed = Date.now()): Step {
  const s: State = { ...state, status: state.status };

  if (key.ctrl && key.name === 'c') return { state: { ...s, quit: true }, effect: { kind: 'quit' } };

  if (s.prompt) return editPrompt(s, key, page, seed);

  if (s.mode === 'extra') return extraKey(s, key, seed);

  // Reading panes: docs, output and help scroll rather than navigate.
  if (s.mode === 'docs' || s.mode === 'output' || s.mode === 'help') return pane(s, key, page, seed);

  switch (key.name) {
    case 'q':
      return { state: { ...s, quit: true }, effect: { kind: 'quit' } };
    case 'escape':
      if (s.filter) return { state: reframe({ ...s, filter: '', cursor: 0, scroll: 0 }, page) };
      if (s.mode === 'groups') return { state: reframe({ ...s, mode: 'list', cursor: 0, scroll: 0 }, page) };
      if (s.group || s.localOnly) return { state: reframe({ ...s, group: null, localOnly: false, cursor: 0, scroll: 0 }, page) };
      return { state: { ...s, status: null } };
    case 'up':
    case 'k':
      return { state: move(s, -1, page) };
    case 'down':
    case 'j':
      return { state: move(s, 1, page) };
    case 'pageup':
      return { state: move(s, -page, page) };
    case 'pagedown':
      return { state: move(s, page, page) };
    case 'home':
      return { state: reframe({ ...s, cursor: 0, scroll: 0 }, page) };
    case 'end':
      return { state: move(s, rowCount(s), page) };
    case 'g':
      return { state: key.shift ? move(s, rowCount(s), page) : reframe({ ...s, cursor: 0, scroll: 0 }, page) };
    case 'd': {
      if (key.ctrl) return { state: move(s, Math.ceil(page / 2), page) };
      // An extra has no docs pane; its screen is its documentation.
      const ex = extraUnderCursor(s);
      if (ex) return { state: openExtra(s, ex, seed) };
      return { state: openSelected(s, 'docs') };
    }
    case 'u':
      if (key.ctrl) return { state: move(s, -Math.ceil(page / 2), page) };
      return { state: s };
    case 'slash':
    case '/':
      return { state: { ...s, prompt: { kind: 'filter', text: s.filter }, status: null } };
    case 'return':
    case 'enter':
      if (s.mode === 'groups') {
        // The synthetic last row behaves like every real category: enter
        // shows its rows in the list, where enter again opens one.
        const group = s.cursor === GROUPS.length ? EXTRA_GROUP : GROUPS[s.cursor];
        return { state: reframe({ ...s, mode: 'list', group, cursor: 0, scroll: 0 }, page) };
      }
      return startRun(s, seed);
    case 'y':
      return yank(s);
    case 'o': {
      const tool = underCursor(s);
      if (!tool) return { state: s };
      return { state: { ...s, status: { text: `Opening ${tool.url}`, kind: 'info' } }, effect: { kind: 'open', url: tool.url } };
    }
    case 'l':
      return { state: reframe({ ...s, localOnly: !s.localOnly, cursor: 0, scroll: 0 }, page) };
    case 'f':
      return { state: reframe({ ...s, mode: s.mode === 'groups' ? 'list' : 'groups', cursor: 0, scroll: 0 }, page) };
    case 'x':
      return {
        state: {
          ...s,
          offline: !s.offline,
          status: {
            text: !s.offline
              ? 'Offline on: a server tool will refuse rather than send your input.'
              : 'Offline off.',
            kind: 'info',
          },
        },
      };
    case '?':
      return { state: { ...s, mode: 'help', pane: 0 } };
    case ':':
      return { state: { ...s, prompt: { kind: 'command', text: '' }, status: null } };
    default:
      break;
  }

  // A digit jumps to a group, 0 to the whole catalogue, the way the
  // terminal applications this borrows its shape from do it. All nine
  // digits are spoken for by the groups, so Extras has no digit; its rows
  // sit at the end of the whole catalogue, and enter on the `f` view's last
  // row (or :games) also reaches them.
  if (/^[0-9]$/.test(key.name) && !key.ctrl) {
    const n = Number(key.name);
    if (n === 0) return { state: reframe({ ...s, mode: 'list', group: null, cursor: 0, scroll: 0 }, page) };
    const group = GROUPS[n - 1];
    if (group) return { state: reframe({ ...s, mode: 'list', group, cursor: 0, scroll: 0 }, page) };
  }

  if (key.seq === '/') return { state: { ...s, prompt: { kind: 'filter', text: s.filter }, status: null } };
  if (key.seq === ':') return { state: { ...s, prompt: { kind: 'command', text: '' }, status: null } };
  if (key.seq === '?') return { state: { ...s, mode: 'help', pane: 0 } };

  return { state: s };
}

/** Scrolling and leaving the reading panes. */
function pane(s: State, key: Key, page: number, seed: number): Step {
  const back: State = { ...s, mode: s.mode === 'output' && s.selected ? 'docs' : 'list', pane: 0, status: null };

  switch (key.name) {
    case 'escape':
    case 'q':
      if (key.name === 'q' && s.mode === 'help') return { state: back };
      if (key.name === 'q') return { state: { ...s, quit: true }, effect: { kind: 'quit' } };
      return { state: back };
    case 'up':
    case 'k':
      return { state: { ...s, pane: Math.max(0, s.pane - 1) } };
    case 'down':
    case 'j':
      return { state: { ...s, pane: s.pane + 1 } };
    case 'pageup':
      return { state: { ...s, pane: Math.max(0, s.pane - page) } };
    case 'pagedown':
    case 'space':
      return { state: { ...s, pane: s.pane + page } };
    case 'g':
      return { state: { ...s, pane: 0 } };
    case 'd':
      if (key.ctrl) return { state: { ...s, pane: s.pane + Math.ceil(page / 2) } };
      return { state: s.mode === 'docs' ? s : { ...s, mode: 'docs', pane: 0 } };
    case 'u':
      if (key.ctrl) return { state: { ...s, pane: Math.max(0, s.pane - Math.ceil(page / 2)) } };
      return { state: s };
    case 'return':
    case 'enter':
      if (s.mode === 'docs') return startRun(s, seed);
      if (s.mode === 'output') return startRun({ ...s, mode: 'docs' }, seed);
      return { state: s };
    case 'e':
      if (s.mode === 'docs' || s.mode === 'output') {
        return { state: { ...s, mode: 'input', prompt: { kind: 'input', text: s.input } } };
      }
      return { state: s };
    case 'p':
      if (s.selected && (s.mode === 'docs' || s.mode === 'output')) {
        return { state: { ...s, mode: 'input', prompt: { kind: 'options', text: optionLine(s.options) } } };
      }
      return { state: s };
    case 'y':
      return yank(s);
    case 'o': {
      const tool = selectedTool(s);
      if (!tool) return { state: s };
      return { state: { ...s, status: { text: `Opening ${tool.url}`, kind: 'info' } }, effect: { kind: 'open', url: tool.url } };
    }
    case '?':
      return { state: { ...s, mode: 'help', pane: 0 } };
    case ':':
      return { state: { ...s, prompt: { kind: 'command', text: '' } } };
    default:
      if (key.seq === ':') return { state: { ...s, prompt: { kind: 'command', text: '' } } };
      if (key.seq === '?') return { state: { ...s, mode: 'help', pane: 0 } };
      return { state: s };
  }
}
