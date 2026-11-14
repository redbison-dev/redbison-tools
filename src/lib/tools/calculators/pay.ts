/**
 * Pure logic for the pay and shopping calculators: salary conversion,
 * overtime, pay raises, tips, discounts, sales tax and VAT.
 * No React here, so the regression tests exercise exactly what the UI shows.
 */
import { msg } from '../../msg';

/** Round to cents (or any number of decimals) without binary drift (1.005 -> 1.01). */
export function roundMoney(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** decimals;
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(value) * factor + 1e-9)) / factor;
}

const isNum = (n: number) => typeof n === 'number' && Number.isFinite(n);

// ---------------------------------------------------------------------------
// Currency
// ---------------------------------------------------------------------------

export const CURRENCIES = [
  { code: 'USD', label: msg('US dollar ($)') },
  { code: 'EUR', label: msg('Euro (€)') },
  { code: 'GBP', label: msg('British pound (£)') },
  { code: 'INR', label: msg('Indian rupee (₹)') },
  { code: 'CAD', label: msg('Canadian dollar (CA$)') },
  { code: 'AUD', label: msg('Australian dollar (A$)') },
  { code: 'JPY', label: msg('Japanese yen (¥)') },
  { code: 'CHF', label: msg('Swiss franc (CHF)') },
] as const;

/**
 * Market currencies the pay tools offer for their market versions (NZ, SG,
 * ZA, PH, UAE). They are not in CURRENCIES, so the pages and tests that use
 * that list are unchanged; each prints in its own market's CLDR format
 * (R 1 234,50 for rand), as src/lib/tools/market-money.ts does.
 */
export const PAY_MARKET_CURRENCIES = [
  { code: 'NZD', label: msg('New Zealand dollar ($)') },
  { code: 'SGD', label: msg('Singapore dollar (S$)') },
  { code: 'ZAR', label: msg('South African rand (R)') },
  { code: 'PHP', label: msg('Philippine peso (₱)') },
  { code: 'AED', label: msg('UAE dirham (AED)') },
] as const;

/** The CLDR locale a pay-tool currency is printed in: Indian grouping for rupees, the market's own for the market currencies, en-US otherwise. */
export const PAY_MONEY_LOCALE: Record<string, string> = { INR: 'en-IN', NZD: 'en-NZ', SGD: 'en-SG', ZAR: 'en-ZA', PHP: 'en-PH', AED: 'en-AE' };

export function formatMoney(value: number, currency = 'USD', decimals?: number): string {
  if (!Number.isFinite(value)) return '-';
  const digits = decimals ?? (currency === 'JPY' ? 0 : 2);
  try {
    // Rupees group the Indian way (₹12,34,567.50), as CLDR en-IN does; the market currencies use their own CLDR locale; every other currency keeps en-US output.
    return new Intl.NumberFormat(PAY_MONEY_LOCALE[currency] ?? 'en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  } catch {
    return value.toFixed(digits);
  }
}

// ---------------------------------------------------------------------------
// Salary conversion
// ---------------------------------------------------------------------------

export type PayPeriod =
  | 'hourly' | 'daily' | 'weekly' | 'biweekly' | 'semimonthly' | 'monthly' | 'quarterly' | 'annual';

export const PAY_PERIODS: { id: PayPeriod; label: string }[] = [
  { id: 'hourly', label: msg('Hourly') },
  { id: 'daily', label: msg('Daily') },
  { id: 'weekly', label: msg('Weekly') },
  { id: 'biweekly', label: msg('Bi-weekly') },
  { id: 'semimonthly', label: msg('Semi-monthly') },
  { id: 'monthly', label: msg('Monthly') },
  { id: 'quarterly', label: msg('Quarterly') },
  { id: 'annual', label: msg('Annual') },
];

export type SalaryInput = {
  amount: number;
  period: PayPeriod;
  hoursPerWeek: number;
  daysPerWeek: number;
  /** Paid or unpaid public holidays per year (days). */
  holidaysPerYear: number;
  /** Vacation / paid time off per year (days). */
  vacationDaysPerYear: number;
  /**
   * Hourly or daily pay only: true when holidays and vacation are paid leave
   * (statutory paid holiday in the UK, vacation pay in Canada), so the yearly
   * total stays at 52 paid weeks and only the rate per hour worked rises.
   * Default false: time off is unpaid, as for many US hourly jobs.
   */
  paidLeave?: boolean;
};

export type SalaryTable = Record<PayPeriod, number>;

export type SalaryResult = {
  unadjusted: SalaryTable;
  adjusted: SalaryTable;
  hoursPerDay: number;
  /** 52 x days per week. */
  scheduledDays: number;
  /** Scheduled days minus holidays and vacation. */
  workedDays: number;
  workedHours: number;
};

export type ValidationResult<T> = { ok: true; value: T; error?: undefined } | { ok: false; error: string; value?: undefined };

/** How many of each period make a year, given the schedule. */
export function periodsPerYear(period: PayPeriod, hoursPerWeek: number, daysPerWeek: number): number {
  switch (period) {
    case 'hourly': return hoursPerWeek * 52;
    case 'daily': return daysPerWeek * 52;
    case 'weekly': return 52;
    case 'biweekly': return 26;
    case 'semimonthly': return 24;
    case 'monthly': return 12;
    case 'quarterly': return 4;
    case 'annual': return 1;
  }
}

function tableFromAnnual(annual: number, hourly: number, daily: number): SalaryTable {
  return {
    hourly,
    daily,
    weekly: annual / 52,
    biweekly: annual / 26,
    semimonthly: annual / 24,
    monthly: annual / 12,
    quarterly: annual / 4,
    annual,
  };
}

/**
 * Converts pay between periods.
 *
 * Unadjusted assumes every one of the 52 weeks is worked and paid.
 * Adjusted takes holidays and vacation out of the working days:
 * - For hourly or daily pay (paid only for time worked), the rate stays the
 *   same and the yearly total falls: rate x hours per day x worked days.
 * - For salaried periods (weekly and longer), the salary stays the same and
 *   the effective hourly and daily rates rise, because the same money is
 *   earned over fewer worked hours.
 * - With paidLeave, hourly and daily pay are treated like a salary: holidays
 *   are paid, so the yearly total is unchanged and the rate per hour worked rises.
 */
export function convertSalary(input: SalaryInput): ValidationResult<SalaryResult> {
  const { amount, period, hoursPerWeek, daysPerWeek, holidaysPerYear, vacationDaysPerYear } = input;
  if (!isNum(amount) || amount < 0) return { ok: false, error: msg('Enter a pay amount of zero or more.') };
  if (!isNum(hoursPerWeek) || hoursPerWeek <= 0 || hoursPerWeek > 168) return { ok: false, error: msg('Hours per week must be between 0 and 168.') };
  if (!isNum(daysPerWeek) || daysPerWeek <= 0 || daysPerWeek > 7) return { ok: false, error: msg('Days per week must be more than 0 and at most 7.') };
  if (hoursPerWeek / daysPerWeek > 24) return { ok: false, error: msg('That schedule needs more than 24 hours a day.') };
  if (!isNum(holidaysPerYear) || holidaysPerYear < 0 || !isNum(vacationDaysPerYear) || vacationDaysPerYear < 0) {
    return { ok: false, error: msg('Holidays and vacation days cannot be negative.') };
  }
  const scheduledDays = 52 * daysPerWeek;
  const workedDays = scheduledDays - holidaysPerYear - vacationDaysPerYear;
  if (workedDays <= 0) return { ok: false, error: msg('Holidays plus vacation days use up every working day in the year.') };

  const hoursPerDay = hoursPerWeek / daysPerWeek;
  const unadjustedAnnual = amount * periodsPerYear(period, hoursPerWeek, daysPerWeek);
  const unadjustedHourly = unadjustedAnnual / (hoursPerWeek * 52);
  const unadjusted = tableFromAnnual(unadjustedAnnual, unadjustedHourly, unadjustedHourly * hoursPerDay);

  const workedHours = workedDays * hoursPerDay;
  let adjusted: SalaryTable;
  if ((period === 'hourly' || period === 'daily') && !input.paidLeave) {
    const hourly = unadjustedHourly;
    const annual = hourly * workedHours;
    adjusted = tableFromAnnual(annual, hourly, hourly * hoursPerDay);
  } else {
    const hourly = unadjustedAnnual / workedHours;
    adjusted = tableFromAnnual(unadjustedAnnual, hourly, hourly * hoursPerDay);
  }
  return { ok: true, value: { unadjusted, adjusted, hoursPerDay, scheduledDays, workedDays, workedHours } };
}

// ---------------------------------------------------------------------------
// Overtime
// ---------------------------------------------------------------------------

export type OvertimeWeeklyInput = {
  hourlyRate: number;
  hoursWorked: number;
  /** Hours at straight time before overtime starts (FLSA: 40). */
  threshold: number;
  multiplier: number;
  /** Optional hours paid at double time, on top of hoursWorked. */
  doubleTimeHours?: number;
  doubleTimeMultiplier?: number;
};

export type OvertimeResult = {
  regularHours: number;
  overtimeHours: number;
  doubleTimeHours: number;
  regularPay: number;
  overtimePay: number;
  doubleTimePay: number;
  totalPay: number;
  totalHours: number;
  overtimeRate: number;
  doubleTimeRate: number;
  /** Total pay divided by total hours. */
  effectiveHourly: number;
};

function overtimeTotals(rate: number, reg: number, ot: number, dt: number, otMult: number, dtMult: number): OvertimeResult {
  const regularPay = rate * reg;
  const overtimePay = rate * otMult * ot;
  const doubleTimePay = rate * dtMult * dt;
  const totalPay = regularPay + overtimePay + doubleTimePay;
  const totalHours = reg + ot + dt;
  return {
    regularHours: reg,
    overtimeHours: ot,
    doubleTimeHours: dt,
    regularPay,
    overtimePay,
    doubleTimePay,
    totalPay,
    totalHours,
    overtimeRate: rate * otMult,
    doubleTimeRate: rate * dtMult,
    effectiveHourly: totalHours > 0 ? totalPay / totalHours : 0,
  };
}

/** Weekly overtime: hours above the threshold are paid at the multiplier. */
export function weeklyOvertime(input: OvertimeWeeklyInput): ValidationResult<OvertimeResult> {
  const { hourlyRate, hoursWorked, threshold, multiplier } = input;
  const dt = input.doubleTimeHours ?? 0;
  const dtMult = input.doubleTimeMultiplier ?? 2;
  if (!isNum(hourlyRate) || hourlyRate < 0) return { ok: false, error: msg('Enter an hourly rate of zero or more.') };
  if (!isNum(hoursWorked) || hoursWorked < 0 || hoursWorked > 168) return { ok: false, error: msg('Hours worked must be between 0 and 168.') };
  if (!isNum(threshold) || threshold < 0) return { ok: false, error: msg('The overtime threshold cannot be negative.') };
  if (!isNum(multiplier) || multiplier < 1) return { ok: false, error: msg('The overtime multiplier should be 1 or more.') };
  if (!isNum(dt) || dt < 0 || hoursWorked + dt > 168) return { ok: false, error: msg('Double-time hours must be zero or more, and the week cannot exceed 168 hours.') };
  if (!isNum(dtMult) || dtMult < 1) return { ok: false, error: msg('The double-time multiplier should be 1 or more.') };
  const reg = Math.min(hoursWorked, threshold);
  const ot = Math.max(0, hoursWorked - threshold);
  return { ok: true, value: overtimeTotals(hourlyRate, reg, ot, dt, multiplier, dtMult) };
}

/**
 * 'flsa' and 'california' are the US rules. The others are market rules used
 * by the localized pages (docs/seo/localization-plan.md):
 * - 'ca-federal': Canada Labour Code, the greater of hours over 8 in a day or
 *   40 in a week (canada.ca "Hours of work").
 * - 'ontario': Employment Standards Act 2000, hours over 44 in a week; no daily rule.
 * - 'alberta': Employment Standards Code, the greater of hours over 8 in a day or 44 in a week.
 * - 'bc': Employment Standards Act s. 40, 1.5x over 8 h a day up to 12, 2x
 *   over 12, and 1.5x over 40 h a week counting only the first 8 h of each day.
 * - 'india': OSH Code 2020 (in force 21 November 2025), the greater of hours
 *   over the normal working day (`ordinaryDayHours`, 8 by default) or 48 in a
 *   week. The page sets the multiplier to 2 (twice the ordinary wage).
 * - 'au-award': Australian modern-award pattern. Hours over the award's daily
 *   ordinary maximum (`ordinaryDayHours`) or beyond 38 ordinary hours in the
 *   week are overtime; on each day the first `firstTierHours` overtime hours
 *   are paid at the multiplier (150%) and the rest at double time (200%).
 * - 'philippines': Labor Code art. 83 and 87, every hour beyond 8 in a day is
 *   overtime; there is no weekly limit, and art. 88 does not let undertime on
 *   one day offset overtime on another. The page sets the multiplier to 1.25
 *   (regular wage plus at least 25%). Rest-day and holiday rates are not modelled.
 * - 'singapore': Employment Act Part 4 (MOM "Hours of work, overtime and rest
 *   days"), the greater of hours over the normal day (`ordinaryDayHours`: 8, or
 *   9 in a week of 5 days or fewer) or 44 in a week, at 1.5x the hourly basic rate.
 */
export type DailyRule = 'flsa' | 'california' | 'ca-federal' | 'ontario' | 'alberta' | 'bc' | 'india' | 'au-award' | 'philippines' | 'singapore';

export const MARKET_DAILY_RULES: Record<Exclude<DailyRule, 'flsa' | 'california' | 'bc' | 'au-award'>, { daily: number | null; weekly: number }> = {
  'ca-federal': { daily: 8, weekly: 40 },
  ontario: { daily: null, weekly: 44 },
  alberta: { daily: 8, weekly: 44 },
  india: { daily: 8, weekly: 48 },
  philippines: { daily: 8, weekly: Infinity },
  singapore: { daily: 8, weekly: 44 },
};

/**
 * Singapore hourly basic rate for a monthly-rated employee (MOM):
 * (12 x monthly basic rate of pay) / (52 x 44).
 */
export function sgHourlyBasicRate(monthlyBasic: number): number {
  if (!isNum(monthlyBasic) || monthlyBasic < 0) return NaN;
  return (12 * monthlyBasic) / (52 * 44);
}

export type DailyOvertimeInput = {
  hourlyRate: number;
  /** Hours for each day of the workweek in order (up to 7). */
  days: number[];
  rule: DailyRule;
  /** Overtime multiplier (default 1.5). */
  multiplier?: number;
  /** Double time multiplier for the California rule (default 2). */
  doubleTimeMultiplier?: number;
  /** 'india', 'singapore' and 'au-award': ordinary hours in a day before daily overtime (India 8, Singapore 8 or 9, award default 9). */
  ordinaryDayHours?: number;
  /** 'au-award': overtime hours on a day paid at the multiplier before double time (default 3). */
  firstTierHours?: number;
};

/** Weekly-only split in day order: straight time up to the limit, the rest overtime. */
function weeklySplit(days: number[], limit: number): DayBreakdown[] {
  let running = 0;
  return days.map((h) => {
    const regular = Math.max(0, Math.min(h, limit - running));
    running += h;
    return { hours: h, regular, overtime: h - regular, doubleTime: 0 };
  });
}

/** Straight-time hours beyond the weekly limit, counted in day order, become overtime. */
function capWeekly(breakdown: DayBreakdown[], limit: number) {
  let running = 0;
  for (const d of breakdown) {
    const keep = Math.min(d.regular, Math.max(0, limit - running));
    running += d.regular;
    d.overtime += d.regular - keep;
    d.regular = keep;
  }
}

function marketBreakdown(days: number[], rule: DailyRule, ordinaryDay: number, tier: number): DayBreakdown[] {
  if (rule === 'bc') {
    const b = days.map((h) => ({ hours: h, regular: Math.min(h, 8), overtime: Math.min(Math.max(0, h - 8), 4), doubleTime: Math.max(0, h - 12) }));
    capWeekly(b, 40);
    return b;
  }
  if (rule === 'au-award') {
    const b = days.map((h) => ({ hours: h, regular: Math.min(h, ordinaryDay), overtime: Math.max(0, h - ordinaryDay), doubleTime: 0 }));
    capWeekly(b, 38);
    for (const d of b) {
      const first = Math.min(d.overtime, tier);
      d.doubleTime = d.overtime - first;
      d.overtime = first;
    }
    return b;
  }
  const r = MARKET_DAILY_RULES[rule as keyof typeof MARKET_DAILY_RULES];
  const weekly = weeklySplit(days, r.weekly);
  const dailyLimit = rule === 'india' || rule === 'singapore' ? ordinaryDay : r.daily;
  if (dailyLimit === null) return weekly;
  // Daily and weekly overtime are not added together: the greater of the two applies.
  const daily = days.map((h) => ({ hours: h, regular: Math.min(h, dailyLimit), overtime: Math.max(0, h - dailyLimit), doubleTime: 0 }));
  const ot = (b: DayBreakdown[]) => b.reduce((s, d) => s + d.overtime, 0);
  return ot(daily) >= ot(weekly) ? daily : weekly;
}

export type DayBreakdown = { hours: number; regular: number; overtime: number; doubleTime: number };

/**
 * Day-by-day overtime.
 * - 'flsa': only hours over 40 in the workweek are overtime (29 U.S.C. 207).
 * - 'california': over 8 hours in a day up to 12 at 1.5x, over 12 at 2x; on the
 *   seventh consecutive day the first 8 hours are 1.5x and the rest 2x; and any
 *   straight-time hours beyond 40 in the week become 1.5x (no pyramiding, so
 *   hours already paid as daily overtime do not count toward the 40).
 */
export function dailyOvertime(input: DailyOvertimeInput): ValidationResult<OvertimeResult & { breakdown: DayBreakdown[] }> {
  const { hourlyRate, days, rule } = input;
  const otMult = input.multiplier ?? 1.5;
  const dtMult = input.doubleTimeMultiplier ?? 2;
  if (!isNum(hourlyRate) || hourlyRate < 0) return { ok: false, error: msg('Enter an hourly rate of zero or more.') };
  if (days.length === 0 || days.length > 7) return { ok: false, error: msg('Enter between one and seven days.') };
  if (days.some((h) => !isNum(h) || h < 0 || h > 24)) return { ok: false, error: msg('Each day must be between 0 and 24 hours.') };
  if (!isNum(otMult) || otMult < 1 || !isNum(dtMult) || dtMult < 1) return { ok: false, error: msg('Multipliers should be 1 or more.') };

  const ordinaryDay = input.ordinaryDayHours ?? (rule === 'au-award' ? 9 : 8);
  const tier = input.firstTierHours ?? 3;
  if (!isNum(ordinaryDay) || ordinaryDay <= 0 || ordinaryDay > 24) return { ok: false, error: msg('Ordinary hours in a day must be more than 0 and at most 24.') };
  if (!isNum(tier) || tier < 0) return { ok: false, error: msg('Hours at the first overtime rate cannot be negative.') };

  let breakdown: DayBreakdown[] = [];
  if (rule !== 'flsa' && rule !== 'california') {
    const tidy = (x: number) => Math.round(x * 1e6) / 1e6;
    breakdown = marketBreakdown(days, rule, ordinaryDay, tier).map((d) => ({ hours: d.hours, regular: tidy(d.regular), overtime: tidy(d.overtime), doubleTime: tidy(d.doubleTime) }));
  } else if (rule === 'flsa') {
    let running = 0;
    for (const h of days) {
      const regular = Math.max(0, Math.min(h, 40 - running));
      running += h;
      breakdown.push({ hours: h, regular, overtime: h - regular, doubleTime: 0 });
    }
  } else {
    const seventhDay = days.length === 7 && days.every((h) => h > 0);
    days.forEach((h, i) => {
      if (seventhDay && i === 6) {
        breakdown.push({ hours: h, regular: 0, overtime: Math.min(h, 8), doubleTime: Math.max(0, h - 8) });
      } else {
        breakdown.push({ hours: h, regular: Math.min(h, 8), overtime: Math.min(Math.max(0, h - 8), 4), doubleTime: Math.max(0, h - 12) });
      }
    });
    // Weekly 40: straight-time hours beyond 40, counted in day order, become overtime.
    let running = 0;
    for (const d of breakdown) {
      const allowed = Math.max(0, 40 - running);
      const keep = Math.min(d.regular, allowed);
      running += d.regular;
      d.overtime += d.regular - keep;
      d.regular = keep;
    }
  }
  const sum = (k: keyof DayBreakdown) => breakdown.reduce((s, d) => s + d[k], 0);
  return {
    ok: true,
    value: { ...overtimeTotals(hourlyRate, sum('regular'), sum('overtime'), sum('doubleTime'), otMult, dtMult), breakdown },
  };
}

// ---------------------------------------------------------------------------
// Pay raise
// ---------------------------------------------------------------------------

export type RaiseResult = {
  oldPay: number;
  newPay: number;
  raiseAmount: number;
  raisePercent: number;
  /** Raise after inflation, as a percent: (1 + raise) / (1 + inflation) - 1. */
  realRaisePercent: number | null;
  /** New pay expressed in the old pay's purchasing power. */
  newPayInTodaysMoney: number | null;
};

function raiseResult(oldPay: number, newPay: number, inflationPercent?: number | null): RaiseResult {
  const raiseAmount = newPay - oldPay;
  const raisePercent = (raiseAmount / oldPay) * 100;
  let realRaisePercent: number | null = null;
  let newPayInTodaysMoney: number | null = null;
  if (inflationPercent !== undefined && inflationPercent !== null && isNum(inflationPercent)) {
    realRaisePercent = ((newPay / oldPay) / (1 + inflationPercent / 100) - 1) * 100;
    newPayInTodaysMoney = newPay / (1 + inflationPercent / 100);
  }
  return { oldPay, newPay, raiseAmount, raisePercent, realRaisePercent, newPayInTodaysMoney };
}

function checkInflation(inflationPercent?: number | null): string | null {
  if (inflationPercent === undefined || inflationPercent === null) return null;
  if (!isNum(inflationPercent) || inflationPercent <= -100) return msg('Inflation must be greater than -100%.');
  return null;
}

export function raiseByPercent(oldPay: number, percent: number, inflationPercent?: number | null): ValidationResult<RaiseResult> {
  if (!isNum(oldPay) || oldPay <= 0) return { ok: false, error: msg('Enter your current pay (more than zero).') };
  if (!isNum(percent) || percent <= -100) return { ok: false, error: msg('The raise must be more than -100%.') };
  const inf = checkInflation(inflationPercent);
  if (inf) return { ok: false, error: inf };
  return { ok: true, value: raiseResult(oldPay, oldPay * (1 + percent / 100), inflationPercent) };
}

export function raiseByAmount(oldPay: number, amount: number, inflationPercent?: number | null): ValidationResult<RaiseResult> {
  if (!isNum(oldPay) || oldPay <= 0) return { ok: false, error: msg('Enter your current pay (more than zero).') };
  if (!isNum(amount) || oldPay + amount <= 0) return { ok: false, error: msg('The raise amount would make the new pay zero or negative.') };
  const inf = checkInflation(inflationPercent);
  if (inf) return { ok: false, error: inf };
  return { ok: true, value: raiseResult(oldPay, oldPay + amount, inflationPercent) };
}

export function raiseBetween(oldPay: number, newPay: number, inflationPercent?: number | null): ValidationResult<RaiseResult> {
  if (!isNum(oldPay) || oldPay <= 0) return { ok: false, error: msg('Enter the old pay (more than zero).') };
  if (!isNum(newPay) || newPay < 0) return { ok: false, error: msg('Enter the new pay (zero or more).') };
  const inf = checkInflation(inflationPercent);
  if (inf) return { ok: false, error: inf };
  return { ok: true, value: raiseResult(oldPay, newPay, inflationPercent) };
}

// ---------------------------------------------------------------------------
// Tip
// ---------------------------------------------------------------------------

export type TipRounding = 'none' | 'person' | 'total';

export type TipInput = {
  bill: number;
  tipPercent: number;
  people: number;
  /** Tax included in the bill; tip is calculated on bill minus tax when tipOnPreTax is true. */
  taxAmount?: number;
  tipOnPreTax?: boolean;
  rounding?: TipRounding;
};

export type TipResult = {
  tipBase: number;
  tip: number;
  total: number;
  perPerson: number;
  tipPerPerson: number;
  /** Tip as a percent of the tip base after rounding. */
  effectiveTipPercent: number;
};

export function calculateTip(input: TipInput): ValidationResult<TipResult> {
  const { bill, tipPercent } = input;
  const people = input.people;
  const tax = input.taxAmount ?? 0;
  const rounding = input.rounding ?? 'none';
  if (!isNum(bill) || bill < 0) return { ok: false, error: msg('Enter a bill amount of zero or more.') };
  if (!isNum(tipPercent) || tipPercent < 0) return { ok: false, error: msg('The tip percentage cannot be negative.') };
  if (!isNum(people) || people < 1 || !Number.isInteger(people)) return { ok: false, error: msg('Split between at least one person (whole number).') };
  if (!isNum(tax) || tax < 0 || tax > bill) return { ok: false, error: msg('Tax must be zero or more and not larger than the bill.') };

  const tipBase = input.tipOnPreTax ? bill - tax : bill;
  let tip = roundMoney(tipBase * tipPercent / 100);
  let total = roundMoney(bill + tip);
  let perPerson = total / people;

  if (rounding === 'person') {
    perPerson = Math.ceil(roundMoney(total / people) - 1e-9);
    total = perPerson * people;
    tip = roundMoney(total - bill);
  } else if (rounding === 'total') {
    total = Math.ceil(total - 1e-9);
    tip = roundMoney(total - bill);
    perPerson = total / people;
  }
  return {
    ok: true,
    value: {
      tipBase,
      tip,
      total,
      perPerson,
      tipPerPerson: tip / people,
      effectiveTipPercent: tipBase > 0 ? (tip / tipBase) * 100 : 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Discounts
// ---------------------------------------------------------------------------

export type DiscountResult = {
  original: number;
  salePrice: number;
  savings: number;
  /** Total discount as a percent of the original price. */
  effectivePercent: number;
  taxRate: number;
  tax: number;
  finalPrice: number;
};

function withTax(original: number, salePrice: number, taxRate: number): DiscountResult {
  const savings = original - salePrice;
  const tax = salePrice * taxRate / 100;
  return {
    original,
    salePrice,
    savings,
    effectivePercent: original > 0 ? (savings / original) * 100 : 0,
    taxRate,
    tax,
    finalPrice: salePrice + tax,
  };
}

function checkPriceAndTax(price: number, taxRate: number): string | null {
  if (!isNum(price) || price < 0) return msg('Enter a price of zero or more.');
  if (!isNum(taxRate) || taxRate < 0) return msg('Sales tax cannot be negative.');
  return null;
}

export function percentOff(price: number, percent: number, taxRate = 0): ValidationResult<DiscountResult> {
  const e = checkPriceAndTax(price, taxRate);
  if (e) return { ok: false, error: e };
  if (!isNum(percent) || percent < 0 || percent > 100) return { ok: false, error: msg('The discount must be between 0% and 100%.') };
  return { ok: true, value: withTax(price, price * (1 - percent / 100), taxRate) };
}

export function amountOff(price: number, amount: number, taxRate = 0): ValidationResult<DiscountResult> {
  const e = checkPriceAndTax(price, taxRate);
  if (e) return { ok: false, error: e };
  if (!isNum(amount) || amount < 0 || amount > price) return { ok: false, error: msg('The amount off must be between zero and the price.') };
  return { ok: true, value: withTax(price, price - amount, taxRate) };
}

/** Successive discounts multiply: 20% then 10% leaves 0.8 x 0.9 = 72%, i.e. 28% off, not 30%. */
export function stackedDiscount(price: number, percents: number[], taxRate = 0): ValidationResult<DiscountResult & { steps: { percent: number; priceAfter: number }[] }> {
  const e = checkPriceAndTax(price, taxRate);
  if (e) return { ok: false, error: e };
  if (percents.some((p) => !isNum(p) || p < 0 || p > 100)) return { ok: false, error: msg('Each discount must be between 0% and 100%.') };
  let current = price;
  const steps = percents.map((p) => {
    current = current * (1 - p / 100);
    return { percent: p, priceAfter: current };
  });
  return { ok: true, value: { ...withTax(price, current, taxRate), steps } };
}

/** Equivalent single discount for a sequence of percentages. */
export function equivalentDiscount(percents: number[]): number {
  return (1 - percents.reduce((f, p) => f * (1 - p / 100), 1)) * 100;
}

export type BuyXGetYResult = DiscountResult & { quantity: number; discountedItems: number; fullPriceItems: number };

/**
 * Buy X get Y at `percentOffY` off (100 = free), for `quantity` identical items.
 * Each complete group of X + Y earns Y discounted items; a partial group only
 * earns discounted items once its first X have been bought.
 */
export function buyXGetY(unitPrice: number, quantity: number, buy: number, get: number, percentOffY = 100, taxRate = 0): ValidationResult<BuyXGetYResult> {
  const e = checkPriceAndTax(unitPrice, taxRate);
  if (e) return { ok: false, error: e };
  if (!Number.isInteger(quantity) || quantity < 1) return { ok: false, error: msg('Quantity must be a whole number of at least 1.') };
  if (!Number.isInteger(buy) || buy < 1 || !Number.isInteger(get) || get < 1) return { ok: false, error: msg('Buy and get must be whole numbers of at least 1.') };
  if (!isNum(percentOffY) || percentOffY < 0 || percentOffY > 100) return { ok: false, error: msg('The discount on the free items must be between 0% and 100%.') };
  const group = buy + get;
  const groups = Math.floor(quantity / group);
  const remainder = quantity % group;
  const discountedItems = groups * get + Math.max(0, remainder - buy);
  const original = unitPrice * quantity;
  const sale = original - discountedItems * unitPrice * (percentOffY / 100);
  return {
    ok: true,
    value: { ...withTax(original, sale, taxRate), quantity, discountedItems, fullPriceItems: quantity - discountedItems },
  };
}

/** Original price from a sale price and the percent that was taken off. */
export function originalFromSale(salePrice: number, percent: number): ValidationResult<number> {
  if (!isNum(salePrice) || salePrice < 0) return { ok: false, error: msg('Enter a sale price of zero or more.') };
  if (!isNum(percent) || percent < 0 || percent >= 100) return { ok: false, error: msg('The discount must be at least 0% and below 100%.') };
  return { ok: true, value: salePrice / (1 - percent / 100) };
}

// ---------------------------------------------------------------------------
// Sales tax
// ---------------------------------------------------------------------------

export type TaxResult = { net: number; tax: number; gross: number; rate: number };

function checkRate(rate: number): string | null {
  if (!isNum(rate) || rate < 0) return msg('The tax rate cannot be negative.');
  if (rate > 100) return msg('A tax rate above 100% is almost certainly a typo.');
  return null;
}

/** Combined rate from separate state, county, city and district rates (they add, they do not compound). */
export function combinedRate(...rates: number[]): number {
  return rates.reduce((s, r) => s + (isNum(r) ? r : 0), 0);
}

export function addTax(net: number, rate: number): ValidationResult<TaxResult> {
  if (!isNum(net) || net < 0) return { ok: false, error: msg('Enter a price of zero or more.') };
  const e = checkRate(rate);
  if (e) return { ok: false, error: e };
  const tax = net * rate / 100;
  return { ok: true, value: { net, tax, gross: net + tax, rate } };
}

/** Remove tax from a tax-inclusive total: net = gross / (1 + rate). */
export function removeTax(gross: number, rate: number): ValidationResult<TaxResult> {
  if (!isNum(gross) || gross < 0) return { ok: false, error: msg('Enter a total of zero or more.') };
  const e = checkRate(rate);
  if (e) return { ok: false, error: e };
  const net = gross / (1 + rate / 100);
  return { ok: true, value: { net, tax: gross - net, gross, rate } };
}

/** Rate implied by a pre-tax amount and a total. */
export function rateFromAmounts(net: number, gross: number): ValidationResult<TaxResult> {
  if (!isNum(net) || net <= 0) return { ok: false, error: msg('Enter a pre-tax amount above zero.') };
  if (!isNum(gross) || gross < net) return { ok: false, error: msg('The total must be at least the pre-tax amount.') };
  return { ok: true, value: { net, tax: gross - net, gross, rate: (gross / net - 1) * 100 } };
}

// ---------------------------------------------------------------------------
// VAT
// ---------------------------------------------------------------------------

/**
 * Standard VAT rates. EU rates from the European Commission's Your Europe
 * page "VAT rules and rates" (last checked by the Commission 13 July 2026);
 * UK from GOV.UK "VAT rates". Editable in the UI because rates change.
 */
export const VAT_RATES_AS_OF = '2026-07-13';
export const VAT_PRESETS: { country: string; rate: number }[] = [
  { country: msg('United Kingdom'), rate: 20 },
  { country: msg('Germany'), rate: 19 },
  { country: msg('France'), rate: 20 },
  { country: msg('Italy'), rate: 22 },
  { country: msg('Spain'), rate: 21 },
  { country: msg('Netherlands'), rate: 21 },
  { country: msg('Belgium'), rate: 21 },
  { country: msg('Ireland'), rate: 23 },
  { country: msg('Austria'), rate: 20 },
  { country: msg('Poland'), rate: 23 },
  { country: msg('Portugal'), rate: 23 },
  { country: msg('Sweden'), rate: 25 },
  { country: msg('Denmark'), rate: 25 },
  { country: msg('Finland'), rate: 25.5 },
  { country: msg('Hungary'), rate: 27 },
  { country: msg('Luxembourg'), rate: 17 },
];

export const addVat = addTax;
export const removeVat = removeTax;

/** UK VAT fraction for extracting VAT from a gross price: rate / (100 + rate), e.g. 1/6 at 20%. */
export function vatFraction(rate: number): number {
  return rate / (100 + rate);
}
