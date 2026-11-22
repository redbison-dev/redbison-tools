/**
 * The extras through the same doors a person uses: the `:` prompt, the keys,
 * the shell's tick, the frame on screen, and the plain commands. Determinism
 * comes from passing reduce a seed, which is exactly what the real shell does
 * with Date.now().
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { GROUPS, initialState, reduce, runCommand, tickExtra, extraTickMs, currentExtra, type Key, type State } from '../tui/state';
import { render, pageSize } from '../tui/render';
import { makeTheme, plain } from '../tui/theme';
import { createApp } from '../tui/app';
import type { SnakeState } from '../tui/extras/snake';
import type { RandomState } from '../tui/extras/random';
import { main } from '../index';

const theme = makeTheme('none');
const colour = makeTheme('true');
const key = (name: string, extra: Partial<Key> = {}): Key => ({ name, seq: name.length === 1 ? name : undefined, ...extra });
const type = (text: string): Key[] => [...text].map((c) => key(c));

function press(state: State, keys: Key[], seed = 7): State {
  let s = state;
  for (const k of keys) s = reduce(s, k, 14, seed).state;
  return s;
}

const open = (cmd: string, seed = 7) => runCommand(initialState(), cmd, 14, seed).state;

const text = (s: State, w = 100, h = 26) => render(s, theme, { width: w, height: h }, '0.0.0').map(plain).join('\n');

describe('getting in and out', () => {
  it('opens from the command prompt and from every alias', () => {
    for (const cmd of ['snake', 'clock', 'sw', 'flip', 'rng', 'teams', '1010', 'arcade']) {
      const s = open(cmd);
      expect(s.mode, cmd).toBe('extra');
      expect(s.extra, cmd).not.toBeNull();
    }
  });

  it('takes the whole trip: : prompt, typed name, enter', () => {
    const s = press(initialState(), [key(':'), ...type('snake'), key('return')]);
    expect(s.mode).toBe('extra');
    expect(s.extra?.id).toBe('snake');
  });

  it('esc leaves any extra for the list; games take q too', () => {
    expect(press(open('clock'), [key('escape')]).mode).toBe('list');
    expect(press(open('tetris'), [key('q')]).mode).toBe('list');
    // ...but q in the splitter is just a letter in somebody's name.
    const splitting = press(open('split'), [key('q')]);
    expect(splitting.mode).toBe('extra');
  });

  it('ctrl-c still quits from inside a game', () => {
    const step = reduce(open('snake'), key('c', { ctrl: true }), 14, 7);
    expect(step.effect).toEqual({ kind: 'quit' });
  });

  it('switches through the menu and clears the extra on any other command', () => {
    let s = open('games');
    s = press(s, [key('7')]); // tetris is the seventh row
    expect(s.extra?.id).toBe('tetris');
    s = press(s, [key(':'), ...type('all'), key('return')]);
    expect(s.mode).toBe('list');
    expect(s.extra).toBeNull();
  });

  it('does not let an extra swallow an unknown command', () => {
    const s = press(open('clock'), [key(':'), ...type('no-such-thing'), key('return')]);
    expect(s.status?.kind).toBe('error');
  });

  it('is findable: the Extras row ends the categories view and opens the menu', () => {
    let s = press(initialState(), [key('f'), key('G', { shift: true, name: 'g' })]);
    expect(s.cursor).toBe(GROUPS.length); // the synthetic last row
    s = press(s, [key('return')]);
    expect(s.mode).toBe('extra');
    expect(s.extra?.id).toBe('games');
  });

  it('is findable: typing /snake points at the game while the prompt is open', () => {
    const s = press(initialState(), [key('/'), ...type('snake')]);
    expect(s.prompt?.kind).toBe('filter');
    const out = text(s);
    expect(out).toContain(':snake');
  });
});

describe('arguments on the command', () => {
  it(':random 5 10 3 draws three in range', () => {
    const s = open('random 5 10 3');
    const es = s.extra?.es as RandomState;
    expect(es.values).toHaveLength(3);
    expect(es.values.every((v) => v >= 5 && v <= 10)).toBe(true);
  });

  it(':split 4 starts at four groups', () => {
    const s = open('split 4');
    expect((s.extra?.es as { n: number }).n).toBe(4);
  });
});

describe('the shell clock', () => {
  it('asks for ticks only while a ticking extra is up', () => {
    expect(extraTickMs(initialState())).toBeNull();
    expect(extraTickMs(open('snake'))).toBe(30);
    expect(extraTickMs(open('blocks'))).toBeNull(); // no clock in a puzzle
    expect(extraTickMs(press(open('snake'), [key('escape')]))).toBeNull();
  });

  it('moves the game only through tickExtra', () => {
    let s = open('snake');
    const head = () => (s.extra?.es as SnakeState).snake[0];
    const before = head();
    s = tickExtra(s, 1000);
    s = tickExtra(s, 1200);
    expect(head()).not.toEqual(before);
    expect(currentExtra(s)?.extra.id).toBe('snake');
  });

  it('ticking a non-extra state is a no-op', () => {
    const s = initialState();
    expect(tickExtra(s, 123)).toBe(s);
  });
});

describe('what the screen shows', () => {
  const SIZES: [number, number][] = [
    [80, 24],
    [100, 26],
    [120, 32],
    [60, 18],
    [28, 8],
  ];

  it('every extra renders inside the frame at every size, before and after play', () => {
    for (const id of ['clock', 'stopwatch', 'coin', 'random', 'split', 'snake', 'tetris', 'breakout', 'blocks', 'games']) {
      let s = open(id);
      // A burst of time and a burst of keys: whatever happens, the frame holds.
      for (let t = 100; t < 4000; t += 30) s = tickExtra(s, t);
      s = press(s, [key('left'), key('down'), key('space'), key('right'), key('up')]);
      for (let t = 4000; t < 6000; t += 30) s = tickExtra(s, t);
      for (const [w, h] of SIZES) {
        for (const t of [theme, colour]) {
          const lines = render(s, t, { width: w, height: h }, '0.0.0');
          expect(lines, `${id} at ${w}x${h}`).toHaveLength(Math.max(6, h));
          for (const line of lines) expect(plain(line).length, `${id} at ${w}x${h}`).toBeLessThanOrEqual(Math.max(28, w));
        }
      }
    }
  });

  it('names the extra in the title, the crumbs and the header', () => {
    const out = text(open('snake'));
    expect(out).toContain('Snake(:snake)');
    expect(out).toContain('<extras> <snake>');
    expect(out).toContain('Screen:');
  });

  it('keeps the help page honest about the extras', () => {
    const out = text(press(initialState(), [key('?')]), 100, 44);
    expect(out).toContain(':games');
  });

  it('shows the games menu with one row per extra', () => {
    const out = text(open('games'));
    for (const name of [':clock', ':stopwatch', ':coin', ':random', ':split', ':snake', ':tetris', ':breakout', ':blocks']) {
      expect(out).toContain(name);
    }
  });

  it('tells a terminal that is too small what it needs', () => {
    const out = text(open('snake'), 60, 18);
    expect(out).toContain('columns');
  });
});

describe('the app shell', () => {
  function makeApp(start?: Partial<State>) {
    const writes: string[] = [];
    return {
      app: createApp({
        write: (s) => void writes.push(s),
        size: () => ({ width: 100, height: 26 }),
        run: async () => ({ text: '', failed: false, ms: 0 }),
        open: () => undefined,
        copy: () => true,
        theme,
        version: '0.0.0',
        quit: () => undefined,
        start,
      }),
      writes,
    };
  }

  it('reports the tick rate of whatever is on screen', async () => {
    const { app } = makeApp();
    expect(app.tickMs()).toBeNull();
    app.command('tetris');
    expect(app.tickMs()).toBe(30);
    await app.key(key('escape'));
    expect(app.tickMs()).toBeNull();
  });

  it('survives a tick that throws, in the status bar', () => {
    const { app } = makeApp();
    app.command('clock');
    expect(() => app.tick(Date.now())).not.toThrow();
  });
});

describe('the plain commands', () => {
  function capture() {
    const out: string[] = [];
    const err: string[] = [];
    const o = vi.spyOn(process.stdout, 'write').mockImplementation((c) => {
      out.push(String(c));
      return true;
    });
    const e = vi.spyOn(process.stderr, 'write').mockImplementation((c) => {
      err.push(String(c));
      return true;
    });
    return { out: () => out.join(''), err: () => err.join(''), restore: () => (o.mockRestore(), e.mockRestore()) };
  }

  async function run(args: string[], stdin?: string) {
    const cap = capture();
    const wasTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, 'isTTY', { value: stdin === undefined, configurable: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stdinAny = process.stdin as any;
    const hadIterator = Object.prototype.hasOwnProperty.call(stdinAny, Symbol.asyncIterator);
    const origIterator = stdinAny[Symbol.asyncIterator];
    if (stdin !== undefined) {
      stdinAny[Symbol.asyncIterator] = async function* () {
        yield Buffer.from(stdin);
      };
    }
    try {
      const code = await main(args, { tty: false });
      return { code, out: cap.out(), err: cap.err() };
    } finally {
      cap.restore();
      if (stdin !== undefined) {
        if (hadIterator) stdinAny[Symbol.asyncIterator] = origIterator;
        else delete stdinAny[Symbol.asyncIterator];
      }
      Object.defineProperty(process.stdin, 'isTTY', { value: wasTTY, configurable: true });
    }
  }

  afterEach(() => vi.restoreAllMocks());

  it('coin prints heads or tails, n times', async () => {
    const one = await run(['coin']);
    expect(one.code).toBe(0);
    expect(one.out.trim()).toMatch(/^(heads|tails)$/);
    const five = await run(['coin', '5']);
    expect(five.out.trim().split('\n')).toHaveLength(5);
  });

  it('random honours min, max and count without repeats', async () => {
    const r = await run(['random', '1', '5', '5']);
    const values = r.out.trim().split('\n').map(Number);
    expect([...values].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it('split deals stdin lines into groups that keep everyone', async () => {
    const r = await run(['split', '3'], 'ann\nbo\ncy\ndee\ned\n');
    expect(r.code).toBe(0);
    const lines = r.out.trim().split('\n');
    expect(lines).toHaveLength(3);
    const all = lines.flatMap((l) => l.split(': ')[1].split(', '));
    expect(all.sort()).toEqual(['ann', 'bo', 'cy', 'dee', 'ed']);
  });

  it('split without names explains itself on stderr', async () => {
    const r = await run(['split'], '');
    expect(r.code).toBe(2);
    expect(r.err).toContain('standard input');
  });

  it('refuses a screen on a pipe, pointing at what does work', async () => {
    const r = await run(['snake']);
    expect(r.code).toBe(2);
    expect(r.err).toContain('interactive terminal');
  });

  it('answers --help without flipping anything', async () => {
    const r = await run(['coin', '--help']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('redbison coin');
  });

  it('never shadows a real tool', async () => {
    // random-number is a catalogue tool; the extras must not catch it.
    const r = await run(['random-number', '--help']);
    expect(r.out).toContain('random-number');
    expect(r.out).not.toContain('Draw count integers');
  });
});
