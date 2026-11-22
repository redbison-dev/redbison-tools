/**
 * `:tetris` — the standard 10 by 20 well, drawn at half-block resolution so
 * it stands ten terminal rows tall with the next piece beside it.
 *
 * Pieces come from a 7-bag: every tetromino exactly once per seven, which is
 * what keeps a long drought of I pieces from being the game's real opponent.
 * Rotation is clockwise and counter-clockwise with simple wall kicks (try in
 * place, then one and two columns either way); scoring is 10 a locked piece
 * and 100 × level × a 1/3/5/8 multiplier for 1/2/3/4 lines, the level rising
 * every ten lines and gravity going from 500ms a row down to an 80ms floor.
 */
import type { Theme } from '../theme';
import { centre, fitScale, halfBlocks, padText, shuffle, tooSmall, type Extra, type ExtraKey, type ExtraStep, type Paint, type Seg } from './core';

export const WELL_W = 10;
export const WELL_H = 20;

/** Each piece as its cells per rotation state, in a 4x4 box. */
const SHAPES: Record<string, number[][][]> = {};
const define = (name: string, base: [number, number][], states: number) => {
  const rots: number[][][] = [];
  let cells = base;
  for (let r = 0; r < 4; r += 1) {
    rots.push(cells.map(([x, y]) => [x, y]));
    // Rotate clockwise inside the 4x4 box (3x3 for everything but I and O).
    const size = name === 'I' ? 4 : 3;
    cells = cells.map(([x, y]) => [size - 1 - y, x]);
  }
  SHAPES[name] = rots.slice(0, states);
};
define('I', [[0, 1], [1, 1], [2, 1], [3, 1]], 2);
define('O', [[1, 0], [2, 0], [1, 1], [2, 1]], 1);
define('T', [[1, 0], [0, 1], [1, 1], [2, 1]], 4);
define('S', [[1, 0], [2, 0], [0, 1], [1, 1]], 2);
define('Z', [[0, 0], [1, 0], [1, 1], [2, 1]], 2);
define('J', [[0, 0], [0, 1], [1, 1], [2, 1]], 4);
define('L', [[2, 0], [0, 1], [1, 1], [2, 1]], 4);

export const PIECES = Object.keys(SHAPES);

/** Palette index per piece, for the half-block renderer. */
const COLOUR: Record<string, number> = { I: 1, O: 2, T: 3, S: 4, Z: 5, J: 6, L: 7 };

export type Falling = { piece: string; rot: number; x: number; y: number };

export type TetrisState = {
  /** 0 empty, otherwise the palette index that locked there. */
  well: number[][];
  falling: Falling | null;
  bag: string[];
  next: string;
  seed: number;
  score: number;
  lines: number;
  best: number;
  alive: boolean;
  paused: boolean;
  lastFall: number;
};

export function level(lines: number): number {
  return Math.floor(lines / 10) + 1;
}

export function gravityMs(lines: number): number {
  return Math.max(80, 500 - (level(lines) - 1) * 50);
}

export function cellsOf(f: Falling): [number, number][] {
  return SHAPES[f.piece][f.rot % SHAPES[f.piece].length].map(([x, y]) => [f.x + x, f.y + y]);
}

export function collides(well: number[][], f: Falling): boolean {
  return cellsOf(f).some(([x, y]) => x < 0 || x >= WELL_W || y >= WELL_H || (y >= 0 && well[y][x] !== 0));
}

function refill(bag: string[], seed: number): { bag: string[]; seed: number } {
  if (bag.length) return { bag, seed };
  const r = shuffle(seed, PIECES);
  return { bag: r.items, seed: r.seed };
}

export function dealPiece(es: TetrisState): TetrisState {
  const r = refill(es.bag, es.seed);
  const piece = es.next;
  const bag = r.bag.slice(1);
  const next = r.bag[0];
  const falling: Falling = { piece, rot: 0, x: 3, y: piece === 'I' ? -1 : 0 };
  if (collides(es.well, falling)) {
    return { ...es, falling: null, alive: false, best: Math.max(es.best, es.score), bag, next, seed: r.seed };
  }
  return { ...es, falling, bag, next, seed: r.seed };
}

export function newGame(seed: number, best = 0): TetrisState {
  const first = refill([], seed);
  const base: TetrisState = {
    well: Array.from({ length: WELL_H }, () => Array<number>(WELL_W).fill(0)),
    falling: null,
    bag: first.bag.slice(1),
    next: first.bag[0],
    seed: first.seed,
    score: 0,
    lines: 0,
    best,
    alive: true,
    paused: false,
    lastFall: 0,
  };
  return dealPiece(base);
}

const LINE_SCORE = [0, 1, 3, 5, 8];

/** Lock the falling piece, clear lines, deal the next. */
export function lock(es: TetrisState): TetrisState {
  if (!es.falling) return es;
  const well = es.well.map((row) => [...row]);
  for (const [x, y] of cellsOf(es.falling)) {
    if (y >= 0 && y < WELL_H && x >= 0 && x < WELL_W) well[y][x] = COLOUR[es.falling.piece];
  }
  const full = well.map((row, y) => ({ row, y })).filter(({ row }) => row.every((c) => c !== 0)).map(({ y }) => y);
  let cleared = well;
  if (full.length) {
    cleared = well.filter((_, y) => !full.includes(y));
    while (cleared.length < WELL_H) cleared.unshift(Array<number>(WELL_W).fill(0));
  }
  const lines = es.lines + full.length;
  const score = es.score + 10 + LINE_SCORE[full.length] * 100 * level(es.lines);
  return dealPiece({ ...es, well: cleared, falling: null, lines, score });
}

export function tryMove(es: TetrisState, dx: number, dy: number): TetrisState {
  if (!es.falling) return es;
  const moved = { ...es.falling, x: es.falling.x + dx, y: es.falling.y + dy };
  if (collides(es.well, moved)) return es;
  return { ...es, falling: moved };
}

export function tryRotate(es: TetrisState, by: 1 | -1): TetrisState {
  if (!es.falling) return es;
  const states = SHAPES[es.falling.piece].length;
  const rot = (es.falling.rot + by + states) % states;
  // In place first, then kicked one and two columns either way.
  for (const kick of [0, -1, 1, -2, 2]) {
    const turned = { ...es.falling, rot, x: es.falling.x + kick };
    if (!collides(es.well, turned)) return { ...es, falling: turned };
  }
  return es;
}

/** Soft drop one row; a piece that cannot fall locks. */
export function fall(es: TetrisState): TetrisState {
  if (!es.falling) return es;
  const dropped = { ...es.falling, y: es.falling.y + 1 };
  if (!collides(es.well, dropped)) return { ...es, falling: dropped };
  return lock(es);
}

export function hardDrop(es: TetrisState): TetrisState {
  if (!es.falling) return es;
  let f = es.falling;
  while (!collides(es.well, { ...f, y: f.y + 1 })) f = { ...f, y: f.y + 1 };
  return lock({ ...es, falling: f });
}

export function onTick(es: TetrisState, now: number): TetrisState {
  if (!es.alive || es.paused) return es;
  if (es.lastFall === 0) return { ...es, lastFall: now };
  if (now - es.lastFall < gravityMs(es.lines)) return es;
  return { ...fall(es), lastFall: now };
}

const tetris: Extra<TetrisState> = {
  id: 'tetris',
  title: 'Tetris',
  summary: 'The well, the seven pieces, the lines.',
  tickMs: 30,

  init: (seed) => newGame(seed),

  tick: onTick,

  key(es: TetrisState, k: ExtraKey): ExtraStep<TetrisState> {
    if (k.name === 'q') return { exit: true };
    if (!es.alive) {
      if (k.name === 'r' || k.name === 'space' || k.name === 'return' || k.name === 'enter') {
        return { es: newGame(es.seed, es.best) };
      }
      return { es };
    }
    if (k.name === 'p') return { es: { ...es, paused: !es.paused, lastFall: 0 } };
    if (es.paused) return { es };
    switch (k.name) {
      case 'left':
      case 'h':
        return { es: tryMove(es, -1, 0) };
      case 'right':
      case 'l':
        return { es: tryMove(es, 1, 0) };
      case 'down':
      case 'j':
        return { es: fall(es) };
      case 'up':
      case 'k':
      case 'x':
        return { es: tryRotate(es, 1) };
      case 'z':
        return { es: tryRotate(es, -1) };
      case 'space':
        return { es: hardDrop(es) };
      default:
        return { es };
    }
  },

  render(es: TetrisState, theme: Theme, width: number, rows: number): Seg[][] {
    const needW = WELL_W * 2 + 2 + 14;
    if (width < needW + 4 || rows < WELL_H / 2 + 1) return tooSmall(theme, needW + 4, WELL_H / 2 + 5);
    // Scale the well to the terminal; the side panel keeps its type size.
    const k = fitScale(width - 4 - 16, rows - 1, WELL_W * 2, WELL_H);
    const wellW = WELL_W * 2 * k;

    const grid = es.well.map((row) => [...row]);
    if (es.falling) {
      for (const [x, y] of cellsOf(es.falling)) {
        if (y >= 0 && y < WELL_H && x >= 0 && x < WELL_W) grid[y][x] = 8;
      }
    }
    const palette: (Paint | undefined)[] = [
      undefined,
      theme.filter, // I
      theme.warn, // O
      theme.menuNumKey, // T
      theme.ok, // S
      theme.error, // Z
      theme.row, // J
      theme.counter, // L
      theme.titleHi, // the falling piece
    ];

    const board = halfBlocks(grid, palette, 2 * k, k);
    // The next piece in a 4x2 box beside the well, same half-block hand.
    const preview: number[][] = Array.from({ length: 4 }, () => Array<number>(4).fill(0));
    for (const [x, y] of SHAPES[es.next][0]) preview[y][x] = COLOUR[es.next];
    const previewLines = halfBlocks(preview, palette);

    const side: Seg[][] = [
      [{ text: padText('next', 10), paint: theme.docKey }],
      ...previewLines,
      [{ text: '' }],
      [{ text: `score ${es.score}`, paint: theme.body }],
      [{ text: `lines ${es.lines}`, paint: theme.body }],
      [{ text: `level ${level(es.lines)}`, paint: theme.body }],
      [{ text: `best  ${es.best}`, paint: theme.dim }],
    ];

    const lines: Seg[][] = [];
    const leftPad = Math.max(1, Math.floor((width - 2 - (wellW + 2 + 14)) / 2));
    for (let r = 0; r < board.length; r += 1) {
      const segs: Seg[] = [{ text: ' '.repeat(leftPad) }];
      segs.push({ text: '▕', paint: theme.border });
      segs.push(...board[r]);
      segs.push({ text: '▏', paint: theme.border });
      segs.push({ text: '  ' });
      segs.push(...(side[r] ?? [{ text: '' }]));
      lines.push(segs);
    }
    // The floor, drawn: a well whose bottom is implied reads as a hole.
    lines.push([{ text: ' '.repeat(leftPad) }, { text: `▝${'▀'.repeat(wellW)}▘`, paint: theme.border }]);
    if (!es.alive) {
      lines[4 * k] = centre([{ text: `  game over — ${es.score} points · r plays again  `, paint: theme.cursor }], width - 2);
    } else if (es.paused) {
      lines[4 * k] = centre([{ text: '  paused — p resumes  ', paint: theme.cursor }], width - 2);
    }
    return lines;
  },

  info: (es) => [
    ['Score', String(es.score)],
    ['Lines', String(es.lines)],
    ['Level', String(level(es.lines))],
  ],

  hints: (es) =>
    es.alive
      ? [
          ['←→', 'move'],
          ['↑', 'rotate'],
          ['space', 'drop'],
          ['p', 'pause'],
          ['q', 'back'],
        ]
      : [
          ['r', 'again'],
          ['q', 'back'],
        ],
};

export default tetris;
