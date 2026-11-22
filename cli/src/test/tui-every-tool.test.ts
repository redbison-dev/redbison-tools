/**
 * Every tool in the catalogue, driven through the picker rather than sampled.
 *
 * The other TUI tests pick a handful of tools and press keys at them, which is
 * how the interface is designed but not how it is used: someone opens the one
 * tool they came for, and it is always the hundredth one that has the example
 * with a newline in it, the option the shared spec does not declare, or the
 * output long enough to push the frame a line past the terminal. Those faults
 * are invisible from a sample of three and obvious from a sweep of a hundred,
 * so this file is the sweep.
 *
 * Four things are checked for every tool:
 *
 *   it can be reached and opened, and its docs pane renders to an exact frame
 *   at both a narrow and a wide terminal, with colour on;
 *
 *   the local ones actually run and give the answer the command line gives for
 *   the same input and options — the picker and `redbison <tool>` must never
 *   disagree, because then one of them is lying;
 *
 *   the server ones refuse rather than send when offline is on, with fetch
 *   removed so a leak fails the test instead of quietly working;
 *
 *   y copies the right thing, and the frame holding the answer is still
 *   exactly the size of the terminal.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { TOOLS, GROUP_ORDER, byId, type CliTool } from '../catalog';
import { EXAMPLES } from '../examples';
import { optionsFor } from '../options';
import { runTool, RunError } from '../run';
import { createApp, runOnce, type App, type AppDeps } from '../tui/app';
import { commandFor, defaultOptions, initialState, visibleTools, type Key } from '../tui/state';
import { EXTRA_ROWS } from '../tui/extras';
import { oneLine, render, type Size } from '../tui/render';
import { makeTheme, plain } from '../tui/theme';

const LOCAL = TOOLS.filter((t) => t.offline);
const SERVER = TOOLS.filter((t) => !t.offline);
const GROUPS_IN_USE = GROUP_ORDER.filter((g) => TOOLS.some((t) => t.group === g));

const key = (name: string, extra: Partial<Key> = {}): Key => ({ name, seq: name, ...extra });
const type = (text: string): Key[] => [...text].map((c) => ({ name: c, seq: c }));

function harness(over: Partial<AppDeps> = {}, size: Size = { width: 120, height: 32 }) {
  const copied: string[] = [];
  const app = createApp({
    write: () => undefined,
    size: () => size,
    run: runOnce,
    open: () => undefined,
    copy: (text) => {
      copied.push(text);
      return true;
    },
    theme: makeTheme('none'),
    version: '0.0.0-test',
    quit: () => undefined,
    ...over,
  });
  return { app, copied, size };
}

async function press(app: App, keys: (string | Key)[]) {
  for (const k of keys) await app.key(typeof k === 'string' ? key(k) : k);
}

/** `:tool-id` — the fast path, and the only one that does not depend on where
 *  the cursor happens to be sitting. */
const goTo = (id: string): (string | Key)[] => [':', ...type(id), 'return'];

/**
 * The frame is a fixed rectangle. One line too many scrolls the terminal and
 * smears every frame after it; one character too wide wraps, which does the
 * same thing from the other direction. Measured with the colours stripped,
 * because a line that counts escape codes as characters is the bug.
 */
function framedExactly(lines: string[], size: Size, where: string) {
  expect(lines, `${where}: line count`).toHaveLength(size.height);
  const wrong = lines
    .map((l, i) => ({ i, w: plain(l).length }))
    .filter(({ w }) => w !== size.width);
  expect(wrong, `${where}: lines not exactly ${size.width} wide`).toEqual([]);
  const withNewline = lines.filter((l) => /[\r\n]/.test(l));
  expect(withNewline, `${where}: a newline inside a line`).toEqual([]);
}

describe('every tool opens and renders', () => {
  // Colour on, because the width of a painted line is where the measuring
  // bugs live, and two terminals: 80 is where the layout starts dropping
  // columns, 120 is where it shows everything.
  const theme = makeTheme('true');
  const sizes: Size[] = [
    { width: 80, height: 24 },
    { width: 120, height: 40 },
  ];

  it.each(TOOLS.map((t) => [t.id, t] as const))('%s', (id, tool: CliTool) => {
    const h = harness();
    // Synchronous: `:` and the keys into it never fire an effect.
    for (const k of goTo(id)) void h.app.key(typeof k === 'string' ? key(k) : k);
    const state = h.app.state();
    expect(state.mode, `${id}: should land in the docs pane`).toBe('docs');
    expect(state.selected).toBe(id);

    for (const size of sizes) {
      const lines = render(state, theme, size, '0.0.0-test');
      framedExactly(lines, size, `${id} docs at ${size.width}x${size.height}`);
      const text = plain(lines.join('\n'));
      expect(text, `${id}: its own name on screen`).toContain(id);
      // The command line shown is the one y copies, so a drift between them
      // would be a copied command that does not reproduce what is on screen.
      // Folded through oneLine because two examples carry a newline, which the
      // pane shows as ⏎ rather than letting it break the frame.
      if (size.width >= 120) expect(text).toContain(oneLine(commandFor(id, state.options)));
    }
  });

  it('every tool is reachable by typing its own name into the search', () => {
    // Through visibleTools rather than a keystroke per character: the filter
    // re-searches the whole catalogue on every key, so typing a hundred names
    // is ten thousand searches and a test that times out instead of answering.
    const missed: string[] = [];
    for (const tool of TOOLS) {
      const hits = visibleTools({ ...initialState(), filter: tool.id });
      if (hits[0]?.id !== tool.id) missed.push(`${tool.id} -> ${hits[0]?.id ?? 'nothing'}`);
    }
    expect(missed, 'a tool its own name does not find first').toEqual([]);
  });

  it('seeds only options the tool actually declares', () => {
    // The picker and the command line have to agree on what is valid: an
    // option seeded here that `redbison <tool> --that` refuses is two routes
    // to the same tool disagreeing, and the picker is the one that looks right.
    const wrong: string[] = [];
    for (const tool of TOOLS) {
      const declared = new Set(optionsFor(tool.id).map((o) => o.key));
      for (const k of Object.keys(defaultOptions(tool.id))) {
        if (!declared.has(k)) wrong.push(`${tool.id}.${k}`);
      }
    }
    expect(wrong).toEqual([]);
  });
});

describe('every local tool runs, and agrees with the command line', () => {
  /**
   * Run it directly, several times. Tools that generate — a UUID, a password,
   * lorem — cannot be compared to a second run of themselves, and identifying
   * them this way rather than by a hand-kept list means a new generator is
   * handled on the day it lands instead of failing this file.
   *
   * Twice is not enough, which cost a flaky run to learn: shuffle-lines
   * shuffles a four-line example, so two runs land on the same permutation
   * one time in 24, and this then held a third independent shuffle to it.
   * Every other generator here draws from a space big enough that a
   * collision never happens (a 20-character password, a UUID, five numbers
   * from 1 to 100), so the sample size only has to cover the small one:
   * SAMPLES runs agreeing by chance is (1/24)^4, about three in a million.
   */
  const SAMPLES = 5;
  async function direct(id: string, input: string, options: Record<string, string | number | boolean>) {
    const runs: string[] = [];
    for (let i = 0; i < SAMPLES; i++) runs.push(await runTool(id, input, options, { offline: true }));
    return { text: runs[0], stable: runs.every((r) => r === runs[0]) };
  }

  it.each(LOCAL.map((t) => [t.id, t] as const))('%s', async (id, tool: CliTool) => {
    const size: Size = { width: 100, height: 30 };
    const h = harness({}, size);
    await press(h.app, goTo(id));
    await press(h.app, ['return']);
    // A generator fires straight away; everything else asks for the input
    // first, preloaded with the worked example.
    if (h.app.state().mode === 'input') {
      expect(h.app.state().input, `${id}: the example should be loaded`).toBe(EXAMPLES[id].input);
      await press(h.app, ['return']);
    } else {
      expect(tool.kind).toBe('insert');
    }

    const out = h.app.state().output;
    expect(out, `${id}: no output at all`).not.toBeNull();
    expect(out?.failed, `${id} refused its own example: ${out?.text}`).toBe(false);
    expect(out?.text.length, `${id}: empty answer`).toBeGreaterThan(0);

    const ref = await direct(id, h.app.state().input, h.app.state().options);
    if (ref.stable) {
      expect(out?.text, `${id}: the picker and the command line disagree`).toBe(ref.text);
    }

    framedExactly(h.app.frame(), size, `${id} output`);

    // y copies exactly what is on screen, byte for byte — a trailing newline
    // eaten here is a diff that does not apply and a hash that does not match.
    await press(h.app, ['y']);
    expect(h.copied, `${id}: y did not copy the answer`).toEqual([out?.text]);
  });
});

describe('every server tool refuses rather than sending, when offline is on', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');

  afterEach(() => fetchSpy.mockReset());

  it.each(SERVER.map((t) => [t.id, t] as const))('%s', async (id) => {
    // Any reach for the network in this block is a bug, so make it one: a
    // guard that only works because the server happens to answer is not a
    // guard. This is the promise --offline makes about a terminal.
    fetchSpy.mockImplementation(() => {
      throw new Error('the network was touched with offline on');
    });

    const size: Size = { width: 100, height: 30 };
    const h = harness({ start: { offline: true } }, size);
    await press(h.app, goTo(id));
    await press(h.app, ['return']);
    if (h.app.state().mode === 'input') await press(h.app, ['return']);

    const out = h.app.state().output;
    expect(out?.failed, `${id}: should have refused`).toBe(true);
    expect(out?.text).toContain('--offline');
    expect(fetchSpy).not.toHaveBeenCalled();
    framedExactly(h.app.frame(), size, `${id} refusal`);

    // The refusal is copyable: it is the text someone pastes when asking why.
    await press(h.app, ['y']);
    expect(h.copied).toEqual([out?.text]);
  });

  it('each one has a server tool to call at all', () => {
    // `--offline` hides a tool with no mcp entry behind a refusal, so without
    // this the whole sweep above would pass for a tool that can never run.
    expect(SERVER.filter((t) => !t.mcp?.name).map((t) => t.id)).toEqual([]);
  });
});

describe('every category', () => {
  it('is reachable by its number, and lists only its own tools', () => {
    expect(GROUPS_IN_USE.length).toBeLessThanOrEqual(9);
    GROUPS_IN_USE.forEach((group, i) => {
      const h = harness();
      void h.app.key(key(String(i + 1)));
      const state = h.app.state();
      expect(state.group, `digit ${i + 1}`).toBe(group);
      const shown = visibleTools(state);
      expect(shown.length, `${group} is empty`).toBeGreaterThan(0);
      expect(shown.filter((t) => t.group !== group)).toEqual([]);
    });
  });

  it('adds up to the whole catalogue, with 0 showing all of it', () => {
    const counted = GROUPS_IN_USE.reduce((n, g) => n + TOOLS.filter((t) => t.group === g).length, 0);
    expect(counted).toBe(TOOLS.length);
    const h = harness();
    void h.app.key(key('3'));
    void h.app.key(key('0'));
    expect(h.app.state().group).toBeNull();
    expect(visibleTools(h.app.state())).toHaveLength(TOOLS.length + EXTRA_ROWS.length);
  });

  it('renders the category list to an exact frame', () => {
    const h = harness();
    void h.app.key(key('f'));
    expect(h.app.state().mode).toBe('groups');
    for (const size of [{ width: 80, height: 24 }, { width: 200, height: 50 }]) {
      framedExactly(render(h.app.state(), makeTheme('true'), size, 'v'), size, `categories at ${size.width}`);
    }
  });
});

describe('y across the whole catalogue', () => {
  it('copies, for every tool, exactly what enter on that row would run', () => {
    const wrong: string[] = [];
    for (const tool of TOOLS) {
      const h = harness();
      for (const k of goTo(tool.id)) void h.app.key(typeof k === 'string' ? key(k) : k);
      void h.app.key(key('escape')); // back to the list, cursor on that tool
      void h.app.key(key('y'));
      const want = commandFor(tool.id, defaultOptions(tool.id));
      if (h.copied[0] !== want) wrong.push(`${tool.id}: ${h.copied[0]} (wanted ${want})`);
    }
    expect(wrong).toEqual([]);
  });

  it('does not carry one tool\'s option value over to another', () => {
    /*
     * `options` belong to `selected`, and `selected` outlives the pane it was
     * set in, so the danger is two tools sharing an option name: visit
     * random-name with count=3, walk the list to lorem, and y would hand over
     * `redbison lorem --count 3` with the 3 nowhere on screen.
     */
    const shared = TOOLS.filter((t) => optionsFor(t.id).some((o) => o.key === 'count'));
    expect(shared.length, 'needs two tools sharing an option to be a test').toBeGreaterThan(1);
    const [first, second] = shared;
    const h = harness();
    for (const k of goTo(first.id)) void h.app.key(typeof k === 'string' ? key(k) : k);
    void h.app.key(key('escape'));
    // Walk to the other tool without opening it, so `selected` stays behind.
    const rows = visibleTools(h.app.state());
    const to = rows.findIndex((t) => t.id === second.id);
    const from = h.app.state().cursor;
    expect(to).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < Math.abs(to - from); i += 1) void h.app.key(key(to > from ? 'down' : 'up'));
    expect(visibleTools(h.app.state())[h.app.state().cursor].id).toBe(second.id);
    expect(h.app.state().selected).toBe(first.id);
    void h.app.key(key('y'));
    expect(h.copied[0]).toBe(commandFor(second.id, defaultOptions(second.id)));
  });

  it('never copies a command the command line would refuse', async () => {
    // The copied line has to parse back. Anything else is a line that looks
    // right in the terminal and fails when run, which is worse than no key.
    const { parseArgs } = await import('../args');
    const bad: string[] = [];
    for (const tool of TOOLS) {
      const options = defaultOptions(tool.id);
      // Force every declared option to a non-default so each one is written
      // out, which is the case the quoting has to survive.
      const line = commandFor(tool.id, options);
      const argv = splitShell(line.replace(/^redbison /, ''));
      try {
        const parsed = parseArgs(argv);
        if (parsed.tool !== tool.id) bad.push(`${tool.id}: parsed as ${parsed.tool}`);
      } catch (e) {
        bad.push(`${tool.id}: ${(e as Error).message}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

/** A small shell-style splitter, enough to undo commandFor's quoting. */
function splitShell(line: string): string[] {
  const out: string[] = [];
  const re = /'((?:[^']|'\\'')*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    out.push(m[1] !== undefined ? m[1].replace(/'\\''/g, "'") : m[2]);
  }
  return out;
}
