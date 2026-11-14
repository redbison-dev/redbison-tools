/** Rental property maths used by the Real Estate Investment Analyzer. */
import { monthlyMortgagePayment } from './rent-vs-buy-calculator';

export { monthlyMortgagePayment };

export interface RentalPropertyInput {
  purchasePrice: number;
  downPayment: number; // % of price
  closingCosts: number; // % of price
  loanTerm: number; // years
  interestRate: number; // % per year
  monthlyRent: number;
  propertyTaxes: number; // per year
  insurance: number; // per year
  maintenance: number; // per year
  vacancy: number; // % of gross rent
  propertyManagement: number; // % of effective gross income
  appreciation: number; // % per year, applied to value and rent
  analysisYears: number;
  depreciation: number; // % of price per year
  taxRate: number; // %
  /** 'interest-only' keeps the balance flat (common for UK buy-to-let). Default 'amortising'. */
  repayment?: RepaymentType;
  /** Times a year the quoted rate compounds. 12 (default) = US style; 2 = Canadian fixed-rate mortgages (Interest Act, s. 6). */
  compoundingPerYear?: number;
  /** How rental profit is taxed. 'none' (default) leaves the analysis pre-tax, as before. */
  taxModel?: RentalTaxModel;
  /** How a rental loss is used: against other income in full, not at all (carried forward against later rental profit), or up to `lossCap` a year. */
  lossRelief?: LossRelief;
  /** Most of a rental loss usable against other income in a year when lossRelief is 'capped' (India old regime: 2,00,000). */
  lossCap?: number;
}

export type RepaymentType = 'amortising' | 'interest-only';
/**
 * - 'deduct': profit = NOI - interest - depreciation (US, Australia, Canada).
 * - 'deduct-cca': as 'deduct', but depreciation (Canadian CCA) cannot create or increase a rental loss.
 * - 'uk-finance-credit': mortgage interest is not deducted; tax = profit x rate - 20% x the lower of finance costs and profit (UK Section 24); unused finance costs and losses carry forward.
 * - 'india-house-property': income = 70% x (rent received - municipal taxes) - interest; no other expenses or depreciation are deducted.
 */
export type RentalTaxModel = 'none' | 'deduct' | 'deduct-cca' | 'uk-finance-credit' | 'india-house-property';
export type LossRelief = 'full' | 'none' | 'capped';

/** UK basic rate used for the finance-cost tax reduction (ITTOIA 2005 s. 272A; GOV.UK "Changes to tax relief for residential landlords"). */
export const UK_FINANCE_COST_CREDIT_RATE = 0.2;
/** India: standard deduction of 30% of the net annual value of a let-out house property. */
export const INDIA_HP_STANDARD_DEDUCTION = 0.3;

export interface RentalYear {
  year: number;
  propertyValue: number;
  monthlyRent: number;
  grossRent: number;
  operatingExpenses: number;
  noi: number;
  mortgagePayment: number;
  principalPayment: number;
  interestPayment: number;
  remainingBalance: number;
  equityBuildup: number;
  cashFlow: number;
  cumulativeCashFlow: number;
  totalReturn: number;
  depreciation: number;
  taxBenefit: number;
  /** Rental profit the tax model taxes this year (negative = a loss). 0 with taxModel 'none'. */
  taxableProfit: number;
  /** Tax on the rental profit; negative is tax saved on other income by a loss. */
  tax: number;
  /** Cash flow after that tax. Equals cashFlow with taxModel 'none'. */
  afterTaxCashFlow: number;
}

export interface RentalMetrics {
  capRate: number;
  cashOnCashReturn: number;
  totalROI: number;
  irr: number;
  totalCashFlow: number;
  totalAppreciation: number;
  totalEquityBuildup: number;
  breakEvenRatio: number;
  dscr: number;
  /** Year-1 after-tax cash flow / cash invested, %. Equals cashOnCashReturn with taxModel 'none'. */
  afterTaxCashOnCash: number;
  totalAfterTaxCashFlow: number;
}

/** Nominal annual rate, compounded monthly, equal to `ratePct` compounded `perYear` times a year (unchanged for 12). */
export function monthlyNominalRatePct(ratePct: number, perYear = 12): number {
  if (!Number.isFinite(ratePct) || !Number.isFinite(perYear) || perYear <= 0 || perYear === 12) return ratePct;
  return 1200 * Math.expm1((perYear / 12) * Math.log1p(ratePct / 100 / perYear));
}

/** Monthly payment for the loan: amortising, or interest only. */
export function rentalMonthlyPayment(loan: number, ratePct: number, years: number, repayment: RepaymentType = 'amortising', perYear = 12): number {
  const nominal = monthlyNominalRatePct(ratePct, perYear);
  if (repayment === 'interest-only') return loan > 0 ? (loan * nominal) / 1200 : 0;
  return monthlyMortgagePayment(loan, nominal, years);
}

type TaxState = { lossCf: number; financeCf: number };

/** One year's tax on rental profit under the chosen model. Mutates the carry-forward state. */
export function rentalYearTax(
  model: RentalTaxModel,
  x: { noi: number; effectiveGrossIncome: number; propertyTaxes: number; interest: number; depreciation: number; ratePct: number; lossRelief: LossRelief; lossCap: number },
  st: TaxState,
): { taxableProfit: number; tax: number } {
  const rate = x.ratePct / 100;
  if (model === 'none') return { taxableProfit: 0, tax: 0 };
  const useLoss = (loss: number) => {
    const usable = x.lossRelief === 'full' ? loss : x.lossRelief === 'capped' ? Math.min(loss, Math.max(0, x.lossCap)) : 0;
    st.lossCf += loss - usable;
    return -usable * rate;
  };
  const offsetCf = (profit: number) => {
    const used = Math.min(profit, st.lossCf);
    st.lossCf -= used;
    return profit - used;
  };
  if (model === 'uk-finance-credit') {
    const raw = x.noi - x.depreciation;
    if (raw <= 0) {
      st.lossCf += -raw;
      st.financeCf += x.interest;
      return { taxableProfit: raw, tax: 0 };
    }
    const profit = offsetCf(raw);
    const finance = x.interest + st.financeCf;
    const relieved = Math.min(finance, profit);
    st.financeCf = finance - relieved;
    return { taxableProfit: profit, tax: profit * rate - UK_FINANCE_COST_CREDIT_RATE * relieved };
  }
  if (model === 'india-house-property') {
    const nav = x.effectiveGrossIncome - x.propertyTaxes;
    const income = nav * (1 - INDIA_HP_STANDARD_DEDUCTION) - x.interest;
    if (income < 0) return { taxableProfit: income, tax: useLoss(-income) };
    const profit = offsetCf(income);
    return { taxableProfit: profit, tax: profit * rate };
  }
  const beforeDep = x.noi - x.interest;
  const dep = model === 'deduct-cca' ? Math.min(x.depreciation, Math.max(0, beforeDep)) : x.depreciation;
  const raw = beforeDep - dep;
  if (raw < 0) return { taxableProfit: raw, tax: useLoss(-raw) };
  const profit = offsetCf(raw);
  return { taxableProfit: profit, tax: profit * rate };
}

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const r2 = (x: number) => Math.round(x * 100) / 100;

/** IRR by bisection on NPV; returns NaN when the cash flows never change sign. */
export function irr(cashFlows: number[]): number {
  const npv = (rate: number) => cashFlows.reduce((s, cf, t) => s + cf / Math.pow(1 + rate, t), 0);
  let lo = -0.99;
  let hi = 10;
  let fLo = npv(lo);
  const fHi = npv(hi);
  if (!Number.isFinite(fLo) || !Number.isFinite(fHi) || fLo * fHi > 0) return NaN;
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid);
    if (Math.abs(fMid) < 1e-7) return mid;
    if (fLo * fMid < 0) hi = mid;
    else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi) / 2;
}

export function analyzeRentalProperty(raw: RentalPropertyInput): { results: RentalYear[]; metrics: RentalMetrics } {
  const p = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, n(v)])) as unknown as RentalPropertyInput;
  const repayment: RepaymentType = raw.repayment === 'interest-only' ? 'interest-only' : 'amortising';
  const perYear = raw.compoundingPerYear === undefined || !(Number(raw.compoundingPerYear) > 0) ? 12 : Number(raw.compoundingPerYear);
  const taxModel: RentalTaxModel = (['deduct', 'deduct-cca', 'uk-finance-credit', 'india-house-property'] as const).find((m) => m === raw.taxModel) ?? 'none';
  const lossRelief: LossRelief = raw.lossRelief === 'none' || raw.lossRelief === 'capped' ? raw.lossRelief : 'full';
  const lossCap = n(raw.lossCap);
  const taxState: TaxState = { lossCf: 0, financeCf: 0 };
  const years = Math.max(1, Math.round(p.analysisYears));
  const loanAmount = Math.max(0, p.purchasePrice * (1 - p.downPayment / 100));
  const cashInvested = p.purchasePrice * (p.downPayment / 100) + p.purchasePrice * (p.closingCosts / 100);
  const payment = rentalMonthlyPayment(loanAmount, p.interestRate, p.loanTerm, repayment, perYear);
  const monthlyRate = monthlyNominalRatePct(p.interestRate, perYear) / 100 / 12;
  const g = p.appreciation / 100;

  let balance = loanAmount;
  let cumulativeCashFlow = 0;
  let cumulativeAfterTax = 0;
  let firstAfterTax = 0;
  let totalEquityBuildup = 0;
  const results: RentalYear[] = [];
  const flows = [-cashInvested];

  for (let year = 1; year <= years; year++) {
    // Year 1 uses today's rent; rent rises with appreciation from year 2.
    const rent = p.monthlyRent * Math.pow(1 + g, year - 1);
    const value = p.purchasePrice * Math.pow(1 + g, year);
    const grossRent = rent * 12;
    const effectiveGrossIncome = grossRent * (1 - p.vacancy / 100);
    const operatingExpenses = p.propertyTaxes + p.insurance + p.maintenance + effectiveGrossIncome * (p.propertyManagement / 100);
    const noi = effectiveGrossIncome - operatingExpenses;

    let principal = 0;
    let interest = 0;
    let debtService = 0;
    for (let m = 0; m < 12 && balance > 0.005; m++) {
      const int = balance * monthlyRate;
      const pay = Math.min(payment, balance + int);
      interest += int;
      principal += pay - int;
      debtService += pay;
      balance = balance + int - pay;
    }
    if (balance < 0.005) balance = 0;
    totalEquityBuildup += principal;

    const cashFlow = noi - debtService;
    cumulativeCashFlow += cashFlow;
    const depreciationAmount = p.purchasePrice * (p.depreciation / 100);
    const taxBenefit = depreciationAmount * (p.taxRate / 100);
    const yearTax = rentalYearTax(
      taxModel,
      { noi, effectiveGrossIncome, propertyTaxes: p.propertyTaxes, interest, depreciation: depreciationAmount, ratePct: p.taxRate, lossRelief, lossCap },
      taxState,
    );
    const afterTaxCashFlow = cashFlow - yearTax.tax;
    cumulativeAfterTax += afterTaxCashFlow;
    if (year === 1) firstAfterTax = afterTaxCashFlow;
    const totalReturn = cumulativeCashFlow + (value - p.purchasePrice) + totalEquityBuildup;

    flows.push(cashFlow + (year === years ? value - balance : 0));

    results.push({
      year,
      propertyValue: Math.round(value),
      monthlyRent: Math.round(rent),
      grossRent: Math.round(grossRent),
      operatingExpenses: Math.round(operatingExpenses),
      noi: Math.round(noi),
      mortgagePayment: Math.round(debtService),
      principalPayment: Math.round(principal),
      interestPayment: Math.round(interest),
      remainingBalance: Math.round(balance),
      equityBuildup: Math.round(principal),
      cashFlow: Math.round(cashFlow),
      cumulativeCashFlow: Math.round(cumulativeCashFlow),
      totalReturn: Math.round(totalReturn),
      depreciation: Math.round(depreciationAmount),
      taxBenefit: Math.round(taxBenefit),
      taxableProfit: Math.round(yearTax.taxableProfit),
      tax: Math.round(yearTax.tax),
      afterTaxCashFlow: Math.round(afterTaxCashFlow),
    });
  }

  const first = results[0];
  const last = results[results.length - 1];
  const firstDebtService = first.mortgagePayment;
  const totalAppreciation = last.propertyValue - p.purchasePrice;
  const rate = irr(flows);

  return {
    results,
    metrics: {
      capRate: p.purchasePrice > 0 ? r2((first.noi / p.purchasePrice) * 100) : 0,
      cashOnCashReturn: cashInvested > 0 ? r2((first.cashFlow / cashInvested) * 100) : 0,
      totalROI: cashInvested > 0 ? r2(((last.cumulativeCashFlow + totalAppreciation + Math.round(totalEquityBuildup)) / cashInvested) * 100) : 0,
      irr: Number.isFinite(rate) ? r2(rate * 100) : 0,
      totalCashFlow: last.cumulativeCashFlow,
      totalAppreciation,
      totalEquityBuildup: Math.round(totalEquityBuildup),
      breakEvenRatio: first.grossRent > 0 ? r2(((first.operatingExpenses + firstDebtService) / first.grossRent) * 100) : 0,
      dscr: firstDebtService > 0 ? r2(first.noi / firstDebtService) : 0,
      afterTaxCashOnCash: cashInvested > 0 ? r2((Math.round(firstAfterTax) / cashInvested) * 100) : 0,
      totalAfterTaxCashFlow: Math.round(cumulativeAfterTax),
    },
  };
}
