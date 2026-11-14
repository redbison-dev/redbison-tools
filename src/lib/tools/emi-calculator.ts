export interface AmortizationRow {
  month: number;
  emi: number;
  principal: number;
  interest: number;
  balance: number;
}

export interface LoanChartPoint {
  month: string;
  /** Cumulative principal repaid */
  principal: number;
  /** Cumulative interest paid */
  interest: number;
  balance: number;
}

export interface LoanSchedule {
  emi: number;
  totalPayment: number;
  totalInterest: number;
  schedule: AmortizationRow[];
  chart: LoanChartPoint[];
}

/**
 * Equated monthly instalment: EMI = P r (1+r)^n / ((1+r)^n - 1), where r is
 * the annual rate / 12 / 100 and n the number of monthly payments. At 0% the
 * formula is 0/0, so the principal is simply split evenly.
 */
export function computeEmi(principal: number, annualRatePercent: number, months: number): number {
  if (months <= 0) return 0;
  const r = annualRatePercent / 12 / 100;
  if (r === 0) return principal / months;
  const growth = Math.pow(1 + r, months);
  return (principal * r * growth) / (growth - 1);
}

/**
 * Builds the month-by-month amortization schedule. Tenure is rounded to whole
 * months because lenders schedule whole instalments. Returns null when the
 * loan amount or tenure is not positive or the rate is negative.
 */
export function buildLoanSchedule(principal: number, annualRatePercent: number, tenureMonths: number): LoanSchedule | null {
  if (![principal, annualRatePercent, tenureMonths].every(Number.isFinite)) return null;
  const months = Math.round(tenureMonths);
  if (principal <= 0 || annualRatePercent < 0 || months <= 0) return null;

  const r = annualRatePercent / 12 / 100;
  const emi = computeEmi(principal, annualRatePercent, months);
  const schedule: AmortizationRow[] = [];
  const chart: LoanChartPoint[] = [];
  let balance = principal;
  let interestPaid = 0;

  for (let month = 1; month <= months; month++) {
    const interest = balance * r;
    const principalPart = emi - interest;
    balance -= principalPart;
    interestPaid += interest;
    // Clamp floating-point dust on the final instalment
    const shown = Math.abs(balance) < 1e-6 ? 0 : Math.max(0, balance);
    schedule.push({ month, emi, principal: principalPart, interest, balance: shown });
    if (month % 12 === 0 || month === months) {
      chart.push({ month: `Month ${month}`, principal: principal - shown, interest: interestPaid, balance: shown });
    }
  }

  const totalPayment = emi * months;
  return { emi, totalPayment, totalInterest: totalPayment - principal, schedule, chart };
}
