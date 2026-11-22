/**
 * `:breakout` — a 72 by 24 court at half-block resolution: six rows of
 * bricks, a paddle, three lives.
 *
 * The ball lives at float coordinates and each tick is taken in sub-steps no
 * longer than one cell, which is what stops a fast ball tunnelling through a
 * brick between frames. Where it leaves the paddle depends on where it
 * landed on it — the edges send it out flat, the middle sends it up — and
 * every level and every fourth paddle touch adds pace.
 */
import type { Theme } from '../theme';
import { centre, halfBlocks, next, tooSmall, type Extra, type ExtraKey, type ExtraStep, type Paint, type Seg } from './core';

export const COLS = 72;
export const ROWS = 24;
export const PADDLE_W = 10;
const PADDLE_Y = ROWS - 1;
export const BRICK_W = 6;
export const BRICK_ROWS = 6;
export const BRICKS_PER_ROW = COLS / BRICK_W;
const BRICK_TOP = 2;

export type Ball = { x: number; y: number; vx: number; vy: number };

export type BreakoutState = {
  paddle: number;
  /** null while the ball waits on the paddle for space. */
  ball: Ball | null;
  /** [row][slot] true while the brick stands. */
  bricks: boolean[][];
  lives: number;
  score: number;
  levelN: number;
  /** Cells per tick. */
  speed: number;
  touches: number;
  seed: number;
  alive: boolean;
  paused: boolean;
};

export function freshBricks(): boolean[][] {
  return Array.from({ length: BRICK_ROWS }, () => Array<boolean>(BRICKS_PER_ROW).fill(true));
}

export function newGame(seed: number): BreakoutState {
  return {
    paddle: Math.floor((COLS - PADDLE_W) / 2),
    ball: null,
    bricks: freshBricks(),
    lives: 3,
    score: 0,
    levelN: 1,
    speed: 0.8,
    touches: 0,
    seed,
    alive: true,
    paused: false,
  };
}

export function launch(es: BreakoutState): BreakoutState {
  if (es.ball) return es;
  const r = next(es.seed);
  // Up and a little sideways, never straight up: a vertical ball on a fresh
  // court would bounce between the same two points until someone moved.
  const angle = (-70 + r.value * 140) * (Math.PI / 180);
  const vx = Math.sin(angle) * es.speed;
  const vy = -Math.abs(Math.cos(angle) * es.speed);
  return { ...es, seed: r.seed, ball: { x: es.paddle + PADDLE_W / 2, y: PADDLE_Y - 1, vx, vy } };
}

export function brickAt(es: BreakoutState, x: number, y: number): { row: number; slot: number } | null {
  const row = Math.floor(y) - BRICK_TOP;
  if (row < 0 || row >= BRICK_ROWS) return null;
  const slot = Math.floor(x / BRICK_W);
  if (slot < 0 || slot >= BRICKS_PER_ROW) return null;
  return es.bricks[row][slot] ? { row, slot } : null;
}

/** Higher rows pay more, the classic arrangement. */
export const rowScore = (row: number) => (BRICK_ROWS - row) * 10;

export function paddleBounce(es: BreakoutState, ball: Ball): Ball {
  const hit = (ball.x - es.paddle) / PADDLE_W; // 0 at the left edge, 1 at the right
  const spread = Math.max(-1, Math.min(1, hit * 2 - 1));
  const angle = spread * 65 * (Math.PI / 180);
  return {
    ...ball,
    vx: Math.sin(angle) * es.speed,
    vy: -Math.abs(Math.cos(angle) * es.speed),
    y: PADDLE_Y - 1,
  };
}

/** One tick of physics, in sub-steps of at most one cell. */
export function step(es: BreakoutState): BreakoutState {
  if (!es.ball) return es;
  let s = es;
  let ball = { ...es.ball };
  const steps = Math.max(1, Math.ceil(es.speed * 2));
  for (let i = 0; i < steps; i += 1) {
    ball.x += ball.vx / steps;
    ball.y += ball.vy / steps;

    if (ball.x < 0) {
      ball.x = 0;
      ball.vx = Math.abs(ball.vx);
    }
    if (ball.x > COLS - 1) {
      ball.x = COLS - 1;
      ball.vx = -Math.abs(ball.vx);
    }
    if (ball.y < 0) {
      ball.y = 0;
      ball.vy = Math.abs(ball.vy);
    }

    const hit = brickAt(s, ball.x, ball.y);
    if (hit) {
      const bricks = s.bricks.map((r) => [...r]);
      bricks[hit.row][hit.slot] = false;
      s = { ...s, bricks, score: s.score + rowScore(hit.row) };
      ball.vy = -ball.vy;
      if (bricks.every((r) => r.every((b) => !b))) {
        // Court cleared: a faster serve on a fresh wall.
        return {
          ...s,
          ball: null,
          bricks: freshBricks(),
          levelN: s.levelN + 1,
          speed: s.speed * 1.15,
          touches: 0,
        };
      }
      continue;
    }

    if (ball.vy > 0 && ball.y >= PADDLE_Y - 1 && ball.x >= s.paddle - 0.5 && ball.x <= s.paddle + PADDLE_W + 0.5) {
      ball = paddleBounce(s, ball);
      const touches = s.touches + 1;
      // Every fourth save quickens the ball, capped where it stays playable.
      s = touches % 4 === 0 ? { ...s, touches, speed: Math.min(2.2, s.speed * 1.06) } : { ...s, touches };
      continue;
    }

    if (ball.y > ROWS - 1) {
      const lives = s.lives - 1;
      if (lives <= 0) return { ...s, lives: 0, ball: null, alive: false };
      return { ...s, lives, ball: null };
    }
  }
  return { ...s, ball };
}

export function onTick(es: BreakoutState, now: number): BreakoutState {
  void now; // constant rate: the speed lives in the velocity, not the timer
  if (!es.alive || es.paused || !es.ball) return es;
  return step(es);
}

export function movePaddle(es: BreakoutState, by: number): BreakoutState {
  return { ...es, paddle: Math.max(0, Math.min(COLS - PADDLE_W, es.paddle + by)) };
}

const breakout: Extra<BreakoutState> = {
  id: 'breakout',
  title: 'Breakout',
  summary: 'A wall, a paddle, three lives.',
  tickMs: 33,

  init: (seed) => newGame(seed),

  tick: onTick,

  key(es: BreakoutState, k: ExtraKey): ExtraStep<BreakoutState> {
    if (k.name === 'q') return { exit: true };
    if (!es.alive) {
      if (k.name === 'r' || k.name === 'space' || k.name === 'return' || k.name === 'enter') {
        return { es: newGame(es.seed) };
      }
      return { es };
    }
    if (k.name === 'p') return { es: { ...es, paused: !es.paused } };
    if (es.paused) return { es };
    switch (k.name) {
      case 'left':
      case 'h':
      case 'a':
        return { es: movePaddle(es, k.shift ? -6 : -3) };
      case 'right':
      case 'l':
      case 'd':
        return { es: movePaddle(es, k.shift ? 6 : 3) };
      case 'space':
      case 'return':
      case 'enter':
        return { es: launch(es) };
      default:
        return { es };
    }
  },

  render(es: BreakoutState, theme: Theme, width: number, rows: number): Seg[][] {
    if (width < COLS + 4 || rows < ROWS / 2) return tooSmall(theme, COLS + 4, ROWS / 2 + 4);

    const grid: number[][] = Array.from({ length: ROWS }, () => Array<number>(COLS).fill(0));
    // Bricks: palette index by row, a slot of BRICK_W cells with a one-cell gap.
    es.bricks.forEach((row, r) => {
      row.forEach((standing, slot) => {
        if (!standing) return;
        for (let i = 0; i < BRICK_W - 1; i += 1) grid[BRICK_TOP + r][slot * BRICK_W + i] = 1 + (r % 6);
      });
    });
    for (let i = 0; i < PADDLE_W; i += 1) grid[PADDLE_Y][es.paddle + i] = 7;
    const ball = es.ball ?? { x: es.paddle + PADDLE_W / 2, y: PADDLE_Y - 1, vx: 0, vy: 0 };
    const bx = Math.max(0, Math.min(COLS - 1, Math.round(ball.x)));
    const by = Math.max(0, Math.min(ROWS - 1, Math.round(ball.y)));
    grid[by][bx] = 8;

    const palette: (Paint | undefined)[] = [
      undefined,
      theme.error,
      theme.warn,
      theme.counter,
      theme.ok,
      theme.filter,
      theme.row,
      theme.titleHi, // paddle
      theme.logo, // ball
    ];

    const lines = halfBlocks(grid, palette, 1).map((segs) => centre(segs, width - 2));
    if (!es.alive) {
      lines[Math.floor(ROWS / 4)] = centre(
        [{ text: `  game over — ${es.score} points · r plays again  `, paint: theme.cursor }],
        width - 2,
      );
    } else if (es.paused) {
      lines[Math.floor(ROWS / 4)] = centre([{ text: '  paused — p resumes  ', paint: theme.cursor }], width - 2);
    } else if (!es.ball) {
      lines[Math.floor(ROWS / 4)] = centre([{ text: '  space serves  ', paint: theme.cursor }], width - 2);
    }
    return lines;
  },

  info: (es) => [
    ['Score', String(es.score)],
    ['Lives', '●'.repeat(Math.max(0, es.lives)) || '—'],
    ['Level', String(es.levelN)],
  ],

  hints: (es) =>
    es.alive
      ? [
          ['←→', 'paddle'],
          ...(es.ball ? [] : [['space', 'serve'] as [string, string]]),
          ['p', 'pause'],
          ['q', 'back'],
        ]
      : [
          ['r', 'again'],
          ['q', 'back'],
        ],
};

export default breakout;
