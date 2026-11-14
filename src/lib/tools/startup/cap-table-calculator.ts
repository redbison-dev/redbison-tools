/**
 * Cap table maths for priced equity rounds: price per share, new investor
 * shares, option pool top-ups placed in the pre-money ("option pool shuffle")
 * or after the round, and fully diluted ownership after each round.
 *
 * This is the shared core for the Cap Table and Dilution Calculator and the
 * Option Pool Shuffle Calculator; later SAFE and convertible note tools should
 * reuse `solveRound` rather than repeat the pool algebra.
 *
 * Conventions (YC post-money SAFE user guide, Appendix II example 1; NVCA-style
 * term sheets):
 * - Fully diluted (FD) shares = every issued share plus granted options and
 *   the unallocated (available) option pool.
 * - The pool target is the unallocated pool as a percent of post-closing FD
 *   shares ("an ungranted and unallocated employee option pool representing
 *   10% of the fully-diluted post-closing capitalization").
 * - Pool in the pre-money: price per share = pre-money / (pre FD + new pool).
 *   Pool after the round: price per share = pre-money / pre FD and the new
 *   pool dilutes the new investors too.
 * Shares are kept as exact (fractional) numbers; closing documents round the
 * price to four decimals and shares to whole numbers, so they can differ by a
 * few shares.
 */
import { msg } from '../../msg';

export type PoolTiming = 'pre' | 'post';

export interface RoundSolveInput {
  /** Fully diluted shares before the round, including the unallocated pool. */
  preFdShares: number;
  /** Unallocated (available, ungranted) pool shares before the round. */
  existingPool: number;
  /** Headline pre-money valuation in currency units. */
  preMoney: number;
  /** New money in the round. */
  investment: number;
  /** Target unallocated pool as a percent of post-round FD shares (0 = no top-up). */
  poolTargetPct: number;
  timing: PoolTiming;
}

export interface RoundSolve {
  /** Shares added to the pool (0 if the existing pool already meets the target). */
  newPoolShares: number;
  pricePerShare: number;
  investorShares: number;
  postFdShares: number;
  postMoney: number;
  /** Unallocated pool after the round, shares and percent of post FD. */
  poolAfter: number;
  poolAfterPct: number;
  /** True when the existing pool was already at or above the target. */
  poolAlreadyMeetsTarget: boolean;
  /** New investors' percent of post-round FD shares. */
  investorPct: number;
  /** Fully diluted value of the post-round company at the round price (FD shares x price). */
  fdValueAtPrice: number;
}

export type SolveError = { error: string };

const isNum = (x: number) => typeof x === 'number' && Number.isFinite(x);

/**
 * Solves one priced round.
 *
 * Pool in the pre-money, with F = pre FD, U = existing pool, V = pre-money,
 * I = investment and t = target fraction: the post FD count is
 * (F + P) x (V + I) / V, so (U + P) = t x (F + P) x (V + I) / V gives
 * P = (kF - U) / (1 - k) with k = t (V + I) / V. It needs k < 1, i.e. the
 * pool's value t (V + I) must be less than the pre-money.
 *
 * Pool after the round: price = V / F, N = I / price and
 * P = (t (F + N) - U) / (1 - t).
 */
export function solveRound(input: RoundSolveInput): RoundSolve | SolveError {
  const { preFdShares: F, existingPool: U, preMoney: V, investment: I, poolTargetPct, timing } = input;
  if (!isNum(F) || F <= 0) return { error: 'Fully diluted shares before the round must be above zero.' };
  if (!isNum(U) || U < 0) return { error: 'The existing pool cannot be negative.' };
  if (U > F) return { error: 'The existing pool cannot be larger than the fully diluted shares.' };
  if (!isNum(V) || V <= 0) return { error: 'The pre-money valuation must be above zero.' };
  if (!isNum(I) || I < 0) return { error: 'The investment cannot be negative.' };
  if (!isNum(poolTargetPct) || poolTargetPct < 0 || poolTargetPct >= 100) return { error: 'The pool target must be from 0 to just under 100%.' };
  const t = poolTargetPct / 100;
  const post = V + I;

  let P = 0;
  let price: number;
  let N: number;
  if (timing === 'pre') {
    const k = (t * post) / V;
    if (t > 0 && k >= 1) {
      return { error: `A ${poolTargetPct}% pool of a ${post.toLocaleString('en-US')} post-money is worth at least the whole pre-money, so the pool cannot sit in the pre-money.` };
    }
    if (t > 0) P = Math.max(0, (k * F - U) / (1 - k));
    price = V / (F + P);
    N = I / price;
  } else {
    price = V / F;
    N = I / price;
    if (t > 0) P = Math.max(0, (t * (F + N) - U) / (1 - t));
  }
  const postFd = F + P + N;
  return {
    newPoolShares: P,
    pricePerShare: price,
    investorShares: N,
    postFdShares: postFd,
    postMoney: post,
    poolAfter: U + P,
    poolAfterPct: ((U + P) / postFd) * 100,
    poolAlreadyMeetsTarget: t > 0 ? P === 0 : true,
    investorPct: (N / postFd) * 100,
    fdValueAtPrice: postFd * price,
  };
}

/**
 * Solves the pool-in-pre-money case by fixed-point iteration instead of the
 * closed form, as an independent check (used in tests and the MCP notes).
 */
export function solvePrePoolIteratively(input: Omit<RoundSolveInput, 'timing'>, iterations = 200): number {
  const { preFdShares: F, existingPool: U, preMoney: V, investment: I, poolTargetPct } = input;
  const t = poolTargetPct / 100;
  let P = 0;
  for (let i = 0; i < iterations; i++) {
    const price = V / (F + P);
    const N = I / price;
    const next = Math.max(0, t * (F + P + N) - U);
    if (Math.abs(next - P) < 1e-9) return next;
    P = next;
  }
  return P;
}

// ---------------------------------------------------------------- multi-round cap table

export type HoldingKind = 'common' | 'preferred' | 'options' | 'pool';

export interface Holding {
  name: string;
  kind: HoldingKind;
  shares: number;
}

export interface RoundInvestor {
  name: string;
  amount: number;
}

export interface CapTableRound {
  name: string;
  preMoney: number;
  investors: RoundInvestor[];
  poolTargetPct: number;
  timing: PoolTiming;
  /** Options granted out of the unallocated pool before this round closes (moves shares from pool to granted options). */
  grantsBefore?: number;
}

export interface CapRow {
  name: string;
  kind: HoldingKind;
  /** Share class label, e.g. "Common", "Seed Preferred", "Options granted". */
  series: string;
}

export interface CapStage {
  label: string;
  /** Shares per row (same order as `rows`); rows that do not exist yet hold 0. */
  shares: number[];
  totalFd: number;
}

export interface CapRoundResult extends RoundSolve {
  name: string;
  preMoney: number;
  investment: number;
  preFdShares: number;
  existingPool: number;
  grantsBefore: number;
  timing: PoolTiming;
  poolTargetPct: number;
  /** Pre-money minus the value of the new pool shares at the round price (the headline figure when the pool is added after the round). */
  effectivePreMoney: number;
}

export interface CapTableResult {
  rows: CapRow[];
  /** stages[0] is the starting table; stages[i + 1] is after rounds[i]. */
  stages: CapStage[];
  rounds: CapRoundResult[];
}

export const POOL_ROW_NAME = msg('Unallocated option pool');
export const GRANTED_ROW_NAME = msg('Options granted');

const seriesFor = (kind: HoldingKind, roundName?: string) =>
  kind === 'common' ? 'Common' : kind === 'pool' ? 'Option pool' : kind === 'options' ? 'Options' : roundName ? `${roundName} Preferred` : 'Preferred';

/** Runs the starting holdings through each round in order. */
export function buildCapTable(holdings: Holding[], rounds: CapTableRound[]): CapTableResult | SolveError {
  if (holdings.length === 0) return { error: 'Add at least one shareholder.' };
  for (const h of holdings) {
    if (!isNum(h.shares) || h.shares < 0) return { error: `Shares for ${h.name || 'a holder'} must be zero or more.` };
  }
  // Unnamed holders get distinct names so they never merge into one row.
  const rows: CapRow[] = holdings.map((h, i) => ({ name: (h.name ?? '').trim() || `Holder ${i + 1}`, kind: h.kind, series: seriesFor(h.kind) }));
  let current = holdings.map((h) => h.shares);
  const total = (v: number[]) => v.reduce((a, b) => a + b, 0);
  if (!(total(current) > 0)) return { error: 'The starting cap table needs some shares.' };

  const findRow = (kind: HoldingKind, name: string, series: string) => rows.findIndex((r) => r.kind === kind && r.name === name && r.series === series);
  const ensureRow = (row: CapRow) => {
    let i = findRow(row.kind, row.name, row.series);
    if (i === -1) {
      rows.push(row);
      current = [...current, 0];
      i = rows.length - 1;
    }
    return i;
  };
  const poolIndex = () => {
    const i = rows.findIndex((r) => r.kind === 'pool');
    return i === -1 ? ensureRow({ name: POOL_ROW_NAME, kind: 'pool', series: 'Option pool' }) : i;
  };
  // Every unallocated pool row counts towards the pool (a table may list several plans).
  const poolTotal = () => rows.reduce((acc, r, i) => acc + (r.kind === 'pool' ? current[i] : 0), 0);

  const seen = new Set<string>();
  for (let ri = 0; ri < rounds.length; ri++) {
    const key = (rounds[ri].name.trim() || `Round ${ri + 1}`).toLowerCase();
    if (seen.has(key)) return { error: `Two rounds are named "${rounds[ri].name.trim() || `Round ${ri + 1}`}". Give each round its own name.` };
    seen.add(key);
  }

  const stages: CapStage[] = [{ label: 'Before', shares: [...current], totalFd: total(current) }];
  const results: CapRoundResult[] = [];

  for (let ri = 0; ri < rounds.length; ri++) {
    const round = rounds[ri];
    const name = round.name.trim() || `Round ${ri + 1}`;
    for (const x of round.investors) {
      if (!isNum(x.amount) || x.amount < 0) return { error: `${name}: investor amounts must be zero or more.` };
    }
    const investment = round.investors.reduce((s, x) => s + x.amount, 0);
    // Grants out of the pool before the round.
    let grants = 0;
    if (round.grantsBefore && round.grantsBefore > 0) {
      const available = poolTotal();
      if (round.grantsBefore > available + 1e-9) return { error: `${name}: ${Math.round(round.grantsBefore).toLocaleString('en-US')} options granted is more than the ${Math.round(available).toLocaleString('en-US')} left in the pool.` };
      grants = round.grantsBefore;
      const gi = ensureRow({ name: GRANTED_ROW_NAME, kind: 'options', series: 'Options' });
      // Draw the grants from the pool rows in order.
      let left = grants;
      for (let i = 0; i < rows.length && left > 0; i++) {
        if (rows[i].kind !== 'pool') continue;
        const take = Math.min(current[i], left);
        current[i] -= take;
        left -= take;
      }
      current[gi] += grants;
    }
    const existingPool = poolTotal();
    const preFd = total(current);
    const solved = solveRound({ preFdShares: preFd, existingPool, preMoney: round.preMoney, investment, poolTargetPct: round.poolTargetPct, timing: round.timing });
    if ('error' in solved) return { error: `${name}: ${solved.error}` };
    if (solved.newPoolShares > 0) {
      const pi = poolIndex();
      current[pi] += solved.newPoolShares;
    }
    for (const inv of round.investors) {
      if (!(inv.amount > 0)) continue;
      const i = ensureRow({ name: inv.name.trim() || `${name} investor`, kind: 'preferred', series: seriesFor('preferred', name) });
      current[i] += inv.amount / solved.pricePerShare;
    }
    stages.push({ label: `After ${name}`, shares: [...current], totalFd: total(current) });
    results.push({
      ...solved,
      name,
      preMoney: round.preMoney,
      investment,
      preFdShares: preFd,
      existingPool,
      grantsBefore: grants,
      timing: round.timing,
      poolTargetPct: round.poolTargetPct,
      effectivePreMoney: round.timing === 'pre' ? round.preMoney - solved.newPoolShares * solved.pricePerShare : round.preMoney,
    });
  }
  // Pad earlier stages to the final row count.
  for (const s of stages) while (s.shares.length < rows.length) s.shares.push(0);
  return { rows, stages, rounds: results };
}

/** Percent of fully diluted shares for each row at a stage. */
export const stagePercents = (stage: CapStage) => stage.shares.map((s) => (stage.totalFd > 0 ? (s / stage.totalFd) * 100 : 0));

/** Shares and percent per holder name (a holder can own several classes), at a stage. */
export function ownershipByHolder(result: CapTableResult, stageIndex: number): { name: string; shares: number; pct: number }[] {
  const stage = result.stages[stageIndex];
  const map = new Map<string, number>();
  result.rows.forEach((r, i) => map.set(r.name, (map.get(r.name) ?? 0) + stage.shares[i]));
  return [...map.entries()].map(([name, shares]) => ({ name, shares, pct: stage.totalFd > 0 ? (shares / stage.totalFd) * 100 : 0 }));
}

/** Dilution between two ownership percentages, as a percent of the earlier stake (1 - after / before). */
export const dilutionPct = (beforePct: number, afterPct: number) => (beforePct > 0 ? (1 - afterPct / beforePct) * 100 : 0);
