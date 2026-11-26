/**
 * Pure maths for the invest-b calculator group: 401(k), Roth IRA comparison,
 * APY / CD, SIP, annuity, bond price and yield, and currency conversion.
 * No React here so the regression tests exercise exactly what the UI shows.
 */
import { msg } from '../../msg';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Rounds to cents (or any number of decimals) without floating noise like 0.1 + 0.2. */
export function round(value: number, decimals = 2): number {
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON * Math.sign(value)) * f) / f;
}

const isFiniteNumber = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

// ---------------------------------------------------------------------------
// IRS limits (verified on irs.gov, IR-2025-111 / Notice 2025-67, Nov 2025)
// ---------------------------------------------------------------------------

export interface RetirementLimits {
  year: number;
  /** 402(g) elective deferral limit for 401(k), 403(b), governmental 457 and TSP. */
  deferral: number;
  /** Catch-up for ages 50+ (except 60–63). */
  catchUp50: number;
  /** SECURE 2.0 "super" catch-up for ages 60, 61, 62 and 63 (replaces catchUp50 at those ages). */
  catchUp6063: number;
  /** 415(c) annual additions limit (employee + employer, excluding catch-up). */
  annualAdditions: number;
  /** 401(a)(17) compensation limit used for employer contributions. */
  compensation: number;
  /** IRA contribution limit (traditional + Roth combined). */
  ira: number;
  /** IRA catch-up for ages 50+. */
  iraCatchUp: number;
  /** Prior-year FICA wages above which 401(k) catch-up must be Roth (from 2026). */
  rothCatchUpWageThreshold: number;
}

export const LIMITS_2026: RetirementLimits = {
  year: 2026,
  deferral: 24500,
  catchUp50: 8000,
  catchUp6063: 11250,
  annualAdditions: 72000,
  compensation: 360000,
  ira: 7500,
  iraCatchUp: 1100,
  rothCatchUpWageThreshold: 150000,
};

/** 2026 Roth IRA modified AGI phase-out ranges (IRS). Shown as a note, not computed. */
export const ROTH_PHASEOUT_2026 = [
  { filing: msg('Single or head of household'), from: 153000, to: 168000 },
  { filing: msg('Married filing jointly'), from: 242000, to: 252000 },
  { filing: msg('Married filing separately (lived with spouse)'), from: 0, to: 10000 },
] as const;

/**
 * 2027 limits, a new set beside 2026 (never an edit of it). Read in IRS Notice
 * 2026-66 (https://www.irs.gov/pub/irs-drop/n-26-66.pdf, announced in IR-2026-136
 * on 12 November 2026) on 2026-11-25: 402(g) $24,500 -> $25,500; 414(v)(2)(B)(i)
 * catch-up $8,000 -> $8,500; 414(v)(2)(E)(i) ages 60-63 $11,250 -> $11,750;
 * 415(c) $72,000 -> $75,000; 401(a)(17) $360,000 -> $375,000; IRA 219(b)(5)(A)
 * stays $7,500 and the 50+ IRA catch-up stays $1,100; the Roth catch-up wage
 * threshold (414(v)(7)(A)), tested on 2026 FICA wages for 2027 catch-ups,
 * $150,000 -> $155,000.
 */
export const LIMITS_2027: RetirementLimits = {
  year: 2027,
  deferral: 25500,
  catchUp50: 8500,
  catchUp6063: 11750,
  annualAdditions: 75000,
  compensation: 375000,
  ira: 7500,
  iraCatchUp: 1100,
  rothCatchUpWageThreshold: 155000,
};

/** 2027 Roth IRA modified AGI phase-out ranges (Notice 2026-66, 408A(c)(3)). Shown as a note, not computed. */
export const ROTH_PHASEOUT_2027 = [
  { filing: msg('Single or head of household'), from: 158000, to: 173000 },
  { filing: msg('Married filing jointly'), from: 250000, to: 260000 },
  { filing: msg('Married filing separately (lived with spouse)'), from: 0, to: 10000 },
] as const;

/** Every year with published limits, oldest first. A new year is a new entry, never an edit. */
export const LIMITS_BY_YEAR: Readonly<Record<number, RetirementLimits>> = { 2026: LIMITS_2026, 2027: LIMITS_2027 };
export const ROTH_PHASEOUT_BY_YEAR: Readonly<Record<number, typeof ROTH_PHASEOUT_2026 | typeof ROTH_PHASEOUT_2027>> = {
  2026: ROTH_PHASEOUT_2026,
  2027: ROTH_PHASEOUT_2027,
};

/** The IRS news release that announced each year's limits, for the page's source links. */
export const LIMITS_NEWS_BY_YEAR: Readonly<Record<number, { id: string; url: string }>> = {
  2026: { id: 'IR-2025-111', url: 'https://www.irs.gov/newsroom/401k-limit-increases-to-24500-for-2026-ira-limit-increases-to-7500' },
  2027: { id: 'IR-2026-136', url: 'https://www.irs.gov/newsroom/401k-limit-increases-to-25500-for-2027-ira-limit-remains-7500' },
};

/** Limits for a tax year: the year asked for, else the nearest year that has figures (never undefined). */
export function limitsForYear(year: number): RetirementLimits {
  if (LIMITS_BY_YEAR[year]) return LIMITS_BY_YEAR[year];
  const years = Object.keys(LIMITS_BY_YEAR).map(Number).sort((a, b) => a - b);
  return LIMITS_BY_YEAR[Number.isFinite(year) && year < years[0] ? years[0] : years[years.length - 1]];
}

/** Catch-up amount available at an age (age reached by 31 December of the plan year). */
export function catchUpForAge(age: number, limits: Pick<RetirementLimits, 'catchUp50' | 'catchUp6063'>): number {
  if (age >= 60 && age <= 63) return limits.catchUp6063;
  if (age >= 50) return limits.catchUp50;
  return 0;
}

/** Projects a dollar limit forward, rounded down to a $500 multiple the way the IRS indexes 402(g). */
export function indexLimit(base: number, growthPct: number, years: number): number {
  if (!(growthPct > 0) || years <= 0) return base;
  return Math.floor((base * (1 + growthPct / 100) ** years) / 500) * 500;
}

// ---------------------------------------------------------------------------
// 401(k)
// ---------------------------------------------------------------------------

/** One tier of an employer match: `rate`% of the next `upTo`% of pay you defer. */
export interface MatchTier {
  rate: number;
  upTo: number;
}

/**
 * Parses a match formula like "50:6" (50% of the first 6%) or "100:3,50:2"
 * (100% of the first 3% plus 50% of the next 2%). Invalid parts are skipped.
 */
export function parseMatchTiers(text: string): MatchTier[] {
  return String(text || '')
    .split(',')
    .map((part) => part.split(':').map((s) => Number(s.trim())))
    .filter((p) => p.length === 2 && isFiniteNumber(p[0]) && isFiniteNumber(p[1]) && p[0] > 0 && p[1] > 0)
    .map(([rate, upTo]) => ({ rate, upTo }));
}

export function formatMatchTiers(tiers: MatchTier[]): string {
  return tiers.map((t) => `${t.rate}:${t.upTo}`).join(',');
}

/** Employer match as a % of pay for a given deferral % of pay. */
export function matchPercentOfPay(deferralPct: number, tiers: MatchTier[]): number {
  let remaining = Math.max(0, deferralPct);
  let match = 0;
  for (const t of tiers) {
    const band = Math.min(remaining, t.upTo);
    match += (band * t.rate) / 100;
    remaining -= band;
    if (remaining <= 0) break;
  }
  return match;
}

/** Deferral % of pay needed to collect the whole match. */
export function fullMatchDeferralPct(tiers: MatchTier[]): number {
  return tiers.reduce((s, t) => s + t.upTo, 0);
}

export interface FourOhOneKInput {
  currentAge: number;
  retirementAge: number;
  currentBalance: number;
  salary: number;
  /** Annual raise, %. */
  salaryGrowth: number;
  /** Employee deferral, % of salary. */
  contributionPct: number;
  match: MatchTier[];
  /** Expected annual return, % (effective annual). */
  annualReturn: number;
  limits: RetirementLimits;
  /** Apply the 402(g) deferral limit (plus catch-up when eligible). */
  enforceLimit: boolean;
  /** Include catch-up contributions at 50+ (and the 60–63 super catch-up). */
  useCatchUp: boolean;
  /** Raise the dollar limits each year by this %, rounded down to $500. 0 holds them flat. */
  limitGrowth: number;
  /** Annual inflation, % (only for the "today's dollars" figure). */
  inflation?: number;
  /** Calendar year of the first projection year (labels and limit indexing). */
  startYear?: number;
}

export interface FourOhOneKRow {
  year: number;
  age: number;
  salary: number;
  employee: number;
  employer: number;
  growth: number;
  endBalance: number;
  /** Dollar deferral limit that applied this year (base + catch-up), or null when not enforced. */
  limit: number | null;
  /** True when the requested contribution % was cut back by the limit. */
  capped: boolean;
}

export interface FourOhOneKResult {
  rows: FourOhOneKRow[];
  finalBalance: number;
  totalEmployee: number;
  totalEmployer: number;
  totalGrowth: number;
  /** Final balance in today's money, using `inflation`. */
  finalBalanceReal: number;
  years: number;
  error?: string;
}

/**
 * Year-by-year 401(k) projection. Each projection year runs 12 monthly
 * deposits (1/12 of the year's employee and employer money, at month end)
 * and compounds monthly at the monthly equivalent of the annual return,
 * so a 7% return is exactly 7% a year on money held all year.
 * The age in a row is the age reached during that year, which is how the
 * IRS tests catch-up eligibility.
 */
export function project401k(input: FourOhOneKInput): FourOhOneKResult {
  const empty = { rows: [], finalBalance: 0, totalEmployee: 0, totalEmployer: 0, totalGrowth: 0, finalBalanceReal: 0, years: 0 };
  const years = Math.round(input.retirementAge - input.currentAge);
  if (!(input.currentAge >= 0) || !(input.retirementAge > input.currentAge)) {
    return { ...empty, error: msg('Retirement age must be greater than current age.') };
  }
  if (years > 80) return { ...empty, error: msg('Use a horizon of 80 years or less.') };
  if (![input.currentBalance, input.salary, input.salaryGrowth, input.contributionPct, input.annualReturn].every(isFiniteNumber)) {
    return { ...empty, error: msg('Enter a number in every field.') };
  }
  if (input.salary < 0 || input.currentBalance < 0 || input.contributionPct < 0) {
    return { ...empty, error: msg('Salary, balance and contribution cannot be negative.') };
  }
  if (input.contributionPct > 100) return { ...empty, error: msg('Contribution cannot exceed 100% of salary.') };
  if (input.annualReturn <= -100) return { ...empty, error: msg('Return must be greater than -100%.') };

  const startYear = input.startYear ?? input.limits.year;
  const monthly = (1 + input.annualReturn / 100) ** (1 / 12) - 1;
  let balance = input.currentBalance;
  let salary = input.salary;
  let totalEmployee = 0;
  let totalEmployer = 0;
  let totalGrowth = 0;
  const rows: FourOhOneKRow[] = [];

  for (let y = 0; y < years; y++) {
    const age = Math.floor(input.currentAge) + y + 1;
    const year = startYear + y;
    const shift = Math.max(0, year - input.limits.year);
    const deferralLimit = indexLimit(input.limits.deferral, input.limitGrowth, shift);
    const catchUp = input.useCatchUp
      ? catchUpForAge(age, {
          catchUp50: indexLimit(input.limits.catchUp50, input.limitGrowth, shift),
          catchUp6063: indexLimit(input.limits.catchUp6063, input.limitGrowth, shift),
        })
      : 0;
    const additionsLimit = indexLimit(input.limits.annualAdditions, input.limitGrowth, shift);
    const compLimit = indexLimit(input.limits.compensation, input.limitGrowth, shift);

    const requested = (salary * input.contributionPct) / 100;
    const limit = input.enforceLimit ? deferralLimit + catchUp : null;
    const employee = limit === null ? requested : Math.min(requested, limit);
    const capped = limit !== null && requested > limit + 1e-9;

    // Match is calculated on the deferral % actually made, on pay up to the 401(a)(17) limit.
    const actualPct = salary > 0 ? (employee / salary) * 100 : 0;
    const matchPay = input.enforceLimit ? Math.min(salary, compLimit) : salary;
    let employer = (matchPay * matchPercentOfPay(actualPct, input.match)) / 100;
    if (input.enforceLimit) {
      // 415(c): regular deferrals + employer money (catch-up is outside this limit).
      const regularDeferral = Math.min(employee, deferralLimit);
      employer = Math.max(0, Math.min(employer, additionsLimit - regularDeferral));
    }

    const start = balance;
    const deposit = (employee + employer) / 12;
    for (let m = 0; m < 12; m++) balance = balance * (1 + monthly) + deposit;
    const growth = balance - start - employee - employer;

    totalEmployee += employee;
    totalEmployer += employer;
    totalGrowth += growth;
    rows.push({ year, age, salary, employee, employer, growth, endBalance: balance, limit, capped });
    salary *= 1 + input.salaryGrowth / 100;
  }

  const inflation = input.inflation ?? 0;
  return {
    rows,
    finalBalance: balance,
    totalEmployee,
    totalEmployer,
    totalGrowth,
    finalBalanceReal: balance / (1 + inflation / 100) ** years,
    years,
  };
}

// ---------------------------------------------------------------------------
// Roth IRA vs traditional IRA vs taxable account
// ---------------------------------------------------------------------------

export interface RothCompareInput {
  /** Contribution each year, made at the start of the year. */
  annualContribution: number;
  currentBalance?: number;
  years: number;
  annualReturn: number;
  /** Marginal tax rate today, %. */
  currentTaxRate: number;
  /** Expected tax rate on traditional IRA withdrawals, %. */
  retirementTaxRate: number;
  /** Tax rate on dividends and capital gains in the taxable account, %. */
  capitalGainsRate: number;
  /** Portion of the return paid out (and taxed) every year in the taxable account, %. */
  dividendYield: number;
  /** Invest the traditional IRA's tax deduction in a taxable account. */
  investTaxSavings: boolean;
}

export interface RothCompareRow {
  year: number;
  roth: number;
  traditionalGross: number;
  traditionalAfterTax: number;
  taxable: number;
}

export interface RothCompareResult {
  rows: RothCompareRow[];
  totalContributed: number;
  roth: number;
  traditionalGross: number;
  traditionalTax: number;
  /** Traditional IRA after withdrawal tax, plus the invested deduction if enabled. */
  traditionalAfterTax: number;
  /** The invested tax savings on their own, after tax. */
  taxSavingsValue: number;
  taxable: number;
  taxableTaxPaid: number;
  error?: string;
}

/**
 * Grows a taxable account. Each year: deposit at the start, growth at the
 * total return, the dividend part taxed and the after-tax dividend added to
 * the cost basis. Unrealised gains are taxed once at the end when `liquidate`.
 */
export function growTaxable(
  deposits: number[],
  annualReturn: number,
  dividendYield: number,
  taxRate: number,
  liquidate = true,
  opening = 0,
): { balances: number[]; afterTax: number[]; final: number; taxPaid: number; basis: number } {
  const r = annualReturn / 100;
  const d = Math.min(Math.max(dividendYield, 0), Math.max(annualReturn, 0)) / 100;
  const t = taxRate / 100;
  let value = opening;
  let basis = opening;
  let taxPaid = 0;
  const balances: number[] = [];
  const afterTax: number[] = [];
  for (const dep of deposits) {
    value += dep;
    basis += dep;
    const start = value;
    const dividend = start * d;
    const dividendTax = dividend * t;
    value = start * (1 + r) - dividendTax;
    basis += dividend - dividendTax;
    taxPaid += dividendTax;
    balances.push(value);
    afterTax.push(value - Math.max(0, value - basis) * t);
  }
  let final = value;
  if (liquidate) {
    const gainTax = Math.max(0, value - basis) * t;
    taxPaid += gainTax;
    final = value - gainTax;
  }
  return { balances, afterTax, final, taxPaid, basis };
}

export function compareRothTraditional(input: RothCompareInput): RothCompareResult {
  const empty: RothCompareResult = {
    rows: [], totalContributed: 0, roth: 0, traditionalGross: 0, traditionalTax: 0, traditionalAfterTax: 0,
    taxSavingsValue: 0, taxable: 0, taxableTaxPaid: 0,
  };
  const years = Math.round(input.years);
  if (!(years >= 1) || years > 80) return { ...empty, error: msg('Years must be between 1 and 80.') };
  if (!(input.annualContribution >= 0) || !((input.currentBalance ?? 0) >= 0)) return { ...empty, error: msg('Amounts cannot be negative.') };
  for (const rate of [input.currentTaxRate, input.retirementTaxRate, input.capitalGainsRate]) {
    if (!(rate >= 0 && rate < 100)) return { ...empty, error: msg('Tax rates must be between 0% and 99%.') };
  }
  if (!(input.annualReturn > -100)) return { ...empty, error: msg('Return must be greater than -100%.') };
  if (!isFiniteNumber(input.dividendYield)) return { ...empty, error: msg('Enter a dividend yield (0 if none).') };

  const r = input.annualReturn / 100;
  const c = input.annualContribution;
  const opening = input.currentBalance ?? 0;
  const tNow = input.currentTaxRate / 100;
  const tRet = input.retirementTaxRate / 100;
  const deposits = Array.from({ length: years }, () => c);
  const savingsDeposits = deposits.map((dep) => (input.investTaxSavings ? dep * tNow : 0));

  const taxable = growTaxable(deposits, input.annualReturn, input.dividendYield, input.capitalGainsRate, true, opening);
  const savings = growTaxable(savingsDeposits, input.annualReturn, input.dividendYield, input.capitalGainsRate, true);

  const rows: RothCompareRow[] = [];
  let ira = opening;
  for (let y = 0; y < years; y++) {
    ira = (ira + c) * (1 + r);
    rows.push({
      year: y + 1,
      roth: ira,
      traditionalGross: ira,
      traditionalAfterTax: ira * (1 - tRet) + savings.afterTax[y],
      taxable: taxable.afterTax[y],
    });
  }
  // Every row is the value if everything were cashed out (and taxed) at the end of that year.
  const traditionalTax = ira * tRet;
  const traditionalAfterTax = ira - traditionalTax + savings.final;

  return {
    rows,
    totalContributed: opening + c * years,
    roth: ira,
    traditionalGross: ira,
    traditionalTax,
    traditionalAfterTax,
    taxSavingsValue: savings.final,
    taxable: taxable.final,
    taxableTaxPaid: taxable.taxPaid,
  };
}

/** IRA contribution limit for an age (traditional and Roth combined). */
export function iraLimitForAge(age: number, limits: Pick<RetirementLimits, 'ira' | 'iraCatchUp'> = LIMITS_2026): number {
  return limits.ira + (age >= 50 ? limits.iraCatchUp : 0);
}

// ---------------------------------------------------------------------------
// APY / APR / CD
// ---------------------------------------------------------------------------

/** Compounding periods per year; 0 means continuous. */
export type Compounding = number;

export const COMPOUNDING_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: msg('Annually') },
  { value: 2, label: msg('Semi-annually') },
  { value: 4, label: msg('Quarterly') },
  { value: 12, label: msg('Monthly') },
  { value: 52, label: msg('Weekly') },
  { value: 365, label: msg('Daily') },
  { value: 0, label: msg('Continuously') },
];

/** APR (nominal annual rate, %) to APY (%). */
export function aprToApy(aprPct: number, n: Compounding): number {
  const r = aprPct / 100;
  if (n === 0) return (Math.exp(r) - 1) * 100;
  return ((1 + r / n) ** n - 1) * 100;
}

/** APY (%) to the nominal APR (%) that produces it at `n` compoundings a year. */
export function apyToApr(apyPct: number, n: Compounding): number {
  const y = apyPct / 100;
  if (y <= -1) return NaN;
  if (n === 0) return Math.log(1 + y) * 100;
  return n * ((1 + y) ** (1 / n) - 1) * 100;
}

/** Truth in Savings (Regulation DD, Appendix A) APY from interest earned over a term in days. */
export function regDdApy(principal: number, interest: number, days: number): number {
  if (!(principal > 0) || !(days > 0)) return NaN;
  return ((1 + interest / principal) ** (365 / days) - 1) * 100;
}

/** Balance after `months` at a nominal APR compounded `n` times a year (0 = continuous). */
export function growAtApr(principal: number, aprPct: number, n: Compounding, months: number): number {
  const t = months / 12;
  const r = aprPct / 100;
  if (n === 0) return principal * Math.exp(r * t);
  return principal * (1 + r / n) ** (n * t);
}

export interface CdInput {
  deposit: number;
  /** Rate as quoted, %. */
  rate: number;
  rateType: 'apr' | 'apy';
  compounding: Compounding;
  termMonths: number;
  /** Early-withdrawal penalty in months of simple interest. */
  penaltyMonths: number;
  /** Month you might withdraw early (for the penalty estimate). */
  withdrawMonth?: number;
  /**
   * How the bank charges for breaking the deposit. 'months' (default, the US
   * CD convention): a number of months of simple interest at the deposit's APR.
   * 'rate': the deposit is repaid at a lower rate for the time it was held, as
   * Indian banks do (card rate for the period held minus a penal rate, RBI
   * Interest Rate on Deposits Directions) and Australian term deposits do
   * (an interest reduction by the share of the term elapsed).
   */
  penaltyType?: 'months' | 'rate';
  /** With penaltyType 'rate': the nominal annual rate (%) paid on early withdrawal, same compounding. */
  earlyRate?: number;
}

export interface CdResult {
  apr: number;
  apy: number;
  maturity: number;
  interest: number;
  schedule: { month: number; balance: number; interest: number }[];
  penalty: number;
  /** Balance at `withdrawMonth` minus the penalty (never below the deposit-minus-penalty floor). */
  earlyValue: number | null;
  error?: string;
}

export function computeCd(input: CdInput): CdResult {
  const base: CdResult = { apr: 0, apy: 0, maturity: 0, interest: 0, schedule: [], penalty: 0, earlyValue: null };
  if (!(input.deposit >= 0)) return { ...base, error: msg('Deposit cannot be negative.') };
  if (!(input.termMonths > 0) || input.termMonths > 600) return { ...base, error: msg('Term must be between 1 and 600 months.') };
  if (!(input.rate > -100)) return { ...base, error: msg('Rate must be greater than -100%.') };
  const apr = input.rateType === 'apr' ? input.rate : apyToApr(input.rate, input.compounding);
  const apy = input.rateType === 'apy' ? input.rate : aprToApy(input.rate, input.compounding);
  const maturity = growAtApr(input.deposit, apr, input.compounding, input.termMonths);
  const schedule: CdResult['schedule'] = [];
  const step = input.termMonths > 60 ? 12 : input.termMonths > 24 ? 3 : 1;
  for (let m = step; m < input.termMonths + step; m += step) {
    const month = Math.min(m, input.termMonths);
    const balance = growAtApr(input.deposit, apr, input.compounding, month);
    schedule.push({ month, balance, interest: balance - input.deposit });
    if (month === input.termMonths) break;
  }
  const early = input.withdrawMonth !== undefined && input.withdrawMonth > 0 && input.withdrawMonth < input.termMonths;
  if (input.penaltyType === 'rate') {
    if (!isFiniteNumber(input.earlyRate) || !((input.earlyRate as number) > -100)) return { ...base, error: msg('Enter the rate paid on early withdrawal.') };
    if (!early) return { apr, apy, maturity, interest: maturity - input.deposit, schedule, penalty: 0, earlyValue: null };
    const full = growAtApr(input.deposit, apr, input.compounding, input.withdrawMonth as number);
    const earlyValue = growAtApr(input.deposit, input.earlyRate as number, input.compounding, input.withdrawMonth as number);
    return { apr, apy, maturity, interest: maturity - input.deposit, schedule, penalty: full - earlyValue, earlyValue };
  }
  const penaltyMonths = isFiniteNumber(input.penaltyMonths) ? Math.max(0, input.penaltyMonths) : 0;
  const penalty = (input.deposit * (apr / 100) * penaltyMonths) / 12;
  let earlyValue: number | null = null;
  if (early) {
    earlyValue = growAtApr(input.deposit, apr, input.compounding, input.withdrawMonth as number) - penalty;
  }
  return { apr, apy, maturity, interest: maturity - input.deposit, schedule, penalty, earlyValue };
}

// ---------------------------------------------------------------------------
// SIP (systematic investment plan)
// ---------------------------------------------------------------------------

/**
 * 'nominal': monthly rate = annual / 12 (most Indian SIP calculators and the
 * SIP formula as usually printed). 'effective': monthly rate = (1 + annual)^(1/12) − 1,
 * which some AMCs (for example HDFC Mutual Fund) and Groww use so that 12% means 12% a year.
 */
export type SipRateConvention = 'nominal' | 'effective';

export function sipMonthlyRate(annualPct: number, convention: SipRateConvention): number {
  const r = annualPct / 100;
  return convention === 'effective' ? (1 + r) ** (1 / 12) - 1 : r / 12;
}

export interface SipInput {
  monthly: number;
  annualReturn: number;
  years: number;
  /** Increase in the monthly instalment at the start of each new year, %. */
  stepUp: number;
  convention: SipRateConvention;
  /** Instalments at the start of the month (annuity due, the SIP convention) or the end. */
  timing?: 'start' | 'end';
}

export interface SipRow {
  year: number;
  monthly: number;
  invested: number;
  value: number;
  gains: number;
}

export interface SipResult {
  rows: SipRow[];
  invested: number;
  value: number;
  gains: number;
  error?: string;
}

export function computeSip(input: SipInput): SipResult {
  const months = Math.round(input.years * 12);
  if (!(input.monthly >= 0)) return { rows: [], invested: 0, value: 0, gains: 0, error: msg('Monthly amount cannot be negative.') };
  if (!(months >= 1) || months > 1200) return { rows: [], invested: 0, value: 0, gains: 0, error: msg('Duration must be between 1 month and 100 years.') };
  if (!(input.annualReturn > -100)) return { rows: [], invested: 0, value: 0, gains: 0, error: msg('Return must be greater than -100%.') };
  if (!(input.stepUp > -100)) return { rows: [], invested: 0, value: 0, gains: 0, error: msg('Step-up must be a number greater than -100%.') };
  const i = sipMonthlyRate(input.annualReturn, input.convention);
  const start = (input.timing ?? 'start') === 'start';
  let value = 0;
  let invested = 0;
  const rows: SipRow[] = [];
  let instalment = input.monthly;
  for (let m = 0; m < months; m++) {
    if (m > 0 && m % 12 === 0) instalment *= 1 + input.stepUp / 100;
    if (start) value = (value + instalment) * (1 + i);
    else value = value * (1 + i) + instalment;
    invested += instalment;
    if ((m + 1) % 12 === 0 || m === months - 1) {
      rows.push({ year: Math.ceil((m + 1) / 12), monthly: instalment, invested, value, gains: value - invested });
    }
  }
  return { rows, invested, value, gains: value - invested };
}

/** Closed-form SIP future value with no step-up (annuity due when `start`). */
export function sipFutureValue(monthly: number, monthlyRate: number, months: number, start = true): number {
  if (monthlyRate === 0) return monthly * months;
  // expm1/log1p keep a tiny rate from collapsing (1 + r)^n - 1 to 0.
  const fv = (monthly * Math.expm1(months * Math.log1p(monthlyRate))) / monthlyRate;
  return start ? fv * (1 + monthlyRate) : fv;
}

/** Lump sum compounded annually: A = P × (1 + r)^years (fractional years allowed). */
export function computeLumpSum(principal: number, annualReturn: number, years: number): { rows: SipRow[]; invested: number; value: number; gains: number; error?: string } {
  if (!(principal >= 0)) return { rows: [], invested: 0, value: 0, gains: 0, error: msg('Amount cannot be negative.') };
  if (!(years > 0) || years > 100) return { rows: [], invested: 0, value: 0, gains: 0, error: msg('Duration must be between 1 month and 100 years.') };
  if (!(annualReturn > -100)) return { rows: [], invested: 0, value: 0, gains: 0, error: msg('Return must be greater than -100%.') };
  const g = 1 + annualReturn / 100;
  const rows: SipRow[] = [];
  const whole = Math.ceil(years - 1e-9);
  for (let y = 1; y <= whole; y++) {
    const t = Math.min(y, years);
    const value = principal * g ** t;
    rows.push({ year: y, monthly: 0, invested: principal, value, gains: value - principal });
  }
  const value = principal * g ** years;
  return { rows, invested: principal, value, gains: value - principal };
}

/** Monthly SIP needed to reach a target (no step-up), annuity due. */
export function sipForTarget(target: number, monthlyRate: number, months: number): number {
  const factor = sipFutureValue(1, monthlyRate, months, true);
  return factor > 0 ? target / factor : NaN;
}

// ---------------------------------------------------------------------------
// Annuity
// ---------------------------------------------------------------------------

export interface AnnuityInput {
  /** Annual nominal rate, %; the per-period rate is rate / paymentsPerYear. */
  annualRate: number;
  years: number;
  paymentsPerYear: number;
  /** 'ordinary' pays at the end of each period, 'due' at the start. */
  timing: 'ordinary' | 'due';
  /** Annual increase in the payment (applied once a year), %. */
  growth: number;
}

/**
 * Present value of the payment stream per 1 unit of first payment, i.e. the
 * sum of (1+g)^yearIndex × v^t over all payments. Exact for any growth.
 */
export function annuityPvFactor(input: AnnuityInput): number {
  const m = input.paymentsPerYear;
  const n = Math.round(input.years * m);
  const i = input.annualRate / 100 / m;
  const g = input.growth / 100;
  const v = 1 / (1 + i);
  let sum = 0;
  for (let k = 0; k < n; k++) {
    const t = input.timing === 'due' ? k : k + 1;
    sum += (1 + g) ** Math.floor(k / m) * v ** t;
  }
  return sum;
}

export function annuityDiscount(input: Pick<AnnuityInput, 'annualRate' | 'years' | 'paymentsPerYear'>): number {
  const m = input.paymentsPerYear;
  const n = Math.round(input.years * m);
  return (1 + input.annualRate / 100 / m) ** -n;
}

/** Closed-form level payment from a present value (no growth). */
export function levelPayment(pv: number, ratePerPeriod: number, n: number, due = false): number {
  if (n <= 0) return NaN;
  if (ratePerPeriod === 0) return pv / n;
  const pmt = (pv * ratePerPeriod) / -Math.expm1(-n * Math.log1p(ratePerPeriod));
  return due ? pmt / (1 + ratePerPeriod) : pmt;
}

export interface AnnuityScheduleRow {
  year: number;
  startBalance: number;
  interest: number;
  payments: number;
  endBalance: number;
}

/** Year-by-year drawdown of `pv` paying `firstPayment` (growing yearly). */
export function annuitySchedule(pv: number, firstPayment: number, input: AnnuityInput): AnnuityScheduleRow[] {
  const m = input.paymentsPerYear;
  const n = Math.round(input.years * m);
  const i = input.annualRate / 100 / m;
  const g = input.growth / 100;
  const rows: AnnuityScheduleRow[] = [];
  let bal = pv;
  let yStart = bal;
  let yInterest = 0;
  let yPay = 0;
  for (let k = 0; k < n; k++) {
    const pmt = firstPayment * (1 + g) ** Math.floor(k / m);
    if (input.timing === 'due') {
      bal -= pmt;
      const int = bal * i;
      bal += int;
      yInterest += int;
    } else {
      const int = bal * i;
      bal += int - pmt;
      yInterest += int;
    }
    yPay += pmt;
    if ((k + 1) % m === 0 || k === n - 1) {
      rows.push({ year: Math.ceil((k + 1) / m), startBalance: yStart, interest: yInterest, payments: yPay, endBalance: Math.abs(bal) < 1e-6 ? 0 : bal });
      yStart = bal;
      yInterest = 0;
      yPay = 0;
    }
  }
  return rows;
}

/** First payment a lump sum supports, leaving `remaining` at the end. */
export function annuityPayout(pv: number, input: AnnuityInput, remaining = 0): number {
  const f = annuityPvFactor(input);
  if (!(f > 0)) return NaN;
  return (pv - remaining * annuityDiscount(input)) / f;
}

/** Lump sum needed today to fund `firstPayment` (growing yearly), leaving `remaining` at the end. */
export function annuityLumpSumNeeded(firstPayment: number, input: AnnuityInput, remaining = 0): number {
  return firstPayment * annuityPvFactor(input) + remaining * annuityDiscount(input);
}

/** Future value of a starting balance plus level contributions (accumulation phase). */
export function annuityFutureValue(start: number, contribution: number, input: AnnuityInput): number {
  const m = input.paymentsPerYear;
  const n = Math.round(input.years * m);
  const i = input.annualRate / 100 / m;
  const g = input.growth / 100;
  let bal = start;
  for (let k = 0; k < n; k++) {
    const c = contribution * (1 + g) ** Math.floor(k / m);
    bal = input.timing === 'due' ? (bal + c) * (1 + i) : bal * (1 + i) + c;
  }
  return bal;
}

// ---------------------------------------------------------------------------
// Bonds
// ---------------------------------------------------------------------------

export interface BondInput {
  face: number;
  /** Annual coupon rate, %. */
  couponRate: number;
  /** Years to maturity (fractional allowed; the stub is placed before the first coupon). */
  years: number;
  frequency: number;
  /** Amount paid at maturity per bond, defaults to face (use the call price for yield to call). */
  redemption?: number;
}

export interface BondPrice {
  dirty: number;
  clean: number;
  accrued: number;
  /** Number of remaining coupons. */
  coupons: number;
  /** Fraction of a period until the next coupon (1 = a coupon was just paid). */
  w: number;
  macaulay: number;
  modified: number;
  convexity: number;
}

/** Splits the time to maturity into N remaining coupons and the fraction w until the next one. */
export function bondPeriods(years: number, frequency: number): { n: number; w: number } {
  const periods = years * frequency;
  const n = Math.max(1, Math.ceil(periods - 1e-9));
  const w = periods - (n - 1);
  return { n, w: Math.min(1, Math.max(w, 1e-9)) };
}

/**
 * Price per bond at an annual yield (bond-equivalent, compounded at the
 * coupon frequency). Uses the street convention: cash flow k arrives at
 * (w + k − 1) periods, dirty = Σ CF × (1 + y/f)^−t, accrued = C × (1 − w).
 */
export function bondPriceFromYield(bond: BondInput, yieldPct: number): BondPrice {
  const f = bond.frequency;
  const { n, w } = bondPeriods(bond.years, f);
  const c = (bond.face * bond.couponRate) / 100 / f;
  const redemption = bond.redemption ?? bond.face;
  const j = yieldPct / 100 / f;
  let dirty = 0;
  let weighted = 0;
  let convex = 0;
  for (let k = 1; k <= n; k++) {
    const t = w + k - 1;
    const cf = c + (k === n ? redemption : 0);
    const pv = cf * (1 + j) ** -t;
    dirty += pv;
    weighted += t * pv;
    convex += t * (t + 1) * pv;
  }
  const accrued = c * (1 - w);
  const macaulayPeriods = weighted / dirty;
  const macaulay = macaulayPeriods / f;
  const modified = macaulay / (1 + j);
  const convexity = convex / (dirty * (1 + j) ** 2 * f * f);
  return { dirty, clean: dirty - accrued, accrued, coupons: n, w, macaulay, modified, convexity };
}

/** Solves the yield (annual %, bond-equivalent) that prices the bond at `price` (clean or dirty). */
export function bondYieldFromPrice(bond: BondInput, price: number, priceType: 'clean' | 'dirty' = 'clean'): number {
  if (!(price > 0)) return NaN;
  const target = (y: number) => {
    const p = bondPriceFromYield(bond, y);
    return (priceType === 'clean' ? p.clean : p.dirty) - price;
  };
  // Bracket: price falls as yield rises. Search between -99% of a period and a very high yield.
  let lo = -0.99 * bond.frequency * 100 + 1e-6;
  let hi = 1000;
  let flo = target(lo);
  const fhi = target(hi);
  if (!(flo > 0 && fhi < 0)) {
    // Retry with a tighter lower bound before giving up (very large negative yields can overflow).
    lo = -50;
    flo = target(lo);
    if (!(flo > 0 && fhi < 0)) return NaN;
  }
  let y = bond.couponRate || 5;
  for (let it = 0; it < 200; it++) {
    const fy = target(y);
    if (Math.abs(fy) < 1e-10) return y;
    if (fy > 0) lo = y; else hi = y;
    // Newton step with numeric derivative, fall back to bisection when it leaves the bracket.
    const h = 1e-6;
    const d = (target(y + h) - fy) / h;
    let next = d !== 0 ? y - fy / d : NaN;
    if (!(next > lo && next < hi)) next = (lo + hi) / 2;
    if (Math.abs(next - y) < 1e-12) return next;
    y = next;
  }
  return y;
}

export function currentYield(bond: BondInput, cleanPrice: number): number {
  if (!(cleanPrice > 0)) return NaN;
  return ((bond.face * bond.couponRate) / 100 / cleanPrice) * 100;
}

// ---------------------------------------------------------------------------
// Currency (Frankfurter API, ECB reference rates)
// ---------------------------------------------------------------------------

export const FRANKFURTER_BASE = 'https://api.frankfurter.dev/v1';

/** Currencies the ECB publishes reference rates for (fallback when /currencies cannot load). */
export const ECB_CURRENCIES: Record<string, string> = {
  AUD: 'Australian Dollar', BRL: 'Brazilian Real', CAD: 'Canadian Dollar', CHF: 'Swiss Franc', CNY: 'Chinese Renminbi Yuan',
  CZK: 'Czech Koruna', DKK: 'Danish Krone', EUR: 'Euro', GBP: 'British Pound', HKD: 'Hong Kong Dollar', HUF: 'Hungarian Forint',
  IDR: 'Indonesian Rupiah', ILS: 'Israeli New Shekel', INR: 'Indian Rupee', ISK: 'Icelandic Króna', JPY: 'Japanese Yen',
  KRW: 'South Korean Won', MXN: 'Mexican Peso', MYR: 'Malaysian Ringgit', NOK: 'Norwegian Krone', NZD: 'New Zealand Dollar',
  PHP: 'Philippine Peso', PLN: 'Polish Złoty', RON: 'Romanian Leu', SEK: 'Swedish Krona', SGD: 'Singapore Dollar',
  THB: 'Thai Baht', TRY: 'Turkish Lira', USD: 'United States Dollar', ZAR: 'South African Rand',
};

const CODE = /^[A-Z]{3}$/;

export function latestRatesUrl(base: string, symbols: string[]): string {
  const b = base.toUpperCase();
  if (!CODE.test(b)) throw new Error(`Invalid currency code: ${base}`);
  const syms = [...new Set(symbols.map((s) => s.toUpperCase()).filter((s) => CODE.test(s) && s !== b))];
  const q = new URLSearchParams({ base: b });
  if (syms.length) q.set('symbols', syms.join(','));
  return `${FRANKFURTER_BASE}/latest?${q.toString()}`;
}

/** Time-series URL for the last `days` calendar days ending `end` (YYYY-MM-DD). */
export function seriesUrl(base: string, symbol: string, end: Date, days: number): string {
  const start = new Date(end.getTime() - days * 86400000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const q = new URLSearchParams({ base: base.toUpperCase(), symbols: symbol.toUpperCase() });
  return `${FRANKFURTER_BASE}/${iso(start)}..${iso(end)}?${q.toString()}`;
}

export interface LatestRates {
  base: string;
  date: string;
  rates: Record<string, number>;
}

/** Validates a /latest response; throws on anything unexpected. */
export function parseLatest(json: unknown): LatestRates {
  const o = json as { base?: unknown; date?: unknown; rates?: unknown };
  if (!o || typeof o.base !== 'string' || typeof o.date !== 'string' || !o.rates || typeof o.rates !== 'object') {
    throw new Error(msg('Unexpected response from the rates service.'));
  }
  const rates: Record<string, number> = {};
  for (const [k, v] of Object.entries(o.rates as Record<string, unknown>)) {
    if (CODE.test(k) && typeof v === 'number' && v > 0) rates[k] = v;
  }
  rates[o.base] = 1;
  return { base: o.base, date: o.date, rates };
}

/** Parses a time-series response into date-sorted points for one symbol. */
export function parseSeries(json: unknown, symbol: string): { date: string; rate: number }[] {
  const o = json as { rates?: Record<string, Record<string, number>> };
  if (!o || !o.rates || typeof o.rates !== 'object') return [];
  return Object.entries(o.rates)
    .map(([date, r]) => ({ date, rate: r?.[symbol] }))
    .filter((p): p is { date: string; rate: number } => typeof p.rate === 'number' && p.rate > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Rate from `from` to `to` using a table quoted against any base:
 * rate = rates[to] / rates[from]. Returns NaN when either is missing.
 */
export function crossRate(table: LatestRates, from: string, to: string): number {
  const a = from === table.base ? 1 : table.rates[from];
  const b = to === table.base ? 1 : table.rates[to];
  if (!(a > 0) || !(b > 0)) return NaN;
  return b / a;
}

export function convertAmount(amount: number, rate: number): number {
  return amount * rate;
}

/** Decimal places normally used to show an amount in a currency (ISO 4217 minor units). */
export function currencyDecimals(code: string): number {
  return ['JPY', 'KRW', 'ISK'].includes(code) ? 0 : 2;
}
