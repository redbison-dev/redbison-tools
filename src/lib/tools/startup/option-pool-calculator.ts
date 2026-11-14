/**
 * Option pool shuffle: how big the pool top-up a term sheet asks for has to
 * be, who pays for it, and what pre-money the company is effectively getting.
 * Built on `solveRound` from the cap table core so both tools agree.
 *
 * Two "effective pre-money" figures are reported, each labelled:
 * - excluding the new pool: pre-money - new pool shares x price
 *   (= pre-round FD shares x price, the value of everything that existed
 *   before the round, the existing unallocated pool included);
 * - excluding the whole post-round pool: pre-money - (existing + new pool) x
 *   price, the value of issued shares and granted options only.
 * The existing pool is subtracted once, in the second figure only. With the
 * pool added after the round, the headline pre-money is the effective one and
 * the second figure subtracts only the pool that existed before the round.
 */
import { solveRound, type PoolTiming, type RoundSolve, type SolveError } from './cap-table-calculator';

export interface OptionPoolInput {
  preMoney: number;
  investment: number;
  /** Fully diluted shares before the round, including the unallocated pool. */
  preFdShares: number;
  /** Unallocated (ungranted) pool shares before the round. */
  existingPool: number;
  /** Unallocated pool the term sheet requires, percent of post-round FD shares. */
  poolTargetPct: number;
}

export interface OptionPoolCase extends RoundSolve {
  timing: PoolTiming;
  /** Pre-money minus the value of the new pool shares at the round price (the headline pre-money when the pool is added after the round). */
  effectivePreMoney: number;
  /** Pre-money minus the value of the unallocated pool inside it at the round price (the whole post-round pool when it sits in the pre-money). */
  preMoneyExcludingWholePool: number;
  /** Value of the new pool shares at the round price. */
  newPoolValue: number;
  /** Issued shares and granted options (everything except the unallocated pool), percent of post FD. */
  existingHoldersPct: number;
  /** Existing holders' shares (excluding the pool) x round price. */
  existingHoldersValue: number;
}

export interface OptionPoolResult {
  pre: OptionPoolCase;
  post: OptionPoolCase;
  /** Percentage points of FD ownership existing holders give up by putting the pool in the pre-money instead of after the round. */
  shuffleCostPoints: number;
  /** Existing pool as a percent of pre-round FD shares. */
  existingPoolPct: number;
}

function caseFor(input: OptionPoolInput, timing: PoolTiming): OptionPoolCase | SolveError {
  const s = solveRound({ ...input, timing });
  if ('error' in s) return s;
  const holders = input.preFdShares - input.existingPool;
  return {
    ...s,
    timing,
    // After the round, the new pool is not bought out of the pre-money, so
    // only the pool that already existed sits inside the headline figure.
    effectivePreMoney: timing === 'pre' ? input.preMoney - s.newPoolShares * s.pricePerShare : input.preMoney,
    preMoneyExcludingWholePool: input.preMoney - (timing === 'pre' ? s.poolAfter : input.existingPool) * s.pricePerShare,
    newPoolValue: s.newPoolShares * s.pricePerShare,
    existingHoldersPct: (holders / s.postFdShares) * 100,
    existingHoldersValue: holders * s.pricePerShare,
  };
}

export function analyzeOptionPool(input: OptionPoolInput): OptionPoolResult | SolveError {
  const pre = caseFor(input, 'pre');
  if ('error' in pre) return pre;
  const post = caseFor(input, 'post');
  if ('error' in post) return post;
  return {
    pre,
    post,
    shuffleCostPoints: post.existingHoldersPct - pre.existingHoldersPct,
    existingPoolPct: (input.existingPool / input.preFdShares) * 100,
  };
}

/**
 * Headline pre-money that leaves `targetEffective` as the effective pre-money
 * (excluding the new pool) when the pool sits in the pre-money. Effective
 * pre-money rises with the headline figure, so a bisection is enough. Returns
 * null when no headline pre-money reaches it (the pool would swallow it).
 */
export function preMoneyForEffective(input: Omit<OptionPoolInput, 'preMoney'>, targetEffective: number): number | null {
  if (!(targetEffective > 0)) return null;
  const eff = (V: number) => {
    const s = solveRound({ ...input, preMoney: V, timing: 'pre' });
    return 'error' in s ? null : V - s.newPoolShares * s.pricePerShare;
  };
  let lo = targetEffective;
  let hi = targetEffective * 2;
  let e = eff(hi);
  let guard = 0;
  while ((e === null || e < targetEffective) && guard++ < 60) {
    hi *= 2;
    e = eff(hi);
  }
  if (e === null || e < targetEffective) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const em = eff(mid);
    if (em === null || em < targetEffective) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-6) break;
  }
  return hi;
}
