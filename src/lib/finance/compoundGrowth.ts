export interface CompoundGrowthRow {
  /** e.g. "Year 3" or "Year 3 (partial)" for a fractional final year */
  period: string;
  startingPrincipal: number;
  /** Contributions made during this year (pro-rated for a partial year) */
  additionalContributions: number;
  /** Interest earned during this year */
  interestEarned: number;
  endingBalance: number;
  /** Cumulative contributions through the end of this year */
  cumulativeContributions: number;
}

export interface CompoundGrowthResult {
  finalAmount: number;
  interestEarned: number;
  totalContributions: number;
  rows: CompoundGrowthRow[];
}

export interface CompoundGrowthOptions {
  principal: number;
  /** Interest rate per compounding period, as a decimal (e.g. 0.10 / 12 for 10% annual compounded monthly) */
  ratePerPeriod: number;
  /** Compounding periods per year (1, 2, 4, 12, 52, 365) */
  periodsPerYear: number;
  /** Duration in years; fractional values are supported */
  years: number;
  /** Total contributions added per year, spread evenly across periods (0 for none) */
  contributionsPerYear?: number;
  /**
   * When each period's contribution is paid in: 'end' (default, an ordinary
   * annuity: it starts earning next period) or 'start' (an annuity due: it
   * earns that period's interest, as a PPF deposit made by the 5th of April
   * earns the whole year).
   */
  contributionTiming?: 'start' | 'end';
}

/**
 * Computes compound growth period-by-period so the chosen compounding
 * frequency is always respected (including when contributions are present)
 * and fractional years compound the correct partial period instead of being
 * silently rounded down.
 */
export function computeCompoundGrowth({
  principal,
  ratePerPeriod,
  periodsPerYear,
  years,
  contributionsPerYear = 0,
  contributionTiming = 'end',
}: CompoundGrowthOptions): CompoundGrowthResult {
  const invalid =
    !Number.isFinite(principal) || !Number.isFinite(ratePerPeriod) || !Number.isFinite(years) ||
    principal < 0 || ratePerPeriod < 0 || years <= 0 || periodsPerYear < 1 ||
    // Nothing to grow: no starting balance and no contributions
    (principal === 0 && contributionsPerYear <= 0);
  if (invalid) {
    return { finalAmount: 0, interestEarned: 0, totalContributions: 0, rows: [] };
  }

  const totalPeriods = periodsPerYear * years;
  const fullPeriods = Math.ceil(totalPeriods);
  const contributionPerPeriod = contributionsPerYear / periodsPerYear;

  let balance = principal;
  let yearStart = principal;
  let yearContributions = 0;
  let totalContributions = 0;
  const rows: CompoundGrowthRow[] = [];

  for (let period = 0; period < fullPeriods; period++) {
    // Fraction of this period that actually elapses (1 for full periods)
    const portion = Math.min(1, totalPeriods - period);
    const contribution = contributionPerPeriod * portion;
    if (contributionTiming === 'start') {
      balance = (balance + contribution) * Math.pow(1 + ratePerPeriod, portion);
    } else {
      balance = balance * Math.pow(1 + ratePerPeriod, portion);
      balance += contribution;
    }
    yearContributions += contribution;
    totalContributions += contribution;

    const isYearBoundary = (period + 1) % periodsPerYear === 0;
    const isLast = period === fullPeriods - 1;
    if (isYearBoundary || isLast) {
      const yearNumber = Math.ceil((period + 1) / periodsPerYear);
      const isPartial = !isYearBoundary || period + 1 > totalPeriods;
      rows.push({
        period: isPartial ? `Year ${yearNumber} (partial)` : `Year ${yearNumber}`,
        startingPrincipal: yearStart,
        additionalContributions: yearContributions,
        interestEarned: balance - yearStart - yearContributions,
        endingBalance: balance,
        cumulativeContributions: totalContributions,
      });
      yearStart = balance;
      yearContributions = 0;
    }
  }

  return {
    finalAmount: balance,
    interestEarned: balance - principal - totalContributions,
    totalContributions,
    rows,
  };
}
