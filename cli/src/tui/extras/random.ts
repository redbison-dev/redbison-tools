/**
 * `:random`, with the range on the command: `:random 1 100 3` draws three
 * from 1 to 100. When the range has room, the draw is without replacement —
 * the lottery behaviour, where asking for five numbers cannot hand you the
 * same one twice. When it does not (count > span), repeats are allowed,
 * because the alternative is an infinite refusal.
 */
import type { Theme } from '../theme';
import { bigText, centre, digitScale, nextInt, scaleArt, type Extra, type ExtraKey, type ExtraStep, type Seg } from './core';

export type RandomState = {
  min: number;
  max: number;
  count: number;
  values: number[];
  seed: number;
};

export function parseRange(arg?: string): { min: number; max: number; count: number } {
  const nums = (arg ?? '')
    .split(/\s+/)
    .filter((w) => w !== '') // Number('') is 0, which is not an argument
    .map((w) => Number(w))
    .filter((n) => Number.isFinite(n) && Number.isInteger(n));
  let [min, max, count] = [1, 100, 1];
  if (nums.length === 1) max = nums[0];
  if (nums.length >= 2) [min, max] = [nums[0], nums[1]];
  if (nums.length >= 3) count = nums[2];
  if (min > max) [min, max] = [max, min];
  count = Math.max(1, Math.min(10, count));
  return { min, max, count };
}

export function draw(es: RandomState): RandomState {
  const span = es.max - es.min + 1;
  const values: number[] = [];
  let seed = es.seed;
  const unique = es.count <= span;
  const taken = new Set<number>();
  while (values.length < es.count) {
    const r = nextInt(seed, es.min, es.max);
    seed = r.seed;
    if (unique && taken.has(r.value)) continue;
    taken.add(r.value);
    values.push(r.value);
  }
  return { ...es, values, seed };
}

const random: Extra<RandomState> = {
  id: 'random',
  title: 'Random number',
  summary: 'Draw from a range; :random 1 100 3 sets it.',
  // Not 'random-number': that is a catalogue tool's id, and the extras are
  // looked up before the tools, so the alias would have shadowed it.
  aliases: ['rng', 'rand'],

  init: (seed, arg) => draw({ ...parseRange(arg), values: [], seed }),

  key(es: RandomState, k: ExtraKey): ExtraStep<RandomState> {
    if (k.name === 'space' || k.name === 'return' || k.name === 'enter' || k.name === 'r') return { es: draw(es) };
    if (k.seq === '+' || k.name === 'up') return { es: draw({ ...es, count: Math.min(10, es.count + 1) }) };
    if (k.seq === '-' || k.name === 'down') return { es: draw({ ...es, count: Math.max(1, es.count - 1) }) };
    return { es };
  },

  render(es: RandomState, theme: Theme, width: number, rows: number): Seg[][] {
    const lines: Seg[][] = [];
    if (es.count === 1) {
      const big = bigText(String(es.values[0]));
      if (width - 4 >= big[0].length && rows >= 9) {
        const k = digitScale(width, rows, big[0].length, 5);
        for (const row of scaleArt(big, k)) lines.push(centre([{ text: row, paint: theme.logo }], width - 2));
      } else {
        lines.push(centre([{ text: String(es.values[0]), paint: theme.titleHi }], width - 2));
      }
    } else {
      lines.push(centre([{ text: es.values.join('   '), paint: theme.titleHi }], width - 2));
    }
    lines.push([{ text: '' }]);
    lines.push(
      centre(
        [
          { text: `${es.min} to ${es.max}`, paint: theme.dim },
          { text: es.count > 1 ? `, ${es.count} numbers` : '', paint: theme.dim },
          { text: es.count > 1 && es.count <= es.max - es.min + 1 ? ', no repeats' : '', paint: theme.dim },
        ],
        width - 2,
      ),
    );
    lines.push(centre([{ text: 'r draws again · + and - change how many', paint: theme.dim }], width - 2));
    // The frame centres every extra vertically; no padding of our own.
    return lines;
  },

  info: (es) => [
    ['Range', `${es.min}–${es.max}`],
    ['Count', String(es.count)],
  ],

  hints: () => [
    ['r', 'draw again'],
    ['+ -', 'count'],
    ['esc', 'back'],
  ],
};

export default random;
