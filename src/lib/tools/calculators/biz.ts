/**
 * Business calculators: margin and markup, break-even, depreciation and
 * sales commission. Pure functions (no React) so the UI and the regression
 * tests in src/test/tools/calc-biz.test.ts run the same maths.
 *
 * Percentages are passed and returned as percent numbers (40 means 40%).
 */
import { msg } from '../../msg';

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Round to cents without the 1.005 → 1.00 binary float surprise. */
export function roundMoney(x: number): number {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

/* ------------------------------------------------------------------ */
/* Margin and markup                                                   */
/* ------------------------------------------------------------------ */

export type MarginField = 'cost' | 'price' | 'margin' | 'markup' | 'profit';

export interface MarginInputs {
  cost?: number;
  price?: number;
  /** Gross margin as % of price. */
  margin?: number;
  /** Markup as % of cost. */
  markup?: number;
  profit?: number;
}

export interface MarginResult {
  cost: number;
  price: number;
  profit: number;
  /** % of price; null when price is 0. */
  margin: number | null;
  /** % of cost; null when cost is 0. */
  markup: number | null;
}

export type Solved<T> = { ok: true; value: T; error?: undefined } | { ok: false; value?: undefined; error: string };

/** Margin % that a given markup % produces: m = k / (1 + k). */
export function markupToMargin(markupPct: number): number | null {
  if (markupPct <= -100) return null;
  return (markupPct / (100 + markupPct)) * 100;
}

/** Markup % needed to produce a given margin %: k = m / (1 - m). */
export function marginToMarkup(marginPct: number): number | null {
  if (marginPct >= 100) return null;
  return (marginPct / (100 - marginPct)) * 100;
}

function finish(cost: number, price: number): Solved<MarginResult> {
  if (!isNum(cost) || !isNum(price)) return { ok: false, error: msg('These inputs do not give a finite cost and price.') };
  if (cost < 0) return { ok: false, error: msg('These inputs imply a negative cost, which is not possible.') };
  if (price < 0) return { ok: false, error: msg('These inputs imply a negative selling price.') };
  const profit = price - cost;
  return {
    ok: true,
    value: {
      cost,
      price,
      profit,
      margin: price === 0 ? null : (profit / price) * 100,
      markup: cost === 0 ? null : (profit / cost) * 100,
    },
  };
}

/**
 * Solve every margin/markup quantity from exactly two known ones.
 * Margin and markup together are not enough: they are two views of the
 * same ratio, so neither fixes the size of the sale.
 */
export function solveMarginMarkup(known: MarginInputs): Solved<MarginResult> {
  const keys = (Object.keys(known) as MarginField[]).filter((k) => isNum(known[k]));
  if (keys.length !== 2) return { ok: false, error: msg('Enter exactly two of cost, price, margin, markup and profit.') };
  const { cost: c, price: p, margin: m, markup: k, profit: g } = known;
  const has = (f: MarginField) => keys.includes(f);

  if (has('cost') && has('price')) return finish(c!, p!);
  if (has('cost') && has('margin')) {
    if (m! >= 100) return { ok: false, error: msg('A margin of 100% or more is impossible when the item costs anything: margin is profit divided by price, and profit can never reach the whole price.') };
    return finish(c!, c! / (1 - m! / 100));
  }
  if (has('cost') && has('markup')) {
    if (k! < -100) return { ok: false, error: msg('A markup below -100% would mean a negative price.') };
    return finish(c!, c! * (1 + k! / 100));
  }
  if (has('cost') && has('profit')) return finish(c!, c! + g!);
  if (has('price') && has('margin')) {
    if (m! > 100) return { ok: false, error: msg('Margin cannot exceed 100% of price.') };
    return finish(p! * (1 - m! / 100), p!);
  }
  if (has('price') && has('markup')) {
    if (k! <= -100) return { ok: false, error: msg('Markup must be greater than -100%.') };
    return finish(p! / (1 + k! / 100), p!);
  }
  if (has('price') && has('profit')) return finish(p! - g!, p!);
  if (has('profit') && has('margin')) {
    if (m === 0) return { ok: false, error: msg('With a 0% margin the profit is 0 at any price, so the price cannot be found.') };
    if (m! >= 100) return { ok: false, error: msg('Margin must be below 100% to solve for cost.') };
    const price = g! / (m! / 100);
    return finish(price - g!, price);
  }
  if (has('profit') && has('markup')) {
    if (k === 0) return { ok: false, error: msg('With a 0% markup the profit is 0 at any cost, so the cost cannot be found.') };
    const cost = g! / (k! / 100);
    return finish(cost, cost + g!);
  }
  return {
    ok: false,
    error: msg('Margin and markup describe the same ratio from two sides, so together they cannot tell the size of the sale. Add a cost, price or profit.'),
  };
}

/**
 * Sales tax, VAT or GST on a selling price. Margin and markup are always
 * worked on the price before tax, because the tax belongs to the government
 * (UK VAT, Indian and Australian GST, Canadian GST/HST). `priceBeforeTax`
 * turns a tax-inclusive shelf price (UK and Australian consumer prices,
 * Indian MRP) back into the net price; `priceWithTax` goes the other way.
 */
export function priceBeforeTax(grossPrice: number, taxRatePct: number): number {
  return grossPrice / (1 + taxRatePct / 100);
}
export function priceWithTax(netPrice: number, taxRatePct: number): { net: number; tax: number; gross: number } {
  const tax = (netPrice * taxRatePct) / 100;
  return { net: netPrice, tax, gross: netPrice + tax };
}

/**
 * The classic pricing mistake: a seller wants a target margin but applies
 * that percentage as a markup on cost.
 */
export function marginMistake(cost: number, targetMarginPct: number) {
  const wrongPrice = cost * (1 + targetMarginPct / 100);
  const rightPrice = targetMarginPct < 100 ? cost / (1 - targetMarginPct / 100) : NaN;
  const actualMargin = wrongPrice === 0 ? 0 : ((wrongPrice - cost) / wrongPrice) * 100;
  return { wrongPrice, rightPrice, actualMargin, shortfallPerUnit: rightPrice - wrongPrice };
}

/* ------------------------------------------------------------------ */
/* Break-even                                                          */
/* ------------------------------------------------------------------ */

export interface BreakEvenInputs {
  fixedCosts: number;
  pricePerUnit: number;
  variableCostPerUnit: number;
  /** Pre-tax target profit for the period (optional). */
  targetProfit?: number;
  /** Expected unit sales, for margin of safety and operating leverage. */
  expectedUnits?: number;
}

export interface BreakEvenResult {
  contributionPerUnit: number;
  /** Contribution margin ratio as a %. */
  contributionRatio: number;
  /** Exact break-even units (may be fractional). */
  breakEvenUnits: number;
  /** Units you actually have to sell: rounded up. */
  breakEvenUnitsWhole: number;
  breakEvenRevenue: number;
  targetUnits: number | null;
  targetUnitsWhole: number | null;
  targetRevenue: number | null;
  expected: null | {
    revenue: number;
    totalCost: number;
    profit: number;
    /** (expected - break-even) / expected, as a %. */
    marginOfSafetyPct: number;
    marginOfSafetyUnits: number;
    /** Contribution / operating profit; null when profit is 0 or negative. */
    operatingLeverage: number | null;
  };
}

export function breakEven(i: BreakEvenInputs): Solved<BreakEvenResult> {
  const { fixedCosts: F, pricePerUnit: P, variableCostPerUnit: V } = i;
  if (![F, P, V].every(isNum)) return { ok: false, error: msg('Enter fixed costs, price and variable cost as numbers.') };
  if (F < 0) return { ok: false, error: msg('Fixed costs cannot be negative.') };
  if (P <= 0) return { ok: false, error: msg('Price per unit must be greater than zero.') };
  if (V < 0) return { ok: false, error: msg('Variable cost per unit cannot be negative.') };
  const cm = P - V;
  if (cm <= 0) {
    return {
      ok: false,
      error: msg('Each unit sells for no more than it costs to make, so there is no contribution toward fixed costs and the business never breaks even. Raise the price or cut the variable cost.'),
    };
  }
  const cmr = cm / P;
  const beUnits = F / cm;
  // Guard against 99.99999999 style float noise before rounding up.
  const ceil = (x: number) => Math.ceil(x - 1e-9);
  const T = i.targetProfit;
  const hasTarget = isNum(T);
  const targetUnits = hasTarget ? (F + T!) / cm : null;
  let expected: BreakEvenResult['expected'] = null;
  if (isNum(i.expectedUnits) && i.expectedUnits > 0) {
    const q = i.expectedUnits;
    const revenue = P * q;
    const totalCost = F + V * q;
    const profit = revenue - totalCost;
    expected = {
      revenue,
      totalCost,
      profit,
      marginOfSafetyPct: ((q - beUnits) / q) * 100,
      marginOfSafetyUnits: q - beUnits,
      operatingLeverage: profit > 0 ? (cm * q) / profit : null,
    };
  }
  return {
    ok: true,
    value: {
      contributionPerUnit: cm,
      contributionRatio: cmr * 100,
      breakEvenUnits: beUnits,
      breakEvenUnitsWhole: ceil(beUnits),
      breakEvenRevenue: F / cmr,
      targetUnits,
      targetUnitsWhole: targetUnits === null ? null : Math.max(0, ceil(targetUnits)),
      targetRevenue: targetUnits === null ? null : targetUnits * P,
      expected,
    },
  };
}

/** Pre-tax profit needed to keep a given after-tax profit. */
export function preTaxTarget(afterTaxProfit: number, taxRatePct: number): number {
  if (taxRatePct >= 100) return NaN;
  return afterTaxProfit / (1 - taxRatePct / 100);
}

/** Points for a cost-volume-profit chart from 0 to maxUnits. */
export function breakEvenChart(i: BreakEvenInputs, maxUnits: number, steps = 20) {
  const out: { units: number; revenue: number; totalCost: number; fixed: number }[] = [];
  const step = Math.max(maxUnits / steps, 1e-9);
  for (let s = 0; s <= steps; s++) {
    const q = Math.round(step * s * 100) / 100;
    out.push({ units: q, revenue: i.pricePerUnit * q, totalCost: i.fixedCosts + i.variableCostPerUnit * q, fixed: i.fixedCosts });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Depreciation                                                        */
/* ------------------------------------------------------------------ */

export type DepreciationMethod = 'straight-line' | 'declining-balance' | 'double-declining' | 'sum-of-years' | 'units-of-production' | 'macrs' | 'tax-pool';

/**
 * First-year treatment for the tax-pool method (market versions):
 * - 'full': the full rate in year 1 (UK writing-down allowance, India WDV
 *   for an asset put to use for 180 days or more);
 * - 'half': half the rate (Canada CCA half-year rule; India half rate for an
 *   asset put to use for less than 180 days; Australian small business pool,
 *   15% in the year added = half of 30%);
 * - 'enhanced': 1.5 times the rate (Canada Accelerated Investment Incentive
 *   for property available for use 2018 to 2023);
 * - 'months': the rate x months held / 12 (ATO diminishing value is
 *   pro-rated by days held; months approximate it);
 * - 'allowance': a first-year allowance of `firstYearAllowancePct` of cost
 *   instead of the rate, the rest pooled from year 2 (UK AIA = 100%, the UK
 *   40% first-year allowance).
 */
export type TaxPoolFirstYear = 'full' | 'half' | 'enhanced' | 'months' | 'allowance';
export const TAX_POOL_FIRST_YEAR: TaxPoolFirstYear[] = ['full', 'half', 'enhanced', 'months', 'allowance'];

export interface DepreciationInputs {
  method: DepreciationMethod;
  cost: number;
  salvage: number;
  /** Useful life in whole years (ignored for MACRS, which uses `macrsClass`). */
  life: number;
  /** Declining-balance factor: 2 = 200% (double), 1.5 = 150%. */
  factor?: number;
  /** Switch from declining balance to straight-line when SL gives more. */
  switchToStraightLine?: boolean;
  /** Months of use in the first fiscal year, 1 to 12 (12 = full year). */
  firstYearMonths?: number;
  /** Units-of-production: total lifetime units and units used each year. */
  totalUnits?: number;
  unitsPerYear?: number[];
  /** MACRS GDS recovery class in years, half-year convention (Table A-1). */
  macrsClass?: MacrsClass;
  /**
   * Tax pool: a fixed rate (%) on the reducing balance, as tax systems
   * outside the US work (UK capital allowances, Canada CCA, India WDV
   * blocks, ATO diminishing value). Salvage is ignored and `life` is the
   * number of years shown; the pool is never forced to zero.
   */
  poolRatePct?: number;
  poolFirstYear?: TaxPoolFirstYear;
  /** First-year allowance as % of cost, for poolFirstYear 'allowance'. */
  firstYearAllowancePct?: number;
}

export interface DepreciationRow {
  year: number;
  beginningBookValue: number;
  depreciation: number;
  accumulated: number;
  endingBookValue: number;
  /** Rate applied this year as a % (of book value, depreciable base or basis). */
  rate: number | null;
  note?: string;
}

export interface DepreciationResult {
  rows: DepreciationRow[];
  depreciableBase: number;
  totalDepreciation: number;
}

/**
 * IRS Publication 946 (2025), Appendix A, Table A-1: GDS percentages for
 * 3-, 5-, 7-, 10-, 15- and 20-year property, half-year convention.
 * 3 to 10 year classes use 200% DB, 15 and 20 year use 150% DB, both
 * switching to straight line.
 */
export const MACRS_HALF_YEAR = {
  3: [33.33, 44.45, 14.81, 7.41],
  5: [20.0, 32.0, 19.2, 11.52, 11.52, 5.76],
  7: [14.29, 24.49, 17.49, 12.49, 8.93, 8.92, 8.93, 4.46],
  10: [10.0, 18.0, 14.4, 11.52, 9.22, 7.37, 6.55, 6.55, 6.56, 6.55, 3.28],
  15: [5.0, 9.5, 8.55, 7.7, 6.93, 6.23, 5.9, 5.9, 5.91, 5.9, 5.91, 5.9, 5.91, 5.9, 5.91, 2.95],
  20: [3.75, 7.219, 6.677, 6.177, 5.713, 5.285, 4.888, 4.522, 4.462, 4.461, 4.462, 4.461, 4.462, 4.461, 4.462, 4.461, 4.462, 4.461, 4.462, 4.461, 2.231],
} as const;
export type MacrsClass = keyof typeof MACRS_HALF_YEAR;
export const MACRS_CLASSES = Object.keys(MACRS_HALF_YEAR).map(Number) as MacrsClass[];

function validateDep(i: DepreciationInputs): string | null {
  if (!isNum(i.cost) || i.cost <= 0) return msg('Enter the asset cost (greater than zero).');
  if (i.method === 'macrs') {
    if (!i.macrsClass || !(i.macrsClass in MACRS_HALF_YEAR)) return msg('Pick a MACRS recovery class.');
    return null;
  }
  if (i.method === 'tax-pool') {
    const r = i.poolRatePct;
    if (!isNum(r) || r <= 0 || r > 100) return msg('Enter the pool rate, above 0% and up to 100%.');
    if (!Number.isInteger(i.life) || i.life < 1 || i.life > 100) return msg('Years to show must be a whole number from 1 to 100.');
    const fy = i.poolFirstYear ?? 'full';
    if (!TAX_POOL_FIRST_YEAR.includes(fy)) return msg('Pick a first-year rule.');
    if (fy === 'months') {
      const m = i.firstYearMonths ?? 12;
      if (!Number.isInteger(m) || m < 1 || m > 12) return msg('Months in the first year must be a whole number from 1 to 12.');
    }
    if (fy === 'allowance') {
      const a = i.firstYearAllowancePct;
      if (!isNum(a) || a < 0 || a > 100) return msg('The first-year allowance must be from 0% to 100% of cost.');
    }
    return null;
  }
  if (!isNum(i.salvage) || i.salvage < 0) return msg('Salvage value cannot be negative.');
  if (i.salvage > i.cost) return msg('Salvage value cannot be more than the cost.');
  if (i.method !== 'units-of-production') {
    if (!Number.isInteger(i.life) || i.life < 1 || i.life > 100) return msg('Useful life must be a whole number of years from 1 to 100.');
  }
  const m = i.firstYearMonths ?? 12;
  if (!Number.isInteger(m) || m < 1 || m > 12) return msg('Months in the first year must be a whole number from 1 to 12.');
  if (i.method === 'declining-balance') {
    const f = i.factor ?? 2;
    if (!isNum(f) || f <= 0 || f > 10) return msg('Declining-balance factor must be above 0 (1.5 = 150%, 2 = 200%).');
  }
  if (i.method === 'units-of-production') {
    if (!isNum(i.totalUnits) || i.totalUnits <= 0) return msg('Enter the total units the asset is expected to produce.');
    const u = i.unitsPerYear ?? [];
    if (u.length === 0) return msg('Enter the units produced in each year.');
    if (u.some((x) => !isNum(x) || x < 0)) return msg('Units per year must be zero or positive numbers.');
  }
  return null;
}

/**
 * Spread an array of "asset-year" amounts across fiscal years when the
 * asset starts part-way through year 1: fiscal year k gets f of asset-year
 * k plus (1 - f) of asset-year k - 1. Used for straight-line and SYD.
 */
function spreadAcrossFiscalYears(assetYears: number[], f: number): number[] {
  if (f >= 1) return assetYears.slice();
  const out: number[] = [];
  for (let k = 0; k <= assetYears.length; k++) {
    const cur = k < assetYears.length ? assetYears[k] * f : 0;
    const prev = k > 0 ? assetYears[k - 1] * (1 - f) : 0;
    out.push(cur + prev);
  }
  return out;
}

function toRows(cost: number, amounts: number[], rates: (number | null)[], notes: (string | undefined)[] = []): DepreciationRow[] {
  const rows: DepreciationRow[] = [];
  let bv = cost;
  let acc = 0;
  amounts.forEach((d, idx) => {
    const begin = bv;
    acc += d;
    bv = cost - acc;
    // Clean float dust like 1e-12 so a fully depreciated asset reads 0.
    if (Math.abs(bv) < 1e-7) bv = 0;
    rows.push({ year: idx + 1, beginningBookValue: begin, depreciation: d, accumulated: acc, endingBookValue: bv, rate: rates[idx] ?? null, note: notes[idx] });
  });
  return rows;
}

function decliningBalance(cost: number, salvage: number, life: number, factor: number, doSwitch: boolean, f: number) {
  const rate = factor / life;
  const amounts: number[] = [];
  const rates: (number | null)[] = [];
  const notes: (string | undefined)[] = [];
  let bv = cost;
  let elapsed = 0; // years of life used before the current fiscal year
  let switched = false;
  const totalYears = f < 1 ? life + 1 : life;
  for (let y = 1; y <= totalYears; y++) {
    const portion = y === 1 ? f : Math.min(1, life - elapsed);
    const remainingLife = life - elapsed;
    const room = Math.max(0, bv - salvage);
    let d = bv * rate * portion;
    let note: string | undefined;
    let r: number | null = rate * 100;
    if (doSwitch && remainingLife > 0) {
      const sl = (room / remainingLife) * portion;
      if (switched || sl > d + 1e-9) {
        if (!switched) note = msg('Switched to straight-line');
        switched = true;
        d = sl;
        r = null;
      }
    }
    const isLast = y === totalYears;
    if (isLast && !doSwitch && room > d) {
      d = room;
      note = msg('Final year: brought down to salvage');
    }
    d = Math.min(d, room);
    amounts.push(d);
    rates.push(r);
    notes.push(note);
    bv -= d;
    elapsed += portion;
  }
  return { amounts, rates, notes };
}

/** First-year rate for the tax pool, as a % of cost. */
export function taxPoolFirstYearPct(i: Pick<DepreciationInputs, 'poolRatePct' | 'poolFirstYear' | 'firstYearMonths' | 'firstYearAllowancePct'>): number {
  const r = i.poolRatePct ?? 0;
  switch (i.poolFirstYear ?? 'full') {
    case 'half':
      return r / 2;
    case 'enhanced':
      return Math.min(100, r * 1.5);
    case 'months':
      return (r * (i.firstYearMonths ?? 12)) / 12;
    case 'allowance':
      return i.firstYearAllowancePct ?? 0;
    default:
      return r;
  }
}

const POOL_NOTES: Record<TaxPoolFirstYear, string | undefined> = {
  full: undefined,
  half: msg('Half rate in the first year'),
  enhanced: msg('1.5 x rate in the first year'),
  months: msg('Pro-rated for months held'),
  allowance: msg('First-year allowance'),
};

function taxPool(i: DepreciationInputs) {
  const rate = i.poolRatePct!;
  const amounts: number[] = [];
  const rates: (number | null)[] = [];
  const notes: (string | undefined)[] = [];
  let bv = i.cost;
  for (let y = 1; y <= i.life; y++) {
    const r = y === 1 ? taxPoolFirstYearPct(i) : rate;
    const d = Math.min(bv, (bv * r) / 100);
    amounts.push(d);
    rates.push(r);
    notes.push(y === 1 ? POOL_NOTES[i.poolFirstYear ?? 'full'] : undefined);
    bv -= d;
  }
  return { amounts, rates, notes };
}

export function depreciationSchedule(i: DepreciationInputs): Solved<DepreciationResult> {
  const err = validateDep(i);
  if (err) return { ok: false, error: err };
  const cost = i.cost;
  const f = (i.firstYearMonths ?? 12) / 12;

  if (i.method === 'macrs') {
    const table = MACRS_HALF_YEAR[i.macrsClass!];
    const amounts = table.map((p) => (cost * p) / 100);
    // Table percentages are rounded and can sum to 100.01; cap at cost.
    const total = amounts.reduce((a, b) => a + b, 0);
    if (total > cost) amounts[amounts.length - 1] -= total - cost;
    const rows = toRows(cost, amounts, table.slice(), table.map((_, k) => (k === 0 ? 'Half-year convention' : undefined)));
    return { ok: true, value: { rows, depreciableBase: cost, totalDepreciation: cost } };
  }

  if (i.method === 'tax-pool') {
    const { amounts, rates, notes } = taxPool(i);
    const rows = toRows(cost, amounts, rates, notes);
    return { ok: true, value: { rows, depreciableBase: cost, totalDepreciation: amounts.reduce((a, b) => a + b, 0) } };
  }

  const salvage = i.salvage;
  const base = cost - salvage;
  const N = i.life;

  if (i.method === 'straight-line') {
    const annual = base / N;
    const amounts = spreadAcrossFiscalYears(Array(N).fill(annual), f);
    const rows = toRows(cost, amounts, amounts.map((d) => (base > 0 ? (d / base) * 100 : 0)));
    return { ok: true, value: { rows, depreciableBase: base, totalDepreciation: base } };
  }

  if (i.method === 'sum-of-years') {
    const syd = (N * (N + 1)) / 2;
    const assetYears = Array.from({ length: N }, (_, k) => (base * (N - k)) / syd);
    const amounts = spreadAcrossFiscalYears(assetYears, f);
    const rows = toRows(
      cost,
      amounts,
      amounts.map((d) => (base > 0 ? (d / base) * 100 : 0)),
      f >= 1 ? assetYears.map((_, k) => `${N - k}/${syd}`) : [],
    );
    return { ok: true, value: { rows, depreciableBase: base, totalDepreciation: base } };
  }

  if (i.method === 'units-of-production') {
    const perUnit = base / i.totalUnits!;
    let room = base;
    const amounts: number[] = [];
    const notes: (string | undefined)[] = [];
    for (const u of i.unitsPerYear!) {
      let d = u * perUnit;
      let note: string | undefined;
      if (d > room) {
        d = room;
        note = msg('Capped: asset fully depreciated');
      }
      room -= d;
      amounts.push(d);
      notes.push(note);
    }
    const rows = toRows(cost, amounts, amounts.map(() => null), notes);
    const total = amounts.reduce((a, b) => a + b, 0);
    return { ok: true, value: { rows, depreciableBase: base, totalDepreciation: total } };
  }

  const factor = i.method === 'double-declining' ? 2 : i.factor ?? 2;
  const { amounts, rates, notes } = decliningBalance(cost, salvage, N, factor, i.switchToStraightLine ?? false, f);
  const rows = toRows(cost, amounts, rates, notes);
  const total = amounts.reduce((a, b) => a + b, 0);
  return { ok: true, value: { rows, depreciableBase: base, totalDepreciation: total } };
}

/* ------------------------------------------------------------------ */
/* Commission                                                          */
/* ------------------------------------------------------------------ */

export interface CommissionTier {
  /** Upper bound of the tier (inclusive of sales up to here); null = no cap. */
  upTo: number | null;
  /** Rate in % for sales in this tier. */
  rate: number;
}

export interface TierSlice {
  from: number;
  to: number;
  amount: number;
  rate: number;
  commission: number;
}

export function validateTiers(tiers: CommissionTier[]): string | null {
  if (tiers.length === 0) return msg('Add at least one tier.');
  let prev = 0;
  for (let k = 0; k < tiers.length; k++) {
    const t = tiers[k];
    if (!isNum(t.rate) || t.rate < 0) return `Tier ${k + 1}: rate must be zero or more.`;
    const last = k === tiers.length - 1;
    if (t.upTo === null) {
      if (!last) return `Tier ${k + 1}: only the last tier can be open-ended.`;
    } else {
      if (!isNum(t.upTo) || t.upTo <= prev) return `Tier ${k + 1}: the upper limit must be higher than the previous tier's.`;
      prev = t.upTo;
    }
  }
  return null;
}

/**
 * Marginal (graduated) tiers: each slice of sales earns its own tier's rate,
 * the way income tax brackets work.
 */
export function tieredMarginal(sales: number, tiers: CommissionTier[]): { total: number; slices: TierSlice[] } {
  const slices: TierSlice[] = [];
  let lower = 0;
  let total = 0;
  for (const t of tiers) {
    if (sales <= lower) break;
    const upper = t.upTo === null ? sales : Math.min(sales, t.upTo);
    const amount = upper - lower;
    const commission = (amount * t.rate) / 100;
    slices.push({ from: lower, to: upper, amount, rate: t.rate, commission });
    total += commission;
    if (t.upTo === null) break;
    lower = t.upTo;
  }
  // Sales beyond the last capped tier earn nothing extra (plan cap).
  return { total, slices };
}

/**
 * Whole-amount ("retroactive") tiers: the rate of the tier the total lands
 * in applies to every dollar, so crossing a threshold lifts the commission
 * on all earlier sales too.
 */
export function tieredWholeAmount(sales: number, tiers: CommissionTier[]): { total: number; rate: number; tierIndex: number } {
  let idx = tiers.length - 1;
  for (let k = 0; k < tiers.length; k++) {
    const up = tiers[k].upTo;
    if (up === null || sales <= up) {
      idx = k;
      break;
    }
  }
  const rate = tiers[idx].rate;
  return { total: (sales * rate) / 100, rate, tierIndex: idx };
}

export function flatCommission(sales: number, ratePct: number): number {
  return (sales * ratePct) / 100;
}

export interface DrawRow {
  period: number;
  earned: number;
  /** Deficit carried in from earlier periods (recoverable draws only). */
  carriedIn: number;
  payout: number;
  /** Part of the payout that was draw rather than earned commission. */
  drawTopUp: number;
  carriedOut: number;
}

/**
 * Draw against commission. Each period the rep receives at least the draw.
 * With a recoverable draw, any shortfall is owed back out of later
 * commission; with a non-recoverable draw it is forgiven.
 */
export function drawSchedule(earnedPerPeriod: number[], draw: number, recoverable: boolean): DrawRow[] {
  const rows: DrawRow[] = [];
  let owed = 0;
  earnedPerPeriod.forEach((earned, k) => {
    const net = recoverable ? earned - owed : earned;
    const payout = Math.max(draw, net);
    const drawTopUp = Math.max(0, draw - net);
    const carriedOut = recoverable ? drawTopUp : 0;
    rows.push({ period: k + 1, earned, carriedIn: recoverable ? owed : 0, payout, drawTopUp, carriedOut });
    owed = carriedOut;
  });
  return rows;
}

/** Commission rate (%) needed to reach a target income from base + sales. */
export function rateForTarget(targetIncome: number, base: number, sales: number): number | null {
  if (sales <= 0) return null;
  return ((targetIncome - base) / sales) * 100;
}

/** Sales needed to reach a target income at a flat rate. */
export function salesForTarget(targetIncome: number, base: number, ratePct: number): number | null {
  if (ratePct <= 0) return null;
  return (targetIncome - base) / (ratePct / 100);
}

/** Parse "10000, 12000 9000" style lists into numbers; null on bad input. */
export function parseNumberList(text: string): number[] | null {
  const parts = text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
  const out = parts.map((s) => Number(s.replace(/[$€£₹¥]/g, '')));
  return out.some((n) => !Number.isFinite(n)) ? null : out;
}

/**
 * Smallest sales figure whose commission reaches `targetCommission`, for any
 * non-decreasing commission function (flat, marginal or whole-amount tiers).
 * Bisection to the cent; null when the target is unreachable (capped plan).
 */
export function salesForCommission(targetCommission: number, commissionOf: (sales: number) => number, maxSales = 1e12): number | null {
  if (targetCommission <= 0) return 0;
  if (commissionOf(maxSales) < targetCommission) return null;
  let lo = 0;
  let hi = maxSales;
  for (let k = 0; k < 200 && hi - lo > 0.001; k++) {
    const mid = (lo + hi) / 2;
    if (commissionOf(mid) >= targetCommission - 1e-9) hi = mid;
    else lo = mid;
  }
  // Snap to the nearest cent that still reaches the target.
  const c = Math.round(hi * 100) / 100;
  return commissionOf(c) >= targetCommission - 1e-9 ? c : Math.round((c + 0.01) * 100) / 100;
}

/** Encode/decode tiers as "10000:5,20000:7,:10" for share links. */
export function encodeTiers(tiers: CommissionTier[]): string {
  return tiers.map((t) => `${t.upTo ?? ''}:${t.rate}`).join(',');
}
export function decodeTiers(s: string): CommissionTier[] {
  return s
    .split(',')
    .filter(Boolean)
    .map((part) => {
      const [u, r] = part.split(':');
      return { upTo: u === '' || u === undefined ? null : Number(u), rate: Number(r) };
    });
}
