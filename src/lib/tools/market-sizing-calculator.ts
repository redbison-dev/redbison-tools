/**
 * Market Sizing Calculator maths.
 *   TAM = industry size (entered directly)
 *   SAM = TAM x SAM %
 *   competition factor = max(0.1, 1 - 0.03 x competitors)
 *   SOM = SAM x penetration % x competition factor
 *   customers = SOM / average customer spending
 *   projected annual revenue = customers x monthly price x 12
 *   share of SAM = SOM / SAM
 *
 * Optional context inputs:
 *   growth factor = (1 + growth rate %) ^ (time to market months / 12);
 *     TAM, SAM, SOM and revenue at launch are today's figures x that factor
 *     (spend per customer held constant, so customer count grows with it).
 *   spend per person = TAM / population, and customers per million people,
 *     as sanity checks on the top-down figure.
 */
export interface MarketSizingInputs {
  industrySize: number;
  samPercentage: number;
  marketPenetration: number;
  competitorCount: number;
  avgSpending: number;
  /** Your monthly price per customer. */
  pricingStrategy: number;
  /** People in the geographic scope; 0 leaves the per-person checks empty. */
  totalPopulation?: number;
  /** Annual market growth, %. */
  industryGrowthRate?: number;
  /** Months until launch; the growth rate projects the market this far. */
  timeToMarket?: number;
}

export interface MarketSizingResult {
  tam: number;
  sam: number;
  som: number;
  competitionFactor: number;
  projectedCustomers: number;
  revenueProjection: number;
  /** SOM as a percentage of SAM. */
  marketShare: number;
  yearsToLaunch: number;
  tamAtLaunch: number;
  samAtLaunch: number;
  somAtLaunch: number;
  revenueAtLaunch: number;
  /** TAM divided by population, or null without a population. */
  spendPerPerson: number | null;
  /** Projected customers per million people, or null without a population. */
  customersPerMillion: number | null;
}

const n = (v: number | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export function competitionFactor(competitors: number): number {
  return Math.max(0.1, 1 - Math.max(0, n(competitors)) * 0.03);
}

export function calculateMarketSize(d: MarketSizingInputs): MarketSizingResult {
  const tam = n(d.industrySize);
  const sam = tam * (n(d.samPercentage) / 100);
  const factor = competitionFactor(d.competitorCount);
  const som = sam * (n(d.marketPenetration) / 100) * factor;
  const spend = n(d.avgSpending);
  const projectedCustomers = spend > 0 ? som / spend : 0;
  const revenueProjection = projectedCustomers * n(d.pricingStrategy) * 12;
  const marketShare = sam > 0 ? (som / sam) * 100 : 0;

  const yearsToLaunch = Math.max(0, n(d.timeToMarket)) / 12;
  const growth = Math.pow(1 + n(d.industryGrowthRate) / 100, yearsToLaunch);
  const population = n(d.totalPopulation);

  return {
    tam, sam, som, competitionFactor: factor, projectedCustomers, revenueProjection, marketShare,
    yearsToLaunch,
    tamAtLaunch: tam * growth,
    samAtLaunch: sam * growth,
    somAtLaunch: som * growth,
    revenueAtLaunch: revenueProjection * growth,
    spendPerPerson: population > 0 ? tam / population : null,
    customersPerMillion: population > 0 ? (projectedCustomers / population) * 1e6 : null,
  };
}
