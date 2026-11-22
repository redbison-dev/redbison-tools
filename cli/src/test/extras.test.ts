/**
 * The extras' own rules, tested as the pure functions they are: no pty, no
 * timer, no Math.random. Every game starts from a chosen seed, so a failure
 * reproduces exactly, and the clocks are whatever number the test hands in.
 */
import { describe, it, expect } from 'vitest';
import { next, nextInt, shuffle, bigText, halfBlocks } from '../tui/extras/core';
import { hour12, clockFace } from '../tui/extras/clock';
import { advance, watchFace, type StopwatchState } from '../tui/extras/stopwatch';
import coinExtra, { flip, settle, type CoinState } from '../tui/extras/coin';
import { parseRange, draw, type RandomState } from '../tui/extras/random';
import { deal, addNames, type SplitState } from '../tui/extras/split';
import snakeExtra, * as Snake from '../tui/extras/snake';
import * as Tetris from '../tui/extras/tetris';
import * as Breakout from '../tui/extras/breakout';
import * as Blocks from '../tui/extras/blocks';
import menuExtra, { MENU_ROWS } from '../tui/extras/menu';
import { EXTRAS, extraById } from '../tui/extras';

describe('the shared randomness', () => {
  it('is deterministic from a seed and fair-ish across draws', () => {
    expect(next(7).value).toBe(next(7).value);
    const seen = new Set<number>();
    let seed = 1;
    for (let i = 0; i < 200; i += 1) {
      const r = nextInt(seed, 1, 10);
      seed = r.seed;
      expect(r.value).toBeGreaterThanOrEqual(1);
      expect(r.value).toBeLessThanOrEqual(10);
      seen.add(r.value);
    }
    // 200 draws from 10 values that miss some value would be a broken PRNG.
    expect(seen.size).toBe(10);
  });

  it('shuffles without losing or inventing anyone', () => {
    const r = shuffle(42, ['a', 'b', 'c', 'd', 'e']);
    expect([...r.items].sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(shuffle(42, ['a', 'b', 'c', 'd', 'e']).items).toEqual(r.items);
  });

  it('draws block digits six rows tall whatever the text', () => {
    for (const text of ['00:00', '1:23:45.6', '-42']) {
      const rows = bigText(text);
      expect(rows).toHaveLength(6);
      expect(new Set(rows.map((r) => r.length)).size).toBe(1);
    }
  });

  it('packs two grid rows into one terminal row of half blocks', () => {
    const segs = halfBlocks(
      [
        [1, 0],
        [0, 1],
      ],
      [undefined, undefined],
      1,
    );
    expect(segs).toHaveLength(1);
    expect(segs[0].map((s) => s.text).join('')).toBe('▀▄');
  });
});

describe('the clock', () => {
  it('converts the 12 o-clocks the way clocks do', () => {
    expect(hour12(0)).toEqual({ hour: 12, half: 'am' });
    expect(hour12(12)).toEqual({ hour: 12, half: 'pm' });
    expect(hour12(15)).toEqual({ hour: 3, half: 'pm' });
  });

  it('formats both faces from the same moment', () => {
    const at = new Date(2026, 10, 21, 15, 4, 5).getTime();
    expect(clockFace({ now: at, h24: true, showSeconds: true }).text).toBe('15:04:05');
    const twelve = clockFace({ now: at, h24: false, showSeconds: false });
    expect(twelve.text).toBe('03:04');
    expect(twelve.suffix).toBe('pm');
  });
});

describe('the stopwatch', () => {
  const running = (acc = 0): StopwatchState => ({ running: true, acc, last: null, laps: [] });

  it('accumulates only while running and only between its own ticks', () => {
    let s = running();
    s = advance(s, 1000); // first tick sets the anchor, adds nothing
    expect(s.acc).toBe(0);
    s = advance(s, 1750);
    expect(s.acc).toBe(750);
    s = { ...s, running: false, last: null };
    s = advance(s, 9999); // stopped: the tick changes nothing
    expect(s.acc).toBe(750);
    s = { ...s, running: true };
    s = advance(s, 20000); // resumed: the pause is not credited
    s = advance(s, 20100);
    expect(s.acc).toBe(850);
  });

  it('prints tenths, minutes and the hour only when there is one', () => {
    expect(watchFace(0)).toBe('00:00.0');
    expect(watchFace(69_900)).toBe('01:09.9');
    expect(watchFace(3_600_000)).toBe('1:00:00.0');
  });
});

describe('the coin', () => {
  it('decides at the flip and lands after the spin, counting once', () => {
    let s: CoinState = { seed: 5, spin: 0, face: 'heads', heads: 0, tails: 0, history: [] };
    s = flip(s);
    const decided = s.face;
    expect(s.spin).toBe(10);
    for (let i = 0; i < 10; i += 1) s = settle(s);
    expect(s.spin).toBe(0);
    expect(s.face).toBe(decided);
    expect(s.heads + s.tails).toBe(1);
    expect(s.history).toEqual([decided]);
    s = settle({ ...s }); // ticking a resting coin counts nothing
    expect(s.heads + s.tails).toBe(1);
  });

  it('is not a two-headed coin', () => {
    let s: CoinState = coinExtra.init(1) as CoinState;
    const faces = new Set<string>();
    for (let i = 0; i < 40; i += 1) {
      while (s.spin > 0) s = settle(s);
      faces.add(s.face);
      s = flip(s);
    }
    expect(faces).toEqual(new Set(['heads', 'tails']));
  });
});

describe('the random draw', () => {
  it('reads the arguments the way the help says', () => {
    expect(parseRange(undefined)).toEqual({ min: 1, max: 100, count: 1 });
    expect(parseRange('6')).toEqual({ min: 1, max: 6, count: 1 });
    expect(parseRange('5 10 3')).toEqual({ min: 5, max: 10, count: 3 });
    expect(parseRange('10 5')).toEqual({ min: 5, max: 10, count: 1 }); // swapped, not refused
    expect(parseRange('1 2 99').count).toBe(10); // capped
  });

  it('stays in range and never repeats while the range has room', () => {
    const s: RandomState = { min: 1, max: 5, count: 5, values: [], seed: 9 };
    const d = draw(s);
    expect([...d.values].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it('allows repeats when the range cannot fill the count', () => {
    const d = draw({ min: 1, max: 2, count: 6, values: [], seed: 3 });
    expect(d.values).toHaveLength(6);
    expect(d.values.every((v) => v === 1 || v === 2)).toBe(true);
  });
});

describe('the splitter', () => {
  it('deals everyone exactly once into groups within one of each other', () => {
    const names = ['ann', 'bo', 'cy', 'dee', 'ed', 'flo', 'gus'];
    const s: SplitState = { n: 3, names, buf: '', groups: null, seed: 11 };
    const d = deal(s);
    const sizes = d.groups!.map((g) => g.length);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    expect(d.groups!.flat().sort()).toEqual([...names].sort());
  });

  it('never makes more groups than people', () => {
    const d = deal({ n: 9, names: ['a', 'b', 'c'], buf: '', groups: null, seed: 1 });
    expect(d.groups).toHaveLength(3);
  });

  it('takes several names from one comma line', () => {
    const s = addNames({ n: 2, names: [], buf: ' ann, bo ,,cy ', groups: null, seed: 1 });
    expect(s.names).toEqual(['ann', 'bo', 'cy']);
    expect(s.buf).toBe('');
  });
});

describe('snake', () => {
  it('grows by eating and speeds up with the score', () => {
    let s = Snake.newGame(1);
    // Put the food straight ahead and walk into it.
    s = { ...s, food: { x: s.snake[0].x + 1, y: s.snake[0].y } };
    const before = s.snake.length;
    s = Snake.step(s);
    expect(s.snake.length).toBe(before + 1);
    expect(s.score).toBe(1);
    expect(Snake.stepMs(10)).toBeLessThan(Snake.stepMs(0));
    expect(Snake.stepMs(1000)).toBe(60); // the floor
  });

  it('dies on the wall and on itself, and remembers the best score', () => {
    let s = Snake.newGame(1);
    s = { ...s, score: 7, snake: [{ x: Snake.COLS - 1, y: 5 }], dir: 'right' as const, pendingDir: 'right' as const };
    s = Snake.step(s);
    expect(s.alive).toBe(false);
    expect(s.best).toBe(7);

    let t = Snake.newGame(1);
    t = {
      ...t,
      snake: [
        { x: 5, y: 5 },
        { x: 6, y: 5 },
        { x: 6, y: 6 },
        { x: 5, y: 6 },
        { x: 4, y: 6 },
      ],
      dir: 'down' as const,
      pendingDir: 'down' as const,
    };
    expect(Snake.step(t).alive).toBe(false);
  });

  it('refuses the about-turn but takes any other direction', () => {
    const s = Snake.newGame(1); // heading right
    const left = snakeExtra.key(s, { name: 'left' });
    expect('es' in left && (left.es as Snake.SnakeState).pendingDir).toBe('right');
    const up = snakeExtra.key(s, { name: 'up' });
    expect('es' in up && (up.es as Snake.SnakeState).pendingDir).toBe('up');
  });

  it('steps on its clock, not on every tick', () => {
    let s = Snake.newGame(1);
    s = Snake.onTick(s, 1000); // anchors
    const head = s.snake[0];
    s = Snake.onTick(s, 1030); // too soon at 140ms a step
    expect(s.snake[0]).toEqual(head);
    s = Snake.onTick(s, 1200);
    expect(s.snake[0]).not.toEqual(head);
  });

  it('never places food on the snake', () => {
    let seed = 2;
    const body = Array.from({ length: 50 }, (_, i) => ({ x: i % Snake.COLS, y: Math.floor(i / Snake.COLS) }));
    for (let i = 0; i < 50; i += 1) {
      const f = Snake.placeFood(seed, body);
      seed = f.seed;
      expect(body.some((p) => p.x === f.food.x && p.y === f.food.y)).toBe(false);
    }
  });
});

describe('tetris', () => {
  it('deals every piece exactly once per bag of seven', () => {
    let s = Tetris.newGame(3);
    const dealt: string[] = [];
    for (let i = 0; i < 14; i += 1) {
      dealt.push(s.falling!.piece);
      s = { ...s, well: s.well.map((r) => r.map(() => 0)) }; // keep the well clear
      s = Tetris.hardDrop({ ...s, well: s.well });
      s = { ...s, well: s.well.map((r) => r.map(() => 0)) };
    }
    const firstBag = dealt.slice(0, 7);
    expect([...new Set(firstBag)]).toHaveLength(7);
  });

  it('refuses a rotation the wall cannot take, after trying the kicks', () => {
    let s = Tetris.newGame(3);
    s = { ...s, falling: { piece: 'I', rot: 1, x: -2, y: 5 } };
    // A vertical I at the left wall: rotating horizontal from x=-2 kicks to
    // a legal spot if one exists within two columns, else stays vertical.
    const turned = Tetris.tryRotate(s, 1);
    expect(Tetris.collides(turned.well, turned.falling!)).toBe(false);
  });

  it('clears a full row, scores it by level, and drops the stack', () => {
    let s = Tetris.newGame(3);
    const well = s.well.map((r) => [...r]);
    // Bottom row full except where a vertical I will land.
    for (let x = 1; x < Tetris.WELL_W; x += 1) well[Tetris.WELL_H - 1][x] = 7;
    well[Tetris.WELL_H - 2][5] = 7; // a cell that must fall one row
    s = { ...s, well, falling: { piece: 'I', rot: 1, x: -2, y: 5 }, score: 0, lines: 0 };
    const after = Tetris.hardDrop(s);
    expect(after.lines).toBe(1);
    expect(after.score).toBe(10 + 100); // the piece, one line at level 1
    expect(after.well[Tetris.WELL_H - 1][5]).toBe(7); // the stack fell
    expect(after.well[Tetris.WELL_H - 2][5]).toBe(0);
  });

  it('ends when the spawn is blocked, keeping the best score', () => {
    let s = Tetris.newGame(3);
    const well = s.well.map((r) => r.map(() => 1));
    s = Tetris.dealPiece({ ...s, well, score: 42, falling: null });
    expect(s.alive).toBe(false);
    expect(s.best).toBe(42);
  });

  it('speeds up with the level and stops at the floor', () => {
    expect(Tetris.gravityMs(0)).toBe(500);
    expect(Tetris.gravityMs(10)).toBe(450);
    expect(Tetris.gravityMs(1000)).toBe(80);
  });
});

describe('breakout', () => {
  it('serves at the paddle and bounces off the side walls', () => {
    let s = Breakout.newGame(4);
    s = Breakout.launch(s);
    expect(s.ball).not.toBeNull();
    expect(s.ball!.vy).toBeLessThan(0);
    // Pin the ball heading into the left wall below the bricks.
    s = { ...s, ball: { x: 0.2, y: 15, vx: -0.8, vy: 0.01 } };
    s = Breakout.step(s);
    expect(s.ball!.vx).toBeGreaterThan(0);
  });

  it('takes a brick, pays by row, and bounces back', () => {
    let s = Breakout.newGame(4);
    s = { ...s, ball: { x: 10, y: 8.4, vx: 0, vy: -0.8 } };
    const before = s.score;
    s = Breakout.step(s);
    expect(s.score).toBeGreaterThan(before);
    expect(s.ball!.vy).toBeGreaterThan(0);
    expect(s.bricks.flat().filter((b) => !b)).toHaveLength(1);
  });

  it('angles the return by where the paddle was hit', () => {
    const s = Breakout.newGame(4);
    const leftEdge = Breakout.paddleBounce(s, { x: s.paddle, y: 22, vx: 0.3, vy: 0.7 });
    const centreHit = Breakout.paddleBounce(s, { x: s.paddle + Breakout.PADDLE_W / 2, y: 22, vx: 0.3, vy: 0.7 });
    expect(leftEdge.vx).toBeLessThan(0);
    expect(Math.abs(centreHit.vx)).toBeLessThan(0.05);
    expect(leftEdge.vy).toBeLessThan(0);
  });

  it('loses a life past the paddle and the game on the last one', () => {
    let s = Breakout.newGame(4);
    s = { ...s, lives: 1, ball: { x: 30, y: 23.8, vx: 0, vy: 0.9 } };
    s = Breakout.step(s);
    expect(s.alive).toBe(false);
    expect(s.ball).toBeNull();
  });

  it('rebuilds faster bricks when the court is cleared', () => {
    let s = Breakout.newGame(4);
    const bricks = s.bricks.map((r) => r.map(() => false));
    bricks[Breakout.BRICK_ROWS - 1][0] = true;
    s = { ...s, bricks, ball: { x: 2, y: 2 + Breakout.BRICK_ROWS - 1 + 0.4, vx: 0, vy: -0.6 }, speed: 1 };
    s = Breakout.step(s);
    expect(s.levelN).toBe(2);
    expect(s.speed).toBeGreaterThan(1);
    expect(s.bricks.flat().every(Boolean)).toBe(true);
    expect(s.ball).toBeNull();
  });
});

describe('blocks', () => {
  it('places only where the piece fits and pays per cell', () => {
    let s = Blocks.newGame(6);
    const idx = s.offer[s.chosen]!;
    const size = Blocks.PIECES[idx].length;
    s = Blocks.place({ ...s, cx: 0, cy: 0 });
    expect(s.score).toBe(size);
    // The same spot again cannot take the same cells.
    const again = Blocks.place({ ...s, chosen: s.chosen, cx: 0, cy: 0 });
    expect(again.score).toBe(s.score);
  });

  it('clears a full row and a full column judged together', () => {
    const board = Array.from({ length: Blocks.SIZE }, () => Array<number>(Blocks.SIZE).fill(0));
    for (let x = 0; x < Blocks.SIZE; x += 1) board[4][x] = 1;
    for (let y = 0; y < Blocks.SIZE; y += 1) board[y][2] = 1;
    const { board: swept, cleared } = Blocks.clearLines(board);
    expect(cleared).toBe(2);
    expect(swept.flat().every((c) => c === 0)).toBe(true);
  });

  it('ends only when nothing on offer fits anywhere', () => {
    let s = Blocks.newGame(6);
    /*
     * A board of isolated one-cell holes: one at (0,0) to place into, one per
     * row at column (row+1) % 9 so that no row and no column ever fills —
     * filling a line here would clear it and hand the big piece room, which
     * is exactly the trap the first version of this test fell into.
     */
    const board = s.board.map((r) => r.map(() => 1));
    board[0][0] = 0;
    for (let y = 0; y < Blocks.SIZE; y += 1) board[y][(y + 1) % Blocks.SIZE] = 0;
    const single = Blocks.PIECES.findIndex((p) => p.length === 1);
    const big = Blocks.PIECES.findIndex((p) => p.length === 9);
    s = { ...s, board, offer: [single, big, null], chosen: 0, cx: 0, cy: 0 };
    expect(Blocks.anyFit(board, Blocks.PIECES[single])).toBe(true);
    expect(Blocks.anyFit(board, Blocks.PIECES[big])).toBe(false);
    const placed = Blocks.place(s);
    expect(placed.alive).toBe(false); // the 3x3 has nowhere to go
  });

  it('redeals the offer when all three are played', () => {
    let s = Blocks.newGame(6);
    const single = Blocks.PIECES.findIndex((p) => p.length === 1);
    s = { ...s, offer: [single, null, null], chosen: 0, cx: 0, cy: 0 };
    s = Blocks.place(s);
    expect(s.offer.filter((p) => p !== null)).toHaveLength(3);
  });
});

describe('the menu and the registry', () => {
  it('lists every extra but itself and switches to the one chosen', () => {
    expect(MENU_ROWS.map((r) => r.id)).toEqual(['clock', 'stopwatch', 'coin', 'random', 'split', 'snake', 'tetris', 'breakout', 'blocks']);
    const es = menuExtra.init(1);
    const step = menuExtra.key({ ...es, cursor: 5 }, { name: 'return' });
    expect(step).toEqual({ switch: 'snake' });
  });

  it('answers to every alias, and to no catalogue tool id', async () => {
    for (const e of EXTRAS) {
      expect(extraById(e.id)?.id).toBe(e.id);
      for (const a of e.aliases ?? []) expect(extraById(a)?.id).toBe(e.id);
    }
    const { byId } = await import('../catalog');
    for (const e of EXTRAS) {
      expect(byId(e.id), `${e.id} shadows a tool`).toBeUndefined();
      for (const a of e.aliases ?? []) expect(byId(a), `${a} shadows a tool`).toBeUndefined();
    }
  });
});
