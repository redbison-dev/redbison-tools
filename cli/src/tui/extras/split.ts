/**
 * `:split` — type names, enter after each, and an empty enter deals them into
 * groups. `:split 4` starts at four groups; up and down change it afterwards.
 *
 * The deal is a shuffle followed by round-robin, so group sizes never differ
 * by more than one and nobody is left out — the two properties the tests pin,
 * because they are the two complaints a classroom splitter actually gets.
 */
import type { Theme } from '../theme';
import { padText, shuffle, type Extra, type ExtraKey, type ExtraStep, type Seg } from './core';

export type SplitState = {
  n: number;
  names: string[];
  /** The name being typed. */
  buf: string;
  groups: string[][] | null;
  seed: number;
};

export function deal(es: SplitState): SplitState {
  const r = shuffle(es.seed, es.names);
  const n = Math.max(2, Math.min(es.n, es.names.length));
  const groups: string[][] = Array.from({ length: n }, () => []);
  r.items.forEach((name, i) => groups[i % n].push(name));
  return { ...es, groups, seed: r.seed };
}

/** Names arrive one per enter, or several at once with commas. */
export function addNames(es: SplitState): SplitState {
  const parts = es.buf
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return es;
  return { ...es, names: [...es.names, ...parts], buf: '', groups: null };
}

const PRINTABLE = /^[\x20-\x7e]$/;

const split: Extra<SplitState> = {
  id: 'split',
  title: 'Split into groups',
  summary: 'Deal names into even groups.',
  aliases: ['split-groups', 'teams', 'groups-split'],

  init: (seed, arg) => {
    const n = Math.max(2, Math.min(9, Number((arg ?? '').trim()) || 2));
    return { n, names: [], buf: '', groups: null, seed };
  },

  key(es: SplitState, k: ExtraKey): ExtraStep<SplitState> {
    if (k.name === 'return' || k.name === 'enter') {
      if (es.buf.trim()) return { es: addNames(es) };
      if (es.names.length >= 2) return { es: deal(es) };
      return { es };
    }
    if (k.name === 'backspace') {
      if (es.buf) return { es: { ...es, buf: es.buf.slice(0, -1) } };
      // Backspace on an empty line takes back the last name.
      return { es: { ...es, names: es.names.slice(0, -1), groups: null } };
    }
    if (k.name === 'up') return { es: { ...es, n: Math.min(9, es.n + 1), groups: es.groups ? deal({ ...es, n: Math.min(9, es.n + 1) }).groups : null } };
    if (k.name === 'down') return { es: { ...es, n: Math.max(2, es.n - 1), groups: es.groups ? deal({ ...es, n: Math.max(2, es.n - 1) }).groups : null } };
    if (k.ctrl && k.name === 'u') return { es: { ...es, buf: '' } };
    if (k.ctrl && k.name === 'r') return { es: es.groups ? deal(es) : es };
    const seq = k.seq ?? '';
    if (seq && [...seq].every((c) => PRINTABLE.test(c))) return { es: { ...es, buf: es.buf + seq } };
    if (k.name === 'space') return { es: { ...es, buf: `${es.buf} ` } };
    return { es };
  },

  render(es: SplitState, theme: Theme, width: number, rows: number): Seg[][] {
    const lines: Seg[][] = [[{ text: '' }]];
    lines.push([
      { text: '  name> ', paint: theme.prompt },
      { text: es.buf, paint: theme.docVal },
      { text: '█', paint: theme.prompt },
      { text: '   enter adds it; commas add several', paint: theme.dim },
    ]);
    lines.push([{ text: '' }]);

    if (!es.groups) {
      lines.push([
        { text: `  ${es.names.length} name${es.names.length === 1 ? '' : 's'}`, paint: theme.title },
        { text: es.names.length >= 2 ? `   enter on an empty line deals ${Math.min(es.n, es.names.length)} groups` : '   two or more to deal', paint: theme.dim },
      ]);
      lines.push([{ text: '' }]);
      // The roster, in columns when it outgrows the rows.
      const room = Math.max(1, rows - lines.length);
      const colW = Math.min(24, Math.max(10, ...es.names.map((n) => n.length + 6)));
      const perCol = Math.max(1, room);
      const cols = Math.max(1, Math.min(Math.ceil(es.names.length / perCol), Math.floor((width - 4) / colW)));
      for (let r = 0; r < Math.min(perCol, Math.ceil(es.names.length / cols)); r += 1) {
        const segs: Seg[] = [{ text: '  ' }];
        for (let c = 0; c < cols; c += 1) {
          const i = c * Math.ceil(es.names.length / cols) + r;
          const name = es.names[i];
          if (name === undefined) continue;
          segs.push({ text: padText(`${i + 1}.`, 4), paint: theme.menuNumKey });
          segs.push({ text: padText(name, colW - 4), paint: theme.body });
        }
        lines.push(segs);
      }
      return lines;
    }

    lines.push([
      { text: `  ${es.groups.length} groups from ${es.names.length} names`, paint: theme.title },
      { text: '   ctrl-r deals again · ↑↓ changes the count', paint: theme.dim },
    ]);
    lines.push([{ text: '' }]);
    const biggest = Math.max(...es.groups.map((g) => g.length));
    const colW = Math.min(26, Math.max(12, ...es.names.map((n) => n.length + 2)));
    const cols = Math.max(1, Math.floor((width - 4) / colW));
    // Groups flow left to right, wrapping to a new band when they run out.
    for (let band = 0; band < es.groups.length; band += cols) {
      const slice = es.groups.slice(band, band + cols);
      const head: Seg[] = [{ text: '  ' }];
      slice.forEach((_, i) => head.push({ text: padText(`Group ${band + i + 1}`, colW), paint: theme.titleHi }));
      lines.push(head);
      for (let r = 0; r < biggest; r += 1) {
        if (slice.every((g) => g[r] === undefined)) break;
        const row: Seg[] = [{ text: '  ' }];
        slice.forEach((g) => row.push({ text: padText(g[r] ?? '', colW), paint: theme.body }));
        lines.push(row);
      }
      lines.push([{ text: '' }]);
    }
    return lines;
  },

  info: (es) => [
    ['Names', String(es.names.length)],
    ['Groups', String(es.groups ? es.groups.length : es.n)],
  ],

  hints: (es) =>
    es.groups
      ? [
          ['ctrl-r', 'redeal'],
          ['↑↓', 'group count'],
          ['esc', 'back'],
        ]
      : [
          ['enter', es.buf ? 'add name' : 'deal'],
          ['↑↓', 'group count'],
          ['esc', 'back'],
        ],
};

export default split;
