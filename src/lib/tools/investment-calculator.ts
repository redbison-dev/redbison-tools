export interface InvestmentRow {
  year: string;
  invested: number;
  value: number;
  returns: number;
}

export interface InvestmentResult {
  maturity: number;
  invested: number;
  returns: number;
  rows: InvestmentRow[];
}

function valid(amount: number, ratePercent: number, months: number): boolean {
  return [amount, ratePercent, months].every(Number.isFinite) && amount > 0 && ratePercent >= 0 && months > 0;
}

/**
 * Future value of a monthly SIP with each instalment invested at the start of
 * the month (annuity due), compounding monthly at annualRate / 12:
 * FV = P * [((1 + i)^n - 1) / i] * (1 + i). At 0% it is just P * n.
 */
export function sipValue(monthly: number, annualRatePercent: number, months: number): number {
  const i = annualRatePercent / 12 / 100;
  if (i === 0) return monthly * months;
  return monthly * ((Math.pow(1 + i, months) - 1) / i) * (1 + i);
}

export function computeSip(monthly: number, annualRatePercent: number, months: number): InvestmentResult | null {
  if (!valid(monthly, annualRatePercent, months)) return null;
  const maturity = sipValue(monthly, annualRatePercent, months);
  const invested = monthly * months;
  const rows: InvestmentRow[] = [];
  for (let year = 1; year <= Math.ceil(months / 12); year++) {
    const elapsed = Math.min(year * 12, months);
    const value = sipValue(monthly, annualRatePercent, elapsed);
    const inv = monthly * elapsed;
    rows.push({ year: `Year ${year}`, invested: inv, value, returns: value - inv });
  }
  return { maturity, invested, returns: maturity - invested, rows };
}

/** Lump sum compounded once a year: A = P(1 + r)^(months / 12). */
export function computeLumpSum(amount: number, annualRatePercent: number, months: number): InvestmentResult | null {
  if (!valid(amount, annualRatePercent, months)) return null;
  const r = annualRatePercent / 100;
  const years = months / 12;
  const maturity = amount * Math.pow(1 + r, years);
  const rows: InvestmentRow[] = [];
  for (let year = 1; year <= Math.ceil(years); year++) {
    const value = amount * Math.pow(1 + r, Math.min(year, years));
    rows.push({ year: `Year ${year}`, invested: amount, value, returns: value - amount });
  }
  return { maturity, invested: amount, returns: maturity - amount, rows };
}
