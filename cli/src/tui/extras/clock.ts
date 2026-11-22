/**
 * `:clock` — the time, in block digits big enough to read from across the
 * room. The tick hands in the wall time; nothing here reads a clock, so a
 * test can show any moment it likes.
 */
import type { Theme } from '../theme';
import { bigText, centre, centreBlock, tooSmall, type Extra, type ExtraKey, type ExtraStep, type Seg } from './core';

export type ClockState = {
  now: number;
  h24: boolean;
  showSeconds: boolean;
};

/** 24h → 12h, with the 12 o'clocks right: 0 → 12am, 12 → 12pm. */
export function hour12(h: number): { hour: number; half: 'am' | 'pm' } {
  const half = h < 12 ? 'am' : 'pm';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return { hour, half };
}

const two = (n: number) => String(n).padStart(2, '0');

export function clockFace(es: ClockState): { text: string; suffix: string } {
  const d = new Date(es.now);
  const h = d.getHours();
  const base = es.h24 ? two(h) : two(hour12(h).hour);
  const text = `${base}:${two(d.getMinutes())}${es.showSeconds ? `:${two(d.getSeconds())}` : ''}`;
  return { text, suffix: es.h24 ? '' : hour12(h).half };
}

export function dateLine(now: number): string {
  return new Date(now).toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

const clock: Extra<ClockState> = {
  id: 'clock',
  title: 'Clock',
  summary: 'The time, in digits a room can read.',
  aliases: ['time'],
  tickMs: 200,

  init: () => ({ now: 0, h24: true, showSeconds: true }),

  tick: (es, now) => ({ ...es, now }),

  key(es: ClockState, k: ExtraKey): ExtraStep<ClockState> {
    if (k.name === 't') return { es: { ...es, h24: !es.h24 } };
    if (k.name === 's') return { es: { ...es, showSeconds: !es.showSeconds } };
    return { es };
  },

  render(es: ClockState, theme: Theme, width: number, rows: number): Seg[][] {
    if (!es.now) return [[{ text: '' }], [{ text: '  …', paint: theme.dim }]];
    const face = clockFace(es);
    const big = bigText(face.text);
    const need = big[0].length + (face.suffix ? 3 : 0);
    if (width - 4 < need || rows < 8) return tooSmall(theme, need + 4, 10);

    const lines: Seg[][] = big.map((row, i) =>
      centre(
        [
          { text: row, paint: theme.logo },
          ...(face.suffix && i === 5 ? [{ text: ` ${face.suffix}`, paint: theme.dim }] : []),
        ],
        width - 2,
      ),
    );
    lines.push([{ text: '' }]);
    lines.push(centre([{ text: dateLine(es.now), paint: theme.body }], width - 2));
    return centreBlock(lines, rows);
  },

  info: (es) => [
    ['Format', es.h24 ? '24-hour' : '12-hour'],
    ['Seconds', es.showSeconds ? 'shown' : 'hidden'],
  ],

  hints: () => [
    ['t', '12/24h'],
    ['s', 'seconds'],
    ['esc', 'back'],
  ],
};

export default clock;
