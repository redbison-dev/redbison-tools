/**
 * "Show the working" for the loan, business and investment calculators of
 * rollout batch s1 (docs/calculation-standard.md). Each `<tool>Steps()`
 * returns ReportStep[] built from the same functions the page uses for its
 * answer, so the last step's result equals what the page shows
 * (src/test/tools/steps-s1.test.ts).
 *
 * The formatters below copy the ones in each page kit (loans/ui.tsx,
 * BizCalcParts.tsx, investAShared.tsx, investB/shared.tsx) so a step reads
 * exactly like the page's result tile. Inputs inside the working are printed
 * without padding zeros (250,000 rather than 250,000.00) so the visitor can
 * see their own numbers.
 */
import { stepDate, stepList, stepMsg, stepMsgText, type ReportStep, type StepMsg } from '../../report/model';
import { msg } from '../../msg';

/*
 * Step text built from a msg() template with values in it. Each spreads the
 * US English text (the template filled in, exactly as t() renders it on an
 * English page) into its field, plus the message CalculationSteps passes
 * through t(): resultMsg, labelMsg, formulaMsg or workingMsg.
 */
const said = (text: string, v: Record<string, unknown> = {}): Pick<ReportStep, 'result' | 'resultMsg'> => {
  const m = stepMsg(text, v);
  return { result: stepMsgText(m), resultMsg: m };
};
const sayLabel = (text: string, v: Record<string, unknown> = {}): Pick<ReportStep, 'label' | 'labelMsg'> => {
  const m = stepMsg(text, v);
  return { label: stepMsgText(m), labelMsg: m };
};
const sayFormula = (text: string, v: Record<string, unknown> = {}): Pick<ReportStep, 'formula' | 'formulaMsg'> => {
  const m = stepMsg(text, v);
  return { formula: stepMsgText(m), formulaMsg: m };
};
const sayWorking = (text: string, v: Record<string, unknown> = {}): Pick<ReportStep, 'working' | 'workingMsg'> => {
  const m = stepMsg(text, v);
  return { working: stepMsgText(m), workingMsg: m };
};
import {
  calculateApr, calculateLease, calculateAutoLoan, calculateMortgage, calculateAffordability, calculateRefinance,
  calculateStudentLoan, calculateDti, simulatePayoff, monthlyRate, canadaApr, paymentDate, PAYOFF_MONTH_CAP, monthlyEquivalentRatePct,
  type AprInput, type LeaseInput, type AutoLoanInput, type MortgageInput, type AffordabilityInput, type RefinanceInput,
  type StudentLoanInput, type Debt, type PayoffStrategy, type RateBasis,
} from '../calculators/loans';
import {
  breakEven, preTaxTarget, solveMarginMarkup, depreciationSchedule, MACRS_HALF_YEAR, flatCommission, tieredMarginal,
  tieredWholeAmount, drawSchedule, type MarginInputs, type MarginField, type DepreciationInputs, type CommissionTier,
} from '../calculators/biz';
import {
  cagr, cagrEndValue, cagrYears, splitYearsMonths, cpiAdjust, inflateForward, deflateBack, npv, irrAll, annualToPeriodRate,
  periodToAnnualRate, futureValue, presentValue, computeRoi, requiredDeposit, periodsToGoal, savingsBalance, ratePerPaymentPeriod,
  fvAnnuityFactor, type TvmInput, type SavingsInput, type Compounding,
} from '../calculators/invest-a';
import { bondPriceFromYield, bondYieldFromPrice, bondPeriods, currencyDecimals, type BondInput } from '../calculators/invest-b';

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

/** Plain number with thousands separators and no padding zeros, for inputs in the working. */
export const plain = (x: number, digits = 6) => (Number.isFinite(x) ? x.toLocaleString('en-US', { maximumFractionDigits: digits }) : '–');

const loanFormatters = new Map<string, Intl.NumberFormat>();
/** Same as money() in components/tools/calculators/loans/ui.tsx. */
export function loanMoney(value: number, currency = 'USD', decimals = 2): string {
  if (!Number.isFinite(value)) return '–';
  const key = `${currency}:${decimals}`;
  let f = loanFormatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    loanFormatters.set(key, f);
  }
  return f.format(Math.abs(value) < 0.005 ? 0 : value);
}
/** Same as pct() in loans/ui.tsx. */
export const loanPct = (value: number, decimals = 2) => (Number.isFinite(value) ? `${value.toFixed(decimals)}%` : '–');
/** A loan-kit amount in the working: no cents when it is a whole number. */
const lw = (v: number, cur: string) => loanMoney(v, cur, Math.abs(v - Math.round(v)) < 1e-9 ? 0 : 2);

/** Number locale for a business-kit currency: Indian grouping for rupees, CLDR en-ZA (R 1 234,50) for rand, en-US otherwise. */
export const bizLocale = (code: string) => (code === 'INR' ? 'en-IN' : code === 'ZAR' ? 'en-ZA' : 'en-US');
/** Like makeMoney() in BizCalcParts.tsx, except for rupees: the working uses Indian grouping (en-IN) while makeMoney prints INR in en-US. Rand matches (en-ZA) in both. */
export function bizMoney(code: string) {
  const fmt =
    code === 'NONE'
      ? new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : new Intl.NumberFormat(bizLocale(code), { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' });
  return (x: number | null | undefined) => (x === null || x === undefined || !Number.isFinite(x) ? 'n/a' : fmt.format(x));
}
/** A business-kit amount in the working: no cents when it is a whole number. */
function bizMoneyW(code: string) {
  const fmt =
    code === 'NONE'
      ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
      : new Intl.NumberFormat(bizLocale(code), { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol', minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return (x: number) => (Number.isFinite(x) ? fmt.format(x) : 'n/a');
}
/** Same as pct() in BizCalcParts.tsx. */
export const bizPct = (x: number | null | undefined, digits = 2) =>
  x === null || x === undefined || !Number.isFinite(x) ? 'n/a' : `${Number(x.toFixed(digits)).toLocaleString('en-US', { maximumFractionDigits: digits })}%`;
/** Same as num() in BizCalcParts.tsx. */
export const bizNum = (x: number | null | undefined, digits = 2) =>
  x === null || x === undefined || !Number.isFinite(x) ? 'n/a' : x.toLocaleString('en-US', { maximumFractionDigits: digits });

const A_SYMBOLS: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', INR: '₹', JPY: '¥', NONE: '' };
/** Same as fmtNumber() in investAShared.tsx. */
export function fmtNumber(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return '–';
  return v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
/** Same as fmtMoney() in investAShared.tsx. */
export function fmtMoney(v: number, code: string, digits = 2): string {
  if (!Number.isFinite(v)) return '–';
  const sym = A_SYMBOLS[code] ?? '$';
  const body = code === 'INR'
    ? Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : fmtNumber(Math.abs(v), digits);
  return `${v < 0 ? '-' : ''}${sym}${body}`;
}
/** Same as fmtPct() in investAShared.tsx (takes a fraction). */
export const fmtPct = (fraction: number, digits = 2) => (Number.isFinite(fraction) ? `${fmtNumber(fraction * 100, digits)}%` : '–');
/** An invest-a amount in the working: no cents when it is a whole number. */
const aw = (v: number, code: string) => fmtMoney(v, code, Math.abs(v - Math.round(v)) < 1e-9 ? 0 : 2);

/** Same as money() in investB/shared.tsx. */
export function investMoney(value: number, currency = 'USD', decimals = 2, locale?: string): string {
  if (!Number.isFinite(value)) return '–';
  try {
    return new Intl.NumberFormat(locale ?? (currency === 'INR' ? 'en-IN' : 'en-US'), {
      style: 'currency', currency, minimumFractionDigits: decimals, maximumFractionDigits: decimals,
    }).format(value);
  } catch {
    return value.toFixed(decimals);
  }
}
/** Same as pct() in investB/shared.tsx. */
export const investPct = (value: number, decimals = 2) => (Number.isFinite(value) ? `${value.toFixed(decimals)}%` : '–');

const AMORT = 'M = P × r × (1 + r)^n / ((1 + r)^n − 1)';
/** The amortization working; `tail` adds ", n = years × 12" (years) or ", n = years × 12 = n" (years-n). */
const AMORT_WORKING = {
  monthly: msg('{p} × r × (1 + r)^{n} / ((1 + r)^{n} − 1), r = {rate}% / 12 = {monthly}% a month'),
  'monthly-years': msg('{p} × r × (1 + r)^{n} / ((1 + r)^{n} − 1), r = {rate}% / 12 = {monthly}% a month, n = {years} × 12'),
  'monthly-years-n': msg('{p} × r × (1 + r)^{n} / ((1 + r)^{n} − 1), r = {rate}% / 12 = {monthly}% a month, n = {years} × 12 = {n}'),
  other: msg('{p} × r × (1 + r)^{n} / ((1 + r)^{n} − 1), r = (1 + {rate}% / {k})^({k}/12) − 1 = {monthly}% a month'),
  'other-years': msg('{p} × r × (1 + r)^{n} / ((1 + r)^{n} − 1), r = (1 + {rate}% / {k})^({k}/12) − 1 = {monthly}% a month, n = {years} × 12'),
  'other-years-n': msg('{p} × r × (1 + r)^{n} / ((1 + r)^{n} − 1), r = (1 + {rate}% / {k})^({k}/12) − 1 = {monthly}% a month, n = {years} × 12 = {n}'),
};
const amortWorking = (p: string, ratePct: number, n: number, compoundingPerYear = 12, tail?: { years: number; showN?: boolean }) => {
  const key = `${compoundingPerYear === 12 ? 'monthly' : 'other'}${tail ? (tail.showN ? '-years-n' : '-years') : ''}` as keyof typeof AMORT_WORKING;
  const monthly = compoundingPerYear === 12 ? plain(ratePct / 12, 5) : plain(monthlyEquivalentRatePct(ratePct, compoundingPerYear) / 12, 5);
  return sayWorking(AMORT_WORKING[key], { p, n, rate: plain(ratePct), k: compoundingPerYear, monthly, years: tail ? plain(tail.years) : '' });
};

// ---------------------------------------------------------------------------
// Loans
// ---------------------------------------------------------------------------

/** APR by the actuarial method of US Regulation Z, Appendix J. Last step: the APR as the page shows it. */
export function aprSteps(i: AprInput, cur = 'USD', method: 'us' | 'uk' | 'ca' = 'us'): ReportStep[] {
  const r = calculateApr(i);
  if (!r) return [];
  const n = Math.round(i.termMonths);
  const m = (v: number) => loanMoney(v, cur);
  return [
    { label: msg('Prepaid finance charges'), formula: msg('charges = fees + points × loan amount'), working: `${lw(i.fees, cur)} + ${plain(i.pointsPct)}% × ${lw(i.loanAmount, cur)}`, result: m(r.financeCharges) },
    {
      label: msg('Amount financed'),
      formula: i.financeFees ? msg('amount financed = (loan + charges) − charges') : msg('amount financed = loan − charges'),
      working: `${m(r.noteAmount)} − ${m(r.financeCharges)}`,
      result: m(r.amountFinanced),
    },
    { label: msg('Monthly payment on the note'), ...sayFormula(msg('{AMORT}, r = note rate / 12'), { AMORT }), ...amortWorking(m(r.noteAmount), i.ratePct, n), result: m(r.payment) },
    r.financeCharges === 0
      ? { label: msg('APR'), formula: msg('with no prepaid finance charges, APR = note rate'), working: `${plain(i.ratePct)}%`, result: loanPct(r.aprPct, 3) }
      : {
          label: msg('APR (actuarial method, Regulation Z Appendix J)'),
          formula: msg('find i so that Σ PMT / (1 + i)^t for t = 1 … n equals the amount financed; APR = 12 × i'),
          ...sayWorking(msg('Σ {payment} / (1 + i)^t for t = 1 … {n} = {amountFinanced}, solved by bisection: i = {value}% a month'), { payment: m(r.payment), n, amountFinanced: m(r.amountFinanced), value: plain(r.aprPct / 12, 5) }),
          result: loanPct(r.aprPct, 3),
        },
    ...(method === 'uk'
      ? [{ label: msg('APR as an annual effective rate (FCA CONC App 1.1)'), formula: msg('APR = (1 + i)^12 − 1'), working: `(1 + ${plain(r.aprPct / 12, 5)}%)^12 − 1`, result: loanPct(r.effectiveAnnualPct, 3) }]
      : method === 'ca'
      ? [{
          label: msg('APR, Canadian cost of borrowing method (SOR/2021-181, s. 47)'),
          formula: msg('APR = C / (T × P) × 100, C = interest + fees, T = years, P = average principal outstanding each month'),
          ...sayWorking(msg('{totalFinanceCharge} / ({value} × average principal) × 100'), { totalFinanceCharge: m(r.totalFinanceCharge), value: plain(n / 12, 2) }),
          result: loanPct(canadaApr(i) ?? NaN, 3),
        }]
      : []),
  ];
}

/** Lease payment as depreciation fee + rent charge + tax. Last step: the monthly payment with tax. */
export function autoLeaseSteps(i: LeaseInput, cur = 'USD'): ReportStep[] {
  const r = calculateLease(i);
  if (!r) return [];
  const m = (v: number) => loanMoney(v, cur);
  const n = Math.round(i.termMonths);
  return [
    { label: msg('Gross capitalized cost'), formula: msg('gross cap cost = price + acquisition fee + other fees'), working: `${lw(i.negotiatedPrice, cur)} + ${lw(i.acquisitionFee, cur)} + ${lw(i.otherCapitalizedFees, cur)}`, result: m(r.grossCapCost) },
    { label: msg('Adjusted capitalized cost'), formula: msg('adjusted cap cost = gross cap cost − cap cost reductions'), working: `${m(r.grossCapCost)} − ${lw(i.capCostReduction, cur)}`, result: m(r.adjustedCapCost) },
    { label: msg('Residual value'), formula: msg('residual = MSRP × residual %'), working: `${lw(i.msrp, cur)} × ${plain(i.residualPct)}%`, result: m(r.residualValue) },
    { label: msg('Depreciation fee'), formula: msg('depreciation = (adjusted cap cost − residual) / months'), working: `(${m(r.adjustedCapCost)} − ${m(r.residualValue)}) / ${n}`, result: m(r.depreciation) },
    { label: msg('Rent charge'), formula: msg('rent charge = (adjusted cap cost + residual) × money factor'), working: `(${m(r.adjustedCapCost)} + ${m(r.residualValue)}) × ${i.moneyFactor.toFixed(5)}`, result: m(r.rentCharge) },
    { label: msg('Sales tax on the payment'), formula: msg('tax = (depreciation + rent charge) × tax rate'), working: `(${m(r.depreciation)} + ${m(r.rentCharge)}) × ${plain(i.salesTaxPct)}%`, result: m(r.tax) },
    { label: msg('Monthly payment'), formula: msg('payment = depreciation + rent charge + tax'), working: `${m(r.depreciation)} + ${m(r.rentCharge)} + ${m(r.tax)}`, result: m(r.payment) },
  ];
}

/** Auto loan: taxable price, sales tax, trade-in equity, amount financed, payment. Last step: the monthly payment. */
export function autoLoanSteps(i: AutoLoanInput, cur = 'USD'): ReportStep[] {
  const r = calculateAutoLoan(i);
  if (!r) return [];
  const m = (v: number) => loanMoney(v, cur);
  const n = Math.round(i.termMonths);
  const taxable = Math.max(0, i.price - (i.taxAfterTradeIn ? i.tradeInValue : 0));
  const steps: ReportStep[] = [
    {
      label: msg('Taxable price'),
      formula: i.taxAfterTradeIn ? msg('taxable = price − trade-in value') : msg('taxable = price'),
      working: i.taxAfterTradeIn ? `${lw(i.price, cur)} − ${lw(i.tradeInValue, cur)}` : lw(i.price, cur),
      result: m(taxable),
    },
    { label: msg('Sales tax'), formula: msg('sales tax = taxable × tax rate'), working: `${m(taxable)} × ${plain(i.salesTaxPct)}%`, result: m(r.salesTax) },
    { label: msg('Trade-in equity'), formula: msg('equity = trade-in value − amount still owed'), working: `${lw(i.tradeInValue, cur)} − ${lw(i.tradeInOwed, cur)}`, result: m(r.tradeEquity) },
    {
      label: msg('Amount financed'),
      formula: i.financeTaxAndFees ? msg('loan = price − down payment − equity + sales tax + fees') : msg('loan = price − down payment − equity'),
      working: `${lw(i.price, cur)} − ${lw(i.downPayment, cur)} − ${m(r.tradeEquity)}${i.financeTaxAndFees ? ` + ${m(r.salesTax)} + ${lw(i.fees, cur)}` : ''}`,
      result: m(r.loanAmount),
    },
  ];
  steps.push(
    r.loanAmount > 0 && r.balloon > 0
      ? {
          label: msg('Monthly payment with a balloon'),
          formula: msg('M = (P − B / (1 + r)^n) × r / (1 − (1 + r)^−n), B = balloon left owing after payment n'),
          ...sayWorking(msg('({loanAmount} − {balloon} / (1 + r)^{n}) × r / (1 − (1 + r)^−{n}), {value} = {value2}% a month'), { loanAmount: m(r.loanAmount), balloon: m(r.balloon), n, value: (i.compoundingPerYear ?? 12) === 12 ? `r = ${plain(i.ratePct)}% / 12` : `r = (1 + ${plain(i.ratePct)}%)^(1/12) − 1`, value2: plain(monthlyEquivalentRatePct(i.ratePct, i.compoundingPerYear ?? 12) / 12, 5) }),
          result: m(r.payment),
        }
      : r.loanAmount > 0
      ? { label: msg('Monthly payment'), formula: AMORT, ...amortWorking(m(r.loanAmount), i.ratePct, n, i.compoundingPerYear ?? 12), result: m(r.payment) }
      : { label: msg('Monthly payment'), formula: msg('nothing is financed when the down payment and trade-in cover the price'), result: m(0) },
  );
  return steps;
}

/** Mortgage PITI: loan, P&I by the amortization formula, escrow, PMI. Last step: total monthly payment. */
export function mortgageSteps(i: MortgageInput, cur = 'USD'): ReportStep[] {
  const r = calculateMortgage(i);
  if (!r) return [];
  const m = (v: number) => loanMoney(v, cur);
  const n = Math.round(i.termYears * 12);
  return [
    r.insurancePremium > 0
      ? { label: msg('Loan amount'), formula: msg('P = home price − down payment + CMHC premium'), working: `${lw(i.homePrice, cur)} − ${lw(i.downPayment, cur)} + ${loanPct(r.insurancePremiumPct, 2)} × ${m(r.baseLoanAmount)}`, ...said(msg('{amount} ({ltv} loan-to-value before the premium)'), { amount: m(r.loanAmount), ltv: loanPct(r.ltvPct, 1) }) }
      : { label: msg('Loan amount'), formula: msg('P = home price − down payment'), working: `${lw(i.homePrice, cur)} − ${lw(i.downPayment, cur)}`, ...said(msg('{amount} ({ltv} loan-to-value)'), { amount: m(r.loanAmount), ltv: loanPct(r.ltvPct, 1) }) },
    { label: msg('Principal and interest'), ...sayFormula(msg('{AMORT}, n = years × 12'), { AMORT }), ...amortWorking(m(r.loanAmount), i.ratePct, n, i.compoundingPerYear ?? 12, { years: i.termYears, showN: true }), result: m(r.principalAndInterest) },
    {
      label: msg('Tax, insurance and HOA each month'),
      formula: msg('escrow = property tax / 12 + insurance / 12 + HOA'),
      working: `${lw(i.propertyTaxYearly, cur)} / 12 + ${lw(i.insuranceYearly, cur)} / 12 + ${lw(i.hoaMonthly, cur)}`,
      result: m(r.monthlyTax + r.monthlyInsurance + r.monthlyHoa),
    },
    r.monthlyPmi > 0
      ? { label: msg('PMI'), formula: msg('PMI = loan × annual PMI rate / 12, while the balance is above 78% of the price'), working: `${m(r.loanAmount)} × ${plain(i.pmiRatePct)}% / 12`, ...said(msg('{amount} until payment {n}'), { amount: m(r.monthlyPmi), n: r.pmiLastMonth }) }
      : { label: msg('PMI'), formula: msg('charged only when the loan is more than 80% of the price'), ...(i.pmiRatePct > 0 ? sayWorking(msg('loan-to-value {ltvPct}'), { ltvPct: loanPct(r.ltvPct, 1) }) : sayWorking(msg('loan-to-value {ltvPct}, PMI rate 0%'), { ltvPct: loanPct(r.ltvPct, 1) })), result: m(0) },
    {
      label: msg('Total monthly payment'),
      formula: msg('total = P&I + tax + insurance + PMI + HOA'),
      working: `${m(r.principalAndInterest)} + ${m(r.monthlyTax)} + ${m(r.monthlyInsurance)} + ${m(r.monthlyPmi)} + ${m(r.monthlyHoa)}`,
      result: m(r.monthlyTotal),
    },
  ];
}

/** The monthly-cost formula by which parts apply: bit 1 CMHC premium, 2 qualifying rate, 4 PMI, 8 heating. */
const AFFORD_FORMULA = [
  msg('P&I on (price − down) + price × tax rate / 12 + insurance / 12 + HOA'),
  msg('P&I on (price − down + CMHC premium) + price × tax rate / 12 + insurance / 12 + HOA'),
  msg('P&I on (price − down) at the {rate}% qualifying rate + price × tax rate / 12 + insurance / 12 + HOA'),
  msg('P&I on (price − down + CMHC premium) at the {rate}% qualifying rate + price × tax rate / 12 + insurance / 12 + HOA'),
  msg('P&I on (price − down) + price × tax rate / 12 + insurance / 12 + PMI + HOA'),
  msg('P&I on (price − down + CMHC premium) + price × tax rate / 12 + insurance / 12 + PMI + HOA'),
  msg('P&I on (price − down) at the {rate}% qualifying rate + price × tax rate / 12 + insurance / 12 + PMI + HOA'),
  msg('P&I on (price − down + CMHC premium) at the {rate}% qualifying rate + price × tax rate / 12 + insurance / 12 + PMI + HOA'),
  msg('P&I on (price − down) + price × tax rate / 12 + insurance / 12 + HOA + heating'),
  msg('P&I on (price − down + CMHC premium) + price × tax rate / 12 + insurance / 12 + HOA + heating'),
  msg('P&I on (price − down) at the {rate}% qualifying rate + price × tax rate / 12 + insurance / 12 + HOA + heating'),
  msg('P&I on (price − down + CMHC premium) at the {rate}% qualifying rate + price × tax rate / 12 + insurance / 12 + HOA + heating'),
  msg('P&I on (price − down) + price × tax rate / 12 + insurance / 12 + PMI + HOA + heating'),
  msg('P&I on (price − down + CMHC premium) + price × tax rate / 12 + insurance / 12 + PMI + HOA + heating'),
  msg('P&I on (price − down) at the {rate}% qualifying rate + price × tax rate / 12 + insurance / 12 + PMI + HOA + heating'),
  msg('P&I on (price − down + CMHC premium) at the {rate}% qualifying rate + price × tax rate / 12 + insurance / 12 + PMI + HOA + heating'),
];

/** Which limit sets the housing budget, one message each. */
const BINDING_WORKING: Record<string, string> = {
  'front-end': msg('front-end limit applies'),
  'back-end': msg('back-end limit applies'),
  'income-multiple': msg('income-multiple limit applies'),
  'minimum-down-payment': msg('minimum-down-payment limit applies'),
};

/** House affordability by the front-end / back-end DTI limits. Last step: the maximum price (whole currency units, as on the page). */
export function houseAffordabilitySteps(i: AffordabilityInput, cur = 'USD'): ReportStep[] {
  const r = calculateAffordability(i);
  if (!r) return [];
  const m = (v: number, d = 2) => loanMoney(v, cur, d);
  const income = i.annualIncome / 12;
  const steps: ReportStep[] = [
    { label: msg('Gross monthly income'), formula: msg('monthly income = annual income / 12'), working: `${lw(i.annualIncome, cur)} / 12`, result: m(income) },
    i.frontEndPct > 0
      ? { label: msg('Front-end budget'), formula: msg('housing ≤ monthly income × front-end limit'), working: `${m(income)} × ${plain(i.frontEndPct)}%`, result: m(r.frontEndBudget) }
      : { label: msg('Front-end budget'), formula: msg('no housing-only limit set'), ...said(msg('no limit')) },
    i.backEndPct > 0
      ? { label: msg('Back-end budget'), formula: msg('housing ≤ monthly income × back-end limit − other debts'), working: `${m(income)} × ${plain(i.backEndPct)}% − ${lw(i.monthlyDebts, cur)}`, result: m(r.backEndBudget) }
      : { label: msg('Back-end budget'), formula: msg('no total-debt limit set'), ...said(msg('no limit')) },
    { label: msg('Housing budget'), formula: msg('budget = smaller of the two'), ...(r.binding === 'down-payment-only' ? sayWorking(msg('no room left for a housing payment')) : sayWorking(BINDING_WORKING[r.binding] ?? msg('{binding} limit applies'), { binding: r.binding })), result: m(r.maxHousingPayment) },
  ];
  if (r.binding === 'down-payment-only') {
    steps.push({ label: msg('Maximum home price'), formula: msg('with no mortgage budget, price = down payment'), working: lw(i.downPayment, cur), result: m(r.maxPrice, 0) });
    return steps;
  }
  steps.push(
    {
      label: msg('Monthly cost at the maximum price'),
      ...sayFormula(AFFORD_FORMULA[(r.insurancePremium > 0 ? 1 : 0) + (r.qualifyingRatePct !== i.ratePct ? 2 : 0) + (r.monthlyPmi > 0 ? 4 : 0) + (r.monthlyHeating > 0 ? 8 : 0)], { rate: plain(r.qualifyingRatePct) }),
      working: `${m(r.principalAndInterest)} + ${m(r.monthlyTax)} + ${m(r.monthlyInsurance)}${r.monthlyPmi > 0 ? ` + ${m(r.monthlyPmi)}` : ''} + ${m(r.monthlyHoa)}${r.monthlyHeating > 0 ? ` + ${m(r.monthlyHeating)}` : ''}`,
      result: m(r.housingPayment),
    },
    r.binding === 'income-multiple' ? {
      label: msg('Maximum home price'),
      formula: msg('price = down payment + income multiple × gross annual income'),
      working: `${lw(i.downPayment, cur)} + ${plain(i.maxLoanToIncome ?? 0)} × ${lw(i.annualIncome, cur)}`,
      result: m(r.maxPrice, 0),
    } : r.binding === 'minimum-down-payment' && !i.canadaMinimumDown && (i.maxLtvPct ?? 0) > 0 && (i.maxLtvPct ?? 0) < 100 ? {
      // A loan-to-value cap (Ireland's 90%) binds the same way as the Canadian minimum; describe the cap instead.
      label: msg('Maximum home price'),
      ...sayFormula(msg('price = down payment ÷ (100% − {value}% maximum loan-to-value)'), { value: plain(i.maxLtvPct ?? 0) }),
      working: `${lw(i.downPayment, cur)} ÷ ${plain(100 - (i.maxLtvPct ?? 0))}%`,
      result: m(r.maxPrice, 0),
    } : r.binding === 'minimum-down-payment' ? {
      label: msg('Maximum home price'),
      formula: msg('highest price your down payment covers: 5% of the first 500,000, 10% above that, 20% from 1.5 million'),
      ...sayWorking(msg('down payment {downPayment}'), { downPayment: lw(i.downPayment, cur) }),
      result: m(r.maxPrice, 0),
    } : {
      label: msg('Maximum home price'),
      formula: msg('largest price whose monthly cost fits the budget (bisection, 200 halvings)'),
      ...sayWorking(msg('down payment {downPayment} + loan {loanAmount} at {qualifyingRatePct}% for {termYears} years'), { downPayment: lw(i.downPayment, cur), loanAmount: m(r.loanAmount, 0), qualifyingRatePct: plain(r.qualifyingRatePct), termYears: plain(i.termYears) }),
      result: m(r.maxPrice, 0),
    },
  );
  return steps;
}

/** Refinance: both payments, costs, savings and the two break-even measures. Last step: the break-even month as the page shows it. */
export function refinanceSteps(i: RefinanceInput, cur = 'USD'): ReportStep[] {
  const r = calculateRefinance(i);
  if (!r) return [];
  const m = (v: number) => loanMoney(v, cur);
  const base = i.currentBalance + i.cashOut;
  return [
    { label: msg('Current payment'), ...sayFormula(msg('{AMORT} on the balance over the payments left'), { AMORT }), ...amortWorking(lw(i.currentBalance, cur), i.currentRatePct, Math.round(i.remainingMonths), i.compoundingPerYear ?? 12), result: m(r.currentPayment) },
    { label: msg('Closing costs and points'), formula: msg('costs = closing costs + points × (balance + cash out)'), working: `${lw(i.closingCosts, cur)} + ${plain(i.pointsPct)}% × ${lw(base, cur)}`, result: m(r.totalCosts) },
    {
      label: msg('New loan amount'),
      formula: i.rollCostsIntoLoan ? msg('new loan = balance + cash out + costs') : msg('new loan = balance + cash out'),
      working: `${lw(i.currentBalance, cur)} + ${lw(i.cashOut, cur)}${i.rollCostsIntoLoan ? ` + ${m(r.totalCosts)}` : ''}`,
      result: m(r.newLoanAmount),
    },
    { label: msg('New payment'), formula: AMORT, ...amortWorking(m(r.newLoanAmount), i.newRatePct, Math.round(i.newTermMonths), i.compoundingPerYear ?? 12), result: m(r.newPayment) },
    { label: msg('Monthly saving'), formula: msg('saving = current payment − new payment'), working: `${m(r.currentPayment)} − ${m(r.newPayment)}`, result: m(r.monthlySavings) },
    {
      label: msg('Simple break-even'),
      formula: msg('months = costs / monthly saving, rounded up'),
      ...(r.monthlySavings > 0 ? { working: `${m(r.totalCosts)} / ${m(r.monthlySavings)}` } : sayWorking(msg('no monthly saving'))),
      ...(r.simpleBreakEvenMonth ? said(msg('{n} months'), { n: r.simpleBreakEvenMonth }) : { result: 'n/a' }),
    },
    {
      label: msg('Break-even'),
      formula: msg('first month where cash out − costs paid at closing + Σ (old − new payment) + (old balance − new balance) ≥ 0'),
      ...sayWorking(msg('cash out {cashOut} − {upfrontCash} paid at closing, tracked month by month'), { cashOut: lw(i.cashOut, cur), upfrontCash: m(r.upfrontCash) }),
      ...(r.breakEvenMonth ? said(msg('{n} months'), { n: r.breakEvenMonth }) : said(msg('Never'))),
    },
  ];
}

/** Student loan: interest during deferment, balance at repayment, level payment. Last step: the monthly payment. */
export function studentLoanSteps(i: StudentLoanInput, cur = 'USD'): ReportStep[] {
  const r = calculateStudentLoan(i);
  if (!r) return [];
  const m = (v: number) => loanMoney(v, cur);
  const n = Math.round(i.termYears * 12);
  const defer = Math.round(i.deferMonths);
  const owedText = r.interestPaidWhileDeferred > 0
    ? msg('{balance} + {capitalizedInterest} principal, {outstandingInterest} interest (paid as it accrued)')
    : r.capitalizedInterest > 0
      ? msg('{balance} + {capitalizedInterest} principal, {outstandingInterest} interest (capitalized into principal)')
      : r.accruedInterest > 0
        ? msg('{balance} + {capitalizedInterest} principal, {outstandingInterest} interest (owed but not capitalized)')
        : msg('{balance} + {capitalizedInterest} principal, {outstandingInterest} interest (none accrued)');
  return [
    i.subsidized
      ? { label: msg('Interest before repayment'), formula: msg('subsidized: the government pays the interest while deferred'), ...sayWorking(msg('{defer} months deferred'), { defer }), result: m(0) }
      : { label: msg('Interest before repayment'), formula: msg('simple interest = balance × rate × months / 12'), working: `${lw(i.balance, cur)} × ${plain(i.ratePct)}% × ${defer} / 12`, result: m(r.accruedInterest) },
    {
      label: msg('Owed when repayment starts'),
      formula: msg('principal = balance + capitalized interest; uncapitalized interest is paid first'),
      ...sayWorking(owedText, { balance: lw(i.balance, cur), capitalizedInterest: m(r.capitalizedInterest), outstandingInterest: m(r.outstandingInterest) }),
      result: m(r.repaymentPrincipal + r.outstandingInterest),
    },
    r.outstandingInterest > 1e-7
      ? {
          label: msg('Monthly payment'),
          formula: msg('level payment that clears the principal and the outstanding interest in n months (bisection)'),
          ...sayWorking(msg('{repaymentPrincipal} principal + {outstandingInterest} interest, r = {ratePct}% / 12, n = {n}'), { repaymentPrincipal: m(r.repaymentPrincipal), outstandingInterest: m(r.outstandingInterest), ratePct: plain(i.ratePct), n }),
          result: m(r.payment),
        }
      : { label: msg('Monthly payment'), ...sayFormula(msg('{AMORT}, n = years × 12'), { AMORT }), ...amortWorking(m(r.repaymentPrincipal), i.ratePct, n, 12, { years: i.termYears }), result: m(r.payment) },
  ];
}

/** Debt-to-income ratios. Last step: back-end DTI to one decimal, as the headline. */
export function debtToIncomeSteps(
  i: { incomeUnit: 'year' | 'month'; income: number; otherIncome: number; housing: number; debts: number[] },
  cur = 'USD',
  /** Ratio names for a market (Canada: GDS and TDS). */
  names: { front: string; back: string } = { front: msg('Front-end DTI'), back: msg('Back-end DTI') },
): ReportStep[] {
  const yearly = i.incomeUnit === 'year';
  const monthly = (yearly ? i.income / 12 : i.income) + (yearly ? i.otherIncome / 12 : i.otherIncome);
  const debts = i.debts.map((d) => (Number.isFinite(d) ? d : 0));
  const other = debts.reduce((t, d) => t + d, 0);
  const r = calculateDti(monthly, i.housing, other);
  if (!r) return [];
  const m = (v: number) => loanMoney(v, cur);
  return [
    {
      label: msg('Gross monthly income'),
      formula: yearly ? msg('income = (salary + other income) / 12') : msg('income = salary + other income'),
      working: yearly ? `(${lw(i.income, cur)} + ${lw(i.otherIncome, cur)}) / 12` : `${lw(i.income, cur)} + ${lw(i.otherIncome, cur)}`,
      result: m(monthly),
    },
    { label: msg('Other monthly debt payments'), formula: msg('sum of car, student, card, personal, support and other payments'), working: debts.map((d) => lw(d, cur)).join(' + '), result: m(other) },
    { label: msg('Total monthly debts'), formula: msg('total = housing + other debts'), working: `${lw(i.housing, cur)} + ${m(other)}`, result: m(r.totalDebts) },
    { label: names.front, ...(names.front === 'Front-end DTI' ? { formula: msg('front-end = housing / gross monthly income') } : sayFormula(msg('{name} = housing / gross monthly income'), { name: names.front })), working: `${lw(i.housing, cur)} / ${m(monthly)}`, result: loanPct(r.frontEnd, 1) },
    { label: names.back, ...(names.back === 'Back-end DTI' ? { formula: msg('back-end = (housing + other debts) / gross monthly income') } : sayFormula(msg('{name} = (housing + other debts) / gross monthly income'), { name: names.back })), working: `${m(r.totalDebts)} / ${m(monthly)}`, result: loanPct(r.backEnd, 1) },
  ];
}

/** Month N of a payment plan as a step date ("Feb 2029" in US English, as formatPaymentDate prints it). */
const paymentMonth = (start: { year: number; month: number }, n: number) => {
  const d = paymentDate(start.year, start.month, n);
  return stepDate(`${d.year}-${String(d.month).padStart(2, '0')}-01`, { month: 'short', year: 'numeric' });
};
/** formatDuration() (loans.ts, "2 years 4 months") as a message for t(). */
export function monthsDurationMsg(total: number): StepMsg {
  const years = Math.floor(total / 12);
  const months = total % 12;
  if (years && months) return stepMsg(years === 1 ? (msg.plural(months, { one: '{years} year {months} month', other: '{years} year {months} months' }, 'months')) : msg.plural(months, { one: '{years} years {months} month', other: '{years} years {months} months' }, 'months'), { years, months });
  if (years) return stepMsg(msg.plural(years, { one: '{years} year', other: '{years} years' }), { years });
  return stepMsg(msg.plural(months, { one: '{months} month', other: '{months} months' }), { months });
}

/** Debt payoff simulation (avalanche, snowball or minimums). Last step: the debt-free date as the headline shows it. */
export function debtPayoffSteps(debts: Debt[], budget: number, strategy: PayoffStrategy, start: { year: number; month: number }, cur = 'USD', rateBasis: RateBasis = 'nominal'): ReportStep[] {
  const named = debts.map((d, k) => ({ ...d, name: d.name.trim() || `Debt ${k + 1}` }));
  const active = named.filter((d) => d.balance > 0);
  if (!active.length) return [];
  const r = simulatePayoff(named, budget, strategy, rateBasis);
  const m = (v: number) => loanMoney(v, cur);
  const total = active.reduce((t, d) => t + d.balance, 0);
  const mins = active.reduce((t, d) => t + (Number.isFinite(d.minPayment) ? d.minPayment : 0), 0);
  const effective = rateBasis === 'effective';
  const firstInterest = active.reduce((t, d) => t + (effective ? d.balance * monthlyRate(d.aprPct, rateBasis) : (d.balance * d.aprPct) / 1200), 0);
  const steps: ReportStep[] = [
    { label: msg('Debt today'), formula: msg('total = Σ balances'), working: active.map((d) => lw(d.balance, cur)).join(' + '), result: m(total) },
    effective
      ? {
          label: msg('First month of interest'),
          formula: msg('interest = balance × ((1 + APR)^(1/12) − 1) for each debt (APR as an annual equivalent rate)'),
          working: active.map((d) => `${lw(d.balance, cur)} × ${plain(monthlyRate(d.aprPct, rateBasis) * 100)}%`).join(' + '),
          result: m(firstInterest),
        }
      : {
          label: msg('First month of interest'),
          formula: msg('interest = balance × APR / 12 for each debt'),
          working: active.map((d) => `${lw(d.balance, cur)} × ${plain(d.aprPct)}% / 12`).join(' + '),
          result: m(firstInterest),
        },
    strategy === 'minimum'
      ? { label: msg('Payments'), formula: msg('each debt gets its own minimum and nothing else'), working: active.map((d) => lw(d.minPayment, cur)).join(' + '), ...said(msg('{amount} a month'), { amount: m(mins) }) }
      : {
          label: msg('Extra above the minimums'),
          formula: strategy === 'avalanche' ? msg('extra = budget − Σ minimums, sent to the highest APR first') : msg('extra = budget − Σ minimums, sent to the smallest balance first'),
          working: `${lw(budget, cur)} − ${m(mins)}`,
          ...said(msg('{amount} a month'), { amount: m(budget - mins) }),
        },
    {
      label: msg('Payoff order'),
      formula: msg('month each balance reaches zero, freed payments roll to the next debt'),
      ...(r.order.length ? said('{order}', { order: stepList(r.order.map((o) => [msg('{name} (month {month})'), { name: o.name, month: o.month }])) }) : said(msg('none paid off'))),
    },
    { label: msg('Total interest'), formula: msg('Σ monthly interest until every balance is zero'), ...(r.months === null ? sayWorking(msg('stopped at {PAYOFF_MONTH_CAP} months'), { PAYOFF_MONTH_CAP }) : sayWorking(msg('{months} months simulated'), { months: r.months })), result: m(r.totalInterest) },
    r.months === null
      ? { label: msg('Debt-free date'), formula: msg('a minimum payment does not cover its interest'), ...sayWorking(msg('still owing after {PAYOFF_MONTH_CAP} months: {value}'), { PAYOFF_MONTH_CAP, value: stepList(r.stuck.map((name) => ['{name}', { name }])) }), ...said(msg('Not within 50 years')) }
      : {
          label: msg('Debt-free date'),
          formula: msg('date of payment number N, counting from the first payment'),
          ...sayWorking(msg('N = {months} ({months2}) from {year}'), { months: r.months, months2: { stepMsg: monthsDurationMsg(r.months) }, year: paymentMonth(start, 1) }),
          ...said('{date}', { date: paymentMonth(start, r.months) }),
        },
  ];
  return steps;
}

// ---------------------------------------------------------------------------
// Business
// ---------------------------------------------------------------------------

export interface BreakEvenStepsInput {
  fixedCosts: number;
  pricePerUnit: number;
  variableCostPerUnit: number;
  /** As entered: after tax when taxRatePct > 0. */
  targetProfit?: number;
  taxRatePct?: number;
}

/** Cost-volume-profit break-even. Last step: break-even revenue, or units for the target profit when one is set. */
export function breakEvenSteps(i: BreakEvenStepsInput, cur = 'USD'): ReportStep[] {
  const tax = i.taxRatePct ?? 0;
  const pretax = i.targetProfit === undefined || !Number.isFinite(i.targetProfit) ? undefined : tax > 0 ? preTaxTarget(i.targetProfit, tax) : i.targetProfit;
  const res = breakEven({ fixedCosts: i.fixedCosts, pricePerUnit: i.pricePerUnit, variableCostPerUnit: i.variableCostPerUnit, targetProfit: pretax });
  if (!res.ok) return [];
  const r = res.value;
  const money = bizMoney(cur);
  const w = bizMoneyW(cur);
  const steps: ReportStep[] = [
    { label: msg('Contribution margin per unit'), formula: msg('CM = price − variable cost'), working: `${w(i.pricePerUnit)} − ${w(i.variableCostPerUnit)}`, result: money(r.contributionPerUnit) },
    { label: msg('Contribution margin ratio'), formula: msg('CMR = CM / price'), working: `${money(r.contributionPerUnit)} / ${w(i.pricePerUnit)}`, result: bizPct(r.contributionRatio) },
    { label: msg('Break-even units'), formula: msg('units = fixed costs / CM, rounded up to whole units'), working: `${w(i.fixedCosts)} / ${money(r.contributionPerUnit)} = ${bizNum(r.breakEvenUnits)}`, ...said(msg('{n} units'), { n: bizNum(r.breakEvenUnitsWhole, 0) }) },
    { label: msg('Break-even revenue'), formula: msg('revenue = fixed costs / CMR'), working: `${w(i.fixedCosts)} / ${bizPct(r.contributionRatio)}`, result: money(r.breakEvenRevenue) },
  ];
  if (r.targetUnits !== null && pretax !== undefined) {
    if (tax > 0) steps.push({ label: msg('Pre-tax profit needed'), formula: msg('pre-tax = after-tax target / (1 − tax rate)'), working: `${w(i.targetProfit!)} / (1 − ${plain(tax)}%)`, result: money(pretax) });
    steps.push({ label: msg('Units for the target profit'), formula: msg('units = (fixed costs + target) / CM, rounded up'), working: `(${w(i.fixedCosts)} + ${money(pretax)}) / ${money(r.contributionPerUnit)} = ${bizNum(r.targetUnits)}`, ...said(msg('{n} units'), { n: bizNum(r.targetUnitsWhole, 0) }) });
  }
  return steps;
}

/** Margin and markup from any two known values. Last step: gross margin, as the first result tile. */
export function marginMarkupSteps(known: MarginInputs, cur = 'USD'): ReportStep[] {
  const res = solveMarginMarkup(known);
  if (!res.ok) return [];
  const r = res.value;
  const money = bizMoney(cur);
  const w = bizMoneyW(cur);
  const keys = (Object.keys(known) as MarginField[]).filter((k) => Number.isFinite(known[k]));
  const has = (f: MarginField) => keys.includes(f);
  const v = (f: MarginField) => (f === 'margin' || f === 'markup' ? `${plain(known[f]!)}%` : w(known[f]!));
  const steps: ReportStep[] = [];
  const solveLine: Record<string, [string, string, string]> = {
    'cost-margin': [msg('Selling price'), msg('price = cost / (1 − margin)'), `${v('cost')} / (1 − ${v('margin')})`],
    'cost-markup': [msg('Selling price'), msg('price = cost × (1 + markup)'), `${v('cost')} × (1 + ${v('markup')})`],
    'cost-profit': [msg('Selling price'), msg('price = cost + profit'), `${v('cost')} + ${v('profit')}`],
    'margin-price': [msg('Cost'), msg('cost = price × (1 − margin)'), `${v('price')} × (1 − ${v('margin')})`],
    'markup-price': [msg('Cost'), msg('cost = price / (1 + markup)'), `${v('price')} / (1 + ${v('markup')})`],
    'price-profit': [msg('Cost'), msg('cost = price − profit'), `${v('price')} − ${v('profit')}`],
    'margin-profit': [msg('Selling price'), msg('price = profit / margin'), `${v('profit')} / ${v('margin')}`],
    'markup-profit': [msg('Cost'), msg('cost = profit / markup'), `${v('profit')} / ${v('markup')}`],
  };
  const pair = [...keys].sort().join('-');
  const line = solveLine[pair];
  if (line) steps.push({ label: line[0], formula: line[1], working: line[2], result: money(line[0] === 'Cost' ? r.cost : r.price) });
  if (pair === 'margin-profit') steps.push({ label: msg('Cost'), formula: msg('cost = price − profit'), working: `${money(r.price)} − ${v('profit')}`, result: money(r.cost) });
  if (pair === 'markup-profit') steps.push({ label: msg('Selling price'), formula: msg('price = cost + profit'), working: `${money(r.cost)} + ${v('profit')}`, result: money(r.price) });
  const c = has('cost') ? v('cost') : money(r.cost);
  const p = has('price') ? v('price') : money(r.price);
  steps.push(
    { label: msg('Profit per unit'), formula: msg('profit = price − cost'), working: `${p} − ${c}`, result: money(r.profit) },
    { label: msg('Markup'), formula: msg('markup = profit / cost'), working: `${money(r.profit)} / ${c}`, result: bizPct(r.markup) },
    { label: msg('Gross margin'), formula: msg('margin = profit / price'), working: `${money(r.profit)} / ${p}`, result: bizPct(r.margin) },
  );
  return steps;
}

/** One fiscal year of a schedule as a working line. */
function depYearStep(i: DepreciationInputs, row: { year: number; beginningBookValue: number; depreciation: number; rate: number | null; note?: string }, money: (x: number) => string, w: (x: number) => string, units?: number): ReportStep {
  const f = (i.firstYearMonths ?? 12) / 12;
  const label = row.note ? sayLabel(msg('Year {year} depreciation ({note})'), { year: row.year, note: row.note.toLowerCase() }) : sayLabel(msg('Year {year} depreciation'), { year: row.year });
  const base = i.cost - i.salvage;
  const part = row.year === 1 && f < 1 ? ` × ${i.firstYearMonths}/12` : '';
  switch (i.method) {
    case 'straight-line':
      return { ...label, formula: msg('D = (cost − salvage) / life'), working: `(${w(i.cost)} − ${w(i.salvage)}) / ${i.life}${part}`, result: money(row.depreciation) };
    case 'sum-of-years': {
      const syd = (i.life * (i.life + 1)) / 2;
      if (f >= 1) return { ...label, formula: msg('D = (cost − salvage) × remaining life / SYD'), working: `${money(base)} × ${i.life - row.year + 1}/${syd}`, result: money(row.depreciation) };
      return { ...label, formula: msg('D = (cost − salvage) × remaining life / SYD, split across fiscal years'), ...(row.year === 1 ? { working: `${money(base)} × ${i.life}/${syd}${part}` } : sayWorking(msg('part of two asset years'))), result: money(row.depreciation) };
    }
    case 'units-of-production':
      return { ...label, formula: msg('D = units used × (cost − salvage) / total units'), working: `${bizNum(units ?? 0, 0)} × ${money(base)} / ${bizNum(i.totalUnits ?? 0, 0)}`, result: money(row.depreciation) };
    case 'macrs': {
      const p = MACRS_HALF_YEAR[i.macrsClass!][row.year - 1];
      return { ...label, formula: msg('D = basis × IRS Table A-1 percentage'), working: `${w(i.cost)} × ${p}%`, result: money(row.depreciation) };
    }
    case 'tax-pool': {
      const fy = i.poolFirstYear ?? 'full';
      if (row.year === 1 && fy === 'allowance') return { ...label, formula: msg('allowance = cost × first-year allowance %'), working: `${w(i.cost)} × ${plain(i.firstYearAllowancePct ?? 0)}%`, result: money(row.depreciation) };
      const r = plain(i.poolRatePct ?? 0);
      const adj = row.year > 1 || fy === 'full' ? '' : fy === 'half' ? ' × 1/2' : fy === 'enhanced' ? ' × 1.5' : ` × ${i.firstYearMonths ?? 12}/12`;
      return { ...label, formula: msg('D = opening pool balance × rate'), working: `${money(row.beginningBookValue)} × ${r}%${adj}`, result: money(row.depreciation) };
    }
    default: {
      const factor = i.method === 'double-declining' ? 2 : i.factor ?? 2;
      const rate = (factor / i.life) * 100;
      if (row.rate === null) return { ...label, formula: msg('D = (book value − salvage) / remaining life'), ...sayWorking(msg('{beginningBookValue} − {salvage} over the remaining life'), { beginningBookValue: money(row.beginningBookValue), salvage: w(i.salvage) }), result: money(row.depreciation) };
      const plainD = (row.beginningBookValue * rate) / 100 * (row.year === 1 ? f : 1);
      const capped = Math.abs(plainD - row.depreciation) > 0.005;
      return {
        ...label,
        formula: capped ? msg('D = book value − salvage (never below salvage)') : msg('D = opening book value × rate'),
        working: capped ? `${money(row.beginningBookValue)} − ${w(i.salvage)}` : `${money(row.beginningBookValue)} × ${bizPct(rate)}${part}`,
        result: money(row.depreciation),
      };
    }
  }
}

/** Depreciation schedule (straight-line, declining balance, SYD, units of production or MACRS). Last step: final book value. */
export function depreciationSteps(i: DepreciationInputs, cur = 'USD'): ReportStep[] {
  const res = depreciationSchedule(i);
  if (!res.ok) return [];
  const { rows, depreciableBase, totalDepreciation } = res.value;
  const money = bizMoney(cur);
  const w = bizMoneyW(cur);
  const steps: ReportStep[] = [];
  if (i.method === 'macrs') {
    steps.push({ label: msg('Depreciable basis'), formula: msg('MACRS ignores salvage'), working: w(i.cost), result: money(depreciableBase) });
  } else if (i.method === 'tax-pool') {
    steps.push({ label: msg('Pool addition'), formula: msg('tax pools ignore salvage; the full cost goes in'), working: w(i.cost), result: money(depreciableBase) });
  } else {
    steps.push({ label: msg('Depreciable base'), formula: msg('base = cost − salvage'), working: `${w(i.cost)} − ${w(i.salvage)}`, result: money(depreciableBase) });
  }
  if (i.method === 'double-declining' || i.method === 'declining-balance') {
    const factor = i.method === 'double-declining' ? 2 : i.factor ?? 2;
    steps.push({ label: msg('Declining-balance rate'), formula: msg('rate = factor / life'), working: `${plain(factor)} / ${i.life}`, ...said(msg('{rate} of opening book value'), { rate: bizPct((factor / i.life) * 100) }) });
  } else if (i.method === 'sum-of-years') {
    steps.push({ label: msg('Sum of the years’ digits'), formula: msg('SYD = n(n + 1) / 2'), working: `${i.life} × ${i.life + 1} / 2`, result: String((i.life * (i.life + 1)) / 2) });
  } else if (i.method === 'units-of-production') {
    steps.push({ label: msg('Rate per unit'), formula: msg('rate = (cost − salvage) / total units'), working: `${money(depreciableBase)} / ${bizNum(i.totalUnits ?? 0, 0)}`, ...said(msg('{amount} per unit'), { amount: bizNum(depreciableBase / (i.totalUnits ?? 1), 6) }) });
  }
  rows.slice(0, 2).forEach((row) => steps.push(depYearStep(i, row, money, w, i.unitsPerYear?.[row.year - 1])));
  const last = rows[rows.length - 1];
  steps.push(
    { label: msg('Total depreciation'), ...sayFormula(msg('Σ yearly depreciation over {length} fiscal years'), { length: rows.length }), working: rows.length > 6 ? `${money(rows[0].depreciation)} + … + ${money(last.depreciation)}` : rows.map((r) => money(r.depreciation)).join(' + '), result: money(totalDepreciation) },
    i.method === 'tax-pool'
      ? { label: msg('Closing written-down value'), formula: msg('pool balance = cost − allowances claimed'), working: `${w(i.cost)} − ${money(last.accumulated)}`, result: money(last.endingBookValue) }
      : { label: msg('Final book value'), formula: msg('book value = cost − accumulated depreciation'), working: `${w(i.cost)} − ${money(last.accumulated)}`, result: money(last.endingBookValue) },
  );
  return steps;
}

export interface CommissionStepsInput {
  plan: 'flat' | 'tiered' | 'draw';
  sales: number;
  ratePct: number;
  base: number;
  tiers: CommissionTier[];
  tierType: 'marginal' | 'whole';
  draw: number;
  periods: number[];
  recoverable: boolean;
}

/** Commission on a flat, tiered or draw plan. Last step: total pay (flat and tiered) or total paid (draw). */
export function commissionSteps(i: CommissionStepsInput, cur = 'USD'): ReportStep[] {
  const money = bizMoney(cur);
  const w = bizMoneyW(cur);
  if (i.plan === 'draw') {
    if (!i.periods.length || !Number.isFinite(i.draw) || !Number.isFinite(i.ratePct)) return [];
    const earned = i.periods.map((s) => flatCommission(s, i.ratePct));
    const rows = drawSchedule(earned, i.draw, i.recoverable);
    const steps: ReportStep[] = [
      { label: msg('Commission earned each period'), formula: msg('commission = period sales × rate'), working: i.periods.slice(0, 6).map((s) => `${w(s)} × ${plain(i.ratePct)}%`).join(', ') + (i.periods.length > 6 ? ', …' : ''), result: earned.slice(0, 6).map((e) => money(e)).join(', ') + (earned.length > 6 ? ', …' : '') },
    ];
    for (const r of rows.slice(0, 5)) {
      steps.push({
        ...sayLabel(msg('Period {period} pay'), { period: r.period }),
        formula: i.recoverable ? msg('pay = max(draw, commission − amount owed)') : msg('pay = max(draw, commission)'),
        working: i.recoverable ? `max(${w(i.draw)}, ${money(r.earned)} − ${money(r.carriedIn)})` : `max(${w(i.draw)}, ${money(r.earned)})`,
        ...(i.recoverable && r.carriedOut > 0 ? said(msg('{pay}, {owed} owed'), { pay: money(r.payout), owed: money(r.carriedOut) }) : { result: money(r.payout) }),
      });
    }
    const paid = rows.reduce((a, r) => a + r.payout, 0);
    steps.push({ label: msg('Total paid'), formula: msg('Σ pay over all periods'), ...(rows.length > 6 ? sayWorking(msg('{length} periods'), { length: rows.length }) : { working: rows.map((r) => money(r.payout)).join(' + ') }), result: money(paid) });
    return steps;
  }
  if (!Number.isFinite(i.sales) || i.sales < 0 || !Number.isFinite(i.base)) return [];
  const steps: ReportStep[] = [];
  let commission: number;
  if (i.plan === 'flat') {
    if (!Number.isFinite(i.ratePct)) return [];
    commission = flatCommission(i.sales, i.ratePct);
    steps.push({ label: msg('Commission'), formula: msg('commission = sales × rate'), working: `${w(i.sales)} × ${plain(i.ratePct)}%`, result: money(commission) });
  } else if (i.tierType === 'whole') {
    const t = tieredWholeAmount(i.sales, i.tiers);
    commission = t.total;
    const up = i.tiers[t.tierIndex].upTo;
    steps.push(
      { label: msg('Tier reached'), formula: msg('the tier the total sales fall in sets the rate for every dollar'), ...(up === null ? sayWorking(msg('{sales} is in tier {tier} (no upper limit)'), { sales: w(i.sales), tier: t.tierIndex + 1 }) : sayWorking(msg('{sales} is in tier {tier} (up to {upper})'), { sales: w(i.sales), tier: t.tierIndex + 1, upper: w(up) })), result: `${bizPct(t.rate)}` },
      { label: msg('Commission'), formula: msg('commission = sales × tier rate'), working: `${w(i.sales)} × ${plain(t.rate)}%`, result: money(commission) },
    );
  } else {
    const t = tieredMarginal(i.sales, i.tiers);
    commission = t.total;
    t.slices.slice(0, 5).forEach((s, k) => steps.push({ ...sayLabel(msg('Tier {value} slice'), { value: k + 1 }), formula: msg('slice commission = (slice top − slice bottom) × tier rate'), working: `(${w(s.to)} − ${w(s.from)}) × ${plain(s.rate)}%`, result: money(s.commission) }));
    steps.push({ label: msg('Commission'), formula: msg('commission = Σ slice commissions'), working: t.slices.map((s) => money(s.commission)).join(' + '), result: money(commission) });
  }
  steps.push(
    { label: msg('Effective rate'), formula: msg('effective rate = commission / sales'), ...(i.sales > 0 ? { working: `${money(commission)} / ${w(i.sales)}` } : sayWorking(msg('no sales'))), result: i.sales > 0 ? bizPct((commission / i.sales) * 100) : 'n/a' },
    { label: msg('Total pay'), formula: msg('total = base salary + commission'), working: `${w(i.base)} + ${money(commission)}`, result: money(i.base + commission) },
  );
  return steps;
}

// ---------------------------------------------------------------------------
// Investments (invest-a kit)
// ---------------------------------------------------------------------------

/** Whole years and months, as the CAGR page prints a period. */
export function fmtYears(y: number): string {
  if (!Number.isFinite(y)) return '–';
  const { years, months } = splitYearsMonths(y);
  return `${years} yr${years === 1 ? '' : 's'}${months ? ` ${months} mo` : ''}`;
}
/** fmtYears() as a message for t(). */
function fmtYearsMsg(y: number) {
  if (!Number.isFinite(y)) return { result: '–' };
  const { years, months } = splitYearsMonths(y);
  const text = months
    ? (years === 1 ? msg('{years} yr {months} mo') : msg('{years} yrs {months} mo'))
    : (years === 1 ? msg('{years} yr') : msg('{years} yrs'));
  return said(text, { years, months });
}

/** CAGR, end value or time needed. Last step: the headline (CAGR to 2 dp, end value, or time). */
export function cagrSteps(i: { mode: 'rate' | 'end' | 'years'; start: number; end: number; years: number; ratePct: number }, cur = 'USD'): ReportStep[] {
  const money = (v: number) => fmtMoney(v, cur);
  if (i.mode === 'rate') {
    const g = cagr(i.start, i.end, i.years);
    if (!Number.isFinite(g)) return [];
    return [
      { label: msg('Growth multiple'), formula: msg('End / Start'), working: `${aw(i.end, cur)} / ${aw(i.start, cur)}`, result: `${fmtNumber(i.end / i.start, 6)}×` },
      { label: msg('Period'), formula: msg('t in years'), ...sayWorking(msg('{years} years'), { years: plain(i.years, 4) }), ...said(msg('{n} years'), { n: fmtNumber(i.years, 4) }) },
      { label: msg('CAGR'), formula: msg('CAGR = (End / Start)^(1 / t) − 1'), working: `${fmtNumber(i.end / i.start, 6)}^(1 / ${plain(i.years, 4)}) − 1`, result: fmtPct(g, 2) },
    ];
  }
  if (i.mode === 'end') {
    const endV = cagrEndValue(i.start, i.ratePct, i.years);
    if (!Number.isFinite(endV)) return [];
    const factor = Math.pow(1 + i.ratePct / 100, i.years);
    return [
      { label: msg('Growth factor'), formula: msg('(1 + CAGR)^t'), working: `(1 + ${plain(i.ratePct)}%)^${plain(i.years, 4)}`, result: fmtNumber(factor, 6) },
      { label: msg('Ending value'), formula: msg('End = Start × (1 + CAGR)^t'), working: `${aw(i.start, cur)} × ${fmtNumber(factor, 6)}`, result: money(endV) },
    ];
  }
  const yrs = cagrYears(i.start, i.end, i.ratePct);
  if (!Number.isFinite(yrs)) return [];
  return [
    { label: msg('Growth multiple'), formula: msg('End / Start'), working: `${aw(i.end, cur)} / ${aw(i.start, cur)}`, result: `${fmtNumber(i.end / i.start, 6)}×` },
    { label: msg('Years needed'), formula: msg('t = ln(End / Start) / ln(1 + CAGR)'), working: `ln(${fmtNumber(i.end / i.start, 6)}) / ln(1 + ${plain(i.ratePct)}%)`, ...said(msg('{n} years'), { n: fmtNumber(yrs, 4) }) },
    { label: msg('Time needed'), formula: msg('whole years and months'), ...sayWorking(msg('{yrs} years'), { yrs: fmtNumber(yrs, 4) }), ...fmtYearsMsg(yrs) },
  ];
}

/** Inflation by CPI-U history or an assumed rate. Last step: the headline value. */
export function inflationSteps(
  i: { mode: 'cpi' | 'rate'; amount: number; fromYear: number; toYear: number; ratePct: number; years: number; forward: boolean },
  cur = 'USD',
): ReportStep[] {
  if (i.mode === 'cpi') {
    const r = cpiAdjust(i.amount, i.fromYear, i.toYear);
    if (!r) return [];
    const money = (v: number) => fmtMoney(v, 'USD');
    const years = Math.abs(i.toYear - i.fromYear);
    return [
      { label: msg('CPI-U annual averages (BLS)'), formula: msg('look up CPI for both years (1982-84 = 100)'), working: `CPI(${i.fromYear}) = ${r.cpiFrom}, CPI(${i.toYear}) = ${r.cpiTo}`, ...said(msg('ratio {value}'), { value: fmtNumber(r.cpiTo / r.cpiFrom, 6) }) },
      { label: msg('Cumulative price change'), formula: msg('change = CPI(to) / CPI(from) − 1'), working: `${r.cpiTo} / ${r.cpiFrom} − 1`, result: `${fmtNumber(r.cumulativePct)}%` },
      { label: msg('Average per year'), formula: msg('average = (CPI ratio)^(1 / years) − 1'), ...(years ? { working: `(${fmtNumber(Math.max(r.cpiTo, r.cpiFrom) / Math.min(r.cpiTo, r.cpiFrom), 6)})^(1 / ${years}) − 1` } : sayWorking(msg('same year'))), result: `${fmtNumber(r.averageAnnualPct)}%` },
      { ...sayLabel(msg('Value in {toYear}'), { toYear: i.toYear }), formula: msg('value = amount × CPI(to) / CPI(from)'), working: `${aw(i.amount, 'USD')} × ${r.cpiTo} / ${r.cpiFrom}`, ...said(msg('{amount} in {year}'), { amount: money(r.value), year: i.toYear }) },
    ];
  }
  const factor = Math.pow(1 + i.ratePct / 100, i.years);
  const value = i.forward ? inflateForward(i.amount, i.ratePct, i.years) : deflateBack(i.amount, i.ratePct, i.years);
  if (!Number.isFinite(value)) return [];
  return [
    { label: msg('Price factor'), formula: '(1 + r)^t', working: `(1 + ${plain(i.ratePct)}%)^${plain(i.years)}`, result: fmtNumber(factor, 6) },
    i.forward
      ? { label: msg('Future cost'), formula: msg('future cost = amount × (1 + r)^t'), working: `${aw(i.amount, cur)} × ${fmtNumber(factor, 6)}`, result: fmtMoney(value, cur) }
      : { label: msg('Value in today’s money'), formula: msg('today’s value = amount / (1 + r)^t'), working: `${aw(i.amount, cur)} / ${fmtNumber(factor, 6)}`, result: fmtMoney(value, cur) },
  ];
}

/** NPV and IRR of a cash-flow series. Last step: the IRR(s) as the IRR tile shows them. */
/** Labels for the period nouns the pages pass (one message each, so the noun is translated with its sentence); other nouns fill {noun}. */
const NPV_RATE_LABEL: Record<string, string> = { year: msg('Discount rate per year'), quarter: msg('Discount rate per quarter'), month: msg('Discount rate per month') };
const SAVINGS_RATE_LABEL: Record<string, string> = {
  week: msg('Rate per week'), 'two weeks': msg('Rate per two weeks'), month: msg('Rate per month'), quarter: msg('Rate per quarter'), year: msg('Rate per year'), 'deposit period': msg('Rate per deposit period'),
};
const SAVINGS_DEPOSIT_LABEL: Record<string, string> = {
  week: msg('Deposit each week'), 'two weeks': msg('Deposit each two weeks'), month: msg('Deposit each month'), quarter: msg('Deposit each quarter'), year: msg('Deposit each year'), period: msg('Deposit each period'),
};
const nounLabel = (known: Record<string, string>, template: string, noun: string) => (known[noun] ? { label: known[noun] } : sayLabel(template, { noun }));

export function npvIrrSteps(i: { flows: number[]; rateAnnual: number; periodsPerYear: number; noun?: string }, cur = 'USD'): ReportStep[] {
  if (i.flows.length < 2 || !(i.rateAnnual > -1)) return [];
  const money = (v: number) => fmtMoney(v, cur);
  const noun = i.noun ?? 'year';
  const r = annualToPeriodRate(i.rateAnnual, i.periodsPerYear);
  const value = npv(r, i.flows);
  const irr = irrAll(i.flows);
  const shown = i.flows.slice(0, 4).map((cf, t) => (t === 0 ? aw(cf, cur) : `${aw(cf, cur)} / ${fmtNumber(1 + r, 4)}^${t}`)).join(' + ') + (i.flows.length > 4 ? ' + …' : '');
  const pvs = i.flows.map((cf, t) => cf / Math.pow(1 + r, t));
  return [
    i.periodsPerYear === 1
      ? { label: msg('Discount rate per year'), formula: msg('r = annual rate'), working: `${plain(i.rateAnnual * 100)}%`, result: fmtPct(r, 4) }
      : { ...nounLabel(NPV_RATE_LABEL, msg('Discount rate per {noun}'), noun), formula: msg('r = (1 + annual rate)^(1 / periods a year) − 1'), working: `(1 + ${plain(i.rateAnnual * 100)}%)^(1 / ${i.periodsPerYear}) − 1`, result: fmtPct(r, 4) },
    { label: msg('Present value of each flow'), formula: 'PVₜ = CFₜ / (1 + r)ᵗ, t = 0 … n', working: shown, result: pvs.slice(0, 4).map(money).join(', ') + (pvs.length > 4 ? ', …' : '') },
    { label: msg('Net present value'), formula: msg('NPV = Σ PVₜ'), ...sayWorking(msg('{length} flows, t = 0 to {value}'), { length: i.flows.length, value: i.flows.length - 1 }), result: money(value) },
    {
      label: msg('Internal rate of return'),
      formula: msg('IRR: the r where NPV = 0 (scan −99% to 10,000% for sign changes, refine each with Newton steps)'),
      ...(irr.rates.length ? { working: irr.rates.map((x) => `NPV(${fmtPct(x, 4)}) = ${money(npv(x, i.flows))}`).join('; ') } : sayWorking(msg('NPV never crosses zero'))),
      ...(irr.rates.length ? { result: irr.rates.map((x) => fmtPct(x)).join(' / ') } : said(msg('None'))),
    },
  ];
}

const PERIODIC_RATE = (comp: Compounding, ppy: number) => (comp === 'continuous' ? `i = e^(r / ${ppy}) − 1` : `i = (1 + r / ${comp})^(${comp} / ${ppy}) − 1`);

/** Future or present value of a lump sum plus a payment series. Last step: the total, as the headline. */
export function presentFutureValueSteps(i: { solve: 'fv' | 'pv'; lump: number; tvm: TvmInput }, cur = 'USD'): ReportStep[] {
  const t = i.tvm;
  if (!(t.years > 0)) return [];
  const isFv = i.solve === 'fv';
  const r = isFv ? futureValue(i.lump, t) : presentValue(i.lump, t);
  if (!Number.isFinite(r.total)) return [];
  const money = (v: number) => fmtMoney(v, cur);
  const due = t.timing === 'start' ? ' × (1 + i)' : '';
  return [
    { label: msg('Rate per payment period'), formula: PERIODIC_RATE(t.compounding, t.paymentsPerYear), working: t.compounding === 'continuous' ? `e^(${plain(t.annualRatePct)}% / ${t.paymentsPerYear}) − 1` : `(1 + ${plain(t.annualRatePct)}% / ${t.compounding})^(${t.compounding} / ${t.paymentsPerYear}) − 1`, result: fmtPct(r.i, 5) },
    { label: msg('Number of periods'), formula: msg('n = years × payments a year'), working: `${plain(t.years)} × ${t.paymentsPerYear}`, result: fmtNumber(r.n, Number.isInteger(r.n) ? 0 : 2) },
    { label: msg('Growth factor'), formula: '(1 + i)^n', working: `(1 + ${fmtPct(r.i, 5)})^${fmtNumber(r.n, Number.isInteger(r.n) ? 0 : 2)}`, result: fmtNumber(r.growth, 6) },
    isFv
      ? { label: msg('Lump sum part'), formula: 'PV × (1 + i)^n', working: `${aw(i.lump, cur)} × ${fmtNumber(r.growth, 6)}`, result: money(r.lump) }
      : { label: msg('Lump sum part'), formula: 'FV / (1 + i)^n', working: `${aw(i.lump, cur)} / ${fmtNumber(r.growth, 6)}`, result: money(r.lump) },
    {
      label: msg('Payment part'),
      formula: isFv ? `PMT × ((1 + i)^n − 1) / i${due}` : `PMT × (1 − (1 + i)^−n) / i${due}`,
      working: `${aw(t.payment, cur)} × ${fmtNumber(t.payment ? r.series / t.payment : 0, 6)}`,
      result: money(r.series),
    },
    { label: isFv ? msg('Future value') : msg('Present value'), formula: msg('total = lump sum part + payment part'), working: `${money(r.lump)} + ${money(r.series)}`, result: money(r.total) },
  ];
}

/** ROI and annualized ROI. Last step: annualized ROI as its tile shows it. */
export function roiSteps(i: { invested: number; returned: number; costs: number; income: number; years: number }, cur = 'USD'): ReportStep[] {
  const r = computeRoi(i);
  if (!r) return [];
  const money = (v: number) => fmtMoney(v, cur);
  return [
    { label: msg('Total cost'), formula: msg('cost = invested + costs and fees'), working: `${aw(i.invested, cur)} + ${aw(i.costs, cur)}`, result: money(r.totalCost) },
    { label: msg('Total received'), formula: msg('received = sale value + income'), working: `${aw(i.returned, cur)} + ${aw(i.income, cur)}`, result: money(r.totalBack) },
    { label: msg('Net gain'), formula: msg('gain = received − cost'), working: `${money(r.totalBack)} − ${money(r.totalCost)}`, result: money(r.netGain) },
    { label: msg('Total ROI'), formula: msg('ROI = gain / cost'), working: `${money(r.netGain)} / ${money(r.totalCost)}`, result: fmtPct(r.roi) },
    { label: msg('Annualized ROI'), formula: msg('annualized = (1 + ROI)^(1 / years) − 1'), working: `(1 + ${fmtPct(r.roi, 3)})^(1 / ${fmtNumber(i.years, 4)}) − 1`, result: fmtPct(r.annualized) },
  ];
}

/** "2 years 6 months", as the savings goal page describes a number of deposits. */
export function describeDuration(periods: number, perYear: number): string {
  if (periods === 0) return 'Already reached';
  const { years, months } = splitYearsMonths(periods / perYear);
  const parts: string[] = [];
  if (years) parts.push(`${years} year${years === 1 ? '' : 's'}`);
  if (months) parts.push(`${months} month${months === 1 ? '' : 's'}`);
  return parts.length ? parts.join(' ') : 'less than a month';
}
/** describeDuration() as a message for t(). */
export function describeDurationMsg(periods: number, perYear: number) {
  if (periods === 0) return said(msg('Already reached'));
  const { years, months } = splitYearsMonths(periods / perYear);
  const Y = years === 1 ? 'one' : 'other';
  const M = months === 1 ? 'one' : 'other';
  const both: Record<string, string> = {
    'one-one': msg('{years} year {months} month'), 'one-other': msg('{years} year {months} months'),
    'other-one': msg('{years} years {months} month'), 'other-other': msg('{years} years {months} months'),
  };
  if (years && months) return said(both[`${Y}-${M}`], { years, months });
  if (years) return said(Y === 'one' ? msg('{years} year') : msg('{years} years'), { years });
  if (months) return said(M === 'one' ? msg('{months} month') : msg('{months} months'), { months });
  return said(msg('less than a month'));
}

/** Savings goal: deposit needed, time to goal or final balance. Last step: the headline value. */
export function savingsGoalSteps(i: { mode: 'deposit' | 'time' | 'balance'; input: SavingsInput; years: number; deposit: number; noun?: string }, cur = 'USD'): ReportStep[] {
  const inp = i.input;
  const ppy = inp.depositsPerYear;
  const money = (v: number) => fmtMoney(v, cur);
  const rate = ratePerPaymentPeriod(inp.annualRatePct, inp.compounding, ppy);
  const a = inp.timing === 'start' ? ' × (1 + i)' : '';
  const rateStep: ReportStep = {
    ...nounLabel(SAVINGS_RATE_LABEL, msg('Rate per {noun}'), i.noun ?? 'deposit period'),
    formula: PERIODIC_RATE(inp.compounding, ppy),
    working: inp.compounding === 'continuous' ? `e^(${plain(inp.annualRatePct)}% / ${ppy}) − 1` : `(1 + ${plain(inp.annualRatePct)}% / ${inp.compounding})^(${inp.compounding} / ${ppy}) − 1`,
    result: fmtPct(rate, 4),
  };
  if (i.mode === 'time') {
    const t = periodsToGoal(inp, i.deposit);
    if (!Number.isFinite(t.periods)) return [];
    const ai = inp.timing === 'start' ? 1 + rate : 1;
    return [
      rateStep,
      { label: msg('Deposits needed'), formula: msg('n = ln[(G·i + D·a) / (P·i + D·a)] / ln(1 + i), rounded up'), working: `G = ${aw(inp.goal, cur)}, P = ${aw(inp.startingBalance, cur)}, D = ${aw(i.deposit, cur)}, a = ${fmtNumber(ai, 6)}`, ...said(msg('{n} deposits'), { n: t.periods }) },
      { label: msg('Balance at that point'), formula: `P(1 + i)^n + D × ((1 + i)^n − 1) / i${a}`, working: `${aw(inp.startingBalance, cur)} × (1 + i)^${t.periods} + ${aw(i.deposit, cur)} × ${fmtNumber(fvAnnuityFactor(rate, t.periods), 4)}${a}`, result: money(savingsBalance(inp, i.deposit, t.periods)) },
      { label: msg('Time to reach the goal'), formula: msg('deposits / deposits a year'), working: `${t.periods} / ${ppy}`, ...describeDurationMsg(t.periods, ppy) },
    ];
  }
  const n = Math.round(i.years * ppy);
  if (n <= 0) return [];
  const growth = Math.pow(1 + rate, n);
  const steps: ReportStep[] = [
    rateStep,
    { label: msg('Number of deposits'), formula: msg('n = years × deposits a year'), working: `${plain(i.years)} × ${ppy}`, result: String(n) },
    { label: msg('Starting balance grown'), formula: 'P(1 + i)^n', working: `${aw(inp.startingBalance, cur)} × ${fmtNumber(growth, 6)}`, result: money(inp.startingBalance * growth) },
  ];
  if (i.mode === 'deposit') {
    const d = requiredDeposit(inp, i.years);
    if (!Number.isFinite(d)) return [];
    steps.push({ ...nounLabel(SAVINGS_DEPOSIT_LABEL, msg('Deposit each {noun}'), i.noun ?? 'period'), formula: `D = (G − P(1 + i)^n) / [((1 + i)^n − 1) / i${a}]`, working: `(${aw(inp.goal, cur)} − ${money(inp.startingBalance * growth)}) / ${fmtNumber(fvAnnuityFactor(rate, n) * (inp.timing === 'start' ? 1 + rate : 1), 4)}`, result: money(d) });
    return steps;
  }
  steps.push({ label: msg('Final balance'), formula: `FV = P(1 + i)^n + D × ((1 + i)^n − 1) / i${a}`, working: `${money(inp.startingBalance * growth)} + ${aw(i.deposit, cur)} × ${fmtNumber(fvAnnuityFactor(rate, n) * (inp.timing === 'start' ? 1 + rate : 1), 4)}`, result: money(savingsBalance(inp, i.deposit, n)) });
  return steps;
}

// ---------------------------------------------------------------------------
// Bonds and currency (invest-b kit)
// ---------------------------------------------------------------------------

/** Bond price from yield, or yield to maturity from price. Last step: the headline (clean price or YTM). */
export function bondYieldSteps(i: { mode: 'price' | 'yield'; bond: BondInput; ytmPct: number; price: number; priceType: 'clean' | 'dirty' }): ReportStep[] {
  const b = i.bond;
  const ytm = i.mode === 'yield' ? bondYieldFromPrice(b, i.price, i.priceType) : i.ytmPct;
  if (!Number.isFinite(ytm)) return [];
  const p = bondPriceFromYield(b, ytm);
  const { n, w } = bondPeriods(b.years, b.frequency);
  const c = (b.face * b.couponRate) / 100 / b.frequency;
  const j = ytm / 100 / b.frequency;
  const money = (v: number) => investMoney(v);
  const steps: ReportStep[] = [
    { label: msg('Coupon per period'), formula: msg('C = face × coupon rate / frequency'), working: `${investMoney(b.face, 'USD', Number.isInteger(b.face) ? 0 : 2)} × ${plain(b.couponRate)}% / ${b.frequency}`, result: money(c) },
    { label: msg('Coupons left'), formula: msg('N = years × frequency rounded up; w = fraction of a period to the next coupon'), working: `${plain(b.years)} × ${b.frequency} = ${plain(b.years * b.frequency, 4)}`, result: `N = ${n}, w = ${plain(w, 4)}` },
  ];
  if (i.mode === 'yield') {
    steps.push(
      { label: i.priceType === 'clean' ? msg('Clean price to match') : msg('Dirty price to match'), formula: msg('market price entered'), ...sayWorking(i.priceType === 'clean' ? msg('{price} (clean)') : msg('{price} (dirty)'), { price: investMoney(i.price) }), result: money(i.price) },
      { label: msg('Yield to maturity'), formula: msg('solve price(y) = market price (Newton steps inside a bisection bracket)'), ...sayWorking(msg('price at {ytm}: clean {clean}, dirty {dirty}'), { ytm: investPct(ytm, 4), clean: money(p.clean), dirty: money(p.dirty) }), result: investPct(ytm, 4) },
    );
    return steps;
  }
  steps.push(
    { label: msg('Yield per period'), formula: msg('j = YTM / frequency'), working: `${plain(ytm)}% / ${b.frequency}`, result: investPct(j * 100, 4) },
    { label: msg('Dirty price'), formula: 'P = Σ C / (1 + j)^(w + k − 1) + F / (1 + j)^(w + N − 1)', working: `Σ ${money(c)} / (1 + ${plain(j, 6)})^(${plain(w, 4)} + k − 1), k = 1 … ${n}, + ${investMoney(b.redemption ?? b.face)} / (1 + ${plain(j, 6)})^${plain(w + n - 1, 4)}`, result: money(p.dirty) },
    { label: msg('Accrued interest'), formula: 'AI = C × (1 − w)', working: `${money(c)} × (1 − ${plain(w, 4)})`, result: money(p.accrued) },
    { label: msg('Clean price'), formula: msg('clean = dirty − accrued'), working: `${money(p.dirty)} − ${money(p.accrued)}`, result: money(p.clean) },
  );
  return steps;
}

/** Rate shown on the converter: 2 dp from 100, 4 dp from 1, else 4 significant figures. */
export const fmtRate = (r: number) => (r >= 100 ? r.toFixed(2) : r >= 1 ? r.toFixed(4) : r.toPrecision(4));
/** Converted amount, with the usual decimals for the currency. */
export const showCurrency = (code: string, v: number) => investMoney(v, code, currencyDecimals(code));

/** Currency conversion at ECB reference rates. Last step: the last target's converted amount. */
export function currencySteps(i: { amount: number; from: string; date: string; rows: { code: string; rate: number }[] }): ReportStep[] {
  const rows = i.rows.filter((r) => Number.isFinite(r.rate));
  if (!rows.length || !Number.isFinite(i.amount) || i.amount < 0) return [];
  return [
    { label: msg('Reference rates'), formula: msg('rate(A → B) = (EUR → B) / (EUR → A), ECB euro reference rates'), ...sayWorking(msg('ECB rates for {date}, rebased to {from}'), { date: i.date, from: i.from }), result: rows.slice(0, 3).map((r) => `1 ${i.from} = ${fmtRate(r.rate)} ${r.code}`).join(', ') + (rows.length > 3 ? ', …' : '') },
    ...rows.slice(0, 6).map((r) => ({ ...sayLabel(msg('Amount in {code}'), { code: r.code }), formula: msg('converted = amount × rate'), working: `${plain(i.amount)} ${i.from} × ${fmtRate(r.rate)}`, result: showCurrency(r.code, i.amount * r.rate) })),
  ];
}
