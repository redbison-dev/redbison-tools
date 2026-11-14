/** Year-by-year ETF growth simulation used by the ETF Investment Simulator. */

export type ContributionFrequency = 'weekly' | 'bi-weekly' | 'semi-monthly' | 'monthly';
export type IncreaseFrequency = 'yearly' | 'every-2-years' | 'every-3-years';

export interface EtfSimulationInput {
  initialAmount: number;
  monthlyContribution: number;
  contributionFrequency: ContributionFrequency | string;
  annualReturn: number; // % total return (price + dividends)
  dividendYield: number; // %
  reinvestDividends: boolean;
  investmentPeriod: number; // years
  contributionIncrease: number; // added to the monthly amount
  contributionIncreaseFrequency: IncreaseFrequency | string;
  expenseRatio?: number; // % per year deducted from returns
  inflationRate?: number; // % per year, for the today's-money figure
  /** Annual salary, used to show the first-year contribution as a share of pay. */
  salary?: number;
  /** % per year; the monthly amount grows by this rate so it keeps pace with pay. */
  salaryGrowthRate?: number;
}

export interface EtfYear {
  year: number;
  totalContributed: number;
  totalValue: number;
  yearlyContribution: number;
  yearlyGrowth: number;
  yearlyDividends: number;
  /** Monthly-equivalent contribution in this year (annual contribution / 12). */
  monthlyContribution: number;
}

export interface EtfSummary {
  finalValue: number;
  totalContributed: number;
  totalGrowth: number;
  totalDividends: number;
  totalFees: number;
  averageMonthlyContribution: number;
  realFinalValue: number;
  /** First-year contributions as a % of salary, or null when no salary is given. */
  contributionPercentOfSalary: number | null;
}

export function contributionsPerYear(frequency: string): number {
  switch (frequency) {
    case 'weekly': return 52;
    case 'bi-weekly': return 26;
    case 'semi-monthly': return 24;
    default: return 12;
  }
}

function increaseEvery(frequency: string): number {
  if (frequency === 'every-2-years') return 2;
  if (frequency === 'every-3-years') return 3;
  return 1;
}

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/**
 * Contributions are treated as arriving evenly through the year, so on
 * average half a year's contributions earn a full year's return (the
 * mid-year convention). Dividends are paid on the average balance; with
 * reinvestment off they are paid out and excluded from the value. The
 * expense ratio is charged on the average balance. The monthly amount
 * rises by `contributionIncrease` after every 1, 2 or 3 completed years.
 * Separately, it grows by `salaryGrowthRate` % at the start of every year
 * after the first, so contributions stay the same share of a rising salary;
 * the percentage rise is applied before the fixed increase.
 */
export function simulateEtf(input: EtfSimulationInput): { years: EtfYear[]; summary: EtfSummary } {
  const years = Math.max(1, Math.round(n(input.investmentPeriod)));
  const perYear = contributionsPerYear(input.contributionFrequency);
  const every = increaseEvery(input.contributionIncreaseFrequency);
  const capitalRate = (n(input.annualReturn) - n(input.dividendYield)) / 100;
  const dividendRate = n(input.dividendYield) / 100;
  const feeRate = n(input.expenseRatio) / 100;
  const inflation = n(input.inflationRate) / 100;
  const salaryGrowth = n(input.salaryGrowthRate) / 100;

  let monthly = n(input.monthlyContribution);
  let value = n(input.initialAmount);
  let totalContributed = value;
  let totalDividends = 0;
  let totalFees = 0;
  const rows: EtfYear[] = [];

  for (let year = 1; year <= years; year++) {
    if (year > 1) monthly *= 1 + salaryGrowth;
    if (year > 1 && (year - 1) % every === 0) monthly += n(input.contributionIncrease);
    const perContribution = (monthly * 12) / perYear;
    const yearlyContribution = perContribution * perYear;

    const averageBalance = value + yearlyContribution / 2;
    const capitalGrowth = averageBalance * capitalRate;
    const dividends = averageBalance * dividendRate;
    const fees = averageBalance * feeRate;

    value += yearlyContribution + capitalGrowth - fees + (input.reinvestDividends ? dividends : 0);
    totalContributed += yearlyContribution;
    totalDividends += dividends;
    totalFees += fees;

    rows.push({
      year,
      totalContributed: Math.round(totalContributed),
      totalValue: Math.round(value),
      yearlyContribution: Math.round(yearlyContribution),
      yearlyGrowth: Math.round(capitalGrowth - fees),
      yearlyDividends: Math.round(dividends),
      monthlyContribution: Math.round(yearlyContribution / 12),
    });
  }

  const last = rows[rows.length - 1];
  const contributedAfterStart = totalContributed - n(input.initialAmount);
  const salary = n(input.salary);
  return {
    years: rows,
    summary: {
      finalValue: last.totalValue,
      totalContributed: last.totalContributed,
      totalGrowth: last.totalValue - last.totalContributed,
      totalDividends: Math.round(totalDividends),
      totalFees: Math.round(totalFees),
      averageMonthlyContribution: Math.round(contributedAfterStart / (years * 12)),
      realFinalValue: Math.round(value / Math.pow(1 + inflation, years)),
      contributionPercentOfSalary: salary > 0 ? Math.round((rows[0].yearlyContribution / salary) * 1000) / 10 : null,
    },
  };
}
