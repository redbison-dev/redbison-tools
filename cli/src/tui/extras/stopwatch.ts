/**
 * `:stopwatch` — space starts and stops, l laps, r resets.
 *
 * Elapsed time is accumulated from the deltas the tick hands in, never read
 * from a clock, and the first tick after starting contributes nothing: that
 * is the `last: null` state, without which resuming after a pause would
 * credit the whole pause to the run.
 */
import type { Theme } from '../theme';
import { bigText, centre, digitScale, padText, scaleArt, tooSmall, type Extra, type ExtraKey, type ExtraStep, type Seg } from './core';

export type StopwatchState = {
  running: boolean;
  /** Milliseconds on the watch. */
  acc: number;
  /** The last tick's time while running; null means "no delta yet". */
  last: number | null;
  laps: number[];
};

export function watchFace(ms: number): string {
  const tenths = Math.floor(ms / 100) % 10;
  const s = Math.floor(ms / 1000) % 60;
  const m = Math.floor(ms / 60000) % 60;
  const h = Math.floor(ms / 3600000);
  const two = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${two(m)}:${two(s)}.${tenths}` : `${two(m)}:${two(s)}.${tenths}`;
}

export function advance(es: StopwatchState, now: number): StopwatchState {
  if (!es.running) return es;
  if (es.last === null) return { ...es, last: now };
  return { ...es, acc: es.acc + Math.max(0, now - es.last), last: now };
}

const stopwatch: Extra<StopwatchState> = {
  id: 'stopwatch',
  title: 'Stopwatch',
  summary: 'Start, stop, lap; tenths shown.',
  aliases: ['sw'],
  tickMs: 100,

  init: () => ({ running: false, acc: 0, last: null, laps: [] }),

  tick: advance,

  key(es: StopwatchState, k: ExtraKey): ExtraStep<StopwatchState> {
    if (k.name === 'space' || k.name === 'return' || k.name === 'enter') {
      return { es: { ...es, running: !es.running, last: null } };
    }
    if (k.name === 'l' && (es.running || es.acc > 0)) {
      return { es: { ...es, laps: [...es.laps, es.acc] } };
    }
    if (k.name === 'r') return { es: { running: false, acc: 0, last: null, laps: [] } };
    return { es };
  },

  render(es: StopwatchState, theme: Theme, width: number, rows: number): Seg[][] {
    const big = bigText(watchFace(es.acc));
    if (width - 4 < big[0].length || rows < 8) return tooSmall(theme, big[0].length + 4, 10);

    // Big enough to glance at from across the room, with space kept back for
    // the status line and a few laps.
    const k = digitScale(width, rows, big[0].length, es.laps.length ? 8 : 4);
    const lines: Seg[][] = scaleArt(big, k).map((row) => centre([{ text: row, paint: es.running ? theme.logo : theme.dim }], width - 2));
    lines.push([{ text: '' }]);
    lines.push(
      centre(
        [{ text: es.running ? 'running — space stops' : es.acc ? 'stopped — space resumes, r resets' : 'space starts', paint: theme.dim }],
        width - 2,
      ),
    );

    if (es.laps.length) {
      lines.push([{ text: '' }]);
      // Latest laps first, each with its split from the one before.
      const shown = es.laps.slice(-Math.max(1, rows - lines.length - 1)).reverse();
      shown.forEach((lap, i) => {
        const n = es.laps.length - i;
        const prev = n - 2 >= 0 ? es.laps[n - 2] : 0;
        lines.push(
          centre(
            [
              { text: padText(`lap ${n}`, 8), paint: theme.menuKey },
              { text: padText(watchFace(lap), 12), paint: theme.body },
              { text: `+${watchFace(lap - prev)}`, paint: theme.dim },
            ],
            width - 2,
          ),
        );
      });
    }
    // The frame centres every extra vertically; padding here as well parked
    // the watch below centre.
    return lines;
  },

  info: (es) => [
    ['Watch', watchFace(es.acc)],
    ['State', es.running ? 'running' : 'stopped'],
    ['Laps', String(es.laps.length)],
  ],

  hints: () => [
    ['space', 'start/stop'],
    ['l', 'lap'],
    ['r', 'reset'],
    ['esc', 'back'],
  ],
};

export default stopwatch;
