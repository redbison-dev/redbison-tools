/**
 * The extras: screens the picker can show that are not catalogue tools.
 *
 * A clock, a stopwatch, a coin, a random number, a group splitter and four
 * games. Each one is the same shape as the picker itself — a pure state
 * machine moved by keys and, where something has to happen without a
 * keystroke, by a tick that is handed the time rather than reading it. That
 * is what lets every one of them be tested to the last frame without a pty,
 * a timer or a real clock.
 *
 * Randomness is a seed carried in the state and advanced functionally
 * (mulberry32), so a test that starts from seed 7 sees the same deal, the
 * same food and the same pieces every run. The shell seeds from Date.now();
 * nothing in here may call Math.random or Date.now itself.
 *
 * This module must not import from state.ts: state.ts imports the registry,
 * and a cycle here is the kind that works until the bundler changes order.
 * The key type is declared structurally instead, which TypeScript accepts
 * from either side.
 */
import type { Theme } from '../theme';

export type Paint = (s: string) => string;
export type Seg = { text: string; paint?: Paint };

/** Structurally identical to state.ts's Key, declared here to avoid a cycle. */
export type ExtraKey = {
  name: string;
  ctrl?: boolean;
  shift?: boolean;
  meta?: boolean;
  seq?: string;
};

/** What a keystroke inside an extra can decide. */
export type ExtraStep<S> = { es: S } | { exit: true } | { switch: string };

export type Extra<S = unknown> = {
  id: string;
  /** The box title and the menu line. */
  title: string;
  summary: string;
  /** Other `:` spellings that reach it. */
  aliases?: string[];
  /**
   * How often the shell should call tick, or absent for screens that only
   * move on keys. One constant rate per extra: anything that speeds up does
   * so by acting on fewer of the ticks, not by asking for a faster timer.
   */
  tickMs?: number;
  /** `arg` is whatever followed the command: `:random 1 100 3`. */
  init: (seed: number, arg?: string) => S;
  tick?: (es: S, now: number) => S;
  key: (es: S, k: ExtraKey) => ExtraStep<S>;
  render: (es: S, theme: Theme, width: number, rows: number) => Seg[][];
  /** Rows for the header's info column while this extra is up. */
  info?: (es: S) => [string, string][];
  /** The bottom key strip. */
  hints?: (es: S) => [string, string][];
};

/* --------------------------------------------------------------- randomness */

/**
 * mulberry32: one 32-bit word of state, good enough spread for games and
 * draws, and trivially advanced without mutation.
 */
export function next(seed: number): { value: number; seed: number } {
  let t = (seed + 0x6d2b79f5) | 0;
  let x = Math.imul(t ^ (t >>> 15), 1 | t);
  x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
  const value = ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  return { value, seed: t };
}

/** An integer in [lo, hi], advancing the seed. */
export function nextInt(seed: number, lo: number, hi: number): { value: number; seed: number } {
  const r = next(seed);
  return { value: lo + Math.floor(r.value * (hi - lo + 1)), seed: r.seed };
}

/** Fisher–Yates, advancing the seed once per swap. */
export function shuffle<T>(seed: number, items: readonly T[]): { items: T[]; seed: number } {
  const out = [...items];
  let s = seed;
  for (let i = out.length - 1; i > 0; i -= 1) {
    const r = nextInt(s, 0, i);
    s = r.seed;
    [out[i], out[r.value]] = [out[r.value], out[i]];
  }
  return { items: out, seed: s };
}

/* ------------------------------------------------------------------ drawing */

export const padText = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length));

/** One centred line of segments inside the given width. */
export function centre(segs: Seg[], width: number): Seg[] {
  const used = segs.reduce((n, s) => n + s.text.length, 0);
  const left = Math.max(0, Math.floor((width - used) / 2));
  return [{ text: ' '.repeat(left) }, ...segs];
}

/** Centre a block of rows vertically in `rows` by padding with blanks. */
export function centreBlock(lines: Seg[][], rows: number): Seg[][] {
  const pad = Math.max(0, Math.floor((rows - lines.length) / 2));
  return [...Array.from({ length: pad }, () => [{ text: '' }] as Seg[]), ...lines];
}

/**
 * The largest integer scale a frame can hold: the board is `baseW` characters
 * wide and `basePix` half-block pixels tall at scale 1, and every scale
 * multiplies both. Games render tiny and lost on a big terminal otherwise —
 * a 36x24 snake court is twelve rows in the corner of a 55-row window. One
 * terminal row holds two pixels, hence the 2.
 */
export function fitScale(availW: number, availRows: number, baseW: number, basePix: number): number {
  const byW = Math.floor(availW / baseW);
  const byH = Math.floor((availRows * 2) / basePix);
  return Math.max(1, Math.min(byW, byH));
}

/**
 * A grid of cells drawn at half-block resolution: every terminal row carries
 * two grid rows, '▀' when only the top is filled, '▄' only the bottom, '█'
 * both. That is what lets tetris's 20 rows stand inside a 24-row terminal,
 * and it reads correctly with no colour at all, which the plain theme and the
 * tests both are.
 *
 * `cellW` repeats each cell horizontally in characters, `cellH` vertically
 * in pixel rows. A pixel stands about as tall as a character is wide, so a
 * cell looks square when the two are equal — unequal and every piece
 * stretches into a bar. A char can only take one paint, so
 * where the top and bottom halves belong to different things the top wins: a
 * one-character colour approximation, never a wrong shape.
 */
export function halfBlocks(
  grid: number[][],
  palette: (Paint | undefined)[],
  cellW = 2,
  cellH = 1,
): Seg[][] {
  const rows = cellH === 1 ? grid : grid.flatMap((row) => Array.from({ length: cellH }, () => row));
  const out: Seg[][] = [];
  for (let y = 0; y < rows.length; y += 2) {
    const top = rows[y];
    const bottom = rows[y + 1] ?? top.map(() => 0);
    const segs: Seg[] = [];
    for (let x = 0; x < top.length; x += 1) {
      const t = top[x];
      const b = bottom[x];
      const ch = t && b ? '█' : t ? '▀' : b ? '▄' : ' ';
      const paint = palette[t || b];
      const text = ch.repeat(cellW);
      const last = segs[segs.length - 1];
      if (last && last.paint === paint) last.text += text;
      else segs.push({ text, paint });
    }
    out.push(segs);
  }
  return out;
}

/** The message every board shows when the terminal cannot hold it. */
export function tooSmall(theme: Theme, needW: number, needR: number): Seg[][] {
  return [
    [{ text: '' }],
    [{ text: `  This needs about ${needW} columns and ${needR} rows.`, paint: theme.warn }],
    [{ text: '  Make the terminal bigger, or esc goes back.', paint: theme.dim }],
  ];
}

/* --------------------------------------------------------------- big digits */

/**
 * Six-row block digits in the same hand as the logo, for the clock, the
 * stopwatch and the random number. Width varies by glyph; a column of space
 * separates them when joined.
 */
const DIGITS: Record<string, string[]> = {
  '0': ['███ ', '█  █', '█  █', '█  █', '█  █', ' ███'],
  '1': [' █  ', '██  ', ' █  ', ' █  ', ' █  ', '███ '],
  '2': ['███ ', '   █', ' ██ ', '█   ', '█   ', '████'],
  '3': ['███ ', '   █', ' ██ ', '   █', '   █', '███ '],
  '4': ['█  █', '█  █', '████', '   █', '   █', '   █'],
  '5': ['████', '█   ', '███ ', '   █', '   █', '███ '],
  '6': [' ██ ', '█   ', '███ ', '█  █', '█  █', ' ██ '],
  '7': ['████', '   █', '  █ ', '  █ ', ' █  ', ' █  '],
  '8': [' ██ ', '█  █', ' ██ ', '█  █', '█  █', ' ██ '],
  '9': [' ██ ', '█  █', ' ███', '   █', '   █', ' ██ '],
  ':': ['    ', ' █  ', '    ', '    ', ' █  ', '    '],
  '.': ['    ', '    ', '    ', '    ', '    ', ' █  '],
  '-': ['    ', '    ', '████', '    ', '    ', '    '],
  ' ': ['  ', '  ', '  ', '  ', '  ', '  '],
};

/** Block art blown up k times: each character k wide, each row k tall. */
export function scaleArt(rows: string[], k: number): string[] {
  if (k <= 1) return rows;
  return rows.flatMap((row) => {
    const wide = [...row].map((ch) => ch.repeat(k)).join('');
    return Array.from({ length: k }, () => wide);
  });
}

/** The string as six rows of blocks. Unknown characters are skipped. */
export function bigText(text: string): string[] {
  const rows = ['', '', '', '', '', ''];
  for (const ch of text) {
    const glyph = DIGITS[ch];
    if (!glyph) continue;
    for (let r = 0; r < 6; r += 1) rows[r] += (rows[r] ? ' ' : '') + glyph[r];
  }
  return rows;
}
