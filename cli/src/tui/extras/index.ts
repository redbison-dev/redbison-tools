/**
 * The registry: every extra, under its id and every alias. state.ts routes
 * `:` commands and extra-mode keys through here; index.ts gives the same ids
 * to the command line.
 */
import type { Extra } from './core';

/**
 * The registry erases each extra's own state type: the holder (state.ts)
 * carries the state as `unknown` and only ever hands it back to the same
 * extra, so the erasure is safe in the one place it is visible.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyExtra = Extra<any>;
import clock from './clock';
import stopwatch from './stopwatch';
import coin from './coin';
import random from './random';
import split from './split';
import snake from './snake';
import tetris from './tetris';
import breakout from './breakout';
import blocks from './blocks';
import menu, { MENU_ROWS } from './menu';

/** Menu order: the quick utilities first, then the games. */
export const EXTRAS: AnyExtra[] = [clock, stopwatch, coin, random, split, snake, tetris, breakout, blocks, menu];

for (const e of EXTRAS) {
  if (e.id !== menu.id) MENU_ROWS.push({ id: e.id, title: e.title, summary: e.summary });
}

const INDEX = new Map<string, AnyExtra>();
for (const e of EXTRAS) {
  INDEX.set(e.id, e);
  for (const a of e.aliases ?? []) INDEX.set(a, e);
}

export function extraById(name: string): AnyExtra | undefined {
  return INDEX.get(name.toLowerCase());
}

export type { Extra, ExtraKey, ExtraStep, Seg } from './core';
