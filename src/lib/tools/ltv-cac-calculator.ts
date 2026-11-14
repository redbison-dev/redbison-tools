/**
 * Unit-economics maths for the LTV-CAC Calculator.
 *
 * All LTV figures are gross-margin LTV (gross profit per customer over the
 * relationship), and payback is always in months:
 *   traditional: LTV = AOV x purchases/year x lifespan (years) x margin
 *                monthly gross profit = AOV x purchases/year x margin / 12
 *   saas:        LTV = monthly ARPA x margin / monthly churn
 *                monthly gross profit = monthly ARPA x margin
 *   CAC = sales and marketing spend / new customers in the same period
 *   payback (months) = CAC / monthly gross profit
 */

export type LtvMethod = 'traditional' | 'saas';
export type LtvHealth = 'healthy' | 'warning' | 'critical' | 'unknown';

export interface LtvCacInputs {
  averageOrderValue: number;
  /** Purchases per year. */
  purchaseFrequency: number;
  /** Years. */
  customerLifespan: number;
  /** Percent, 0-100. */
  grossMargin: number;
  salesAndMarketingCosts: number;
  newCustomersAcquired: number;
  /** Monthly revenue per customer (ARPA). */
  monthlyRevenue: number;
  /** Monthly churn, percent. */
  churnRate: number;
}

export interface LtvCacMetrics {
  /** null when LTV is not finite (0% churn on the SaaS method). */
  ltv: number | null;
  /** null when no new customers were entered. */
  cac: number | null;
  /** null when LTV or CAC is missing, or CAC is 0. */
  ltvCacRatio: number | null;
  /** Months to recover CAC from gross profit; null when it cannot be computed. */
  paybackMonths: number | null;
  /** Gross profit one customer produces per month. */
  monthlyGrossProfit: number;
  /** Expected lifetime in months implied by the inputs (null for 0% churn). */
  lifetimeMonths: number | null;
  health: LtvHealth;
  /** True when the SaaS method was used with 0% churn. */
  zeroChurn: boolean;
}

const num = (v: number) => (Number.isFinite(v) ? v : 0);

export function computeLtvCac(input: LtvCacInputs, method: LtvMethod): LtvCacMetrics {
  const margin = num(input.grossMargin) / 100;
  let ltv: number | null = 0;
  let monthlyGrossProfit = 0;
  let lifetimeMonths: number | null = 0;
  let zeroChurn = false;

  if (method === 'traditional') {
    const annualRevenue = num(input.averageOrderValue) * num(input.purchaseFrequency);
    ltv = annualRevenue * num(input.customerLifespan) * margin;
    monthlyGrossProfit = (annualRevenue * margin) / 12;
    lifetimeMonths = num(input.customerLifespan) * 12;
  } else {
    const churn = num(input.churnRate) / 100;
    monthlyGrossProfit = num(input.monthlyRevenue) * margin;
    if (churn > 0) {
      ltv = monthlyGrossProfit / churn;
      lifetimeMonths = 1 / churn;
    } else {
      zeroChurn = true;
      ltv = monthlyGrossProfit > 0 ? null : 0;
      lifetimeMonths = null;
    }
  }

  const customers = num(input.newCustomersAcquired);
  const cac = customers > 0 ? num(input.salesAndMarketingCosts) / customers : null;

  const ltvCacRatio = ltv !== null && cac !== null && cac > 0 ? ltv / cac : null;
  const paybackMonths = cac !== null && monthlyGrossProfit > 0 ? cac / monthlyGrossProfit : null;

  let health: LtvHealth = 'unknown';
  if (ltvCacRatio !== null) {
    health = ltvCacRatio >= 3 ? 'healthy' : ltvCacRatio >= 2 ? 'warning' : 'critical';
  }
  // 0% churn gives an unbounded LTV. That usually means too little churn
  // history rather than immortal customers, so health stays 'unknown'.

  return { ltv, cac, ltvCacRatio, paybackMonths, monthlyGrossProfit, lifetimeMonths, health, zeroChurn };
}
