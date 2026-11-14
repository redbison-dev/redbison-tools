/**
 * Monthly cost totals for the EMI Calculator, moved out of the component so
 * the page and its working steps (src/lib/tools/steps/s7.ts) share one
 * calculation. Yearly costs are spread evenly over 12 months.
 */
import { buildLoanSchedule, type LoanSchedule } from '../emi-calculator';

export type EmiCostFrequency = 'monthly' | 'yearly' | string;
export type EmiCustomCost = { name: string; amount: number; frequency: EmiCostFrequency };

export type EmiInput = {
  loanAmount: number;
  downPayment: number;
  rate: number;
  tenure: number;
  insurance: number;
  tax: number;
  maintenance: number;
  insuranceFreq: EmiCostFrequency;
  taxFreq: EmiCostFrequency;
  maintenanceFreq: EmiCostFrequency;
  customCosts?: EmiCustomCost[];
};

export type EmiTotals = {
  principal: number;
  loan: LoanSchedule;
  monthlyInsurance: number;
  monthlyTax: number;
  monthlyMaintenance: number;
  monthlyCustom: number;
  totalMonthlyPayment: number;
};

/** A cost entered monthly or yearly, as a monthly amount. */
export const emiMonthly = (amount: number, frequency: EmiCostFrequency) => (frequency === 'yearly' ? amount / 12 : amount);

/** Loan schedule plus the monthly add-on costs; null when the loan itself is invalid. */
export function emiTotals(i: EmiInput): EmiTotals | null {
  const principal = i.loanAmount - i.downPayment;
  const loan = buildLoanSchedule(principal, i.rate, i.tenure);
  if (!loan) return null;
  const monthlyInsurance = emiMonthly(i.insurance, i.insuranceFreq);
  const monthlyTax = emiMonthly(i.tax, i.taxFreq);
  const monthlyMaintenance = emiMonthly(i.maintenance, i.maintenanceFreq);
  const monthlyCustom = (i.customCosts ?? []).reduce((t, c) => t + emiMonthly(c.amount, c.frequency), 0);
  return {
    principal,
    loan,
    monthlyInsurance,
    monthlyTax,
    monthlyMaintenance,
    monthlyCustom,
    totalMonthlyPayment: loan.emi + monthlyInsurance + monthlyTax + monthlyMaintenance + monthlyCustom,
  };
}
