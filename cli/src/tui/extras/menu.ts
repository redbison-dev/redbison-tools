/**
 * `:games` (also `:extras`, `:fun`) — the list of everything in this folder,
 * so nobody has to remember nine command names. Enter switches straight into
 * the one under the bar.
 */
import type { Theme } from '../theme';
import { padText, type Extra, type ExtraKey, type ExtraStep, type Seg } from './core';

export type MenuRow = { id: string; title: string; summary: string };

export type MenuState = {
  rows: MenuRow[];
  cursor: number;
};

/** Filled by the registry at load, which avoids importing it back. */
export const MENU_ROWS: MenuRow[] = [];

const menu: Extra<MenuState> = {
  id: 'games',
  title: 'Extras',
  summary: 'Everything that is not a tool.',
  aliases: ['extras', 'fun', 'toys', 'arcade'],

  init: () => ({ rows: MENU_ROWS, cursor: 0 }),

  key(es: MenuState, k: ExtraKey): ExtraStep<MenuState> {
    switch (k.name) {
      case 'up':
      case 'k':
        return { es: { ...es, cursor: Math.max(0, es.cursor - 1) } };
      case 'down':
      case 'j':
        return { es: { ...es, cursor: Math.min(es.rows.length - 1, es.cursor + 1) } };
      case 'g':
        return { es: { ...es, cursor: k.shift ? es.rows.length - 1 : 0 } };
      case 'return':
      case 'enter':
        return es.rows[es.cursor] ? { switch: es.rows[es.cursor].id } : { es };
      case 'q':
        return { exit: true };
      default:
        if (/^[1-9]$/.test(k.name) && es.rows[Number(k.name) - 1]) {
          return { switch: es.rows[Number(k.name) - 1].id };
        }
        return { es };
    }
  },

  render(es: MenuState, theme: Theme, width: number, rows: number): Seg[][] {
    const lines: Seg[][] = [[{ text: '' }]];
    es.rows.forEach((row, i) => {
      const here = i === es.cursor;
      lines.push([
        { text: here ? ' ▶ ' : '   ', paint: theme.titleHi },
        { text: padText(`${i + 1}`, 3), paint: theme.menuNumKey },
        { text: padText(row.title, 19), paint: here ? theme.titleHi : theme.row },
        { text: padText(`:${row.id}`, 12), paint: theme.menuKey },
        { text: row.summary, paint: here ? theme.body : theme.dim },
      ]);
    });
    lines.push([{ text: '' }]);
    lines.push([{ text: '   Each is also a command: redbison snake, redbison clock …', paint: theme.dim }]);
    lines.push([{ text: '   coin, random and split print plainly on a pipe.', paint: theme.dim }]);
    void width;
    void rows;
    return lines;
  },

  hints: () => [
    ['↵', 'open'],
    ['1-9', 'jump'],
    ['esc', 'back'],
  ],
};

export default menu;
