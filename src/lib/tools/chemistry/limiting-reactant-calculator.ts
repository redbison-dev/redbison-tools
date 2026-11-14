/**
 * Limiting reactant, theoretical yield and excess remaining for a balanced
 * equation. Each reactant amount becomes moles n_i; dividing by its
 * coefficient nu_i gives the extent of reaction it alone would allow
 * (IUPAC Gold Book, "extent of reaction"). The smallest n_i / nu_i is the
 * limiting reactant and sets the extent xi for the whole reaction:
 * every product forms xi * nu_p mol and every other reactant keeps
 * n_i - xi * nu_i mol (OpenStax Chemistry 2e, 4.4).
 */
import { balanceEquation, findSpecies, type BalancedEquation, type Result } from './equation-balancer';
import { toMoles, GAS_CONVENTIONS, type AmountInput, type GasConvention, isAmountUnit } from './stoichiometry-calculator';

const ok = <T,>(value: T): Result<T> => ({ ok: true, value });
const fail = <T,>(error: string): Result<T> => ({ ok: false, error });

/** Translation function for errors and notes; pages pass their t(), other callers get English. */
export type ChemT = (source: string, vars?: Record<string, string | number>) => string;
const enT: ChemT = (source, vars) => (vars ? source.replace(/\{(\w+)\}/g, (all, k: string) => (vars[k] === undefined ? all : String(vars[k]))) : source);

/** Relative tolerance for calling two reactants an exact stoichiometric mix. */
const TIE = 1e-9;

export type ReactantRow = {
  index: number;
  label: string;
  coefficient: number;
  molarMass: number;
  /** Undefined when the reactant was left blank (treated as in excess). */
  moles?: number;
  grams?: number;
  /** n_i / nu_i: the extent this reactant alone would allow. */
  extentAllowed?: number;
  limiting: boolean;
  /** Moles consumed: xi * nu_i. */
  usedMoles: number;
  usedGrams: number;
  /** Left over after the reaction; undefined for blank (excess) reactants. */
  excessMoles?: number;
  excessGrams?: number;
  /** Excess as a percentage of what was supplied. */
  excessPercent?: number;
  /** Moles of this reactant that would be needed to use up the limiting reactant. */
  neededMoles: number;
};

export type ProductRow = {
  index: number;
  label: string;
  coefficient: number;
  molarMass: number;
  moles: number;
  grams: number;
  /** Gas volume at the chosen convention, if the product is a gas or a state was not given. */
  litres: number;
};

export type YieldResult = {
  equation: BalancedEquation;
  /** Extent of reaction xi, mol. */
  extent: number;
  limitingIndexes: number[];
  /** True when two or more given reactants run out together. */
  exactMix: boolean;
  reactants: ReactantRow[];
  products: ProductRow[];
  /** Fewest significant figures among the typed amounts, if known. */
  sigFigs?: number;
  notes: string[];
};

/**
 * Theoretical yield from reactant amounts. `amounts` maps a reactant (formula
 * as typed, or index) to its amount; reactants left out are treated as in
 * excess. At least `minGiven` reactants need an amount.
 */
export function reactionYield(
  equationText: string | BalancedEquation,
  amounts: { species: string | number; amount: AmountInput }[],
  gas: GasConvention = 'stp-bar',
  minGiven = 1,
  t: ChemT = enT,
): Result<YieldResult> {
  const eqR = typeof equationText === 'string' ? balanceEquation(equationText) : ok(equationText);
  if (!eqR.ok) return fail(eqR.error);
  const eq = eqR.value;
  const given = new Map<number, AmountInput>();
  for (const a of amounts) {
    const i = findSpecies(eq, a.species);
    if (i < 0) return fail(t('"{species}" is not in the equation.', { species: String(a.species) }));
    const sp = eq.species[i];
    if (sp.side !== 'reactant') return fail(t('{species} is a product. Enter amounts for reactants.', { species: sp.label }));
    if (given.has(i)) return fail(t('{species} has two amounts.', { species: sp.label }));
    if (!Number.isFinite(a.amount.value) || a.amount.value <= 0) return fail(t('Enter an amount greater than zero for {species}.', { species: sp.label }));
    if (!isAmountUnit(a.amount.unit)) return fail(t('Unknown unit.'));
    if (sp.molarMass === 0 && ['g', 'kg', 'mg'].includes(a.amount.unit)) return fail(t('Electrons have no meaningful mass here; use mol.'));
    given.set(i, a.amount);
  }
  const reactantIdx = eq.species.map((sp, i) => (sp.side === 'reactant' ? i : -1)).filter((i) => i >= 0);
  if (given.size < minGiven) {
    return fail(minGiven >= 2 ? t('Enter amounts for at least two reactants to compare them.') : t('Enter the amount of at least one reactant.'));
  }

  const allowed = new Map<number, number>();
  for (const [i, a] of given) {
    const sp = eq.species[i];
    allowed.set(i, toMoles(a.value, a.unit, sp.molarMass, gas) / sp.coefficient);
  }
  const extent = Math.min(...allowed.values());
  const limitingIndexes: number[] = [];
  allowed.forEach((x, i) => {
    if (Math.abs(x - extent) <= TIE * extent) limitingIndexes.push(i);
  });
  const exactMix = limitingIndexes.length > 1;

  const reactants: ReactantRow[] = reactantIdx.map((i) => {
    const sp = eq.species[i];
    const a = given.get(i);
    const used = extent * sp.coefficient;
    const moles = a ? toMoles(a.value, a.unit, sp.molarMass, gas) : undefined;
    const limiting = limitingIndexes.includes(i);
    const excess = moles === undefined ? undefined : limiting ? 0 : Math.max(0, moles - used);
    return {
      index: i,
      label: sp.label,
      coefficient: sp.coefficient,
      molarMass: sp.molarMass,
      moles,
      grams: moles === undefined ? undefined : moles * sp.molarMass,
      extentAllowed: allowed.get(i),
      limiting,
      usedMoles: used,
      usedGrams: used * sp.molarMass,
      excessMoles: excess,
      excessGrams: excess === undefined ? undefined : excess * sp.molarMass,
      excessPercent: excess === undefined || !moles ? undefined : (excess / moles) * 100,
      neededMoles: used,
    };
  });

  const Vm = GAS_CONVENTIONS[gas].litresPerMol;
  const products: ProductRow[] = eq.species
    .map((sp, i) => ({ sp, i }))
    .filter(({ sp }) => sp.side === 'product')
    .map(({ sp, i }) => {
      const moles = extent * sp.coefficient;
      return { index: i, label: sp.label, coefficient: sp.coefficient, molarMass: sp.molarMass, moles, grams: moles * sp.molarMass, litres: moles * Vm };
    });

  const sfs = [...given.values()].map((a) => a.sigFigs).filter((x): x is number => typeof x === 'number');
  const notes: string[] = [...eq.notes];
  const blank = reactants.filter((r) => r.moles === undefined).map((r) => r.label);
  if (blank.length) notes.push(blank.length === 1 ? t('{names} was left blank and treated as in excess.', { names: blank[0] }) : t('{names} were left blank and treated as in excess.', { names: blank.join(', ') }));
  if (exactMix) notes.push(t('The given reactants are in the exact stoichiometric ratio: they run out together and nothing is left over.'));

  return ok({
    equation: eq,
    extent,
    limitingIndexes,
    exactMix,
    reactants,
    products,
    sigFigs: sfs.length === given.size && sfs.length > 0 ? Math.min(...sfs) : undefined,
    notes,
  });
}

/** The limiting reactant calculator's entry point: needs amounts for at least two reactants. */
export function limitingReactant(
  equationText: string | BalancedEquation,
  amounts: { species: string | number; amount: AmountInput }[],
  gas: GasConvention = 'stp-bar',
  t: ChemT = enT,
): Result<YieldResult> {
  const eqR = typeof equationText === 'string' ? balanceEquation(equationText) : ok(equationText);
  if (!eqR.ok) return fail(eqR.error);
  if (eqR.value.species.filter((s) => s.side === 'reactant').length < 2) {
    return fail(t('A limiting reactant needs at least two reactants. For a single reactant, use the stoichiometry calculator.'));
  }
  return reactionYield(eqR.value, amounts, gas, 2, t);
}

