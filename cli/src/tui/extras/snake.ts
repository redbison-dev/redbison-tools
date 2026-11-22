/**
 * `:snake` — the Nokia one, on a 36 by 24 board drawn at half-block
 * resolution so it stands twelve terminal rows tall.
 *
 * The board is walls: hitting one ends the game, as does the tail. Speed
 * starts at 140ms a step and tightens by 4ms per apple down to a floor of
 * 60ms. A turn straight back into the neck is refused rather than fatal,
 * because on a keyboard that is always a slip, never a decision.
 */
import type { Theme } from '../theme';
import { centre, halfBlocks, nextInt, tooSmall, type Extra, type ExtraKey, type ExtraStep, type Paint, type Seg } from './core';

export const COLS = 36;
export const ROWS = 24;

type Point = { x: number; y: number };
export type Dir = 'up' | 'down' | 'left' | 'right';

export type SnakeState = {
  snake: Point[]; // head first
  dir: Dir;
  /** The turn taken this step, so two quick keys cannot fold the snake. */
  pendingDir: Dir;
  food: Point;
  seed: number;
  score: number;
  best: number;
  alive: boolean;
  paused: boolean;
  lastStep: number;
};

const DELTA: Record<Dir, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };

export function stepMs(score: number): number {
  return Math.max(60, 140 - score * 4);
}

export function placeFood(seed: number, snake: Point[]): { food: Point; seed: number } {
  let s = seed;
  // The board has 864 cells and the snake a few dozen, so this terminates
  // fast in practice; the guard is for the theoretical full board.
  for (let tries = 0; tries < 2000; tries += 1) {
    const rx = nextInt(s, 0, COLS - 1);
    const ry = nextInt(rx.seed, 0, ROWS - 1);
    s = ry.seed;
    if (!snake.some((p) => p.x === rx.value && p.y === ry.value)) {
      return { food: { x: rx.value, y: ry.value }, seed: s };
    }
  }
  return { food: { x: 0, y: 0 }, seed: s };
}

export function newGame(seed: number, best = 0): SnakeState {
  const snake = [
    { x: 8, y: 12 },
    { x: 7, y: 12 },
    { x: 6, y: 12 },
  ];
  const f = placeFood(seed, snake);
  return {
    snake,
    dir: 'right',
    pendingDir: 'right',
    food: f.food,
    seed: f.seed,
    score: 0,
    best,
    alive: true,
    paused: false,
    lastStep: 0,
  };
}

/** One movement step: the part of the game that is not timing. */
export function step(es: SnakeState): SnakeState {
  const dir = es.pendingDir;
  const head = es.snake[0];
  const d = DELTA[dir];
  const nx = head.x + d.x;
  const ny = head.y + d.y;
  const ate = nx === es.food.x && ny === es.food.y;
  // The tail cell empties this step unless the snake grows into it.
  const body = ate ? es.snake : es.snake.slice(0, -1);
  const dead = nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS || body.some((p) => p.x === nx && p.y === ny);
  if (dead) {
    return { ...es, dir, alive: false, best: Math.max(es.best, es.score) };
  }
  const snake = [{ x: nx, y: ny }, ...body];
  if (!ate) return { ...es, dir, snake };
  const f = placeFood(es.seed, snake);
  return { ...es, dir, snake, food: f.food, seed: f.seed, score: es.score + 1 };
}

export function onTick(es: SnakeState, now: number): SnakeState {
  if (!es.alive || es.paused) return es;
  if (es.lastStep === 0) return { ...es, lastStep: now };
  if (now - es.lastStep < stepMs(es.score)) return es;
  return { ...step(es), lastStep: now };
}

const DIR_KEYS: Record<string, Dir> = {
  up: 'up',
  k: 'up',
  w: 'up',
  down: 'down',
  j: 'down',
  s: 'down',
  left: 'left',
  h: 'left',
  a: 'left',
  right: 'right',
  l: 'right',
  d: 'right',
};

const snake: Extra<SnakeState> = {
  id: 'snake',
  title: 'Snake',
  summary: 'Eat, grow, do not meet yourself.',
  tickMs: 30,

  init: (seed) => newGame(seed),

  tick: onTick,

  key(es: SnakeState, k: ExtraKey): ExtraStep<SnakeState> {
    if (k.name === 'q') return { exit: true };
    if (!es.alive) {
      if (k.name === 'r' || k.name === 'space' || k.name === 'return' || k.name === 'enter') {
        return { es: newGame(es.seed, es.best) };
      }
      return { es };
    }
    if (k.name === 'p' || k.name === 'space') return { es: { ...es, paused: !es.paused, lastStep: 0 } };
    const dir = DIR_KEYS[k.name];
    // Turns queue against the direction last *stepped*, so a fast double-tap
    // cannot reverse through the neck between two frames.
    if (dir && dir !== OPPOSITE[es.dir] && !es.paused) return { es: { ...es, pendingDir: dir } };
    return { es };
  },

  render(es: SnakeState, theme: Theme, width: number, rows: number): Seg[][] {
    const needW = COLS * 2 + 6;
    // 12 board lines plus the two wall lines is exactly what an 80x24
    // terminal's body has room for.
    if (width < needW || rows < ROWS / 2 + 2) return tooSmall(theme, needW, ROWS / 2 + 5);

    const grid: number[][] = Array.from({ length: ROWS }, () => Array<number>(COLS).fill(0));
    es.snake.forEach((p, i) => {
      grid[p.y][p.x] = i === 0 ? 2 : 1;
    });
    grid[es.food.y][es.food.x] = 3;
    const palette: (Paint | undefined)[] = [undefined, theme.row, theme.titleHi, theme.error];

    // The walls are fatal, so they are drawn: a court with invisible edges
    // reads as an endless field right up to the collision that says otherwise.
    const board = halfBlocks(grid, palette).map((segs) =>
      centre([{ text: '▐', paint: theme.border }, ...segs, { text: '▌', paint: theme.border }], width - 2),
    );
    const lines: Seg[][] = [
      centre([{ text: `▗${'▄'.repeat(COLS * 2)}▖`, paint: theme.border }], width - 2),
      ...board,
      centre([{ text: `▝${'▀'.repeat(COLS * 2)}▘`, paint: theme.border }], width - 2),
    ];
    if (!es.alive) {
      lines[Math.floor(ROWS / 4) + 1] = centre(
        [{ text: `  game over — ${es.score} apple${es.score === 1 ? '' : 's'} · r plays again  `, paint: theme.cursor }],
        width - 2,
      );
    } else if (es.paused) {
      lines[Math.floor(ROWS / 4) + 1] = centre([{ text: '  paused — space resumes  ', paint: theme.cursor }], width - 2);
    }
    return lines;
  },

  info: (es) => [
    ['Score', String(es.score)],
    ['Best', String(es.best)],
    ['Speed', `${stepMs(es.score)}ms`],
  ],

  hints: (es) =>
    es.alive
      ? [
          ['←↑↓→', 'steer'],
          ['space', 'pause'],
          ['q', 'back'],
        ]
      : [
          ['r', 'again'],
          ['q', 'back'],
        ],
};

export default snake;
