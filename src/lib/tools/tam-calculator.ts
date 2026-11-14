/**
 * TAM, SAM and SOM maths for the TAM Calculator.
 *   top-down:     TAM = total market size x relevant segment %
 *   bottom-up:    TAM = addressable customers x average revenue per customer
 *   value-theory: TAM = total problem value x penetration %
 *   SAM = TAM x SAM % x geographic reach % x business model fit %
 *   SOM = SAM x target share % x competitive factor % x resource availability %
 *   revenue projection = SOM x 0.85 (fixed haircut used by the tool)
 */
export type TamApproach = 'top-down' | 'bottom-up' | 'value-theory';

export interface TamInputs {
  approach: TamApproach;
  totalMarketSize: number;
  relevantSegmentPercentage: number;
  targetCustomers: number;
  averageRevenuePerCustomer: number;
  problemValue: number;
  marketPenetration: number;
  samPercentage: number;
  geographicReach: number;
  businessModelFit: number;
  marketShare: number;
  competitiveFactor: number;
  resourceConstraints: number;
}

export interface TamResult {
  tam: number;
  sam: number;
  som: number;
  revenueProjection: number;
}

export const REVENUE_PROJECTION_FACTOR = 0.85;

const n = (v: number) => (Number.isFinite(v) ? v : 0);
const pct = (v: number) => n(v) / 100;

export function computeTam(d: TamInputs): TamResult {
  let tam = 0;
  if (d.approach === 'top-down') tam = n(d.totalMarketSize) * pct(d.relevantSegmentPercentage);
  else if (d.approach === 'bottom-up') tam = n(d.targetCustomers) * n(d.averageRevenuePerCustomer);
  else tam = n(d.problemValue) * pct(d.marketPenetration);
  const sam = tam * pct(d.samPercentage) * pct(d.geographicReach) * pct(d.businessModelFit);
  const som = sam * pct(d.marketShare) * pct(d.competitiveFactor) * pct(d.resourceConstraints);
  return { tam, sam, som, revenueProjection: som * REVENUE_PROJECTION_FACTOR };
}
