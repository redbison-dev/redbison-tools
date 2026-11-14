/**
 * Stoichiometry: convert an amount of one species in a balanced equation into
 * the amount of another (grams -> moles -> mole ratio -> moles -> grams), with
 * gas volumes and particle counts, the dimensional-analysis chain and
 * significant figures. Shared by the stoichiometry, limiting reactant and
 * percent yield calculators.
 *
 * Constants are exact SI values (2019 redefinition, CODATA 2022):
 * N_A = 6.02214076e23 mol^-1 and R = N_A k = 8.314462618... J/(mol K), so the
 * ideal-gas molar volume at 273.15 K and 100 kPa is 22.71095464 L/mol and at
 * 101.325 kPa is 22.41396954 L/mol.
 */
import { balanceEquation, findSpecies, type BalancedEquation, type Result } from './equation-balancer';
import { msg } from '../../msg';

export type { Result } from './equation-balancer';
const ok = <T,>(value: T): Result<T> => ({ ok: true, value });
const fail = <T,>(error: string): Result<T> => ({ ok: false, error });

export const AVOGADRO = 6.02214076e23;
export const BOLTZMANN = 1.380649e-23;
export const GAS_CONSTANT = AVOGADRO * BOLTZMANN; // 8.314462618... J/(mol K)

export type GasConvention = 'stp-bar' | 'stp-atm' | 'satp';
export const GAS_CONVENTIONS: Record<GasConvention, { label: string; tempK: number; pressurePa: number; litresPerMol: number }> = {
  'stp-bar': { label: msg('STP, 0 °C and 1 bar (IUPAC)'), tempK: 273.15, pressurePa: 100000, litresPerMol: (GAS_CONSTANT * 273.15) / 100000 * 1000 },
  'stp-atm': { label: msg('STP, 0 °C and 1 atm (older texts)'), tempK: 273.15, pressurePa: 101325, litresPerMol: (GAS_CONSTANT * 273.15) / 101325 * 1000 },
  satp: { label: msg('SATP, 25 °C and 1 bar'), tempK: 298.15, pressurePa: 100000, litresPerMol: (GAS_CONSTANT * 298.15) / 100000 * 1000 },
};

export type AmountUnit = 'g' | 'kg' | 'mg' | 'mol' | 'mmol' | 'L' | 'mL' | 'particles';
export const AMOUNT_UNITS: { value: AmountUnit; label: string; kind: 'mass' | 'moles' | 'gas' | 'count' }[] = [
  { value: 'g', label: 'g', kind: 'mass' },
  { value: 'kg', label: 'kg', kind: 'mass' },
  { value: 'mg', label: 'mg', kind: 'mass' },
  { value: 'mol', label: 'mol', kind: 'moles' },
  { value: 'mmol', label: 'mmol', kind: 'moles' },
  { value: 'L', label: msg('L (gas)'), kind: 'gas' },
  { value: 'mL', label: msg('mL (gas)'), kind: 'gas' },
  { value: msg('particles'), label: msg('particles'), kind: 'count' },
];
const MASS_G: Record<string, number> = { g: 1, kg: 1000, mg: 1e-3 };
const MOL: Record<string, number> = { mol: 1, mmol: 1e-3 };
const GAS_L: Record<string, number> = { L: 1, mL: 1e-3 };

export const isAmountUnit = (u: string): u is AmountUnit => AMOUNT_UNITS.some((x) => x.value === u);

/** Moles of a species from an amount in any unit. */
export function toMoles(value: number, unit: AmountUnit, molarMass: number, gas: GasConvention = 'stp-bar'): number {
  if (unit in MASS_G) return (value * MASS_G[unit]) / molarMass;
  if (unit in MOL) return value * MOL[unit];
  if (unit in GAS_L) return (value * GAS_L[unit]) / GAS_CONVENTIONS[gas].litresPerMol;
  return value / AVOGADRO;
}

/** An amount in any unit from moles. */
export function fromMoles(moles: number, unit: AmountUnit, molarMass: number, gas: GasConvention = 'stp-bar'): number {
  if (unit in MASS_G) return (moles * molarMass) / MASS_G[unit];
  if (unit in MOL) return moles / MOL[unit];
  if (unit in GAS_L) return (moles * GAS_CONVENTIONS[gas].litresPerMol) / GAS_L[unit];
  return moles * AVOGADRO;
}

/* ------------------------------------------------------------------ */
/* Significant figures                                                 */
/* ------------------------------------------------------------------ */

/**
 * Significant figures in a number as typed. Leading zeros never count;
 * trailing zeros count only when there is a decimal point ("2.50" has 3,
 * "250" has 2, "250." has 3), the textbook rule (OpenStax Chemistry 2e, 1.5).
 * Returns undefined for text that is not a number.
 */
export function countSigFigs(input: string): number | undefined {
  const t = String(input).trim().replace(/,/g, '').replace(/^[+-]/, '');
  const m = /^(\d*)(?:\.(\d*))?(?:[eE][+-]?\d+)?$/.exec(t);
  if (!m || (m[1] === '' && (m[2] === undefined || m[2] === ''))) return undefined;
  const intPart = m[1];
  const frac = m[2];
  const hasPoint = t.includes('.');
  const digits = (intPart + (frac ?? '')).replace(/^0+/, '');
  if (digits === '') return 1; // the value zero
  if (hasPoint) return digits.length;
  const trimmed = digits.replace(/0+$/, '');
  return Math.max(1, trimmed.length);
}

/**
 * Round to `sig` significant figures, half away from zero, on the decimal
 * digits rather than the binary value, so 0.429 x 1.5 = 0.6435 rounds to
 * 0.644 as it does by hand (binary floating point stores 0.64349999...).
 */
export function roundSig(x: number, sig: number): number {
  if (!Number.isFinite(x) || x === 0) return x;
  const [mant, e] = Math.abs(x).toExponential(14).split('e');
  const digits = mant.replace('.', '');
  let kept = digits.slice(0, sig);
  let exp = Number(e);
  if (Number(digits[sig] ?? '0') >= 5) {
    const up = (BigInt(kept) + BigInt(1)).toString();
    if (up.length > kept.length) exp += 1;
    kept = up.slice(0, sig);
  }
  const v = Number(`${kept[0]}.${kept.slice(1) || '0'}e${exp}`);
  return x < 0 ? -v : v;
}

/** Format to `sig` significant figures, keeping trailing zeros ("2.50"); scientific notation for very large or small values. */
export function formatSig(x: number, sig: number): string {
  if (!Number.isFinite(x)) return 'n/a';
  if (x === 0) return sig > 1 ? `0.${'0'.repeat(sig - 1)}` : '0';
  const s = Math.max(1, Math.min(15, Math.round(sig)));
  x = roundSig(x, s);
  const ax = Math.abs(x);
  const exp = Math.floor(Math.log10(ax));
  if (exp >= 6 || exp < -4) {
    const [mant, e] = x.toExponential(s - 1).split('e');
    return `${mant} × 10^${Number(e)}`;
  }
  const out = x.toPrecision(s);
  // toPrecision switches to exponent form when the sig figs end left of the
  // decimal point (2460 at 3 sf is "2.46e+3"); keep it, so the precision shows.
  if (out.includes('e')) {
    const [mant, e] = out.split('e');
    return `${mant} × 10^${Number(e)}`;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Conversion                                                          */
/* ------------------------------------------------------------------ */

export type AmountInput = { value: number; unit: AmountUnit; /** sig figs of the typed value; defaults to exact */ sigFigs?: number };

export type StoichResult = {
  equation: BalancedEquation;
  fromIndex: number;
  toIndex: number;
  molesFrom: number;
  /** Coefficient ratio target / given. */
  ratio: number;
  molesTo: number;
  value: number;
  unit: AmountUnit;
  /** Significant figures for display (the given amount's), or undefined for exact. */
  sigFigs?: number;
  /** Dimensional-analysis chain, one step per line. */
  steps: string[];
  /** Every species' amount for the same extent of reaction. */
  table: { label: string; side: 'reactant' | 'product'; coefficient: number; molarMass: number; moles: number; grams: number }[];
  warnings: string[];
};

const r6 = (x: number) => Number(x.toPrecision(6));

function unitWord(unit: AmountUnit): string {
  return unit === 'particles' ? msg('particles') : unit;
}

/**
 * Convert an amount of species `from` into species `to` in `equationText`
 * (balanced automatically). `from`/`to` are formulas as typed or indexes.
 */
export function stoichiometry(
  equationText: string | BalancedEquation,
  from: string | number,
  amount: AmountInput,
  to: string | number,
  toUnit: AmountUnit,
  gas: GasConvention = 'stp-bar',
): Result<StoichResult> {
  const eqR = typeof equationText === 'string' ? balanceEquation(equationText) : ok(equationText);
  if (!eqR.ok) return fail(eqR.error);
  const eq = eqR.value;
  const fi = findSpecies(eq, from);
  const ti = findSpecies(eq, to);
  if (fi < 0) return fail(`"${from}" is not in the equation.`);
  if (ti < 0) return fail(`"${to}" is not in the equation.`);
  if (!Number.isFinite(amount.value) || amount.value <= 0) return fail('Enter an amount greater than zero.');
  if (!isAmountUnit(amount.unit) || !isAmountUnit(toUnit)) return fail('Unknown unit.');
  const A = eq.species[fi];
  const T = eq.species[ti];
  const needsMass = (u: AmountUnit, mm: number) => u in MASS_G && mm === 0;
  if (needsMass(amount.unit, A.molarMass) || needsMass(toUnit, T.molarMass)) return fail('Electrons have no meaningful mass here; use mol or particles.');

  const warnings: string[] = [];
  const checks: { sp: typeof A; u: AmountUnit }[] = [
    { sp: A, u: amount.unit },
    { sp: T, u: toUnit },
  ];
  for (const { sp, u } of checks) {
    if (u in GAS_L && sp.state && sp.state !== 'g') warnings.push(`${sp.label} is marked (${sp.state}); a gas volume only applies to gases.`);
  }

  const molesFrom = toMoles(amount.value, amount.unit, A.molarMass, gas);
  const ratio = T.coefficient / A.coefficient;
  const molesTo = molesFrom * ratio;
  const value = fromMoles(molesTo, toUnit, T.molarMass, gas);
  const Vm = GAS_CONVENTIONS[gas].litresPerMol;

  const steps: string[] = [];
  const given = `${r6(amount.value)} ${unitWord(amount.unit)} ${A.label}`;
  if (amount.unit in MASS_G) {
    const g = amount.value * MASS_G[amount.unit];
    steps.push(`${given}${amount.unit === 'g' ? '' : ` = ${r6(g)} g`} ÷ ${r6(A.molarMass)} g/mol = ${r6(molesFrom)} mol ${A.label}`);
  } else if (amount.unit in GAS_L) {
    steps.push(`${given} ÷ ${r6(Vm)} L/mol = ${r6(molesFrom)} mol ${A.label}`);
  } else if (amount.unit === 'particles') {
    steps.push(`${given} ÷ 6.02214076 × 10^23 /mol = ${r6(molesFrom)} mol ${A.label}`);
  } else {
    steps.push(`${given} = ${r6(molesFrom)} mol ${A.label}`);
  }
  steps.push(`${r6(molesFrom)} mol ${A.label} × (${T.coefficient} mol ${T.label} / ${A.coefficient} mol ${A.label}) = ${r6(molesTo)} mol ${T.label}`);
  if (toUnit in MASS_G) steps.push(`${r6(molesTo)} mol × ${r6(T.molarMass)} g/mol = ${r6(molesTo * T.molarMass)} g ${T.label}${toUnit === 'g' ? '' : ` = ${r6(value)} ${toUnit}`}`);
  else if (toUnit in GAS_L) steps.push(`${r6(molesTo)} mol × ${r6(Vm)} L/mol = ${r6(value)} ${toUnit} ${T.label}`);
  else if (toUnit === 'particles') steps.push(`${r6(molesTo)} mol × 6.02214076 × 10^23 /mol = ${formatSig(value, 6)} particles of ${T.label}`);
  else if (toUnit === 'mmol') steps.push(`${r6(molesTo)} mol = ${r6(value)} mmol ${T.label}`);

  const extent = molesFrom / A.coefficient;
  const table = eq.species.map((sp) => ({
    label: sp.label,
    side: sp.side,
    coefficient: sp.coefficient,
    molarMass: sp.molarMass,
    moles: extent * sp.coefficient,
    grams: extent * sp.coefficient * sp.molarMass,
  }));

  return ok({ equation: eq, fromIndex: fi, toIndex: ti, molesFrom, ratio, molesTo, value, unit: toUnit, sigFigs: amount.sigFigs, steps, table, warnings });
}
