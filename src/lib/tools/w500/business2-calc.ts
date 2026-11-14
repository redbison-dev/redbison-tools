/**
 * Pure maths for the business2 calculators: meeting cost, payback period
 * and freelance hourly rate. No React, no DOM. Used by the pages and by the
 * MCP calculator specs (src/lib/mcp/calculators/w500-business2.ts).
 */

import { msg } from '../../msg';

/** Optional undefined members keep property access type-safe with strictNullChecks off. */
export type Result<T> = { ok: true; value: T; error?: undefined } | { ok: false; error: string; value?: undefined };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = <T>(error: string): Result<T> => ({ ok: false, error });
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/* ------------------------------------------------------------------ */
/* Meeting cost                                                        */
/* ------------------------------------------------------------------ */

export type PayBasis = 'annual' | 'hourly';

export type AttendeeGroup = {
  /** Label such as "Engineers". */
  label?: string;
  /** Number of people in this group. */
  count: number;
  /** Salary per year (basis 'annual') or pay per hour (basis 'hourly'). */
  pay: number;
  basis: PayBasis;
};

export type MeetingInput = {
  groups: AttendeeGroup[];
  /** Meeting length in minutes. */
  durationMinutes: number;
  /** Paid hours per year used to turn a salary into an hourly rate. 2,080 = 52 weeks x 40 hours. */
  hoursPerYear?: number;
  /** Multiplier for employer costs on top of pay (benefits, payroll tax, equipment). 1 = pay only. */
  overheadMultiplier?: number;
  /** Times the meeting happens per week, for the yearly figure. 0 = one-off. */
  perWeek?: number;
  /** Weeks a year the recurring meeting actually runs. */
  weeksPerYear?: number;
};

export type MeetingResult = {
  attendees: number;
  /** Loaded cost per hour of everyone in the room. */
  costPerHour: number;
  costPerMinute: number;
  costPerSecond: number;
  /** Cost of one meeting of the given length. */
  costPerMeeting: number;
  /** Person-hours consumed by one meeting. */
  personHours: number;
  /** Yearly cost if recurring, else null. */
  costPerYear: number | null;
  personHoursPerYear: number | null;
  groups: { label: string; count: number; hourlyRate: number; costPerMeeting: number }[];
};

export function hourlyFromPay(pay: number, basis: PayBasis, hoursPerYear = 2080): number {
  return basis === 'annual' ? pay / hoursPerYear : pay;
}

export function meetingCost(input: MeetingInput): Result<MeetingResult> {
  const hoursPerYear = input.hoursPerYear ?? 2080;
  const overhead = input.overheadMultiplier ?? 1;
  const perWeek = input.perWeek ?? 0;
  const weeks = input.weeksPerYear ?? 48;
  if (!finite(input.durationMinutes) || input.durationMinutes <= 0) return fail(msg('Meeting length must be greater than zero.'));
  if (!finite(hoursPerYear) || hoursPerYear <= 0) return fail(msg('Paid hours per year must be greater than zero.'));
  if (!finite(overhead) || overhead < 1 || overhead > 5) return fail(msg('Overhead multiplier must be between 1 and 5.'));
  if (!finite(perWeek) || perWeek < 0) return fail(msg('Meetings per week cannot be negative.'));
  if (!finite(weeks) || weeks < 0 || weeks > 53) return fail(msg('Weeks per year must be between 0 and 53.'));
  if (!input.groups.length) return fail(msg('Add at least one attendee.'));
  let attendees = 0;
  let perHour = 0;
  const groups: MeetingResult['groups'] = [];
  for (const g of input.groups) {
    if (!finite(g.count) || g.count < 0 || !Number.isInteger(g.count)) return fail(msg('Attendee counts must be whole numbers.'));
    if (!finite(g.pay) || g.pay < 0) return fail(msg('Pay cannot be negative.'));
    const rate = hourlyFromPay(g.pay, g.basis, hoursPerYear) * overhead;
    attendees += g.count;
    perHour += rate * g.count;
    groups.push({ label: g.label || 'Attendees', count: g.count, hourlyRate: rate, costPerMeeting: rate * g.count * (input.durationMinutes / 60) });
  }
  if (attendees === 0) return fail(msg('Add at least one attendee.'));
  const hours = input.durationMinutes / 60;
  const costPerMeeting = perHour * hours;
  const yearly = perWeek > 0 ? costPerMeeting * perWeek * weeks : null;
  return ok({
    attendees,
    costPerHour: perHour,
    costPerMinute: perHour / 60,
    costPerSecond: perHour / 3600,
    costPerMeeting,
    personHours: attendees * hours,
    costPerYear: yearly,
    personHoursPerYear: perWeek > 0 ? attendees * hours * perWeek * weeks : null,
    groups,
  });
}

/** Running cost after `elapsedSeconds` of a live meeting. */
export function liveCost(costPerHour: number, elapsedSeconds: number): number {
  return (costPerHour * Math.max(0, elapsedSeconds)) / 3600;
}

/* ------------------------------------------------------------------ */
/* Payback period                                                      */
/* ------------------------------------------------------------------ */

export type PaybackInput = {
  /** Up-front investment at time 0, as a positive number. */
  initialInvestment: number;
  /** Net cash flow for periods 1..n (end of period). May include negatives. */
  cashFlows: number[];
  /** Discount rate per period in percent for the discounted payback. */
  discountRatePct?: number;
};

export type PaybackRow = {
  period: number;
  cashFlow: number;
  cumulative: number;
  discountFactor: number;
  discounted: number;
  cumulativeDiscounted: number;
};

export type PaybackResult = {
  /** Simple payback in periods, interpolated within the recovery period. null if never recovered. */
  simple: number | null;
  /** Discounted payback in periods. null if never recovered. */
  discounted: number | null;
  /** Net present value at the discount rate (time-0 investment included). */
  npv: number;
  /** Sum of undiscounted flows minus the investment. */
  netCash: number;
  /** True if the cumulative balance turns negative again after first recovery. */
  simpleReverts: boolean;
  discountedReverts: boolean;
  rows: PaybackRow[];
};

/**
 * First period at which the running balance (starting at -investment)
 * reaches zero, assuming each period's cash arrives evenly through the
 * period, which is the textbook interpolation: (n - 1) + unrecovered / flow_n.
 */
function crossing(investment: number, flows: number[]): { at: number | null; reverts: boolean } {
  let bal = -investment;
  if (bal >= 0) return { at: 0, reverts: false };
  let at: number | null = null;
  for (let i = 0; i < flows.length; i++) {
    const before = bal;
    bal += flows[i];
    if (at === null && bal >= 0) {
      at = i + (-before) / flows[i];
      continue;
    }
    if (at !== null && bal < -1e-9) return { at, reverts: true };
  }
  return { at, reverts: false };
}

export function paybackPeriod(input: PaybackInput): Result<PaybackResult> {
  const { initialInvestment: inv, cashFlows } = input;
  const rate = input.discountRatePct ?? 0;
  if (!finite(inv) || inv <= 0) return fail(msg('Initial investment must be greater than zero.'));
  if (!cashFlows.length) return fail(msg('Enter at least one cash flow.'));
  if (cashFlows.some((c) => !finite(c))) return fail(msg('Every cash flow must be a number.'));
  if (cashFlows.length > 600) return fail(msg('Use 600 periods or fewer.'));
  if (!finite(rate) || rate <= -100 || rate > 1000) return fail(msg('Discount rate must be above -100%.'));
  const r = rate / 100;
  const rows: PaybackRow[] = [];
  let cum = -inv;
  let cumD = -inv;
  const discountedFlows: number[] = [];
  cashFlows.forEach((cf, i) => {
    const t = i + 1;
    const df = 1 / Math.pow(1 + r, t);
    const d = cf * df;
    cum += cf;
    cumD += d;
    discountedFlows.push(d);
    rows.push({ period: t, cashFlow: cf, cumulative: cum, discountFactor: df, discounted: d, cumulativeDiscounted: cumD });
  });
  const s = crossing(inv, cashFlows);
  const d = crossing(inv, discountedFlows);
  return ok({
    simple: s.at,
    discounted: d.at,
    npv: cumD,
    netCash: cum,
    simpleReverts: s.reverts,
    discountedReverts: d.reverts,
    rows,
  });
}

/** Even cash flows: n periods of the same amount, optionally growing by g% each period. */
export function evenFlows(amount: number, periods: number, growthPct = 0): number[] {
  const n = Math.max(0, Math.min(600, Math.floor(periods)));
  return Array.from({ length: n }, (_, i) => amount * Math.pow(1 + growthPct / 100, i));
}

/**
 * Parse "30000, 40000\n50000", "30k 40k" or "1,000 (500)" into numbers. A comma followed by exactly three
 * digits is a thousands separator; any other comma, space, semicolon or new line separates values.
 * Returns null on a bad token.
 */
export function parseCashFlows(text: string): number[] | null {
  const tokens = text
    .split(/[\s;]+|,(?!\d{3}(?!\d))/)
    .map((t) => t.trim().replace(/,/g, ''))
    .filter(Boolean);
  const out: number[] = [];
  for (const raw of tokens) {
    const m = /^(-?)\(?\$?(-?[0-9]*\.?[0-9]+)\)?([kKmM]?)$/.exec(raw.replace(/[$€£₹¥]/g, ''));
    if (!m) return null;
    let v = Number(m[2]);
    if (m[3].toLowerCase() === 'k') v *= 1e3;
    if (m[3].toLowerCase() === 'm') v *= 1e6;
    if (m[1] === '-' || /^\(.*\)$/.test(raw)) v = -Math.abs(v);
    out.push(v);
  }
  return out;
}

/** Split a fractional period count into whole years and months (12 months per period). */
export function yearsMonths(periods: number): { years: number; months: number } {
  let years = Math.floor(periods);
  let months = Math.round((periods - years) * 12);
  if (months === 12) {
    years += 1;
    months = 0;
  }
  return { years, months };
}

/* ------------------------------------------------------------------ */
/* Freelance hourly rate                                               */
/* ------------------------------------------------------------------ */

export type FreelanceInput = {
  /** Income you want to keep after tax and business costs, per year. */
  targetNetIncome: number;
  /** Business expenses per year: software, hardware, insurance, accountant, coworking, health cover. */
  annualExpenses: number;
  /** Effective total tax rate on profit, percent (income tax plus self-employment or social charges). */
  taxRatePct: number;
  /** Extra margin on top of costs and pay, percent of required revenue (savings buffer, retirement, profit). */
  profitMarginPct?: number;
  /** Working days per week. */
  daysPerWeek?: number;
  /** Hours worked per working day (billable plus admin). */
  hoursPerDay?: number;
  /** Vacation days a year. */
  vacationDays?: number;
  /** Public holidays a year. */
  holidays?: number;
  /** Sick days a year. */
  sickDays?: number;
  /** Share of working hours you can bill to clients, percent. */
  billablePct?: number;
};

export type FreelanceResult = {
  workingDays: number;
  workingHours: number;
  billableHours: number;
  /** Profit before tax needed to keep the target after tax. */
  preTaxProfit: number;
  tax: number;
  /** Revenue needed: pre-tax profit + expenses, grossed up for the margin. */
  revenue: number;
  hourlyRate: number;
  /** Hourly rate times hours per day: the day rate for a full billable day. */
  dayRate: number;
  weeklyRevenue: number;
  monthlyRevenue: number;
  /** Rate that only covers expenses and tax at zero personal income (the floor). */
  breakEvenHourly: number;
};

export function freelanceRate(input: FreelanceInput): Result<FreelanceResult> {
  const daysPerWeek = input.daysPerWeek ?? 5;
  const hoursPerDay = input.hoursPerDay ?? 8;
  const vacation = input.vacationDays ?? 20;
  const holidays = input.holidays ?? 10;
  const sick = input.sickDays ?? 5;
  const billablePct = input.billablePct ?? 70;
  const margin = input.profitMarginPct ?? 0;
  const { targetNetIncome: net, annualExpenses: exp, taxRatePct: tax } = input;
  if (!finite(net) || net < 0) return fail(msg('Target income cannot be negative.'));
  if (!finite(exp) || exp < 0) return fail(msg('Expenses cannot be negative.'));
  if (!finite(tax) || tax < 0 || tax >= 100) return fail(msg('Tax rate must be from 0 to below 100%.'));
  if (!finite(margin) || margin < 0 || margin >= 100) return fail(msg('Profit margin must be from 0 to below 100%.'));
  if (!finite(daysPerWeek) || daysPerWeek <= 0 || daysPerWeek > 7) return fail(msg('Days per week must be between 1 and 7.'));
  if (!finite(hoursPerDay) || hoursPerDay <= 0 || hoursPerDay > 24) return fail(msg('Hours per day must be between 0 and 24.'));
  if (!finite(billablePct) || billablePct <= 0 || billablePct > 100) return fail(msg('Billable share must be between 1 and 100%.'));
  for (const d of [vacation, holidays, sick]) if (!finite(d) || d < 0) return fail(msg('Days off cannot be negative.'));
  const workingDays = 52 * daysPerWeek - vacation - holidays - sick;
  if (workingDays <= 0) return fail(msg('Days off leave no working days in the year.'));
  const workingHours = workingDays * hoursPerDay;
  const billableHours = (workingHours * billablePct) / 100;
  const preTaxProfit = net / (1 - tax / 100);
  const revenue = (preTaxProfit + exp) / (1 - margin / 100);
  const hourlyRate = revenue / billableHours;
  return ok({
    workingDays,
    workingHours,
    billableHours,
    preTaxProfit,
    tax: preTaxProfit - net,
    revenue,
    hourlyRate,
    dayRate: hourlyRate * hoursPerDay,
    weeklyRevenue: revenue / 52,
    monthlyRevenue: revenue / 12,
    breakEvenHourly: exp / billableHours,
  });
}

/** Round a rate up to a friendly step (5 for hourly, 25 for daily) for quoting. */
export function roundUpTo(x: number, step: number): number {
  if (!finite(x) || step <= 0) return x;
  return Math.ceil(x / step - 1e-9) * step;
}
