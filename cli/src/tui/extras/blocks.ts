/**
 * `:blocks` — the 1010 kind of block puzzle: a 9 by 9 board, three pieces on
 * offer, place them anywhere they fit, and full rows and columns clear. No
 * gravity and no clock; it ends when none of the offered pieces fits
 * anywhere, which the game checks after every placement so the end is a
 * verdict rather than a surprise discovered by trying.
 *
 * Scoring: one point per cell placed, plus 10 per cleared line and another
 * 10 for every line past the first in the same placement.
 */
import type { Theme } from '../theme';
import { centre, padText, shuffle, type Extra, type ExtraKey, type ExtraStep, type Paint, type Seg } from './core';

export const SIZE = 9;

/** The offer pieces, as cell lists. Mirrors and rotations are spelled out. */
export const PIECES: [number, number][][] = [
  [[0, 0]],
  [[0, 0], [1, 0]],
  [[0, 0], [0, 1]],
  [[0, 0], [1, 0], [2, 0]],
  [[0, 0], [0, 1], [0, 2]],
  [[0, 0], [1, 0], [2, 0], [3, 0]],
  [[0, 0], [0, 1], [0, 2], [0, 3]],
  [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]],
  [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]],
  [[0, 0], [1, 0], [0, 1], [1, 1]],
  [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2]],
  [[0, 0], [0, 1], [1, 1]],
  [[0, 0], [1, 0], [0, 1]],
  [[0, 0], [1, 0], [1, 1]],
  [[0, 1], [1, 1], [1, 0]],
  [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]],
  [[0, 0], [1, 0], [2, 0], [0, 1], [0, 2]],
];

export type BlocksState = {
  /** 0 empty, else a palette index. */
  board: number[][];
  /** Indexes into PIECES; null slots are already played. */
  offer: (number | null)[];
  chosen: number;
  cx: number;
  cy: number;
  score: number;
  best: number;
  seed: number;
  alive: boolean;
};

export function fits(board: number[][], piece: [number, number][], cx: number, cy: number): boolean {
  return piece.every(([dx, dy]) => {
    const x = cx + dx;
    const y = cy + dy;
    return x >= 0 && x < SIZE && y >= 0 && y < SIZE && board[y][x] === 0;
  });
}

export function anyFit(board: number[][], piece: [number, number][]): boolean {
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      if (fits(board, piece, x, y)) return true;
    }
  }
  return false;
}

export function dealOffer(seed: number): { offer: number[]; seed: number } {
  // Three draws from a shuffle of the whole set: no duplicates in one offer,
  // and every piece reachable.
  const r = shuffle(seed, PIECES.map((_, i) => i));
  return { offer: r.items.slice(0, 3), seed: r.seed };
}

export function newGame(seed: number, best = 0): BlocksState {
  const d = dealOffer(seed);
  return {
    board: Array.from({ length: SIZE }, () => Array<number>(SIZE).fill(0)),
    offer: d.offer,
    chosen: 0,
    cx: 3,
    cy: 3,
    score: 0,
    best,
    seed: d.seed,
    alive: true,
  };
}

/** Clear any full rows and columns, both judged before either is removed. */
export function clearLines(board: number[][]): { board: number[][]; cleared: number } {
  const fullRows = board.map((row, y) => ({ y, full: row.every((c) => c !== 0) })).filter((r) => r.full).map((r) => r.y);
  const fullCols: number[] = [];
  for (let x = 0; x < SIZE; x += 1) {
    if (board.every((row) => row[x] !== 0)) fullCols.push(x);
  }
  if (!fullRows.length && !fullCols.length) return { board, cleared: 0 };
  const next = board.map((row) => [...row]);
  for (const y of fullRows) next[y] = Array<number>(SIZE).fill(0);
  for (const x of fullCols) for (let y = 0; y < SIZE; y += 1) next[y][x] = 0;
  return { board: next, cleared: fullRows.length + fullCols.length };
}

export function place(es: BlocksState): BlocksState {
  const pieceIndex = es.offer[es.chosen];
  if (pieceIndex === null) return es;
  const piece = PIECES[pieceIndex];
  if (!fits(es.board, piece, es.cx, es.cy)) return es;

  const board = es.board.map((row) => [...row]);
  const colour = 1 + (pieceIndex % 6);
  for (const [dx, dy] of piece) board[es.cy + dy][es.cx + dx] = colour;
  const { board: sweptBoard, cleared } = clearLines(board);
  const score = es.score + piece.length + (cleared > 0 ? 10 * cleared + 10 * (cleared - 1) : 0);

  let offer = es.offer.map((p, i) => (i === es.chosen ? null : p));
  let seed = es.seed;
  if (offer.every((p) => p === null)) {
    const d = dealOffer(seed);
    offer = d.offer;
    seed = d.seed;
  }
  const chosen = offer.findIndex((p) => p !== null);
  const alive = offer.some((p) => p !== null && anyFit(sweptBoard, PIECES[p]));
  return {
    ...es,
    board: sweptBoard,
    offer,
    chosen: chosen === -1 ? 0 : chosen,
    score,
    seed,
    alive,
    best: alive ? es.best : Math.max(es.best, score),
  };
}

function nextChoice(es: BlocksState, by: 1 | -1): BlocksState {
  const live = es.offer.map((p, i) => ({ p, i })).filter((x) => x.p !== null);
  if (!live.length) return es;
  const at = live.findIndex((x) => x.i === es.chosen);
  const to = live[(at + by + live.length) % live.length];
  return { ...es, chosen: to.i };
}

const blocks: Extra<BlocksState> = {
  id: 'blocks',
  title: 'Blocks',
  summary: 'Fit pieces; full rows and columns clear.',
  aliases: ['1010', 'block-puzzle'],

  init: (seed) => newGame(seed),

  key(es: BlocksState, k: ExtraKey): ExtraStep<BlocksState> {
    if (k.name === 'q') return { exit: true };
    if (!es.alive) {
      if (k.name === 'r' || k.name === 'space' || k.name === 'return' || k.name === 'enter') {
        return { es: newGame(es.seed, es.best) };
      }
      return { es };
    }
    switch (k.name) {
      case 'left':
      case 'h':
        return { es: { ...es, cx: Math.max(0, es.cx - 1) } };
      case 'right':
      case 'l':
        return { es: { ...es, cx: Math.min(SIZE - 1, es.cx + 1) } };
      case 'up':
      case 'k':
        return { es: { ...es, cy: Math.max(0, es.cy - 1) } };
      case 'down':
      case 'j':
        return { es: { ...es, cy: Math.min(SIZE - 1, es.cy + 1) } };
      case 'tab':
      case 'n':
        return { es: nextChoice(es, k.shift ? -1 : 1) };
      case 'return':
      case 'enter':
      case 'space':
        return { es: place(es) };
      default:
        if (/^[1-3]$/.test(k.name) && es.offer[Number(k.name) - 1] !== null) {
          return { es: { ...es, chosen: Number(k.name) - 1 } };
        }
        return { es };
    }
  },

  render(es: BlocksState, theme: Theme, width: number, rows: number): Seg[][] {
    const trayW = 24;
    if (width < SIZE * 2 + 2 + trayW + 6 || rows < SIZE + 1) {
      return [[{ text: '' }], [{ text: `  This needs about ${SIZE * 2 + 2 + trayW + 6} columns and ${SIZE + 4} rows.`, paint: theme.warn }]];
    }
    // Cells are drawn in whole characters here, so the scale works in whole
    // rows: a cell is 2k characters wide and k rows tall.
    const k = Math.max(1, Math.min(Math.floor((width - trayW - 10) / (SIZE * 2)), Math.floor((rows - 2) / SIZE)));
    const boardW = SIZE * 2 * k + 2;

    const palette: (Paint | undefined)[] = [undefined, theme.row, theme.ok, theme.warn, theme.filter, theme.counter, theme.error];
    const pieceIndex = es.offer[es.chosen];
    const piece = pieceIndex === null ? [] : PIECES[pieceIndex];
    const legal = pieceIndex !== null && fits(es.board, PIECES[pieceIndex], es.cx, es.cy);
    const ghost = new Set(piece.map(([dx, dy]) => `${es.cx + dx},${es.cy + dy}`));

    const lines: Seg[][] = [];
    const leftPad = Math.max(1, Math.floor((width - 2 - boardW - trayW - 2) / 2));

    // The tray rows sit beside the board rows.
    const tray: Seg[][] = [[{ text: 'pieces', paint: theme.docKey }]];
    es.offer.forEach((p, i) => {
      const mark = i === es.chosen ? '▶ ' : '  ';
      if (p === null) {
        tray.push([{ text: `${mark}${i + 1}. played`, paint: theme.dim }]);
        tray.push([{ text: '' }]);
        return;
      }
      const cells = PIECES[p];
      const w = Math.max(...cells.map(([x]) => x)) + 1;
      const h = Math.max(...cells.map(([, y]) => y)) + 1;
      tray.push([
        { text: `${mark}${i + 1}. `, paint: i === es.chosen ? theme.titleHi : theme.dim },
        { text: `${w}×${h}`, paint: theme.dim },
      ]);
      for (let y = 0; y < Math.min(h, 2); y += 1) {
        let row = '     ';
        for (let x = 0; x < w; x += 1) row += cells.some(([px, py]) => px === x && py === y) ? '██' : '  ';
        tray.push([{ text: row, paint: i === es.chosen ? palette[1 + (p % 6)] : theme.dim }]);
      }
    });

    for (let y = 0; y < SIZE; y += 1) {
      for (let r = 0; r < k; r += 1) {
        const d = y * k + r; // the display row, which is what the tray rides beside
        const segs: Seg[] = [{ text: ' '.repeat(leftPad) }, { text: '▕', paint: theme.border }];
        // One dot per cell whatever the scale, on the cell's middle row: a
        // dot on every row reads as a column of debris, not an empty cell.
        const dotRow = r === Math.floor((k - 1) / 2);
        for (let x = 0; x < SIZE; x += 1) {
          const inGhost = ghost.has(`${x},${y}`);
          const cell = es.board[y][x];
          if (inGhost) segs.push({ text: (legal ? '▒' : '░').repeat(2 * k), paint: legal ? theme.titleHi : theme.error });
          else if (cell) segs.push({ text: '█'.repeat(2 * k), paint: palette[cell] });
          else segs.push({ text: dotRow ? `${' '.repeat(k - 1)}·${' '.repeat(k)}` : ' '.repeat(2 * k), paint: theme.dim });
        }
        segs.push({ text: '▏', paint: theme.border });
        segs.push({ text: '  ' });
        segs.push(...(tray[d] ?? [{ text: '' }]));
        lines.push(segs);
      }
    }
    for (let d = SIZE * k; d < tray.length; d += 1) {
      lines.push([{ text: ' '.repeat(leftPad + boardW + 2) }, ...tray[d]]);
    }
    if (!es.alive) {
      lines.push([{ text: '' }]);
      lines.push(centre([{ text: `  no piece fits — ${es.score} points · r plays again  `, paint: theme.cursor }], width - 2));
    }
    return lines;
  },

  info: (es) => [
    ['Score', String(es.score)],
    ['Best', String(es.best)],
  ],

  hints: (es) =>
    es.alive
      ? [
          ['←↑↓→', 'aim'],
          ['1-3', 'piece'],
          ['enter', 'place'],
          ['q', 'back'],
        ]
      : [
          ['r', 'again'],
          ['q', 'back'],
        ],
};

export default blocks;
