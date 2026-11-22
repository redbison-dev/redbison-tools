/**
 * The registry: every extra, under its id and every alias. state.ts routes
 * `:` commands and extra-mode keys through here; index.ts gives the same ids
 * to the command line.
 */
import type { Extra } from './core';
import type { CliTool } from '../../catalog';

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

/* ------------------------------------------------------- rows for the list */

/** The reserved category name the main list shows the extras under. */
export const EXTRA_GROUP = 'Extras';

const GAME_IDS = new Set(['snake', 'tetris', 'breakout', 'blocks']);

/**
 * The extras as rows of the main tool list, which is where people actually
 * look. A hint in the status line and a row at the end of the categories view
 * both shipped first, and the games still went unseen — nothing behind a
 * keystroke is discoverable from the default screen. So the nine extras ride
 * at the end of the catalogue as ordinary rows: scrollable, searchable by
 * their aliases, and opened by enter like everything else. The menu itself
 * stays out; it is a door, not a thing.
 */
export const EXTRA_ROWS: CliTool[] = EXTRAS.filter((e) => e.id !== menu.id).map((e) => ({
  id: e.id,
  title: e.title,
  summary: e.summary,
  kind: 'inspect',
  group: EXTRA_GROUP,
  offline: true,
  native: true,
  // The page documenting the CLI and its extras; the games have no page of
  // their own under these ids.
  url: 'https://redbison.dev/cli',
  mcp: null,
  keywords: [e.id, ...(e.aliases ?? []), 'extra', ...(GAME_IDS.has(e.id) ? ['game', 'games', 'arcade', 'play'] : [])].join(' '),
}));

export type { Extra, ExtraKey, ExtraStep, Seg } from './core';
