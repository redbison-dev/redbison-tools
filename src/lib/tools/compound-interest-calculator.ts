/** Frequency keys used by the Compound Interest Calculator selects. */
export type CompoundingFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'semi-annually' | 'annually';

export function periodsPerYear(frequency: string): number {
  switch (frequency) {
    case 'daily': return 365;
    case 'weekly': return 52;
    case 'monthly': return 12;
    case 'quarterly': return 4;
    case 'semi-annually': return 2;
    case 'annually': return 1;
    default: return 1;
  }
}

/**
 * Converts a rate quoted per `rateDuration` (e.g. 10% per year) into the
 * decimal rate per compounding period, using the nominal-rate convention
 * behind A = P(1 + r/n)^(nt): 10% per year compounded monthly is 0.10 / 12
 * per month. When the two frequencies match, the rate passes through unchanged.
 */
export function toRatePerPeriod(ratePercent: number, rateDuration: string, compoundFrequency: string): number {
  const nominalAnnual = (ratePercent / 100) * periodsPerYear(rateDuration);
  return nominalAnnual / periodsPerYear(compoundFrequency);
}

/** Total contributions per year for an amount paid weekly, monthly, quarterly or yearly. */
export function contributionsPerYear(amount: number, frequency: string): number {
  if (!(amount > 0)) return 0;
  switch (frequency) {
    case 'weekly': return amount * 52;
    case 'monthly': return amount * 12;
    case 'quarterly': return amount * 4;
    case 'yearly': return amount;
    default: return 0;
  }
}
