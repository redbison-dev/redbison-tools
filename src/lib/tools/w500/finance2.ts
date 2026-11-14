/**
 * Pure logic for the finance2 calculators: paycheck (US 2026), HELOC,
 * net worth, emergency fund, dividends and DRIP, stock average cost and
 * required minimum distributions. No React, so the regression tests and the
 * MCP specs run exactly what the pages show.
 */
import { msg, built } from '../../msg';

export type Result<T> = { ok: true; value: T; error?: undefined } | { ok: false; error: string; value?: undefined };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = <T>(error: string): Result<T> => ({ ok: false, error });
const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** Round to cents without binary drift (1.005 -> 1.01). */
export function round2(value: number): number {
  if (!Number.isFinite(value)) return value;
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(value) * 100 + 1e-9)) / 100;
}

/** Level payment for a fully amortizing loan. Rate is annual percent, n is months. */
export function amortizedPayment(principal: number, annualRatePct: number, months: number): number {
  if (principal <= 0 || months <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  if (r === 0) return principal / months;
  // Stable for tiny rates, where 1 - (1 + r)^-n would round to 0.
  return (principal * r) / -Math.expm1(-months * Math.log1p(r));
}

// ===========================================================================
// Paycheck calculator (US federal, tax year 2026)
// ===========================================================================

export type FilingStatus = 'single' | 'mfj' | 'mfs' | 'hoh';
export type PayFrequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly' | 'annual';

export const FILING_STATUSES: { id: FilingStatus; label: string }[] = [
  { id: 'single', label: msg('Single') },
  { id: 'mfj', label: msg('Married filing jointly') },
  { id: 'mfs', label: msg('Married filing separately') },
  { id: 'hoh', label: msg('Head of household') },
];

export const PAY_FREQUENCIES: { id: PayFrequency; label: string; perYear: number }[] = [
  { id: 'weekly', label: msg('Weekly (52)'), perYear: 52 },
  { id: 'biweekly', label: msg('Bi-weekly (26)'), perYear: 26 },
  { id: 'semimonthly', label: msg('Semi-monthly (24)'), perYear: 24 },
  { id: 'monthly', label: msg('Monthly (12)'), perYear: 12 },
  { id: 'annual', label: msg('Annually (1)'), perYear: 1 },
];

/** Translation function for paycheck errors and notes; the page passes its t(), other callers get English. */
export type FinanceT = (source: string, vars?: Record<string, string | number>) => string;
const enT: FinanceT = (source, vars) => (vars ? source.replace(/\{(\w+)\}/g, (all, k: string) => (vars[k] === undefined ? all : String(vars[k]))) : source);

export function periodsPerYear(f: PayFrequency): number {
  return PAY_FREQUENCIES.find((p) => p.id === f)?.perYear ?? 26;
}

type Bracket = { upTo: number; rate: number };

/**
 * Federal figures for tax year 2026. Sources: IRS Rev. Proc. 2025-32 (brackets,
 * standard deduction, additional deduction for age 65+, child tax credit),
 * SSA (2026 wage base $184,500), IRS Notice 2025-67 (401(k) limits),
 * IRS Rev. Proc. 2025-19 (HSA limits), IRC 3101(b)(2) (additional Medicare tax),
 * IRC 151(d)(5)(C) as added by Public Law 119-21 (senior deduction, 2025 to 2028).
 */
export const FED_2026 = {
  taxYear: 2026,
  brackets: {
    single: [
      { upTo: 12400, rate: 0.10 }, { upTo: 50400, rate: 0.12 }, { upTo: 105700, rate: 0.22 },
      { upTo: 201775, rate: 0.24 }, { upTo: 256225, rate: 0.32 }, { upTo: 640600, rate: 0.35 }, { upTo: Infinity, rate: 0.37 },
    ],
    mfj: [
      { upTo: 24800, rate: 0.10 }, { upTo: 100800, rate: 0.12 }, { upTo: 211400, rate: 0.22 },
      { upTo: 403550, rate: 0.24 }, { upTo: 512450, rate: 0.32 }, { upTo: 768700, rate: 0.35 }, { upTo: Infinity, rate: 0.37 },
    ],
    mfs: [
      { upTo: 12400, rate: 0.10 }, { upTo: 50400, rate: 0.12 }, { upTo: 105700, rate: 0.22 },
      { upTo: 201775, rate: 0.24 }, { upTo: 256225, rate: 0.32 }, { upTo: 384350, rate: 0.35 }, { upTo: Infinity, rate: 0.37 },
    ],
    hoh: [
      { upTo: 17700, rate: 0.10 }, { upTo: 67450, rate: 0.12 }, { upTo: 105700, rate: 0.22 },
      { upTo: 201750, rate: 0.24 }, { upTo: 256200, rate: 0.32 }, { upTo: 640600, rate: 0.35 }, { upTo: Infinity, rate: 0.37 },
    ],
  } as Record<FilingStatus, Bracket[]>,
  standardDeduction: { single: 16100, mfj: 32200, mfs: 16100, hoh: 24150 } as Record<FilingStatus, number>,
  /** Additional standard deduction per person aged 65+: $1,650 if married, $2,050 if unmarried. */
  additionalStdMarried: 1650,
  additionalStdUnmarried: 2050,
  ssRate: 0.062,
  ssWageBase: 184500,
  medicareRate: 0.0145,
  addlMedicareRate: 0.009,
  addlMedicareThreshold: { single: 200000, mfj: 250000, mfs: 125000, hoh: 200000 } as Record<FilingStatus, number>,
  childTaxCredit: 2200,
  otherDependentCredit: 500,
  creditPhaseoutStart: { single: 200000, mfj: 400000, mfs: 200000, hoh: 200000 } as Record<FilingStatus, number>,
  seniorDeduction: 6000,
  seniorPhaseoutStart: { single: 75000, mfj: 150000, mfs: 0, hoh: 75000 } as Record<FilingStatus, number>,
  seniorPhaseoutRate: 0.06,
  k401Limit: 24500,
  k401CatchUp50: 8000,
  k401CatchUp60to63: 11250,
  hsaSelfOnly: 4400,
  hsaFamily: 8750,
  hsaCatchUp55: 1000,
} as const;

export type TaxBracketLine = { rate: number; from: number; to: number; taxed: number; tax: number };

/** Federal income tax on taxable income, with the per-bracket breakdown and marginal rate. */
export function federalIncomeTax(taxableIncome: number, status: FilingStatus): { tax: number; marginalRate: number; lines: TaxBracketLine[] } {
  const brackets = FED_2026.brackets[status];
  const income = Math.max(0, taxableIncome);
  let lower = 0;
  let tax = 0;
  let marginalRate = brackets[0].rate;
  const lines: TaxBracketLine[] = [];
  for (const b of brackets) {
    if (income > lower) {
      const taxed = Math.min(income, b.upTo) - lower;
      const t = taxed * b.rate;
      tax += t;
      marginalRate = b.rate;
      lines.push({ rate: b.rate, from: lower, to: b.upTo, taxed, tax: t });
    }
    lower = b.upTo;
  }
  return { tax, marginalRate, lines };
}

/** Elective deferral cap for an employee of a given age at year end. */
export function k401Limit(age: number): number {
  let limit = FED_2026.k401Limit;
  if (age >= 60 && age <= 63) limit += FED_2026.k401CatchUp60to63;
  else if (age >= 50) limit += FED_2026.k401CatchUp50;
  return limit;
}

export type PaycheckInput = {
  annualGross: number;
  frequency: PayFrequency;
  status: FilingStatus;
  /** Age at the end of 2026. */
  age: number;
  /** Married filing jointly only: spouse is 65 or older at year end. */
  spouse65?: boolean;
  /** Traditional (pre-tax) 401(k) as a percent of gross pay. */
  k401Pct?: number;
  /** Roth 401(k) as a percent of gross pay (after tax). */
  roth401kPct?: number;
  /** HSA payroll contribution per paycheck (pre-tax for income tax and FICA). */
  hsaPerPeriod?: number;
  /** Other Section 125 pre-tax deductions per paycheck (health, dental, vision premiums, FSA). */
  section125PerPeriod?: number;
  /** After-tax deductions per paycheck (union dues, insurance, garnishments...). */
  postTaxPerPeriod?: number;
  /** Flat state income tax rate, percent of state wages. */
  statePct?: number;
  /** Flat local or city income tax rate, percent of state wages. */
  localPct?: number;
  /** Qualifying children under 17 for the child tax credit. */
  children?: number;
  /** Other dependents for the $500 credit. */
  otherDependents?: number;
  /** Annual itemized deductions; the larger of this and the standard deduction is used. */
  itemized?: number;
  /** Extra federal withholding per paycheck (W-4 step 4(c)). */
  extraWithholdingPerPeriod?: number;
};

export type PaycheckLine = { id: string; label: string; annual: number; perPeriod: number };

export type PaycheckResult = {
  periods: number;
  grossAnnual: number;
  grossPerPeriod: number;
  netAnnual: number;
  netPerPeriod: number;
  traditional401k: number;
  roth401k: number;
  k401Capped: boolean;
  k401Cap: number;
  hsa: number;
  section125: number;
  postTax: number;
  ficaWages: number;
  federalWages: number;
  deduction: number;
  usedItemized: boolean;
  standardDeduction: number;
  seniorDeduction: number;
  taxableIncome: number;
  federalBeforeCredits: number;
  credits: number;
  federalTax: number;
  marginalRate: number;
  bracketLines: TaxBracketLine[];
  socialSecurity: number;
  medicare: number;
  additionalMedicare: number;
  stateTax: number;
  localTax: number;
  extraWithholding: number;
  totalTax: number;
  effectiveTaxRate: number;
  lines: PaycheckLine[];
  notes: string[];
};

export function calculatePaycheck(input: PaycheckInput, t: FinanceT = enT): Result<PaycheckResult> {
  const F = FED_2026;
  const gross = input.annualGross;
  if (!isNum(gross) || gross <= 0) return fail(t('Enter a gross pay above zero.'));
  if (gross > 1e9) return fail(t('Gross pay is too large for this estimate.'));
  if (!FED_2026.brackets[input.status]) return fail(t('Choose a filing status.'));
  const age = isNum(input.age) ? input.age : 35;
  if (age < 14 || age > 120) return fail(t('Enter an age between 14 and 120.'));
  const periods = periodsPerYear(input.frequency);

  const pct = (v: number | undefined, name: string): number | string => {
    const x = v ?? 0;
    if (!isNum(x) || x < 0 || x > 100) return t('{name} must be between 0 and 100%.', { name: t(name) });
    return x / 100;
  };
  const money = (v: number | undefined, name: string): number | string => {
    const x = v ?? 0;
    if (!isNum(x) || x < 0) return t('{name} cannot be negative.', { name: t(name) });
    return x;
  };
  const checks = {
    k401: pct(input.k401Pct, msg('Traditional 401(k)')),
    roth: pct(input.roth401kPct, msg('Roth 401(k)')),
    state: pct(input.statePct, msg('State tax')),
    local: pct(input.localPct, msg('Local tax')),
    hsa: money(input.hsaPerPeriod, 'HSA'),
    s125: money(input.section125PerPeriod, msg('Pre-tax benefits')),
    post: money(input.postTaxPerPeriod, msg('After-tax deductions')),
    itemized: money(input.itemized, msg('Itemized deductions')),
    extra: money(input.extraWithholdingPerPeriod, msg('Extra withholding')),
    children: money(input.children, msg('Children')),
    others: money(input.otherDependents, msg('Other dependents')),
  };
  for (const v of Object.values(checks)) if (typeof v === 'string') return fail(v);
  const c = checks as Record<keyof typeof checks, number>;
  const notes: string[] = [];

  // 401(k): traditional and Roth deferrals share one limit.
  const cap = k401Limit(age);
  let trad = gross * c.k401;
  let roth = gross * c.roth;
  let capped = false;
  if (trad + roth > cap) {
    capped = true;
    trad = Math.min(trad, cap);
    roth = Math.min(roth, cap - trad);
    notes.push(t('401(k) deferrals were capped at the 2026 limit of {cap} for age {age}.', { cap: `$${cap.toLocaleString('en-US')}`, age }));
  }
  const hsa = c.hsa * periods;
  const s125 = c.s125 * periods;
  const postTax = c.post * periods;
  const hsaMax = F.hsaFamily + (age >= 55 ? F.hsaCatchUp55 : 0);
  if (hsa > hsaMax) notes.push(t('HSA contributions of {hsa} a year exceed the 2026 family limit of {family} (self-only coverage: {self}).', { hsa: `$${Math.round(hsa).toLocaleString('en-US')}`, family: `$${hsaMax.toLocaleString('en-US')}`, self: `$${(F.hsaSelfOnly + (age >= 55 ? F.hsaCatchUp55 : 0)).toLocaleString('en-US')}` }));
  if (trad + hsa + s125 > gross) return fail(t('Pre-tax deductions are larger than gross pay.'));

  // FICA: Section 125 and payroll HSA contributions are exempt; 401(k) deferrals are not.
  const ficaWages = Math.max(0, gross - hsa - s125);
  const socialSecurity = F.ssRate * Math.min(ficaWages, F.ssWageBase);
  const medicare = F.medicareRate * ficaWages;
  const additionalMedicare = F.addlMedicareRate * Math.max(0, ficaWages - F.addlMedicareThreshold[input.status]);
  if (ficaWages > F.ssWageBase) notes.push(t('Social Security tax stops once 2026 wages reach {base}, so real paychecks rise late in the year; the per-paycheck figure here is the yearly average.', { base: `$${F.ssWageBase.toLocaleString('en-US')}` }));

  // Federal income tax.
  const federalWages = Math.max(0, gross - trad - hsa - s125);
  const married = input.status === 'mfj' || input.status === 'mfs';
  const addPer = married ? F.additionalStdMarried : F.additionalStdUnmarried;
  const seniors = (age >= 65 ? 1 : 0) + (input.status === 'mfj' && input.spouse65 ? 1 : 0);
  const standardDeduction = F.standardDeduction[input.status] + addPer * seniors;
  const usedItemized = c.itemized > standardDeduction;
  const deduction = usedItemized ? c.itemized : standardDeduction;
  let seniorDeduction = 0;
  if (seniors > 0 && input.status !== 'mfs') {
    const each = Math.max(0, F.seniorDeduction - F.seniorPhaseoutRate * Math.max(0, federalWages - F.seniorPhaseoutStart[input.status]));
    seniorDeduction = each * seniors;
  }
  const taxableIncome = Math.max(0, federalWages - deduction - seniorDeduction);
  const fed = federalIncomeTax(taxableIncome, input.status);
  const creditBase = F.childTaxCredit * Math.floor(c.children) + F.otherDependentCredit * Math.floor(c.others);
  const over = Math.max(0, federalWages - F.creditPhaseoutStart[input.status]);
  const creditAllowed = Math.max(0, creditBase - 50 * Math.ceil(over / 1000));
  const credits = Math.min(fed.tax, creditAllowed);
  if (creditAllowed > fed.tax) notes.push(t('Some of the child credit exceeds your income tax; the refundable part (up to $1,700 per child) comes back when you file, not through your paycheck.'));
  const federalTax = fed.tax - credits;

  const stateTax = federalWages * c.state;
  const localTax = federalWages * c.local;
  const extraWithholding = c.extra * periods;

  const totalTax = federalTax + socialSecurity + medicare + additionalMedicare + stateTax + localTax;
  const netAnnual = gross - trad - roth - hsa - s125 - postTax - totalTax - extraWithholding;
  if (netAnnual < 0) notes.push(t('Deductions and taxes are larger than gross pay.'));

  const per = (v: number) => v / periods;
  const lines: PaycheckLine[] = [
    { id: 'gross', label: msg('Gross pay'), annual: gross, perPeriod: per(gross) },
    { id: 'k401', label: msg('Traditional 401(k)'), annual: trad, perPeriod: per(trad) },
    { id: 'hsa', label: 'HSA', annual: hsa, perPeriod: per(hsa) },
    { id: 's125', label: msg('Pre-tax benefits (Section 125)'), annual: s125, perPeriod: per(s125) },
    { id: 'federal', label: msg('Federal income tax'), annual: federalTax, perPeriod: per(federalTax) },
    { id: 'ss', label: msg('Social Security (6.2%)'), annual: socialSecurity, perPeriod: per(socialSecurity) },
    { id: 'medicare', label: msg('Medicare (1.45%)'), annual: medicare, perPeriod: per(medicare) },
    { id: 'addlMedicare', label: msg('Additional Medicare (0.9%)'), annual: additionalMedicare, perPeriod: per(additionalMedicare) },
    { id: 'state', label: msg('State income tax'), annual: stateTax, perPeriod: per(stateTax) },
    { id: 'local', label: msg('Local income tax'), annual: localTax, perPeriod: per(localTax) },
    { id: 'roth', label: msg('Roth 401(k)'), annual: roth, perPeriod: per(roth) },
    { id: 'post', label: msg('After-tax deductions'), annual: postTax, perPeriod: per(postTax) },
    { id: 'extra', label: msg('Extra federal withholding'), annual: extraWithholding, perPeriod: per(extraWithholding) },
    { id: 'net', label: msg('Take-home pay'), annual: netAnnual, perPeriod: per(netAnnual) },
  ];

  return ok({
    periods,
    grossAnnual: gross,
    grossPerPeriod: per(gross),
    netAnnual,
    netPerPeriod: per(netAnnual),
    traditional401k: trad,
    roth401k: roth,
    k401Capped: capped,
    k401Cap: cap,
    hsa,
    section125: s125,
    postTax,
    ficaWages,
    federalWages,
    deduction,
    usedItemized,
    standardDeduction,
    seniorDeduction,
    taxableIncome,
    federalBeforeCredits: fed.tax,
    credits,
    federalTax,
    marginalRate: taxableIncome > 0 ? fed.marginalRate : 0,
    bracketLines: fed.lines,
    socialSecurity,
    medicare,
    additionalMedicare,
    stateTax,
    localTax,
    extraWithholding,
    totalTax,
    effectiveTaxRate: totalTax / gross,
    lines,
    notes,
  });
}

/** Annual gross pay from an hourly rate, a per-paycheck amount or an annual salary. */
export function annualGrossFrom(mode: 'annual' | 'perPeriod' | 'hourly', amount: number, frequency: PayFrequency, hoursPerWeek = 40): number {
  if (mode === 'hourly') return amount * hoursPerWeek * 52;
  if (mode === 'perPeriod') return amount * periodsPerYear(frequency);
  return amount;
}

// ===========================================================================
// HELOC and home equity
// ===========================================================================

export type HelocInput = {
  homeValue: number;
  /** First mortgage balance plus any other liens already on the home. */
  mortgageBalance: number;
  /** Maximum combined loan-to-value the lender allows, percent (often 80 to 90). */
  cltvLimitPct: number;
  /** Amount you plan to draw. Leave undefined or 0 to use the full line. */
  drawAmount?: number;
  /** HELOC APR, percent. */
  ratePct: number;
  drawYears: number;
  repayYears: number;
  /** Rate for a fixed home equity loan, for comparison. */
  fixedLoanRatePct?: number;
  fixedLoanYears?: number;
  /** Stress test: rate rise in percentage points. */
  rateShockPts?: number;
  /**
   * Separate cap on the revolving line as a percent of the home value, on top
   * of the combined limit. Canada: a HELOC may be up to 65% of the home's value
   * (FCAC), while a HELOC combined with a mortgage needs 20% equity, so the
   * combined limit is 80%. Undefined or 100 = no separate cap.
   */
  lineCapPct?: number;
};

export type HelocResult = {
  /** True when the separate line cap, not the combined limit, sets the maximum line. */
  lineCapBinds: boolean;
  equity: number;
  currentLtv: number;
  maxLine: number;
  drawn: number;
  drawCapped: boolean;
  cltvAfter: number;
  interestOnlyPayment: number;
  repaymentPayment: number;
  paymentJump: number;
  drawInterest: number;
  repayInterest: number;
  totalInterest: number;
  totalPaid: number;
  shockedRepaymentPayment: number;
  shockedInterestOnly: number;
  fixedLoanPayment: number;
  fixedLoanInterest: number;
  /** Balance at the end of each year of the repayment period. */
  schedule: { year: number; phase: 'draw' | 'repay'; payment: number; interest: number; principal: number; balance: number }[];
};

export function calculateHeloc(input: HelocInput): Result<HelocResult> {
  const { homeValue, mortgageBalance, cltvLimitPct, ratePct, drawYears, repayYears } = input;
  if (!isNum(homeValue) || homeValue <= 0) return fail(msg('Enter a home value above zero.'));
  if (!isNum(mortgageBalance) || mortgageBalance < 0) return fail(msg('Mortgage balance cannot be negative.'));
  if (!isNum(cltvLimitPct) || cltvLimitPct <= 0 || cltvLimitPct > 100) return fail(msg('CLTV limit must be between 0 and 100%.'));
  if (!isNum(ratePct) || ratePct < 0 || ratePct > 40) return fail(msg('Enter an interest rate between 0 and 40%.'));
  if (!isNum(drawYears) || drawYears < 0 || drawYears > 30) return fail(msg('Draw period must be 0 to 30 years.'));
  if (!isNum(repayYears) || repayYears <= 0 || repayYears > 40) return fail(msg('Repayment period must be 1 to 40 years.'));

  const equity = homeValue - mortgageBalance;
  const cap = input.lineCapPct;
  if (cap !== undefined && (!isNum(cap) || cap <= 0 || cap > 100)) return fail(msg('Credit line cap must be between 0 and 100%.'));
  const combinedRoom = Math.max(0, homeValue * (cltvLimitPct / 100) - mortgageBalance);
  const maxLine = cap !== undefined && cap < 100 ? Math.min(combinedRoom, homeValue * (cap / 100)) : combinedRoom;
  const lineCapBinds = cap !== undefined && cap < 100 && homeValue * (cap / 100) < combinedRoom;
  const requested = isNum(input.drawAmount) && input.drawAmount > 0 ? input.drawAmount : maxLine;
  const drawCapped = requested > maxLine + 1e-9;
  const drawn = Math.min(requested, maxLine);
  const cltvAfter = (mortgageBalance + drawn) / homeValue;

  const r = ratePct / 100 / 12;
  const interestOnlyPayment = drawn * r;
  const repayMonths = Math.round(repayYears * 12);
  if (repayMonths < 1) return fail(msg('Repayment period must be 1 to 40 years.'));
  const repaymentPayment = amortizedPayment(drawn, ratePct, repayMonths);
  const drawInterest = interestOnlyPayment * Math.round(drawYears * 12);
  const repayInterest = repaymentPayment * repayMonths - drawn;
  const shock = isNum(input.rateShockPts) ? input.rateShockPts : 2;
  const fixedRate = isNum(input.fixedLoanRatePct) ? input.fixedLoanRatePct : ratePct;
  const fixedYears = isNum(input.fixedLoanYears) && input.fixedLoanYears > 0 ? input.fixedLoanYears : drawYears + repayYears;
  const fixedLoanPayment = amortizedPayment(drawn, fixedRate, Math.round(fixedYears * 12));

  const schedule: HelocResult['schedule'] = [];
  for (let y = 1; y <= Math.round(drawYears); y++) {
    schedule.push({ year: y, phase: 'draw', payment: interestOnlyPayment * 12, interest: interestOnlyPayment * 12, principal: 0, balance: drawn });
  }
  let bal = drawn;
  for (let y = 1; y <= Math.ceil(repayMonths / 12); y++) {
    let interest = 0;
    let principal = 0;
    let paid = 0;
    for (let m = 0; m < 12 && (y - 1) * 12 + m < repayMonths; m++) {
      const i = bal * r;
      const p = Math.min(bal, repaymentPayment - i);
      interest += i;
      principal += p;
      paid += i + p;
      bal -= p;
    }
    schedule.push({ year: Math.round(drawYears) + y, phase: 'repay', payment: paid, interest, principal, balance: Math.max(0, bal) });
  }

  return ok({
    lineCapBinds,
    equity,
    currentLtv: mortgageBalance / homeValue,
    maxLine,
    drawn,
    drawCapped,
    cltvAfter,
    interestOnlyPayment,
    repaymentPayment,
    paymentJump: repaymentPayment - interestOnlyPayment,
    drawInterest,
    repayInterest,
    totalInterest: drawInterest + repayInterest,
    totalPaid: drawInterest + repayInterest + drawn,
    shockedRepaymentPayment: amortizedPayment(drawn, ratePct + shock, repayMonths),
    shockedInterestOnly: drawn * ((ratePct + shock) / 100 / 12),
    fixedLoanPayment,
    fixedLoanInterest: fixedLoanPayment * Math.round(fixedYears * 12) - drawn,
    schedule,
  });
}

// ===========================================================================
// Net worth
// ===========================================================================

export type AssetKind = 'cash' | 'investment' | 'retirement' | 'home' | 'real-estate' | 'vehicle' | 'business' | 'other';
export type LiabilityKind = 'mortgage' | 'heloc' | 'auto' | 'student' | 'credit-card' | 'personal' | 'other';

export const ASSET_KINDS: { id: AssetKind; label: string; liquid: boolean }[] = [
  { id: 'cash', label: msg('Cash and savings'), liquid: true },
  { id: 'investment', label: msg('Taxable investments'), liquid: true },
  { id: 'retirement', label: msg('Retirement accounts'), liquid: false },
  { id: 'home', label: msg('Primary home'), liquid: false },
  { id: 'real-estate', label: msg('Other real estate'), liquid: false },
  { id: 'vehicle', label: msg('Vehicles'), liquid: false },
  { id: 'business', label: msg('Business interest'), liquid: false },
  { id: 'other', label: msg('Other assets'), liquid: false },
];

export const LIABILITY_KINDS: { id: LiabilityKind; label: string; securedByHome: boolean }[] = [
  { id: 'mortgage', label: msg('Mortgage on primary home'), securedByHome: true },
  { id: 'heloc', label: msg('HELOC or home equity loan'), securedByHome: true },
  { id: 'auto', label: msg('Auto loan'), securedByHome: false },
  { id: 'student', label: msg('Student loans'), securedByHome: false },
  { id: 'credit-card', label: msg('Credit cards'), securedByHome: false },
  { id: 'personal', label: msg('Personal loans'), securedByHome: false },
  { id: 'other', label: msg('Other debts'), securedByHome: false },
];

export type NetWorthItem<K extends string> = { label: string; amount: number; kind: K };

/**
 * Median family net worth by age of the family head, 2022 Survey of Consumer
 * Finances (Federal Reserve Bulletin, October 2023), in 2022 dollars.
 */
export const SCF_2022_MEDIAN_BY_AGE: { label: string; minAge: number; maxAge: number; median: number }[] = [
  { label: msg('Under 35'), minAge: 0, maxAge: 34, median: 39000 },
  { label: msg('35 to 44'), minAge: 35, maxAge: 44, median: 135600 },
  { label: msg('45 to 54'), minAge: 45, maxAge: 54, median: 247200 },
  { label: msg('55 to 64'), minAge: 55, maxAge: 64, median: 364500 },
  { label: msg('65 to 74'), minAge: 65, maxAge: 74, median: 409900 },
  { label: msg('75 or older'), minAge: 75, maxAge: 200, median: 335600 },
];

export type NetWorthResult = {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  liquidAssets: number;
  /** Liquid assets minus every liability. */
  liquidNetWorth: number;
  homeEquity: number;
  netWorthExcludingHome: number;
  debtToAssetRatio: number | null;
  assetsByKind: { kind: AssetKind; label: string; amount: number; share: number }[];
  liabilitiesByKind: { kind: LiabilityKind; label: string; amount: number; share: number }[];
  /** Stanley and Danko's rule: age x pre-tax income / 10. */
  expectedNetWorth: number | null;
  scfBand: { label: string; median: number } | null;
};

export function calculateNetWorth(
  assets: NetWorthItem<AssetKind>[],
  liabilities: NetWorthItem<LiabilityKind>[],
  opts: { age?: number; annualIncome?: number } = {},
): Result<NetWorthResult> {
  for (const a of [...assets, ...liabilities]) {
    if (!isNum(a.amount)) return fail(a.label ? built(msg('Enter a number for {label}.'), { label: a.label }) : msg('Enter a number for every row.'));
    if (a.amount < 0) return fail(a.label ? built(msg('{label} cannot be negative; enter debts as liabilities.'), { label: a.label }) : msg('An amount cannot be negative; enter debts as liabilities.'));
  }
  const sum = (xs: { amount: number }[]) => xs.reduce((s, x) => s + x.amount, 0);
  const totalAssets = sum(assets);
  const totalLiabilities = sum(liabilities);
  const liquidKinds = new Set(ASSET_KINDS.filter((k) => k.liquid).map((k) => k.id));
  const liquidAssets = sum(assets.filter((a) => liquidKinds.has(a.kind)));
  const homeValue = sum(assets.filter((a) => a.kind === 'home'));
  const homeDebt = sum(liabilities.filter((l) => l.kind === 'mortgage' || l.kind === 'heloc'));
  const homeEquity = homeValue - homeDebt;
  const netWorth = totalAssets - totalLiabilities;

  const assetsByKind = ASSET_KINDS.map((k) => {
    const amount = sum(assets.filter((a) => a.kind === k.id));
    return { kind: k.id, label: k.label, amount, share: totalAssets > 0 ? amount / totalAssets : 0 };
  }).filter((x) => x.amount > 0);
  const liabilitiesByKind = LIABILITY_KINDS.map((k) => {
    const amount = sum(liabilities.filter((a) => a.kind === k.id));
    return { kind: k.id, label: k.label, amount, share: totalLiabilities > 0 ? amount / totalLiabilities : 0 };
  }).filter((x) => x.amount > 0);

  const age = opts.age;
  const income = opts.annualIncome;
  const expectedNetWorth = isNum(age) && age > 0 && isNum(income) && income > 0 ? (age * income) / 10 : null;
  const band = isNum(age) && age > 0 ? SCF_2022_MEDIAN_BY_AGE.find((b) => age >= b.minAge && age <= b.maxAge) ?? null : null;

  return ok({
    totalAssets,
    totalLiabilities,
    netWorth,
    liquidAssets,
    liquidNetWorth: liquidAssets - totalLiabilities,
    homeEquity,
    netWorthExcludingHome: netWorth - homeEquity,
    debtToAssetRatio: totalAssets > 0 ? totalLiabilities / totalAssets : null,
    assetsByKind,
    liabilitiesByKind,
    expectedNetWorth,
    scfBand: band ? { label: band.label, median: band.median } : null,
  });
}

// ===========================================================================
// Emergency fund
// ===========================================================================

export type EmergencyFactors = {
  singleIncome?: boolean;
  dependents?: boolean;
  variableIncome?: boolean;
  homeowner?: boolean;
  longJobSearch?: boolean;
  /** High-deductible health plan or other large out-of-pocket exposure. */
  highDeductible?: boolean;
};

/**
 * Rule-of-thumb months of essential expenses: start at 3 and add for each risk
 * that makes an income gap longer or a shock bigger. Capped at 12.
 */
export function suggestedMonths(f: EmergencyFactors): { months: number; reasons: string[] } {
  let months = 3;
  const reasons: string[] = [msg('Base: 3 months for a stable, dual-income household')];
  if (f.singleIncome) { months += 1; reasons.push(msg('+1 single income in the household')); }
  if (f.dependents) { months += 1; reasons.push(msg('+1 children or other dependents')); }
  if (f.variableIncome) { months += 2; reasons.push(msg('+2 self-employed, commission or irregular income')); }
  if (f.homeowner) { months += 1; reasons.push(msg('+1 homeowner (repairs fall on you)')); }
  if (f.longJobSearch) { months += 1; reasons.push(msg('+1 specialised job that takes long to replace')); }
  if (f.highDeductible) { months += 1; reasons.push(msg('+1 High-deductible health plan')); }
  return { months: Math.min(12, months), reasons };
}

export type EmergencyInput = {
  monthlyEssentials: number;
  targetMonths: number;
  currentSavings: number;
  monthlyContribution: number;
  /** Savings account APY, percent. */
  apyPct?: number;
  /**
   * Income that would keep arriving during a gap in pay, per month: sick pay,
   * unemployment insurance, a benefit or a partner's pay (for example UK
   * Statutory Sick Pay, Canadian EI). The fund only has to cover essentials
   * minus this. Defaults to 0, which is the plain months-of-essentials rule.
   */
  monthlyIncomeDuringGap?: number;
};

export type EmergencyResult = {
  /** Essentials minus income that continues during a gap: what the fund pays each month. */
  monthlyShortfall: number;
  target: number;
  gap: number;
  monthsCovered: number;
  monthsToGoal: number | null;
  totalContributed: number;
  interestEarned: number;
  milestones: { label: string; amount: number; month: number | null }[];
  /** Balance at the end of each month until the goal (or 120 months). */
  path: { month: number; balance: number }[];
};

export function calculateEmergencyFund(input: EmergencyInput): Result<EmergencyResult> {
  const { monthlyEssentials, targetMonths, currentSavings, monthlyContribution } = input;
  const apy = input.apyPct ?? 0;
  if (!isNum(monthlyEssentials) || monthlyEssentials <= 0) return fail(msg('Enter monthly essential expenses above zero.'));
  if (!isNum(targetMonths) || targetMonths <= 0 || targetMonths > 36) return fail(msg('Target months must be between 1 and 36.'));
  if (!isNum(currentSavings) || currentSavings < 0) return fail(msg('Current savings cannot be negative.'));
  if (!isNum(monthlyContribution) || monthlyContribution < 0) return fail(msg('Monthly saving cannot be negative.'));
  if (!isNum(apy) || apy < 0 || apy > 25) return fail(msg('APY must be between 0 and 25%.'));
  const support = input.monthlyIncomeDuringGap ?? 0;
  if (!isNum(support) || support < 0) return fail(msg('Income during a gap cannot be negative.'));
  if (support >= monthlyEssentials) return fail(msg('The income you would still get covers all your essential costs, so there is no monthly shortfall for the fund to cover. Lower it, or check the essentials.'));

  const shortfall = monthlyEssentials - support;
  const target = shortfall * targetMonths;
  const gap = Math.max(0, target - currentSavings);
  const r = Math.pow(1 + apy / 100, 1 / 12) - 1;
  const marks = [
    { label: '1 month', amount: shortfall },
    { label: '3 months', amount: shortfall * 3 },
    { label: `${targetMonths} months (goal)`, amount: target },
  ].filter((m, i, arr) => arr.findIndex((x) => x.amount === m.amount) === i);
  const hit: (number | null)[] = marks.map((m) => (currentSavings >= m.amount ? 0 : null));

  let bal = currentSavings;
  let month = 0;
  let contributed = 0;
  const path = [{ month: 0, balance: bal }];
  const MAX = 1200;
  while (bal < target && month < MAX) {
    if (monthlyContribution <= 0 && r === 0) break;
    month += 1;
    bal = bal * (1 + r) + monthlyContribution;
    contributed += monthlyContribution;
    if (month <= 120) path.push({ month, balance: bal });
    marks.forEach((m, i) => { if (hit[i] === null && bal >= m.amount - 1e-9) hit[i] = month; });
    if (monthlyContribution <= 0 && bal <= 0) break;
  }
  const reached = bal >= target - 1e-9;
  return ok({
    monthlyShortfall: shortfall,
    target,
    gap,
    monthsCovered: currentSavings / shortfall,
    monthsToGoal: reached ? month : null,
    totalContributed: contributed,
    interestEarned: reached ? bal - currentSavings - contributed : 0,
    milestones: marks.map((m, i) => ({ ...m, month: hit[i] })),
    path,
  });
}

// ===========================================================================
// Dividends and DRIP
// ===========================================================================

export type DividendInput = {
  sharePrice: number;
  /** Annual dividend per share today. */
  annualDividendPerShare: number;
  initialInvestment: number;
  /** Payments per year: 12, 4, 2 or 1. */
  frequency: number;
  years: number;
  /** Yearly growth of the dividend per share, percent. */
  dividendGrowthPct?: number;
  /** Yearly share price growth, percent. */
  priceGrowthPct?: number;
  drip: boolean;
  /** Added every month and invested at the start of each payment period. */
  monthlyContribution?: number;
  /** Tax withheld on dividends before reinvesting, percent (the marginal rate for the methods below). */
  taxPct?: number;
  /**
   * How taxPct applies (market versions, docs/seo/localization-plan.md):
   * - 'flat' (default): every dividend loses taxPct.
   * - 'allowance': the first `taxFreeAllowance` of gross dividends in each
   *   year is tax-free and the rest is taxed at taxPct (UK dividend allowance).
   * - 'franking': Australian imputation. The franking credit is
   *   dividend x franked share x c / (1 - c) for company tax rate c; tax is
   *   taxPct of the dividend plus the credit, less the credit, so the net is
   *   (dividend + credit) x (1 - taxPct) and can exceed the cash dividend
   *   when taxPct is below c (excess credits are refunded).
   * - 'credit': Canadian gross-up and dividend tax credit. Tax is
   *   (taxPct - dividendCreditPct) of the grossed-up dividend, floored at 0
   *   because the credit is non-refundable (any excess only reduces tax on
   *   other income, which is not counted here).
   */
  taxMethod?: 'flat' | 'allowance' | 'franking' | 'credit';
  /** 'allowance': gross dividends a year that are tax-free. */
  taxFreeAllowance?: number;
  /** 'franking': franked share of each dividend, percent (100 = fully franked). */
  frankedPct?: number;
  /** 'franking': company tax rate behind the credit, percent (30, or 25 for base rate entities). */
  companyTaxPct?: number;
  /** 'credit': gross-up, percent of the cash dividend (38 eligible, 15 non-eligible). */
  grossUpPct?: number;
  /** 'credit': combined federal and provincial dividend tax credit, percent of the grossed-up dividend. */
  dividendCreditPct?: number;
};

export type DividendYear = {
  year: number;
  shares: number;
  price: number;
  value: number;
  dividendsGross: number;
  dividendsNet: number;
  /** Tax on the year's dividends (negative when franking credits are refunded). */
  tax: number;
  /** Australian franking credits attached to the year's dividends (0 for other methods). */
  frankingCredits: number;
  cumulativeNet: number;
  contributions: number;
  /** Forward annual income from the shares held at year end. */
  forwardIncome: number;
  yieldOnCost: number;
  cash: number;
};

export type DividendResult = {
  yieldPct: number;
  initialShares: number;
  annualIncome: number;
  incomePerPayment: number;
  monthlyIncome: number;
  rows: DividendYear[];
  finalValue: number;
  totalInvested: number;
  totalDividendsNet: number;
};

export function dividendYield(annualDividendPerShare: number, sharePrice: number): number {
  return sharePrice > 0 ? (annualDividendPerShare / sharePrice) * 100 : NaN;
}

export function projectDividends(input: DividendInput): Result<DividendResult> {
  const { sharePrice, annualDividendPerShare, initialInvestment, frequency, years, drip } = input;
  if (!isNum(sharePrice) || sharePrice <= 0) return fail(msg('Enter a share price above zero.'));
  if (!isNum(annualDividendPerShare) || annualDividendPerShare < 0) return fail(msg('Dividend per share cannot be negative.'));
  if (!isNum(initialInvestment) || initialInvestment < 0) return fail(msg('Investment cannot be negative.'));
  if (![1, 2, 4, 12].includes(frequency)) return fail(msg('Payment frequency must be 1, 2, 4 or 12 times a year.'));
  if (!isNum(years) || years < 1 || years > 60) return fail(msg('Years must be between 1 and 60.'));
  const dg = (input.dividendGrowthPct ?? 0) / 100;
  const pg = (input.priceGrowthPct ?? 0) / 100;
  const tax = (input.taxPct ?? 0) / 100;
  const monthly = input.monthlyContribution ?? 0;
  if (!isNum(dg) || dg <= -1 || !isNum(pg) || pg <= -1) return fail(msg('Growth rates must be above -100%.'));
  if (!isNum(tax) || tax < 0 || tax > 1) return fail(msg('Dividend tax must be between 0 and 100%.'));
  if (!isNum(monthly) || monthly < 0) return fail(msg('Monthly contribution cannot be negative.'));
  if (initialInvestment <= 0 && monthly <= 0) return fail(msg('Enter an investment or a monthly contribution.'));
  const method = input.taxMethod ?? 'flat';
  const allowance = input.taxFreeAllowance ?? 0;
  const franked = (input.frankedPct ?? 0) / 100;
  const companyTax = (input.companyTaxPct ?? 30) / 100;
  const grossUp = (input.grossUpPct ?? 0) / 100;
  const dtc = (input.dividendCreditPct ?? 0) / 100;
  if (!['flat', 'allowance', 'franking', 'credit'].includes(method)) return fail(msg('Unknown dividend tax method.'));
  if (method === 'allowance' && (!isNum(allowance) || allowance < 0)) return fail(msg('The tax-free allowance cannot be negative.'));
  if (method === 'franking' && (!isNum(franked) || franked < 0 || franked > 1 || !isNum(companyTax) || companyTax <= 0 || companyTax >= 1)) return fail(msg('Franked share must be 0 to 100% and the company tax rate above 0 and below 100%.'));
  if (method === 'credit' && (!isNum(grossUp) || grossUp < 0 || !isNum(dtc) || dtc < 0 || dtc >= 1)) return fail(msg('Gross-up and dividend tax credit must be zero or more.'));
  /** Net amount and tax of one payment `g`; `allowanceLeft` is this year's unused allowance. */
  const taxPayment = (g: number, allowanceLeft: number): { net: number; tax: number; credit: number; used: number } => {
    if (method === 'allowance') {
      const used = Math.min(g, Math.max(0, allowanceLeft));
      const t = (g - used) * tax;
      return { net: g - t, tax: t, credit: 0, used };
    }
    if (method === 'franking') {
      const credit = g * franked * (companyTax / (1 - companyTax));
      const t = (g + credit) * tax - credit;
      return { net: g - t, tax: t, credit, used: 0 };
    }
    if (method === 'credit') {
      const t = Math.max(0, g * (1 + grossUp) * (tax - dtc));
      return { net: g - t, tax: t, credit: 0, used: 0 };
    }
    return { net: g * (1 - tax), tax: g * tax, credit: 0, used: 0 };
  };

  let shares = initialInvestment / sharePrice;
  const initialShares = shares;
  let price = sharePrice;
  let cash = 0;
  let cumulative = 0;
  let invested = initialInvestment;
  const perPeriodGrowth = Math.pow(1 + pg, 1 / frequency);
  const contributionPerPeriod = monthly * (12 / frequency);
  const rows: DividendYear[] = [];
  for (let y = 1; y <= Math.round(years); y++) {
    const dps = annualDividendPerShare * Math.pow(1 + dg, y - 1);
    let gross = 0;
    let net = 0;
    let yearTax = 0;
    let credits = 0;
    let allowanceLeft = allowance;
    let contributions = 0;
    for (let p = 0; p < frequency; p++) {
      if (contributionPerPeriod > 0) {
        shares += contributionPerPeriod / price;
        contributions += contributionPerPeriod;
      }
      const g = shares * (dps / frequency);
      const paid = taxPayment(g, allowanceLeft);
      allowanceLeft -= paid.used;
      const n = paid.net;
      gross += g;
      net += n;
      yearTax += paid.tax;
      credits += paid.credit;
      price *= perPeriodGrowth;
      if (drip) shares += n / price;
      else cash += n;
    }
    invested += contributions;
    cumulative += net;
    const nextDps = annualDividendPerShare * Math.pow(1 + dg, y);
    rows.push({
      year: y,
      shares,
      price,
      value: shares * price,
      dividendsGross: gross,
      dividendsNet: net,
      tax: yearTax,
      frankingCredits: credits,
      cumulativeNet: cumulative,
      contributions,
      forwardIncome: shares * nextDps,
      yieldOnCost: invested > 0 ? (shares * nextDps) / invested * 100 : 0,
      cash,
    });
  }
  const annualIncome = initialShares * annualDividendPerShare;
  const last = rows[rows.length - 1];
  return ok({
    yieldPct: dividendYield(annualDividendPerShare, sharePrice),
    initialShares,
    annualIncome,
    incomePerPayment: annualIncome / frequency,
    monthlyIncome: annualIncome / 12,
    rows,
    finalValue: last.value + last.cash,
    totalInvested: invested,
    totalDividendsNet: cumulative,
  });
}

/** Investment needed for a target yearly dividend income at a given yield. */
export function investmentForIncome(targetAnnualIncome: number, yieldPct: number): number {
  if (!(yieldPct > 0)) return NaN;
  return targetAnnualIncome / (yieldPct / 100);
}

// ===========================================================================
// Stock average cost
// ===========================================================================

export type Trade = { side: 'buy' | 'sell'; shares: number; price: number; fee?: number };

export type AverageCostResult = {
  shares: number;
  costBasis: number;
  averageCost: number;
  totalBought: number;
  totalSold: number;
  realizedPnl: number;
  steps: { index: number; side: 'buy' | 'sell'; shares: number; price: number; sharesAfter: number; averageAfter: number; realized: number }[];
};

/**
 * Average cost per share across buys and sells. Buys add shares x price + fee
 * to the cost basis. Sells remove shares at the current average (the average
 * cost method), so they never change the average; the fee lowers the gain.
 */
export function averageCost(trades: Trade[]): Result<AverageCostResult> {
  if (trades.length === 0) return fail(msg('Add at least one buy.'));
  let shares = 0;
  let basis = 0;
  let bought = 0;
  let sold = 0;
  let realized = 0;
  const steps: AverageCostResult['steps'] = [];
  for (let i = 0; i < trades.length; i++) {
    const t = trades[i];
    const fee = t.fee ?? 0;
    if (!isNum(t.shares) || t.shares <= 0) return fail(built(msg('Row {n}: shares must be above zero.'), { n: i + 1 }));
    if (!isNum(t.price) || t.price < 0) return fail(built(msg('Row {n}: price cannot be negative.'), { n: i + 1 }));
    if (!isNum(fee) || fee < 0) return fail(built(msg('Row {n}: fee cannot be negative.'), { n: i + 1 }));
    let r = 0;
    if (t.side === 'buy') {
      basis += t.shares * t.price + fee;
      shares += t.shares;
      bought += t.shares;
    } else {
      if (t.shares > shares + 1e-9) return fail(built(msg('Row {n}: you cannot sell {sell} shares when you hold {held}.'), { n: i + 1, sell: t.shares, held: round2(shares) }));
      const avg = basis / shares;
      r = t.shares * t.price - fee - t.shares * avg;
      realized += r;
      basis -= t.shares * avg;
      shares -= t.shares;
      sold += t.shares;
      if (shares < 1e-9) { shares = 0; basis = 0; }
    }
    steps.push({ index: i + 1, side: t.side, shares: t.shares, price: t.price, sharesAfter: shares, averageAfter: shares > 0 ? basis / shares : 0, realized: r });
  }
  return ok({ shares, costBasis: basis, averageCost: shares > 0 ? basis / shares : 0, totalBought: bought, totalSold: sold, realizedPnl: realized, steps });
}

/** Shares to buy at `price` to move the average from `avg` to `target`. */
export function sharesForTargetAverage(held: number, avg: number, price: number, target: number, fee = 0): Result<{ shares: number; cost: number; newAverage: number }> {
  if (!isNum(held) || held <= 0) return fail(msg('You need shares already held.'));
  if (!isNum(avg) || avg <= 0 || !isNum(price) || price <= 0 || !isNum(target) || target <= 0) return fail(msg('Prices must be above zero.'));
  if (!isNum(fee) || fee < 0) return fail(msg('Fee cannot be negative.'));
  const denom = target - price;
  if (Math.abs(denom) < 1e-12) return fail(msg('The target equals the current price, so no finite number of shares reaches it.'));
  const n = (held * avg + fee - held * target) / denom;
  if (!(n > 0)) {
    return fail(price < avg
      ? built(msg('Buying at {price} can only bring the average down to somewhere between {price} and {avg}. Pick a target in that range.'), { price, avg: round2(avg) })
      : built(msg('Buying at {price} can only move the average between {avg} and {price}. Pick a target in that range.'), { price, avg: round2(avg) }));
  }
  return ok({ shares: n, cost: n * price + fee, newAverage: (held * avg + n * price + fee) / (held + n) });
}

/** New average after buying `shares` more at `price`. */
export function averageAfterBuy(held: number, avg: number, shares: number, price: number, fee = 0): number {
  const total = held + shares;
  return total > 0 ? (held * avg + shares * price + fee) / total : 0;
}

/** Price you must sell at to break even after a per-sale fee and an optional tax-free assumption. */
export function breakEvenPrice(shares: number, costBasis: number, sellFee = 0): number {
  return shares > 0 ? (costBasis + sellFee) / shares : NaN;
}

// ===========================================================================
// Required minimum distributions
// ===========================================================================

/** IRS Publication 590-B, Appendix B, Table III (Uniform Lifetime), in effect from 2022. */
export const UNIFORM_LIFETIME_TABLE: Record<number, number> = {
  72: 27.4, 73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9, 78: 22.0, 79: 21.1, 80: 20.2,
  81: 19.4, 82: 18.5, 83: 17.7, 84: 16.8, 85: 16.0, 86: 15.2, 87: 14.4, 88: 13.7, 89: 12.9, 90: 12.2,
  91: 11.5, 92: 10.8, 93: 10.1, 94: 9.5, 95: 8.9, 96: 8.4, 97: 7.8, 98: 7.3, 99: 6.8, 100: 6.4,
  101: 6.0, 102: 5.6, 103: 5.2, 104: 4.9, 105: 4.6, 106: 4.3, 107: 4.1, 108: 3.9, 109: 3.7, 110: 3.5,
  111: 3.4, 112: 3.3, 113: 3.1, 114: 3.0, 115: 2.9, 116: 2.8, 117: 2.7, 118: 2.5, 119: 2.3, 120: 2.0,
};

export function uniformLifetimeFactor(age: number): number | null {
  if (!isNum(age) || age < 72) return null;
  return UNIFORM_LIFETIME_TABLE[Math.min(120, Math.floor(age))];
}

/**
 * RMD starting age under SECURE 2.0 (IRC 401(a)(9)(C)(v)) as read by the
 * 2024 proposed regulations: born 1951 to 1959 -> 73, born 1960 or later -> 75.
 * Born 1950 or earlier: 72 (or 70 1/2 if born before July 1, 1949).
 */
export function rmdStartAge(birthYear: number): number {
  if (birthYear >= 1960) return 75;
  if (birthYear >= 1951) return 73;
  return 72;
}

export type RmdInput = {
  /** Account balance on December 31 of the year before the distribution year. */
  priorYearEndBalance: number;
  birthYear: number;
  distributionYear: number;
  /** Expected yearly growth for the projection, percent. */
  growthPct?: number;
  projectionYears?: number;
};

export type RmdYear = { year: number; age: number; startBalance: number; factor: number; rmd: number; pctOfBalance: number; endBalance: number };

export type RmdResult = {
  age: number;
  startAge: number;
  firstRmdYear: number;
  required: boolean;
  factor: number | null;
  rmd: number;
  deadline: string;
  isFirstYear: boolean;
  projection: RmdYear[];
};

export function calculateRmd(input: RmdInput): Result<RmdResult> {
  const { priorYearEndBalance, birthYear, distributionYear } = input;
  if (!isNum(priorYearEndBalance) || priorYearEndBalance < 0) return fail(msg('Enter the December 31 balance (zero or more).'));
  if (!isNum(birthYear) || birthYear < 1900 || birthYear > 2010) return fail(msg('Enter a birth year between 1900 and 2010.'));
  if (!isNum(distributionYear) || distributionYear < 2022 || distributionYear > 2100) return fail(msg('Distribution year must be 2022 or later.'));
  const g = (input.growthPct ?? 0) / 100;
  if (!isNum(g) || g <= -1 || g > 0.5) return fail(msg('Growth must be between -100% and 50%.'));
  const years = Math.max(1, Math.min(50, Math.round(input.projectionYears ?? 20)));

  const startAge = rmdStartAge(birthYear);
  const firstRmdYear = birthYear + startAge;
  const age = distributionYear - birthYear;
  const required = age >= startAge;
  const factor = required ? uniformLifetimeFactor(age) : null;
  const rmd = factor ? priorYearEndBalance / factor : 0;
  const isFirstYear = distributionYear === firstRmdYear;
  const deadline = !required
    ? `No RMD for ${distributionYear}. Your first RMD year is ${firstRmdYear} (age ${startAge}).`
    : isFirstYear
      ? `April 1, ${distributionYear + 1} at the latest (first RMD). Waiting means taking two RMDs in ${distributionYear + 1}.`
      : `December 31, ${distributionYear}`;

  const projection: RmdYear[] = [];
  let bal = priorYearEndBalance;
  const firstYear = Math.max(distributionYear, firstRmdYear);
  // Grow untouched until the first RMD year.
  for (let y = distributionYear; y < firstYear; y++) bal *= 1 + g;
  for (let i = 0; i < years; i++) {
    const year = firstYear + i;
    const a = year - birthYear;
    const f = uniformLifetimeFactor(a);
    if (!f) break;
    const d = Math.min(bal, bal / f);
    const end = Math.max(0, bal * (1 + g) - d);
    projection.push({ year, age: a, startBalance: bal, factor: f, rmd: d, pctOfBalance: (1 / f) * 100, endBalance: end });
    bal = end;
  }

  return ok({ age, startAge, firstRmdYear, required, factor, rmd, deadline, isFirstYear, projection });
}

// ===========================================================================
// Share-link helpers for the row editors
// ===========================================================================

/** Encode editable rows into one URL-safe string so share links keep them. */
export function encodeRows(rows: string[][]): string {
  // encodeURIComponent leaves '~' alone, so escape it too or a cell containing '~' splits in two.
  return rows.map((r) => r.map((c) => encodeURIComponent(c).replace(/~/g, '%7E')).join('~')).join('|');
}

export function decodeRows(s: string): string[][] {
  if (!s) return [];
  return s.split('|').map((r) => r.split('~').map((c) => { try { return decodeURIComponent(c); } catch { return c; } }));
}
