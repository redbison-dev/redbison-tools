export interface RetirementProjectionInput {
  currentAge: number;
  retirementAge: number;
  currentSavings: number;
  /** Your own monthly contribution */
  monthlyContribution: number;
  /** Employer contribution per month */
  employerMatch: number;
  /** Yearly raise applied to contributions, in percent */
  annualIncrease: number;
  /** Expected annual return, in percent */
  expectedReturn: number;
  inflationRate: number;
}

export interface RetirementProjectionRow {
  age: number;
  totalSavings: number;
  monthlyContribution: number;
  totalContributions: number;
  investmentGrowth: number;
  inflation: number;
  /** totalSavings expressed in today's money */
  realValue: number;
}

/**
 * Year-by-year savings projection. Each year the opening balance grows by the
 * full annual return and that year's contributions are assumed to arrive
 * evenly, so on average they earn half a year of return.
 */
export function projectRetirementSavings(input: RetirementProjectionInput): RetirementProjectionRow[] {
  const years = Math.max(0, Math.round(input.retirementAge - input.currentAge));
  const r = input.expectedReturn / 100;
  const rows: RetirementProjectionRow[] = [];
  let balance = input.currentSavings;
  let monthly = input.monthlyContribution + input.employerMatch;
  let contributed = input.currentSavings;

  for (let year = 0; year <= years; year++) {
    if (year > 0) {
      const yearly = monthly * 12;
      balance = balance * (1 + r) + yearly * (1 + r / 2);
      contributed += yearly;
      monthly *= 1 + input.annualIncrease / 100;
    }
    rows.push({
      age: input.currentAge + year,
      totalSavings: balance,
      monthlyContribution: monthly,
      totalContributions: contributed,
      investmentGrowth: balance - contributed,
      inflation: input.inflationRate,
      realValue: balance / Math.pow(1 + input.inflationRate / 100, year),
    });
  }
  return rows;
}

export interface RetirementNeedInput {
  yearsToRetirement: number;
  yearsInRetirement: number;
  /** Today's monthly living expenses */
  monthlyExpenses: number;
  /** Monthly health insurance in retirement, in today's money */
  healthInsuranceCost: number;
  inflationRate: number;
  /** Share of today's spending you expect to need in retirement, in percent */
  retirementIncomeRatio: number;
  /** Social Security, pension and spouse benefits per month, taken as entered */
  guaranteedMonthlyIncome: number;
  /** One-off goals funded from the same pot (education, care funds) */
  lumpSumGoals: number;
}

export interface RetirementNeed {
  /** Monthly spending at the start of retirement, in future money */
  monthlySpending: number;
  /** Part of that spending your savings must cover */
  monthlyGap: number;
  total: number;
}

/**
 * Savings target at retirement. Living expenses are inflated to the
 * retirement date and scaled by the income ratio; health insurance is
 * inflated but not scaled. Guaranteed income reduces the monthly gap. The
 * gap is multiplied out over the retirement years with no further growth or
 * inflation, i.e. it assumes returns in retirement roughly match inflation.
 */
export function computeRetirementNeed(input: RetirementNeedInput): RetirementNeed {
  const inflate = Math.pow(1 + input.inflationRate / 100, Math.max(0, input.yearsToRetirement));
  const living = input.monthlyExpenses * inflate * (input.retirementIncomeRatio / 100);
  const health = input.healthInsuranceCost * inflate;
  const monthlySpending = living + health;
  const monthlyGap = Math.max(0, monthlySpending - input.guaranteedMonthlyIncome);
  const years = Math.max(0, input.yearsInRetirement);
  return { monthlySpending, monthlyGap, total: monthlyGap * 12 * years + input.lumpSumGoals };
}

/** Even monthly draw that spends the pot over the retirement years. */
export function monthlyIncomeFromSavings(savings: number, yearsInRetirement: number): number {
  return yearsInRetirement > 0 ? savings / (yearsInRetirement * 12) : 0;
}

/**
 * Extra monthly contribution (held flat) that would close `shortfall` by
 * retirement under the same growth assumptions as projectRetirementSavings.
 */
export function requiredExtraMonthlyContribution(shortfall: number, years: number, expectedReturnPercent: number): number {
  if (shortfall <= 0 || years <= 0) return 0;
  const r = expectedReturnPercent / 100;
  let factor = 0;
  for (let k = 1; k <= years; k++) {
    factor += 12 * (1 + r / 2) * Math.pow(1 + r, years - k);
  }
  return shortfall / factor;
}
