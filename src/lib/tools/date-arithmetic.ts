import { addDays, addHours, addMinutes, addMonths, addWeeks, addYears } from 'date-fns';

export type DateUnit = 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years';
export type DateOperation = 'add' | 'subtract';

/**
 * Add or subtract whole units from a local date. Months and years clamp to
 * the last valid day (Jan 31 + 1 month = Feb 29 in 2024), days and weeks keep
 * the wall-clock time across DST changes, and minutes/hours are elapsed time.
 * Returns null for non-finite input or a result outside the Date range.
 */
export function applyDateArithmetic(base: Date, operation: DateOperation, value: number, unit: DateUnit): Date | null {
  if (Number.isNaN(base.getTime()) || !Number.isFinite(value)) return null;
  const amount = Math.trunc(value) * (operation === 'add' ? 1 : -1);
  let result: Date;
  switch (unit) {
    case 'minutes': result = addMinutes(base, amount); break;
    case 'hours': result = addHours(base, amount); break;
    case 'days': result = addDays(base, amount); break;
    case 'weeks': result = addWeeks(base, amount); break;
    case 'months': result = addMonths(base, amount); break;
    case 'years': result = addYears(base, amount); break;
    default: return null;
  }
  return Number.isNaN(result.getTime()) ? null : result;
}
