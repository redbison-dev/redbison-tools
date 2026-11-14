import { msg } from '../msg';

export interface SimpleInterestRow {
  period: string;
  startingPrincipal: number;
  additionalContributions: number;
  /** Interest earned during this year (pro-rated for a partial final year) */
  interestEarned: number;
  endingBalance: number;
}

export interface SimpleInterestPoint {
  year: string;
  principal: number;
  interest: number;
  total: number;
}

export interface SimpleInterestResult {
  interest: number;
  finalAmount: number;
  rows: SimpleInterestRow[];
  chart: SimpleInterestPoint[];
}

/**
 * Simple interest: SI = P * R * T / 100, with R in percent per year and T in
 * years. Fractional terms get a final "(partial)" row so the table and chart
 * end at the same amount as the headline result. Returns null for empty,
 * negative or non-numeric input; a 0% rate is valid and earns nothing.
 */
export function computeSimpleInterest(principal: number, ratePercent: number, years: number): SimpleInterestResult | null {
  if (![principal, ratePercent, years].every(Number.isFinite)) return null;
  if (principal <= 0 || ratePercent < 0 || years <= 0) return null;

  const perYear = (principal * ratePercent) / 100;
  const interest = perYear * years;
  const rows: SimpleInterestRow[] = [];
  const chart: SimpleInterestPoint[] = [{ year: 'Year 0', principal, interest: 0, total: principal }];

  const wholeYears = Math.floor(years);
  for (let year = 1; year <= Math.ceil(years); year++) {
    const partial = year > wholeYears;
    const elapsed = partial ? years : year;
    const earned = perYear * (elapsed - (year - 1));
    const cumulative = perYear * elapsed;
    const label = partial ? `Year ${year} (partial)` : `Year ${year}`;
    rows.push({
      period: label,
      startingPrincipal: principal,
      additionalContributions: 0,
      interestEarned: earned,
      endingBalance: principal + cumulative,
    });
    chart.push({ year: label, principal, interest: cumulative, total: principal + cumulative });
  }

  return { interest, finalAmount: principal + interest, rows, chart };
}

/** How the rate is quoted: per year (the textbook R), or per month (as many informal and some bank loans in South Asia are). */
export type SimpleRatePer = 'year' | 'month';
/** How the time is entered. Days use a 365-day year, as GOV.UK's late-payment interest example does. */
export type SimpleTimeUnit = 'years' | 'months' | 'days';

/** A rate quoted per month or per year, as percent per year (2% a month = 24% a year, not compounded). */
export function annualRatePercent(rate: number, per: SimpleRatePer = 'year'): number {
  return per === 'month' ? rate * 12 : rate;
}

/** A term in months or days, in years (18 months = 1.5; 50 days = 50/365). */
export function termInYears(time: number, unit: SimpleTimeUnit = 'years'): number {
  if (unit === 'months') return time / 12;
  if (unit === 'days') return time / 365;
  return time;
}

/**
 * The conversion steps shown before SI = P × R × T / 100 when the rate or
 * time is not entered per year. Empty when both already are.
 */
export function simpleInterestInputSteps(rate: number, per: SimpleRatePer, time: number, unit: SimpleTimeUnit): { label: string; formula: string; working: string; result: string; resultMsg: { text: string; vars: Record<string, string | number> } }[] {
  const steps: { label: string; formula: string; working: string; result: string; resultMsg: { text: string; vars: Record<string, string | number> } }[] = [];
  const fmt = (x: number) => x.toLocaleString('en-US', { maximumFractionDigits: 6 });
  if (per === 'month') {
    const rateYear = fmt(annualRatePercent(rate, per));
    steps.push({ label: msg('Rate per year'), formula: msg('R = monthly rate × 12'), working: `${fmt(rate)}% × 12`, result: `${rateYear}% a year`, resultMsg: { text: msg('{rate}% a year'), vars: { rate: rateYear } } });
  }
  if (unit === 'months' || unit === 'days') {
    const years = fmt(termInYears(time, unit));
    const formula = unit === 'months' ? msg('T = months / 12') : msg('T = days / 365');
    steps.push({ label: msg('Time in years'), formula, working: `${fmt(time)} / ${unit === 'months' ? 12 : 365}`, result: `${years} years`, resultMsg: { text: msg('{years} years'), vars: { years } } });
  }
  return steps;
}
