/**
 * `:coin` — one coin, flipped properly.
 *
 * The result is decided the moment the flip starts, from the seed, and the
 * spin frames that follow are theatre. Deciding at the end instead would tie
 * the answer to how many frames the animation happened to draw, which is the
 * kind of coupling that turns "add a frame" into "change every recorded
 * outcome in the tests".
 */
import type { Theme } from '../theme';
import { centre, next, type Extra, type ExtraKey, type ExtraStep, type Seg } from './core';

export type Face = 'heads' | 'tails';

export type CoinState = {
  seed: number;
  /** Frames of spin left; 0 means the coin is at rest. */
  spin: number;
  /** What the coin will show (or is showing). */
  face: Face;
  heads: number;
  tails: number;
  /** Last few results, newest first. */
  history: Face[];
};

export function flip(es: CoinState): CoinState {
  const r = next(es.seed);
  return { ...es, seed: r.seed, face: r.value < 0.5 ? 'heads' : 'tails', spin: 10 };
}

export function settle(es: CoinState): CoinState {
  // The tick that brings spin to 0 is the landing: the tally and the history
  // move exactly once per flip.
  if (es.spin !== 1) return { ...es, spin: Math.max(0, es.spin - 1) };
  return {
    ...es,
    spin: 0,
    heads: es.heads + (es.face === 'heads' ? 1 : 0),
    tails: es.tails + (es.face === 'tails' ? 1 : 0),
    history: [es.face, ...es.history].slice(0, 12),
  };
}

const FACE_H = [
  '      ▄▄▄▄▄▄▄      ',
  '   ▄▄█████████▄▄   ',
  '  ███  █   █  ███  ',
  ' ████  █▄▄▄█  ████ ',
  ' ████  █   █  ████ ',
  '  ███  █   █  ███  ',
  '   ▀▀█████████▀▀   ',
  '      ▀▀▀▀▀▀▀      ',
];
const FACE_T = [
  '      ▄▄▄▄▄▄▄      ',
  '   ▄▄█████████▄▄   ',
  '  ███ █▀▀█▀▀█ ███  ',
  ' ████    █    ████ ',
  ' ████    █    ████ ',
  '  ███    █    ███  ',
  '   ▀▀█████████▀▀   ',
  '      ▀▀▀▀▀▀▀      ',
];
const EDGE_WIDE = [
  '                   ',
  '      ▄▄▄▄▄▄▄      ',
  '   ▄███████████▄   ',
  ' ▄███████████████▄ ',
  ' ▀███████████████▀ ',
  '   ▀███████████▀   ',
  '      ▀▀▀▀▀▀▀      ',
  '                   ',
];
const EDGE_THIN = [
  '                   ',
  '                   ',
  '     ▄▄▄▄▄▄▄▄▄     ',
  ' ▄▄███████████▄▄▄  ',
  ' ▀▀███████████▀▀▀  ',
  '     ▀▀▀▀▀▀▀▀▀     ',
  '                   ',
  '                   ',
];

function frame(es: CoinState): string[] {
  if (es.spin === 0) return es.face === 'heads' ? FACE_H : FACE_T;
  const cycle = [es.face === 'heads' ? FACE_T : FACE_H, EDGE_WIDE, EDGE_THIN, EDGE_WIDE];
  return cycle[es.spin % 4];
}

const coin: Extra<CoinState> = {
  id: 'coin',
  title: 'Coin toss',
  summary: 'Heads or tails, with a tally.',
  aliases: ['coin-toss', 'flip', 'toss'],
  tickMs: 90,

  init: (seed) => flip({ seed, spin: 0, face: 'heads', heads: 0, tails: 0, history: [] }),

  tick: (es) => (es.spin > 0 ? settle(es) : es),

  key(es: CoinState, k: ExtraKey): ExtraStep<CoinState> {
    if (es.spin === 0 && (k.name === 'space' || k.name === 'return' || k.name === 'enter' || k.name === 'f')) {
      return { es: flip(es) };
    }
    if (k.name === 'r') return { es: { ...es, heads: 0, tails: 0, history: [] } };
    return { es };
  },

  render(es: CoinState, theme: Theme, width: number, rows: number): Seg[][] {
    const art = frame(es);
    const lines: Seg[][] = art.map((row) => centre([{ text: row, paint: theme.logo }], width - 2));
    lines.push([{ text: '' }]);
    lines.push(
      centre(
        [{ text: es.spin > 0 ? '· · ·' : es.face.toUpperCase(), paint: es.spin > 0 ? theme.dim : theme.titleHi }],
        width - 2,
      ),
    );
    lines.push([{ text: '' }]);
    lines.push(
      centre(
        [
          { text: `heads ${es.heads}`, paint: theme.ok },
          { text: '   ' },
          { text: `tails ${es.tails}`, paint: theme.warn },
        ],
        width - 2,
      ),
    );
    if (es.history.length > 1) {
      lines.push(
        centre([{ text: es.history.map((f) => (f === 'heads' ? 'H' : 'T')).join(' '), paint: theme.dim }], width - 2),
      );
    }
    // The frame centres every extra vertically; no padding of our own.
    return lines;
  },

  info: (es) => [
    ['Heads', String(es.heads)],
    ['Tails', String(es.tails)],
  ],

  hints: (es) => [
    ['space', es.spin > 0 ? '…' : 'flip'],
    ['r', 'reset tally'],
    ['esc', 'back'],
  ],
};

export default coin;
