import {
  addDays,
  differenceInBusinessDays,
  differenceInCalendarDays,
  differenceInDays,
  differenceInMonths,
  differenceInYears,
} from 'date-fns';

export interface DateDifference {
  isNegative: boolean;
  total: { years: number; months: number; weeks: number; days: number; hours: number; minutes: number; seconds: number };
  breakdown: { weeks: number; days: number; hours: number; minutes: number; seconds: number };
  business: { businessDays: number; weekends: number };
}

function parse(value: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Difference between two datetime-local values, interpreted in the browser's
 * time zone. Days, months and years are calendar-aware (a 23-hour DST day is
 * still one day, Jan 31 to Mar 1 is one month), while hours, minutes and
 * seconds are real elapsed time. Business days count Monday to Friday from
 * the earlier date up to, but not including, the later date.
 */
export function computeDateDifference(startValue: string, endValue: string): DateDifference | null {
  const start = parse(startValue);
  const end = parse(endValue);
  if (!start || !end) return null;

  const isNegative = end.getTime() < start.getTime();
  const [from, to] = isNegative ? [end, start] : [start, end];
  const diffMs = to.getTime() - from.getTime();

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = differenceInDays(to, from);

  const remainder = Math.floor((to.getTime() - addDays(from, days).getTime()) / 1000);
  const businessDays = differenceInBusinessDays(to, from);
  const calendarDays = differenceInCalendarDays(to, from);

  return {
    isNegative,
    total: {
      years: differenceInYears(to, from),
      months: differenceInMonths(to, from),
      weeks: Math.floor(days / 7),
      days,
      hours,
      minutes,
      seconds,
    },
    breakdown: {
      weeks: Math.floor(days / 7),
      days: days % 7,
      hours: Math.floor(remainder / 3600),
      minutes: Math.floor((remainder % 3600) / 60),
      seconds: remainder % 60,
    },
    business: { businessDays, weekends: calendarDays - businessDays },
  };
}
