/**
 * The picker's behaviour, which is all in the reducer.
 *
 * Every one of these is a thing a person does — type a filter, jump to a
 * category, open the docs, change an option, run it, back out — and the point
 * of keeping the reducer pure is that each can be asserted directly instead of
 * through a terminal. The cases that matter most are the ones where a wrong
 * answer would look right: an option the picker accepts but the command line
 * refuses, and a cursor that points at a different tool from the one the
 * highlight is on.
 */
import { describe, it, expect } from 'vitest';
import { TOOLS, byId } from '../catalog';
import { EXTRA_ROWS, extraById } from '../tui/extras';
import { EXAMPLES } from '../examples';
import { optionsFor } from '../options';
import {
  GROUPS,
  applyResult,
  commandFor,
  defaultOptions,
  initialState,
  optionLine,
  parseOptionLine,
  reduce,
  rowCount,
  runCommand,
  visibleTools,
  type Key,
  type State,
} from '../tui/state';

const key = (name: string, extra: Partial<Key> = {}): Key => ({ name, seq: name, ...extra });

/** Press keys in order, with a page size small enough to exercise scrolling. */
function press(state: State, names: (string | Key)[], page = 10): State {
  let s = state;
  for (const k of names) s = reduce(s, typeof k === 'string' ? key(k) : k, page).state;
  return s;
}

const type = (text: string): Key[] => [...text].map((c) => ({ name: c, seq: c }));

/** Type a filter and commit it, which is what leaves the prompt. */
const find = (text: string): (string | Key)[] => ['/', ...type(text), 'return'];

describe('the list', () => {
  it('starts on the first tool of the whole catalogue, extras at the end', () => {
    const s = initialState();
    expect(s.cursor).toBe(0);
    expect(visibleTools(s)).toHaveLength(TOOLS.length + EXTRA_ROWS.length);
  });

  it('moves with the arrows and with j and k', () => {
    const s = press(initialState(), ['down', 'down', 'j']);
    expect(s.cursor).toBe(3);
    expect(press(s, ['up', 'k']).cursor).toBe(1);
  });

  it('stops at both ends rather than wrapping', () => {
    const last = TOOLS.length + EXTRA_ROWS.length - 1;
    expect(press(initialState(), ['up', 'up', 'up']).cursor).toBe(0);
    const bottom = press(initialState(), [{ name: 'g', shift: true, seq: 'G' }]);
    expect(bottom.cursor).toBe(last);
    expect(press(bottom, ['down', 'down']).cursor).toBe(last);
  });

  it('keeps the cursor inside the window it scrolled to', () => {
    const page = 10;
    const s = press(initialState(), Array(25).fill('down'), page);
    expect(s.cursor).toBe(25);
    expect(s.cursor).toBeGreaterThanOrEqual(s.scroll);
    expect(s.cursor).toBeLessThan(s.scroll + page);
  });

  it('pages with ctrl-d and ctrl-u', () => {
    const down = press(initialState(), [{ name: 'd', ctrl: true }], 10);
    expect(down.cursor).toBe(5);
    expect(press(down, [{ name: 'u', ctrl: true }], 10).cursor).toBe(0);
  });
});

describe('filtering with /', () => {
  it('narrows as you type and finds a tool by its initials', () => {
    const s = press(initialState(), ['/', ...type('b64')]);
    expect(s.filter).toBe('b64');
    const ids = visibleTools(s).map((t) => t.id);
    expect(ids).toContain('base64-encode');
    expect(ids).toContain('base64-decode');
    expect(ids.length).toBeLessThan(6);
  });

  it('puts the exact name first', () => {
    const s = press(initialState(), ['/', ...type('hash')]);
    expect(visibleTools(s)[0].id).toBe('hash');
  });

  it('sends the cursor back to the top, so the highlight is on a real row', () => {
    const s = press(initialState(), ['down', 'down', 'down', '/', ...type('uuid')]);
    expect(s.cursor).toBe(0);
    expect(s.cursor).toBeLessThan(rowCount(s));
  });

  it('esc clears the filter and leaves the list whole', () => {
    const filtered = press(initialState(), ['/', ...type('zzz')]);
    expect(visibleTools(filtered)).toHaveLength(0);
    const cleared = press(filtered, ['escape']);
    expect(cleared.filter).toBe('');
    expect(visibleTools(cleared)).toHaveLength(TOOLS.length + EXTRA_ROWS.length);
  });

  it('backspace and ctrl-u edit the query', () => {
    const s = press(initialState(), ['/', ...type('json'), 'backspace']);
    expect(s.filter).toBe('jso');
    expect(press(s, [{ name: 'u', ctrl: true }]).filter).toBe('');
  });

  it('takes a pasted chunk as one piece', () => {
    const s = press(initialState(), ['/', { name: 'paste', seq: 'base64' }]);
    expect(s.filter).toBe('base64');
  });
});

describe('categories', () => {
  it('jumps with a digit and goes back to everything with 0', () => {
    const s = press(initialState(), ['2']);
    expect(s.group).toBe(GROUPS[1]);
    expect(visibleTools(s).every((t) => t.group === GROUPS[1])).toBe(true);
    expect(press(s, ['0']).group).toBeNull();
  });

  it('f opens the category list, and enter drills into one', () => {
    const list = press(initialState(), ['f']);
    expect(list.mode).toBe('groups');
    // One row per group, plus the Extras row at the end.
    expect(rowCount(list)).toBe(GROUPS.length + 1);
    const drilled = press(list, ['down', 'return']);
    expect(drilled.mode).toBe('list');
    expect(drilled.group).toBe(GROUPS[1]);
  });

  it('l keeps only the tools that need no network, extras included', () => {
    const s = press(initialState(), ['l']);
    expect(visibleTools(s).every((t) => t.offline)).toBe(true);
    expect(visibleTools(s).length).toBe(TOOLS.filter((t) => t.offline).length + EXTRA_ROWS.length);
  });
});

describe('documentation and running', () => {
  it('d opens the docs for the highlighted tool, not a different one', () => {
    const s = press(initialState(), ['down', 'down', 'd']);
    expect(s.mode).toBe('docs');
    expect(s.selected).toBe(visibleTools(s)[2].id);
  });

  it('loads the tool\'s own example and defaults, so enter just works', () => {
    const opened = press(initialState(), [...find('json-format'), 'd']);
    expect(opened.selected).toBe('json-format');
    expect(opened.input).toContain('{');
    expect(opened.options).toEqual(defaultOptions('json-format'));
  });

  it('enter on a transform asks for the input before running', () => {
    const s = press(initialState(), ['return']);
    expect(s.mode).toBe('input');
    expect(s.prompt?.kind).toBe('input');
  });

  it('enter on a generator runs it straight away', () => {
    const uuid = TOOLS.findIndex((t) => t.kind === 'insert');
    expect(uuid).toBeGreaterThanOrEqual(0);
    const at = { ...initialState(), cursor: uuid };
    const step = reduce(at, key('return'));
    expect(step.effect).toMatchObject({ kind: 'run', tool: TOOLS[uuid].id, input: '' });
    expect(step.state.running).toBe(true);
  });

  it('carries the input and the options into the run', () => {
    const docs = press(initialState(), [...find('json-format'), 'd']);
    const edited = press(docs, ['e', { name: 'u', ctrl: true }, ...type('{"b":1}')]);
    const step = reduce(edited, key('return'));
    expect(step.effect).toMatchObject({ kind: 'run', tool: 'json-format', input: '{"b":1}' });
    expect((step.effect as { options: Record<string, unknown> }).options).toEqual({ indent: 2 });
  });

  it('shows the answer, then esc goes back to the docs', () => {
    const run = press(initialState(), [...find('json-format'), 'd', 'return']);
    const done = applyResult(run, { text: 'ok', failed: false, ms: 4 });
    expect(done.mode).toBe('output');
    expect(done.prompt).toBeNull();
    expect(done.output).toMatchObject({ text: 'ok', failed: false });
    expect(press(done, ['escape']).mode).toBe('docs');
  });

  it('a refusal is reported as one rather than as an answer', () => {
    const run = press(initialState(), ['return']);
    const done = applyResult(run, { text: 'that is not valid JSON', failed: true, ms: 1 });
    expect(done.output?.failed).toBe(true);
    expect(done.status?.kind).toBe('error');
  });

  it('o asks for the tool\'s page on the web', () => {
    const step = reduce(initialState(), key('o'));
    expect(step.effect).toEqual({ kind: 'open', url: TOOLS[0].url });
  });
});

describe('y, the copy key', () => {
  it('copies the answer when there is one on screen', () => {
    const run = press(initialState(), [...find('json-format'), 'd', 'return']);
    const done = applyResult(run, { text: '{\n  "a": 1\n}', failed: false, ms: 2 });
    const step = reduce(done, key('y'));
    expect(step.effect).toEqual({ kind: 'copy', text: '{\n  "a": 1\n}' });
    expect(step.state.status?.text).toBe('Copied the answer from json-format.');
  });

  it('copies a refusal too, which is the text worth pasting into a search', () => {
    /*
     * This was a dead key at the one moment it was most wanted: the old rule
     * was `output && !failed`, so the error message — the thing someone wants
     * in a bug report or a search box — was the one output that could not be
     * copied, and y did nothing at all with no explanation.
     */
    const run = press(initialState(), [...find('json-validate'), 'd', 'return']);
    const done = applyResult(run, { text: 'Unexpected token } at line 3', failed: true, ms: 1 });
    const step = reduce(done, key('y'));
    expect(step.effect).toEqual({ kind: 'copy', text: 'Unexpected token } at line 3' });
    expect(step.state.status?.text).toContain('error message');
  });

  it('copies the command for the highlighted tool straight from the list', () => {
    const s = press(initialState(), find('uuid'));
    const step = reduce(s, key('y'));
    expect(step.effect).toEqual({ kind: 'copy', text: `redbison ${visibleTools(s)[0].id}` });
    expect(step.state.status?.text).toBe(`Copied the command for ${visibleTools(s)[0].id}.`);
  });

  it('copies the command for the tool under the bar, not the last one opened', () => {
    // The same mistake enter made: `selected` outlives the docs pane, so
    // reading it in the list copies a tool whose name is nowhere on screen.
    const s = press(initialState(), [...find('json-format'), 'd', 'escape', 'escape', 'down', 'down']);
    const under = visibleTools(s)[s.cursor];
    expect(under.id).not.toBe('json-format');
    expect(reduce(s, key('y')).effect).toEqual({ kind: 'copy', text: `redbison ${under.id}` });
  });

  it('carries the options the user changed, and leaves the defaults off', () => {
    const docs = press(initialState(), [...find('json-format'), 'd']);
    expect(defaultOptions('json-format')).toEqual({ indent: 2 });
    // The default is on screen and in state, but a line carrying every
    // default is longer, no clearer, and pins a value we may improve.
    expect(reduce(docs, key('y')).effect).toEqual({ kind: 'copy', text: 'redbison json-format' });
    const edited = press(docs, ['p', { name: 'u', ctrl: true }, ...type('indent=6'), 'return', 'escape']);
    expect(edited.mode).toBe('docs');
    expect(reduce(edited, key('y')).effect).toEqual({ kind: 'copy', text: 'redbison json-format --indent 6' });
  });

  it('quotes a value the shell would otherwise split', () => {
    // lines-to-comma joins with ", " by default: pasted unquoted, the shell
    // eats the space and the copied line stops reproducing the answer.
    expect(commandFor('lines-to-comma', { separator: ' | ' })).toBe("redbison lines-to-comma --separator ' | '");
    expect(commandFor('lines-to-comma', { separator: "it's" })).toBe("redbison lines-to-comma --separator 'it'\\''s'");
    expect(commandFor('lines-to-comma', { quote: 'double' })).toBe('redbison lines-to-comma --quote double');
  });

  it('writes a boolean as the bare flag the command line takes', () => {
    const spec = optionsFor('toml-convert').find((o) => o.key === 'sort_keys');
    expect(spec?.type).toBe('boolean');
    expect(commandFor('toml-convert', { sort_keys: true })).toBe('redbison toml-convert --sort_keys');
    expect(commandFor('toml-convert', { sort_keys: false })).toBe('redbison toml-convert');
  });

  it('says so rather than copying something off screen', () => {
    // On the category list the cursor indexes categories, and on the help page
    // the list behind it is not what the user is looking at.
    for (const mode of ['groups', 'help'] as const) {
      const s = press(initialState(), [mode === 'groups' ? 'f' : '?']);
      expect(s.mode).toBe(mode);
      const step = reduce(s, key('y'));
      expect(step.effect).toBeUndefined();
      expect(step.state.status?.kind).toBe('warn');
    }
  });

  it('copies nothing when the filter matches nothing', () => {
    const s = press(initialState(), find('zzzznotatool'));
    expect(visibleTools(s)).toHaveLength(0);
    expect(reduce(s, key('y')).effect).toBeUndefined();
  });

  it('is a plain y in a prompt, not a copy', () => {
    // Typing a filter containing "y" must not fire the clipboard.
    const s = reduce(initialState(), key('/')).state;
    const step = reduce(s, key('y'));
    expect(step.effect).toBeUndefined();
    expect(step.state.filter).toBe('y');
  });
});

describe('options', () => {
  it('reads key=value through the same check the command line uses', () => {
    expect(parseOptionLine('json-format', 'indent=4').options).toEqual({ indent: 4 });
    expect(parseOptionLine('base64-encode', 'variant=url').options).toEqual({ variant: 'url' });
  });

  it('refuses a value the tool does not take, and says what it does take', () => {
    const bad = parseOptionLine('base64-encode', 'variant=rot13');
    expect(bad.error).toMatch(/one of/);
    const unknown = parseOptionLine('json-format', 'indentation=4');
    expect(unknown.error).toMatch(/--indent/);
  });

  it('refuses a number that is not one', () => {
    expect(parseOptionLine('json-format', 'indent=wide').error).toMatch(/number/);
  });

  it('round-trips through the line it shows', () => {
    const opts = { indent: 4 };
    expect(parseOptionLine('json-format', optionLine(opts)).options).toEqual(opts);
  });

  it('p edits them and enter puts them back on the run', () => {
    const docs = press(initialState(), [...find('json-format'), 'd']);
    const editing = press(docs, ['p']);
    expect(editing.prompt?.kind).toBe('options');
    const set = press(editing, [{ name: 'u', ctrl: true }, ...type('indent=8'), 'return']);
    expect(set.options).toEqual({ indent: 8 });
  });

  it('keeps a bad options line open instead of silently dropping it', () => {
    const editing = press(initialState(), [...find('json-format'), 'd', 'p']);
    const bad = press(editing, [{ name: 'u', ctrl: true }, ...type('indent=wide'), 'return']);
    expect(bad.status?.kind).toBe('error');
    expect(bad.options).toEqual({ indent: 2 });
    expect(bad.prompt?.kind).toBe('options');
  });
});

describe('the command bar', () => {
  const cmd = (text: string, s = initialState()) => runCommand(s, text, 10);

  it('q quits', () => {
    expect(cmd('q').effect).toEqual({ kind: 'quit' });
    expect(cmd('quit').state.quit).toBe(true);
  });

  it('a tool id opens that tool', () => {
    const { state } = cmd('jwt-decode');
    expect(state.mode).toBe('docs');
    expect(state.selected).toBe('jwt-decode');
    expect(visibleTools(state)[state.cursor]?.id).toBe('jwt-decode');
  });

  it('a category name, even a partial one, filters to it', () => {
    expect(cmd('enc').state.group).toBe('Encoding and hashing');
  });

  it('offline toggles the promise the header shows', () => {
    expect(cmd('offline on').state.offline).toBe(true);
    expect(cmd('offline off').state.offline).toBe(false);
  });

  it('says so when it does not know the word', () => {
    const { state } = cmd('nonsense');
    expect(state.status?.kind).toBe('error');
    expect(state.status?.text).toContain('nonsense');
  });

  it('is reachable with : and closed with esc', () => {
    const open = press(initialState(), [':']);
    expect(open.prompt?.kind).toBe('command');
    expect(press(open, ['escape']).prompt).toBeNull();
  });
});

describe('offline', () => {
  it('x carries the refusal into the run', () => {
    const offline = press(initialState(), ['x']);
    expect(offline.offline).toBe(true);
    const step = reduce({ ...offline, cursor: TOOLS.findIndex((t) => t.kind === 'insert') }, key('return'));
    expect(step.effect).toMatchObject({ offline: true });
  });
});

describe('quitting', () => {
  it('q and ctrl-c both end it', () => {
    expect(reduce(initialState(), key('q')).effect).toEqual({ kind: 'quit' });
    expect(reduce(initialState(), { name: 'c', ctrl: true }).effect).toEqual({ kind: 'quit' });
  });

  it('q inside a reading pane leaves the pane, not the program', () => {
    const help = press(initialState(), ['?']);
    const step = reduce(help, key('q'));
    expect(step.effect).toBeUndefined();
    expect(step.state.mode).toBe('list');
  });

  it('ctrl-c still quits from inside a prompt', () => {
    const typing = press(initialState(), ['/', ...type('abc')]);
    expect(reduce(typing, { name: 'c', ctrl: true }).effect).toEqual({ kind: 'quit' });
  });
});

/*
 * The cases below came out of a review of this file's own code, and every one
 * of them passed the suite above while being wrong on screen. They are kept
 * together because they share a shape: the picker acting on a tool other than
 * the one the user is looking at, which is the failure mode with no symptom.
 */
describe('acting on the tool that is actually highlighted', () => {
  it('runs the highlighted tool, not the last one whose docs were open', () => {
    // d, esc, down, down: the bar is on the third tool, but `selected` still
    // names the first. Enter used to run the first, with its name nowhere on
    // screen, for the rest of the session.
    const s = press(initialState(), ['d', 'escape', 'down', 'down']);
    const highlighted = visibleTools(s)[s.cursor].id;
    expect(highlighted).not.toBe(s.selected);
    const step = reduce(s, key('return'));
    expect(step.state.selected).toBe(highlighted);
  });

  it('opens the docs for the highlighted tool after visiting another', () => {
    const s = press(initialState(), ['d', 'escape', 'down', 'd']);
    expect(s.selected).toBe(visibleTools(s)[s.cursor].id);
  });

  it('loads that tool\'s own example rather than keeping the previous one', () => {
    const first = press(initialState(), ['d']);
    const second = press(first, ['escape', 'down', 'down', 'return']);
    const tool = visibleTools(second)[second.cursor].id;
    expect(second.input).toBe(EXAMPLES[tool]?.input ?? '');
  });

  it('does nothing with d or o while the category list is up', () => {
    // The cursor indexes categories there, so indexing the tool list with it
    // opened the documentation for whichever tool happened to sit at that
    // position.
    const groups = press(initialState(), ['f', 'down', 'down', 'down']);
    const docs = reduce(groups, key('d'));
    expect(docs.state.mode).toBe('groups');
    expect(docs.state.selected).toBeNull();
    expect(docs.state.status?.kind).toBe('warn');
    expect(reduce(groups, key('o')).effect).toBeUndefined();
  });
});

describe('the options line survives a round trip', () => {
  it('keeps a value that contains a space', () => {
    /*
     * lines-to-comma separates with ", ". Shown unquoted and split on
     * whitespace, it came back as "," — so pressing p and then enter, with no
     * edit at all, turned "a, b, c" into "a,b,c". A wrong answer from a
     * screen the user did not touch.
     */
    const line = optionLine({ quote: 'none', separator: ', ' });
    expect(parseOptionLine('lines-to-comma', line).options).toEqual({ quote: 'none', separator: ', ' });
  });

  it('keeps a value that is only a space', () => {
    const line = optionLine({ separator: ' ' });
    const parsed = parseOptionLine('to-hex', line);
    expect(parsed.error).toBeUndefined();
    expect(parsed.options.separator).toBe(' ');
  });

  it('round-trips the real defaults of every tool that has them', () => {
    // The screen is allowed to show anything; accepting it unedited must
    // never change what runs.
    for (const tool of TOOLS) {
      const defaults = defaultOptions(tool.id);
      if (!Object.keys(defaults).length) continue;
      const parsed = parseOptionLine(tool.id, optionLine(defaults));
      expect(parsed.error, `${tool.id}: ${parsed.error}`).toBeUndefined();
      expect(parsed.options, tool.id).toEqual(defaults);
    }
  });
});

describe('every row the list can reach is a real thing', () => {
  it('each id resolves in the catalogue, or in the extras for an Extras row', () => {
    for (const group of [null, ...GROUPS, 'Extras']) {
      const s: State = { ...initialState(), group };
      for (const row of visibleTools(s)) {
        if (row.group === 'Extras') expect(extraById(row.id), row.id).toBeTruthy();
        else expect(byId(row.id), row.id).toBeTruthy();
      }
    }
  });
});
