/**
 * The extras on the command line.
 *
 * Two kinds, split by what they are for. The screens — clock, stopwatch and
 * the games — only mean anything on a live terminal, so `redbison snake`
 * starts the picker already inside the game and refuses a pipe the same way
 * the picker does. The draws — coin, random, split — are answers, so on the
 * command line they print plainly and compose like every other tool:
 *
 *   redbison coin
 *   redbison random 1 100 3
 *   cut -d, -f1 people.csv | redbison split 4
 *
 * Inside the picker the same three become screens too (`:coin` flips a coin
 * that actually turns over), which is the version the names in --help point
 * at. A real catalogue tool always wins a name clash; these are checked
 * second.
 */
import { version as VERSION } from '../package.json';
import { byId } from './catalog';
import { next, shuffle } from './tui/extras/core';
import { parseRange } from './tui/extras/random';

/** The extras that are full-screen only. `games` opens the menu of all of them. */
const SCREENS = new Set(['clock', 'time', 'stopwatch', 'sw', 'snake', 'tetris', 'breakout', 'blocks', '1010', 'block-puzzle', 'games', 'extras', 'fun', 'toys', 'arcade']);

/** The extras that print when asked plainly. */
const PLAIN = new Set(['coin', 'flip', 'toss', 'random', 'rng', 'rand', 'split', 'teams', 'split-groups', 'groups-split']);

const HELP: Record<string, string> = {
  coin:
    'redbison coin [n]\n\n' +
    'Flip a coin, or n coins, one result per line.\n' +
    'In the picker, :coin flips one that turns over.',
  random:
    'redbison random [min] [max] [count]\n\n' +
    'Draw count integers from min to max (default one from 1 to 100),\n' +
    'without repeats while the range allows it.\n' +
    'In the picker, :random 1 100 3 does the same in big digits.',
  split:
    'redbison split [n]\n\n' +
    'Read names from standard input, one per line, shuffle them and deal\n' +
    'them into n groups (default 2) whose sizes differ by at most one.\n' +
    'In the picker, :split takes the names interactively.',
};

const CANON: Record<string, string> = {
  flip: 'coin',
  toss: 'coin',
  rng: 'random',
  rand: 'random',
  teams: 'split',
  'split-groups': 'split',
  'groups-split': 'split',
  time: 'clock',
  sw: 'stopwatch',
  '1010': 'blocks',
  'block-puzzle': 'blocks',
  extras: 'games',
  fun: 'games',
  toys: 'games',
  arcade: 'games',
};

async function readStdinLines(): Promise<string[]> {
  if (process.stdin.isTTY) return [];
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks)
    .toString('utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * Handle `redbison <extra> …`, or return null when this is not one — a real
 * tool of the same name included, so the catalogue can never lose a name to
 * a game.
 */
export async function runExtrasCommand(
  sub: string,
  rest: string[],
  opts: { tty?: boolean },
): Promise<number | null> {
  const name = CANON[sub] ?? sub;
  if (byId(sub)) return null;
  if (!SCREENS.has(sub) && !PLAIN.has(sub)) return null;

  const wantsHelp = rest.includes('--help') || rest.includes('-h');

  if (SCREENS.has(sub)) {
    if (wantsHelp) {
      process.stdout.write(
        `redbison ${name}\n\nA full-screen ${name === 'games' ? 'menu of the extras' : name} in the terminal.\n` +
          `Also reachable from the picker as :${name}.\n`,
      );
      return 0;
    }
    if (!opts.tty) {
      process.stderr.write(
        `${name} is a full-screen view and needs an interactive terminal.\n` +
          `Run it from a shell; coin, random and split work on pipes.\n`,
      );
      return 2;
    }
    const { startTui } = await import('./tui/app');
    return startTui(VERSION, { screen: [name, ...rest].join(' ') });
  }

  if (wantsHelp) {
    process.stdout.write(`${HELP[name]}\n`);
    return 0;
  }

  const seedBase = Date.now() ^ (process.pid << 8);

  if (name === 'coin') {
    const n = Math.max(1, Math.min(1000, Number(rest[0]) || 1));
    let seed = seedBase;
    const out: string[] = [];
    for (let i = 0; i < n; i += 1) {
      const r = next(seed);
      seed = r.seed;
      out.push(r.value < 0.5 ? 'heads' : 'tails');
    }
    process.stdout.write(`${out.join('\n')}\n`);
    return 0;
  }

  if (name === 'random') {
    const { min, max, count } = parseRange(rest.join(' '));
    // The same draw the picker makes: unique while the range has room.
    const span = max - min + 1;
    const unique = count <= span;
    const taken = new Set<number>();
    const values: number[] = [];
    let seed = seedBase;
    while (values.length < count) {
      const r = next(seed);
      seed = r.seed;
      const v = min + Math.floor(r.value * span);
      if (unique && taken.has(v)) continue;
      taken.add(v);
      values.push(v);
    }
    process.stdout.write(`${values.join('\n')}\n`);
    return 0;
  }

  // split
  const n = Math.max(2, Math.min(9, Number(rest[0]) || 2));
  const names = await readStdinLines();
  if (names.length < 2) {
    process.stderr.write('split needs names on standard input, one per line:\n  printf "ann\\nbo\\ncy\\n" | redbison split 2\n');
    return 2;
  }
  const dealt = shuffle(seedBase, names);
  const groups: string[][] = Array.from({ length: Math.min(n, names.length) }, () => []);
  dealt.items.forEach((name2, i) => groups[i % groups.length].push(name2));
  process.stdout.write(`${groups.map((g, i) => `Group ${i + 1}: ${g.join(', ')}`).join('\n')}\n`);
  return 0;
}
