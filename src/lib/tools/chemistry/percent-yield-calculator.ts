/**
 * Percent yield and atom economy.
 *
 * Percent yield = actual yield / theoretical yield x 100 (OpenStax
 * Chemistry 2e, 4.4); solve for any one of the three. The theoretical yield
 * can also come from a balanced equation and reactant amounts through the
 * shared limiting-reactant core.
 *
 * Atom economy = nu_p M_p / sum(nu_r M_r) x 100: the share of reactant mass
 * that ends up in the desired product when the reaction runs perfectly
 * (Trost, Science 254, 1991). It ignores yield, solvents and reagents not in
 * the equation.
 */
import { balanceEquation, findSpecies, type BalancedEquation, type Result } from './equation-balancer';
import { reactionYield, type ChemT, type YieldResult } from './limiting-reactant-calculator';
import { msg } from '../../msg';

const enT: ChemT = (source, vars) => (vars ? source.replace(/\{(\w+)\}/g, (all, k: string) => (vars[k] === undefined ? all : String(vars[k]))) : source);
import { countSigFigs, type AmountInput, type GasConvention } from './stoichiometry-calculator';

const ok = <T,>(value: T): Result<T> => ({ ok: true, value });
const fail = <T,>(error: string): Result<T> => ({ ok: false, error });

export type YieldKey = 'actual' | 'theoretical' | 'percent';

export type PercentYieldResult = {
  actual: number;
  theoretical: number;
  percent: number;
  /** Mass lost relative to theory (negative when the yield is above 100%). */
  shortfall: number;
  warnings: string[];
};

export const OVER_100_CAUSES = [
  msg('the product is still wet or holds solvent'),
  msg('impurities or unreacted starting material were weighed with it'),
  msg('a hydrate or a different product formed than the one in the equation'),
  msg('a weighing or calculation error, such as the wrong molar mass'),
];

const MISSING: Record<YieldKey, string> = { actual: msg('Enter the actual yield.'), theoretical: msg('Enter the theoretical yield.'), percent: msg('Enter the percent yield.') };
const NOT_POSITIVE: Record<YieldKey, string> = {
  actual: msg('The actual yield must be greater than zero.'),
  theoretical: msg('The theoretical yield must be greater than zero.'),
  percent: msg('The percent yield must be greater than zero.'),
};

/** Solve percent = actual / theoretical x 100 for the missing value. Masses in any one unit. */
export function solvePercentYield(solveFor: YieldKey, v: Partial<Record<YieldKey, number>>, t: ChemT = enT): Result<PercentYieldResult> {
  const need = (['actual', 'theoretical', 'percent'] as YieldKey[]).filter((k) => k !== solveFor);
  for (const k of need) {
    const x = v[k];
    if (x === undefined || !Number.isFinite(x)) return fail(t(MISSING[k]));
    // Zero actual yield is a real (if sad) result when solving for percent,
    // but cannot give a theoretical yield.
    const allowZero = k === 'actual' && solveFor === 'percent';
    if (allowZero ? x < 0 : x <= 0) return fail(t(NOT_POSITIVE[k]));
  }
  let actual = v.actual ?? 0;
  let theoretical = v.theoretical ?? 0;
  let percent = v.percent ?? 0;
  if (solveFor === 'percent') percent = (actual / theoretical) * 100;
  else if (solveFor === 'actual') actual = (percent / 100) * theoretical;
  else theoretical = actual / (percent / 100);
  const warnings: string[] = [];
  if (percent > 100 + 1e-9) {
    warnings.push(t('A yield above 100% is not physically possible for a pure, dry product. Likely causes: {causes}.', { causes: OVER_100_CAUSES.map((c) => t(c)).join('; ') }));
  }
  return ok({ actual, theoretical, percent, shortfall: theoretical - actual, warnings });
}

/**
 * Significant figures for the solved value in "actual and theoretical" mode.
 * Only the masses set the precision: a percent typed as "80" would count as
 * one significant figure under the trailing-zero rule, which is rarely what a
 * student means, so a typed percent is never the limiting input.
 */
export function percentYieldSigFigs(solveFor: YieldKey, typed: Partial<Record<YieldKey, string>>): number | undefined {
  const masses = (['actual', 'theoretical'] as YieldKey[]).filter((k) => k !== solveFor);
  const sfs = masses.map((k) => countSigFigs(typed[k] ?? '')).filter((x): x is number => typeof x === 'number');
  return sfs.length === masses.length && sfs.length > 0 ? Math.min(...sfs) : undefined;
}

/**
 * Significant figures in "from an equation" mode: the theoretical yield
 * follows the reactant amount alone (1.274 g gives 0.5072 g); the percent
 * yield follows the less precise of that amount and the actual yield.
 */
export function equationYieldSigFigs(amountTyped: string, actualTyped: string): { theoretical?: number; percent?: number } {
  const a = countSigFigs(amountTyped);
  const b = countSigFigs(actualTyped);
  return { theoretical: a, percent: a && b ? Math.min(a, b) : undefined };
}

export type EquationYieldResult = PercentYieldResult & {
  yieldResult: YieldResult;
  /** Labels of the reactant(s) that actually limit, from the amounts given. */
  limitingLabels: string[];
  productIndex: number;
  productLabel: string;
  /** Theoretical yield of the chosen product in grams. */
  theoreticalGrams: number;
};

/**
 * Percent yield of `product` from reactant amounts (limiting reactant found
 * automatically; blank reactants are in excess) and the actual mass in grams.
 */
export function percentYieldFromEquation(
  equationText: string | BalancedEquation,
  amounts: { species: string | number; amount: AmountInput }[],
  product: string | number,
  actualGrams: number,
  gas: GasConvention = 'stp-bar',
  t: ChemT = enT,
): Result<EquationYieldResult> {
  const y = reactionYield(equationText, amounts, gas, 1, t);
  if (!y.ok) return fail(y.error);
  const pi = findSpecies(y.value.equation, product);
  if (pi < 0) return fail(t('"{species}" is not in the equation.', { species: String(product) }));
  const sp = y.value.equation.species[pi];
  if (sp.side !== 'product') return fail(t('{species} is a reactant. Pick a product.', { species: sp.label }));
  if (sp.molarMass === 0) return fail(t('Pick a product with a mass.'));
  const theoreticalGrams = y.value.extent * sp.coefficient * sp.molarMass;
  const p = solvePercentYield('percent', { actual: actualGrams, theoretical: theoreticalGrams }, t);
  if (!p.ok) return fail(p.error);
  const limitingLabels = y.value.limitingIndexes.map((k) => y.value.equation.species[k].label);
  return ok({ ...p.value, yieldResult: y.value, limitingLabels, productIndex: pi, productLabel: sp.label, theoreticalGrams });
}

export type AtomEconomyResult = {
  equation: BalancedEquation;
  productLabel: string;
  productMass: number;
  reactantMass: number;
  percent: number;
  /** Mass of everything else formed, per the balanced equation (g per mol of reaction). */
  wasteMass: number;
};

/** Atom economy of `product` in a balanced equation, %. */
export function atomEconomy(equationText: string | BalancedEquation, product: string | number, t: ChemT = enT): Result<AtomEconomyResult> {
  const eqR = typeof equationText === 'string' ? balanceEquation(equationText) : ok(equationText);
  if (!eqR.ok) return fail(eqR.error);
  const eq = eqR.value;
  const pi = findSpecies(eq, product);
  if (pi < 0) return fail(t('"{species}" is not in the equation.', { species: String(product) }));
  const sp = eq.species[pi];
  if (sp.side !== 'product') return fail(t('{species} is a reactant. Pick a product.', { species: sp.label }));
  const reactantMass = eq.species.filter((s) => s.side === 'reactant').reduce((s, x) => s + x.coefficient * x.molarMass, 0);
  const productMass = sp.coefficient * sp.molarMass;
  if (reactantMass <= 0) return fail(t('The reactants have no mass.'));
  return ok({ equation: eq, productLabel: sp.label, productMass, reactantMass, percent: atomEconomyFromMasses(productMass, reactantMass), wasteMass: reactantMass - productMass });
}

/** Atom economy from masses: product mass ÷ total reactant mass × 100. */
export function atomEconomyFromMasses(productMass: number, reactantMass: number): number {
  return (productMass / reactantMass) * 100;
}
