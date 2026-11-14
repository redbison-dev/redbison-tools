/**
 * "Show the working" steps (docs/calculation-standard.md) for rollout batch
 * s10: physics and chemistry, home, automotive, engineering fits and keys,
 * data formats, AI sizing, photography and net worth calculators. Each
 * `<tool>Steps()` calls the same calculator function the page uses for its
 * answer and formats numbers the way the page does, so the last step's
 * result reads exactly like the page's headline value
 * (src/test/tools/steps-s10.test.ts). Invalid input returns [].
 */
import { ctxLabel, stepList, stepMsg, stepMsgText, stepPart, type ReportStep } from '../../report/model';
import { msg } from '../../msg';

/*
 * Step text built from a msg() template with values in it. Each spreads the
 * US English text (the template filled in, exactly as t() renders it on an
 * English page) into its field, plus the message CalculationSteps passes
 * through t(): resultMsg, labelMsg, formulaMsg or workingMsg.
 */
const said = (text: string, v: Record<string, unknown> = {}): Pick<ReportStep, 'result' | 'resultMsg'> => {
  const m = stepMsg(text, v);
  return { result: stepMsgText(m), resultMsg: m };
};
const sayLabel = (text: string, v: Record<string, unknown> = {}): Pick<ReportStep, 'label' | 'labelMsg'> => {
  const m = stepMsg(text, v);
  return { label: stepMsgText(m), labelMsg: m };
};
const sayFormula = (text: string, v: Record<string, unknown> = {}): Pick<ReportStep, 'formula' | 'formulaMsg'> => {
  const m = stepMsg(text, v);
  return { formula: stepMsgText(m), formulaMsg: m };
};
const sayWorking = (text: string, v: Record<string, unknown> = {}): Pick<ReportStep, 'working' | 'workingMsg'> => {
  const m = stepMsg(text, v);
  return { working: stepMsgText(m), workingMsg: m };
};
import {
  solveNewton,
  friction,
  freeFall,
  terminalVelocity,
  solveKineticEnergy,
  solvePotentialEnergy,
  solveIdealGas,
  solveCombinedGas,
  factorOf,
  kToTemp,
  GAS_R,
  G0,
  FORCE_UNITS,
  MASS_UNITS,
  ACCEL_UNITS,
  LENGTH_UNITS,
  SPEED_UNITS,
  TIME_UNITS,
  ENERGY_UNITS,
  PRESSURE_UNITS,
  VOLUME_UNITS,
  type UnitDef,
  type NewtonKey,
  type FallSolve,
  type DragInput,
  type KeKey,
  type PeKey,
  type GasKey,
  type CombinedKey,
  type TempUnit,
} from '../w500/science2';
import { injectorSize, injectorCapacity, lbhrToCcmin, ccminToLbhr, HP_PER_KW, LB_TO_G, type InjectorInput, type CapacityInput } from '../w500/eng2-fuel';
import {
  seedNeeded,
  sodNeeded,
  insulationPlan,
  paintEstimate,
  paintPurchase,
  SOD_PIECES,
  ENERGY_STAR_R,
  GM2_PER_LB1000FT2,
  M2_PER_FT2,
  KG_PER_LB,
  type ClimateZone,
  type InsulationInput,
  type InsulationLocation,
  type PaintInput,
} from '../w500/home';
import { heatPumpSavings, fuelUnit, HEATING_FUEL_UNITS, type HeatPumpInput } from '../w500/everyday2-energy';
import { computeFit, type Zone } from '../w500/eng2-fits';
import { designKey, type KeyDesignInput } from '../engineering/key-size-calculator';
import { torqueFromPower } from '../engineering/shaft-torsion-calculator';
import { encodeFloat, decodeFloat, FORMATS, type FloatFormat } from '../dataformats/ieee-754-float-converter';
import { convertNumber, groupDigits, positionalExpansion, type BaseString } from '../dataformats/number-base-converter';
import type { BalancedEquation } from '../chemistry/equation-balancer';
import { GAS_CONVENTIONS, formatSig, type AmountInput, type GasConvention } from '../chemistry/stoichiometry-calculator';
import { limitingReactant } from '../chemistry/limiting-reactant-calculator';
import { solvePercentYield, percentYieldFromEquation, atomEconomy, type YieldKey } from '../chemistry/percent-yield-calculator';
import { linearRegression, predict } from '../w500/stats2';
import { fmt as fmtStats } from '../calculators/stats';
import {
  estimateMemory,
  embeddingParams,
  loraParams,
  PRECISION_BYTES,
  NF4_BYTES_PER_PARAM,
  GIB,
  type MemoryInput,
} from '../ai/training-memory';
import {
  trainingFlops,
  tokensForCompute,
  paramsForCompute,
  chinchillaOptimal,
  hardwareEstimate,
  formatScaled,
  formatSci,
  fmtNum,
  type HardwareInput,
} from '../ai/training-compute';
import { ndExposure, ndForTarget, ndStopsFromFactor, formatShutter } from '../w500/photo';
import { calculateNetWorth, ASSET_KINDS, type NetWorthItem, type AssetKind, type LiabilityKind } from '../w500/finance2';
import { formatMoney } from '../calculators/pay';

// ---------------------------------------------------------------------------
// Number formatting, identical to the kit's fmt (geometryShared.tsx) and the
// science kit's show (science2Shared.tsx).
// ---------------------------------------------------------------------------

export function fmt(x: number | null | undefined, sig = 6): string {
  if (x === null || x === undefined || Number.isNaN(x)) return 'n/a';
  if (!Number.isFinite(x)) return x > 0 ? '∞' : '−∞';
  if (x === 0) return '0';
  const ax = Math.abs(x);
  if (ax >= 1e15 || ax < 1e-6) return x.toExponential(sig - 1).replace(/\.?0+e/, 'e');
  const r = Number(x.toPrecision(sig));
  return r.toLocaleString('en-US', { maximumFractionDigits: 12 });
}

/** A text field as a number the way the pages read it: blank is NaN, thousands separators dropped. */
export function fieldNum(text: unknown): number {
  const t = String(text ?? '').trim().replace(/,/g, '');
  return t === '' ? NaN : Number(t);
}

const unitFactor = (units: UnitDef[], id: string) => units.find((x) => x.id === id)?.factor ?? 1;
/** "12.3 km/h": an SI value shown in a unit, as the science pages do. */
const show = (si: number, units: UnitDef[], id: string, sig = 5) => `${fmt(si / unitFactor(units, id), sig)} ${id}`;
const finite = (...xs: number[]) => xs.every((x) => typeof x === 'number' && Number.isFinite(x));

/** Exact definitions behind the unit factors (NIST SP 811 appendix B; SI Brochure). */
const UNIT_SOURCE: Record<string, string> = {
  lb: msg('1 lb = 0.45359237 kg exactly'),
  oz: msg('1 oz = 1/16 lb = 0.028349523125 kg'),
  ft: msg('1 ft = 0.3048 m exactly'),
  in: msg('1 in = 0.0254 m exactly'),
  yd: msg('1 yd = 0.9144 m exactly'),
  mi: msg('1 mi = 1,609.344 m exactly'),
  mph: msg('1 mph = 0.44704 m/s exactly'),
  'km/h': msg('1 km/h = 1/3.6 m/s'),
  knot: msg('1 knot = 1,852 m/h'),
  'ft/s': msg('1 ft/s = 0.3048 m/s'),
  'ft/s²': msg('1 ft/s² = 0.3048 m/s²'),
  g: msg('1 g = 9.80665 m/s² (standard gravity)'),
  lbf: msg('1 lbf = 0.45359237 kg × 9.80665 m/s² = 4.4482216152605 N'),
  kgf: msg('1 kgf = 9.80665 N'),
  atm: msg('1 atm = 101,325 Pa exactly'),
  psi: msg('1 psi = 1 lbf/in² = 6,894.757 Pa'),
  bar: msg('1 bar = 100,000 Pa'),
  Torr: msg('1 Torr = 101,325/760 Pa'),
  gal: msg('1 US gal = 3.785411784 L exactly'),
  'gal UK': msg('1 UK gal = 4.54609 L exactly'),
  BTU: msg('1 BTU (IT) = 1,055.05585262 J'),
  cal: msg('1 cal (thermochemical) = 4.184 J'),
  kcal: msg('1 kcal = 4,184 J'),
  Wh: msg('1 Wh = 3,600 J'),
  kWh: msg('1 kWh = 3.6 MJ'),
};

type Known = { name: string; value: number; unit: string; units: UnitDef[]; si: string };

/** One step converting the known inputs to SI, with each factor written out. */
function toSiStep(knowns: Known[]): ReportStep {
  const defs = knowns.map((k) => UNIT_SOURCE[k.unit]).filter(Boolean);
  return {
    ...(defs.length ? sayLabel(msg('Inputs in SI units ({defs}; NIST SP 811)'), { defs: stepList([...new Set(defs)].map((d) => [d]), '; ') }) : { label: msg('Inputs in SI units') }),
    ...(knowns.length === 1
      ? sayFormula(msg('{a} = value × factor'), { a: knowns[0].name })
      : knowns.length === 2
        ? sayFormula(msg('{a} = value × factor; {b} = value × factor'), { a: knowns[0].name, b: knowns[1].name })
        : knowns.length === 3
          ? sayFormula(msg('{a} = value × factor; {b} = value × factor; {c} = value × factor'), { a: knowns[0].name, b: knowns[1].name, c: knowns[2].name })
          : sayFormula('{all}', { all: stepList(knowns.map((k) => [msg('{a} = value × factor'), { a: k.name }]), '; ') })),
    working: knowns.map((k) => `${fmt(k.value, 8)} ${k.unit} × ${fmt(factorOf(k.units, k.unit), 10)}`).join('; '),
    result: knowns.map((k) => `${k.name} = ${fmt(k.value * factorOf(k.units, k.unit), 6)} ${k.si}`).join(', '),
  };
}

// ---------------------------------------------------------------------------
// Force calculator: Newton's second law, weight, friction on a slope
// ---------------------------------------------------------------------------

export type ForceStepsInput =
  | { tab: 'newton'; solve: NewtonKey; f: number; fu: string; m: number; mu: string; a: number; au: string }
  | { tab: 'weight'; m: number; mu: string; g: number }
  | { tab: 'friction'; m: number; mu: string; g: number; angleDeg: number; muK: number; muS: number | null; ffu: string };

/** F = ma (OpenStax University Physics 1, 5.3), W = mg, and friction μN on a slope (6.2). */
export function forceSteps(i: ForceStepsInput): ReportStep[] {
  if (i.tab === 'newton') {
    const si = { force: i.f * unitFactor(FORCE_UNITS, i.fu), mass: i.m * unitFactor(MASS_UNITS, i.mu), acceleration: i.a * unitFactor(ACCEL_UNITS, i.au) };
    const r = solveNewton(i.solve, si);
    if (!r.ok) return [];
    const { force: F, mass: m, acceleration: a } = r.value;
    const knowns: Known[] = [];
    if (i.solve !== 'force') knowns.push({ name: 'F', value: i.f, unit: i.fu, units: FORCE_UNITS, si: 'N' });
    if (i.solve !== 'mass') knowns.push({ name: 'm', value: i.m, unit: i.mu, units: MASS_UNITS, si: 'kg' });
    if (i.solve !== 'acceleration') knowns.push({ name: 'a', value: i.a, unit: i.au, units: ACCEL_UNITS, si: 'm/s²' });
    const solveStep: Record<NewtonKey, ReportStep> = {
      force: { label: msg('Net force (Newton\'s second law)'), formula: 'F = m × a', working: `${fmt(m, 6)} kg × ${fmt(a, 6)} m/s²`, result: `${fmt(F, 6)} N` },
      mass: { label: msg('Mass from Newton\'s second law'), formula: 'm = F ÷ a', working: `${fmt(F, 6)} N ÷ ${fmt(a, 6)} m/s²`, result: `${fmt(m, 6)} kg` },
      acceleration: { label: msg('Acceleration from Newton\'s second law'), formula: 'a = F ÷ m', working: `${fmt(F, 6)} N ÷ ${fmt(m, 6)} kg`, result: `${fmt(a, 6)} m/s²` },
    };
    return [
      toSiStep(knowns),
      { label: msg('Unit check'), formula: msg('1 N = 1 kg × 1 m/s² (SI Brochure)'), ...sayWorking(msg('N, kg and m/s² are used directly')), ...said(msg('consistent SI units')) },
      solveStep[i.solve],
    ];
  }
  if (i.tab === 'weight') {
    const m = i.m * unitFactor(MASS_UNITS, i.mu);
    if (!finite(m, i.g) || !(m > 0) || !(i.g > 0)) return [];
    const W = m * i.g;
    return [
      toSiStep([{ name: 'm', value: i.m, unit: i.mu, units: MASS_UNITS, si: 'kg' }]),
      { label: msg('Gravitational acceleration'), formula: i.g === G0 ? msg('g0 = 9.80665 m/s² (standard gravity, CGPM 1901)') : msg('g for the chosen body (NASA planetary fact sheet)'), working: `g = ${fmt(i.g, 6)} m/s²`, result: `${fmt(i.g, 6)} m/s²` },
      { label: msg('In pounds-force and kilograms-force'), formula: msg('lbf = W ÷ 4.4482216152605; kgf = W ÷ 9.80665'), working: `${fmt(W, 6)} ÷ 4.4482216152605; ${fmt(W, 6)} ÷ 9.80665`, ...said('{lbf} lbf, {kgf} kgf', { lbf: fmt(W / 4.4482216152605, 5), kgf: fmt(W / G0, 5) }) },
      { ...ctxLabel(msg.ctx('mass', 'Weight')), formula: 'W = m × g', working: `${fmt(m, 6)} kg × ${fmt(i.g, 6)} m/s²`, result: `${fmt(W, 6)} N` },
    ];
  }
  const m = i.m * unitFactor(MASS_UNITS, i.mu);
  const r = friction({ mass: m, g: i.g, angleDeg: i.angleDeg, mu: i.muK, muStatic: i.muS !== null && Number.isFinite(i.muS) ? i.muS : null });
  if (!r.ok) return [];
  const v = r.value;
  const F = (n: number) => show(n, FORCE_UNITS, i.ffu);
  const th = fmt(i.angleDeg, 6);
  const steps: ReportStep[] = [
    { ...ctxLabel(msg.ctx('mass', 'Weight')), formula: 'W = m × g', working: `${fmt(m, 6)} kg × ${fmt(i.g, 6)} m/s²`, result: `${fmt(v.weight, 6)} N` },
    { label: msg('Normal force'), formula: 'N = m g cos θ', working: `${fmt(v.weight, 6)} N × cos ${th}°`, result: `${fmt(v.normal, 6)} N` },
    { label: msg('Weight component down the slope'), formula: 'F∥ = m g sin θ', working: `${fmt(v.weight, 6)} N × sin ${th}°`, result: `${fmt(v.downslope, 6)} N` },
  ];
  if (v.maxStatic !== null) {
    steps.push(
      { label: msg('Maximum static friction'), formula: 'Fs,max = μs × N', working: `${fmt(i.muS!, 6)} × ${fmt(v.normal, 6)} N`, result: `${fmt(v.maxStatic, 6)} N` },
      { label: msg('Force to start it moving'), formula: msg('F start = F∥ + Fs,max'), working: `${fmt(v.downslope, 6)} N + ${fmt(v.maxStatic, 6)} N`, result: F(v.breakaway) },
    );
  }
  steps.push({ label: msg('Kinetic friction'), formula: 'Fk = μk × N', working: `${fmt(i.muK, 6)} × ${fmt(v.normal, 6)} N`, result: F(v.kinetic) });
  return steps;
}

// ---------------------------------------------------------------------------
// Free fall: constant-acceleration kinematics, and quadratic drag
// ---------------------------------------------------------------------------

export type FreeFallStepsInput = { solve: FallSolve; given: number; givenText: { value: number; unit: string }; v0: number; g: number; drag: DragInput | null; hu: string };

/**
 * Vacuum: h = v₀t + ½gt², v = v₀ + gt (OpenStax University Physics 1, 3.5).
 * Drag: terminal speed vt = √(2mg ÷ ρCdA) and the closed-form quadratic-drag
 * solutions (OpenStax 6.4; NASA Glenn, Terminal Velocity).
 */
export function freeFallSteps(i: FreeFallStepsInput): ReportStep[] {
  const res = freeFall({ solve: i.solve, given: i.given, v0: i.v0, g: i.g, drag: i.drag });
  if (!res.ok) return [];
  const r = res.value;
  const units = i.solve === 'height' ? LENGTH_UNITS : i.solve === 'time' ? TIME_UNITS : SPEED_UNITS;
  const siU = i.solve === 'height' ? 'm' : i.solve === 'time' ? 's' : 'm/s';
  const sym = i.solve === 'height' ? 'h' : i.solve === 'time' ? 't' : 'v';
  const steps: ReportStep[] = [
    {
      ...toSiStep([{ name: sym, value: i.givenText.value, unit: i.givenText.unit, units, si: siU }]),
      result: `${sym} = ${fmt(i.given, 6)} ${siU}, v₀ = ${fmt(i.v0, 6)} m/s, g = ${fmt(i.g, 6)} m/s²`,
    },
  ];
  const v0 = fmt(i.v0, 6);
  const g = fmt(i.g, 6);
  const timeR = { result: `${fmt(r.time, 5)} s` };
  const speedR = { result: `${fmt(r.velocity, 5)} m/s` };
  const distR = { result: show(r.height, LENGTH_UNITS, i.hu) };
  if (!i.drag || r.terminalVelocity === null) {
    if (i.solve === 'height') {
      steps.push(
        { label: msg('Impact speed'), formula: 'v = √(v₀² + 2gh)', working: `√(${v0}² + 2 × ${g} × ${fmt(r.height, 6)})`, ...speedR },
        { label: msg('Fall time'), formula: 't = (v − v₀) ÷ g', working: `(${fmt(r.velocity, 6)} − ${v0}) ÷ ${g}`, ...timeR },
      );
    } else if (i.solve === 'time') {
      steps.push(
        { label: msg('Impact speed'), formula: 'v = v₀ + g t', working: `${v0} + ${g} × ${fmt(r.time, 6)}`, ...speedR },
        { label: msg('Distance fallen'), formula: 'h = v₀t + ½gt²', working: `${v0} × ${fmt(r.time, 6)} + 0.5 × ${g} × ${fmt(r.time, 6)}²`, ...distR },
      );
    } else {
      steps.push(
        { label: msg('Fall time'), formula: 't = (v − v₀) ÷ g', working: `(${fmt(r.velocity, 6)} − ${v0}) ÷ ${g}`, ...timeR },
        { label: msg('Distance fallen'), formula: 'h = (v² − v₀²) ÷ 2g', working: `(${fmt(r.velocity, 6)}² − ${v0}²) ÷ (2 × ${g})`, ...distR },
      );
    }
    return steps;
  }
  const d = i.drag;
  const vt = terminalVelocity(d, i.g);
  const VT = fmt(vt, 6);
  const fast = i.v0 > vt;
  steps.push({
    label: msg('Terminal velocity (weight = drag)'),
    formula: 'vt = √(2 m g ÷ (ρ Cd A))',
    working: `√(2 × ${fmt(d.mass, 6)} kg × ${g} ÷ (${fmt(d.airDensity, 6)} × ${fmt(d.cd, 4)} × ${fmt(d.area, 6)} m²))`,
    result: `${VT} m/s`,
  });
  // Offset of the starting speed in the tanh/coth solution: a = atanh(v₀/vt), or b = acoth(v₀/vt) when starting faster than vt.
  const off = fast ? 0.5 * Math.log((i.v0 / vt + 1) / (i.v0 / vt - 1)) : 0.5 * Math.log((1 + i.v0 / vt) / (1 - i.v0 / vt));
  const a0 = fast ? `b = acoth(${v0}/${VT}) = ${fmt(off, 6)}` : `a = atanh(${v0}/${VT}) = ${fmt(off, 6)}`;
  const arg = (t: number) => fmt((i.g * t) / vt + off, 6);
  const fn = fast ? 'sinh' : 'cosh';
  if (i.solve === 'height') {
    steps.push(
      { label: msg('Impact speed with drag'), formula: 'v² = vt² + (v₀² − vt²) e^(−2gh ÷ vt²)', working: `${VT}² + (${v0}² − ${VT}²) × e^(−2 × ${g} × ${fmt(r.height, 6)} ÷ ${VT}²)`, ...speedR },
      {
        label: msg('Fall time with drag'),
        formula: fast ? msg('h = (vt²/g) ln(sinh(gt/vt + b) ÷ sinh b), solved for t') : msg('h = (vt²/g) ln(cosh(gt/vt + a) ÷ cosh a), solved for t'),
        ...sayWorking(msg('{a0}; ({VT}² ÷ {g}) × ln({fn}({g} t ÷ {VT} + {off}) ÷ {fn} {off}) = {height} m, solved: g t ÷ vt + {value} = {time}'), { a0, VT, g, fn, off: fmt(off, 6), height: fmt(r.height, 6), value: fast ? 'b' : 'a', time: arg(r.time) }),
        ...timeR,
      },
    );
  } else if (i.solve === 'time') {
    steps.push(
      { label: msg('Impact speed with drag'), formula: fast ? 'v = vt ÷ tanh(gt/vt + b)' : 'v = vt × tanh(gt/vt + a)', working: `${a0}; ${VT} × ${fast ? '1 ÷ tanh' : 'tanh'}(${g} × ${fmt(r.time, 6)} ÷ ${VT} + ${fmt(off, 6)}) = ${VT} × ${fast ? '1 ÷ tanh' : 'tanh'}(${arg(r.time)})`, ...speedR },
      { label: msg('Distance fallen with drag'), formula: fast ? 'h = (vt²/g) ln(sinh(gt/vt + b) ÷ sinh b)' : 'h = (vt²/g) ln(cosh(gt/vt + a) ÷ cosh a)', working: `(${VT}² ÷ ${g}) × ln(${fn}(${arg(r.time)}) ÷ ${fn}(${fmt(off, 6)}))`, ...distR },
    );
  } else {
    steps.push(
      { label: msg('Fall time with drag'), formula: msg('t = (vt/g) [atanh(v/vt) − atanh(v₀/vt)]'), ...sayWorking(msg('({VT} ÷ {g}) × [atanh({velocity}/{VT}) − atanh({v0}/{VT})]'), { VT, g, velocity: fmt(r.velocity, 6), v0 }), ...timeR },
      { label: msg('Distance fallen with drag'), formula: 'h = (vt² ÷ 2g) ln((vt² − v₀²) ÷ (vt² − v²))', working: `(${VT}² ÷ (2 × ${g})) × ln((${VT}² − ${v0}²) ÷ (${VT}² − ${fmt(r.velocity, 6)}²))`, ...distR },
    );
  }
  return steps;
}

// ---------------------------------------------------------------------------
// Kinetic and potential energy
// ---------------------------------------------------------------------------

export type KineticEnergyStepsInput =
  | { tab: 'ke'; solve: KeKey; e: number; eu: string; m: number; mu: string; v: number; vu: string; g: number }
  | { tab: 'pe'; solve: PeKey; e: number; eu: string; m: number; mu: string; h: number; hu: string; g: number };

/** KE = ½mv² (OpenStax University Physics 1, 7.2) and PE = mgh near the surface (8.2). */
export function kineticEnergySteps(i: KineticEnergyStepsInput): ReportStep[] {
  const E = i.e * unitFactor(ENERGY_UNITS, i.eu);
  const m = i.m * unitFactor(MASS_UNITS, i.mu);
  if (i.tab === 'ke') {
    const v = i.v * unitFactor(SPEED_UNITS, i.vu);
    const r = solveKineticEnergy(i.solve, { energy: E, mass: m, velocity: v }, i.g);
    if (!r.ok) return [];
    const x = r.value;
    const knowns: Known[] = [];
    if (i.solve !== 'energy') knowns.push({ name: 'KE', value: i.e, unit: i.eu, units: ENERGY_UNITS, si: 'J' });
    if (i.solve !== 'mass') knowns.push({ name: 'm', value: i.m, unit: i.mu, units: MASS_UNITS, si: 'kg' });
    if (i.solve !== 'velocity') knowns.push({ name: 'v', value: i.v, unit: i.vu, units: SPEED_UNITS, si: 'm/s' });
    const steps: ReportStep[] = [toSiStep(knowns)];
    if (i.solve === 'energy') {
      steps.push(
        { label: msg('Kinetic energy in joules'), formula: 'KE = ½ × m × v²', working: `0.5 × ${fmt(x.mass, 6)} kg × (${fmt(x.velocity, 6)} m/s)²`, result: `${fmt(x.energy, 6)} J` },
        { ...sayLabel(msg('Kinetic energy in {eu}'), { eu: i.eu }), formula: `KE ÷ ${fmt(unitFactor(ENERGY_UNITS, i.eu), 10)} J/${i.eu}`, working: `${fmt(x.energy, 6)} J ÷ ${fmt(unitFactor(ENERGY_UNITS, i.eu), 10)}`, result: show(x.energy, ENERGY_UNITS, i.eu) },
      );
    } else if (i.solve === 'mass') {
      steps.push(
        { label: msg('Mass in kilograms'), formula: 'm = 2 KE ÷ v²', working: `2 × ${fmt(x.energy, 6)} J ÷ (${fmt(x.velocity, 6)} m/s)²`, result: `${fmt(x.mass, 6)} kg` },
        { ...sayLabel(msg('Mass in {mu}'), { mu: i.mu }), formula: `m ÷ ${fmt(unitFactor(MASS_UNITS, i.mu), 10)} kg/${i.mu}`, working: `${fmt(x.mass, 6)} kg ÷ ${fmt(unitFactor(MASS_UNITS, i.mu), 10)}`, result: show(x.mass, MASS_UNITS, i.mu) },
      );
    } else {
      steps.push(
        { label: msg('Speed in m/s'), formula: 'v = √(2 KE ÷ m)', working: `√(2 × ${fmt(x.energy, 6)} J ÷ ${fmt(x.mass, 6)} kg)`, result: `${fmt(x.velocity, 6)} m/s` },
        { ...sayLabel(msg('Speed in {vu}'), { vu: i.vu }), formula: `v ÷ ${fmt(unitFactor(SPEED_UNITS, i.vu), 10)} (m/s)/(${i.vu})`, working: `${fmt(x.velocity, 6)} m/s ÷ ${fmt(unitFactor(SPEED_UNITS, i.vu), 10)}`, result: show(x.velocity, SPEED_UNITS, i.vu) },
      );
    }
    steps.splice(steps.length - 1, 0, { label: msg('Momentum'), formula: 'p = m × v', working: `${fmt(x.mass, 6)} kg × ${fmt(x.velocity, 6)} m/s`, result: `${fmt(x.momentum, 5)} kg·m/s` });
    return steps;
  }
  const h = i.h * unitFactor(LENGTH_UNITS, i.hu);
  const r = solvePotentialEnergy(i.solve, { energy: E, mass: m, height: h }, i.g);
  if (!r.ok) return [];
  const x = r.value;
  const knowns: Known[] = [];
  if (i.solve !== 'energy') knowns.push({ name: 'PE', value: i.e, unit: i.eu, units: ENERGY_UNITS, si: 'J' });
  if (i.solve !== 'mass') knowns.push({ name: 'm', value: i.m, unit: i.mu, units: MASS_UNITS, si: 'kg' });
  if (i.solve !== 'height') knowns.push({ name: 'h', value: i.h, unit: i.hu, units: LENGTH_UNITS, si: 'm' });
  const gs = fmt(x.g, 6);
  const steps: ReportStep[] = [
    toSiStep(knowns),
    { label: msg('Gravitational acceleration'), formula: x.g === G0 ? msg('g0 = 9.80665 m/s² (standard gravity, CGPM 1901)') : msg('g for the chosen body (NASA planetary fact sheet)'), working: `g = ${gs} m/s²`, result: `${gs} m/s²` },
  ];
  if (i.solve === 'energy') {
    steps.push(
      { label: msg('Potential energy in joules'), formula: 'PE = m × g × h', working: `${fmt(x.mass, 6)} kg × ${gs} m/s² × ${fmt(x.height, 6)} m`, result: `${fmt(x.energy, 6)} J` },
      { ...sayLabel(msg('Potential energy in {eu}'), { eu: i.eu }), formula: `PE ÷ ${fmt(unitFactor(ENERGY_UNITS, i.eu), 10)} J/${i.eu}`, working: `${fmt(x.energy, 6)} J ÷ ${fmt(unitFactor(ENERGY_UNITS, i.eu), 10)}`, result: show(x.energy, ENERGY_UNITS, i.eu) },
    );
  } else if (i.solve === 'mass') {
    steps.push(
      { label: msg('Mass in kilograms'), formula: 'm = PE ÷ (g × h)', working: `${fmt(x.energy, 6)} J ÷ (${gs} × ${fmt(x.height, 6)} m)`, result: `${fmt(x.mass, 6)} kg` },
      { ...sayLabel(msg('Mass in {mu}'), { mu: i.mu }), formula: `m ÷ ${fmt(unitFactor(MASS_UNITS, i.mu), 10)} kg/${i.mu}`, working: `${fmt(x.mass, 6)} kg ÷ ${fmt(unitFactor(MASS_UNITS, i.mu), 10)}`, result: show(x.mass, MASS_UNITS, i.mu) },
    );
  } else {
    steps.push(
      { label: msg('Height in metres'), formula: 'h = PE ÷ (m × g)', working: `${fmt(x.energy, 6)} J ÷ (${fmt(x.mass, 6)} kg × ${gs})`, result: `${fmt(x.height, 6)} m` },
      { ...sayLabel(msg('Height in {hu}'), { hu: i.hu }), formula: `h ÷ ${fmt(unitFactor(LENGTH_UNITS, i.hu), 10)} m/${i.hu}`, working: `${fmt(x.height, 6)} m ÷ ${fmt(unitFactor(LENGTH_UNITS, i.hu), 10)}`, result: show(x.height, LENGTH_UNITS, i.hu) },
    );
  }
  return steps;
}

// ---------------------------------------------------------------------------
// Ideal gas law and combined gas law
// ---------------------------------------------------------------------------

export type IdealGasStepsInput =
  | {
      tab: 'pvnrt';
      solve: GasKey;
      /** The SI values passed to solveIdealGas (pressure absolute, Pa). */
      pressure: number;
      volume: number;
      moles: number;
      temperature: number;
      /** Molar mass, kg/mol, or null. */
      molarMass: number | null;
      /** As entered, for the conversion step. */
      p: number; pu: string; gauge: boolean; v: number; vu: string; t: number; tu: TempUnit;
      amount: { by: 'moles'; n: number; nu: string } | { by: 'mass'; m: number; mu: string };
    }
  | { tab: 'combined'; solve: CombinedKey; values: Partial<Record<CombinedKey, number>>; ctu: TempUnit; cpu: string; cvu: string; raw: Partial<Record<CombinedKey, number>> };

const tempFormula: Record<TempUnit, string> = { K: 'T = T(K)', '°C': 'T = °C + 273.15', '°F': 'T = (°F − 32) × 5/9 + 273.15', '°R': 'T = °R × 5/9' };
const tempWork = (t: number, u: TempUnit) => (u === 'K' ? `${fmt(t, 8)}` : u === '°C' ? `${fmt(t, 8)} + 273.15` : u === '°F' ? `(${fmt(t, 8)} − 32) × 5/9 + 273.15` : `${fmt(t, 8)} × 5/9`);

/** PV = nRT with R = N_A k = 8.314462618 J/(mol·K) exact (CODATA 2018; OpenStax Chemistry 2e, 9.2), and P1V1/T1 = P2V2/T2. */
export function idealGasSteps(i: IdealGasStepsInput): ReportStep[] {
  if (i.tab === 'combined') {
    const res = solveCombinedGas(i.solve, i.values);
    if (!res.ok) return [];
    const x = res.value;
    const k = i.solve;
    const unitOf = (key: CombinedKey) => (key.startsWith('p') ? i.cpu : key.startsWith('v') ? i.cvu : i.ctu);
    const lhs = (x.p1 * x.v1) / x.t1;
    const side1 = k.endsWith('1');
    const known = side1 ? 'P2 V2 ÷ T2' : 'P1 V1 ÷ T1';
    const knownWork = side1 ? `${fmt(x.p2, 6)} × ${fmt(x.v2, 6)} ÷ ${fmt(x.t2, 6)} K` : `${fmt(x.p1, 6)} × ${fmt(x.v1, 6)} ÷ ${fmt(x.t1, 6)} K`;
    const C = side1 ? (x.p2 * x.v2) / x.t2 : lhs;
    const n = side1 ? '1' : '2';
    const solveFormula: Record<string, string> = { p: `P${n} = C × T${n} ÷ V${n}`, v: `V${n} = C × T${n} ÷ P${n}`, t: `T${n} = P${n} × V${n} ÷ C` };
    const P = fmt(x[`p${n}` as CombinedKey], 6);
    const V = fmt(x[`v${n}` as CombinedKey], 6);
    const T = fmt(x[`t${n}` as CombinedKey], 6);
    const solveWork: Record<string, string> = { p: `${fmt(C, 6)} × ${T} K ÷ ${V}`, v: `${fmt(C, 6)} × ${T} K ÷ ${P}`, t: `${P} × ${V} ÷ ${fmt(C, 6)}` };
    const kind = k[0];
    const raw = kind === 't' ? kToTemp(x[k], i.ctu) : x[k];
    const steps: ReportStep[] = [
      {
        label: msg('Temperatures in kelvin'),
        formula: tempFormula[i.ctu],
        working: (['t1', 't2'] as CombinedKey[]).filter((t) => t !== k).map((t) => `${t.toUpperCase()} = ${tempWork(i.raw[t]!, i.ctu)}`).join('; '),
        result: (['t1', 't2'] as CombinedKey[]).filter((t) => t !== k).map((t) => `${t.toUpperCase()} = ${fmt(x[t], 6)} K`).join(', '),
      },
      { label: msg('Combined gas constant of the known state'), formula: `C = ${known}`, working: knownWork, result: `${fmt(C, 6)} ${i.cpu}·${i.cvu}/K` },
      { ...sayLabel(msg('Solve for {value}'), { value: k.toUpperCase() }), ...sayFormula(msg('P1V1/T1 = P2V2/T2, so {solveFormula}'), { solveFormula: solveFormula[kind] }), working: solveWork[kind], result: kind === 't' ? `${fmt(x[k], 6)} K` : `${fmt(x[k], 6)} ${unitOf(k)}` },
    ];
    if (kind === 't') steps.push({ label: `${k.toUpperCase()} in ${i.ctu}`, ...(i.ctu === 'K' ? { formula: msg('no conversion') } : sayFormula(msg('from kelvin to {ctu}'), { ctu: i.ctu })), working: `${fmt(x[k], 6)} K`, result: `${fmt(raw, 6).replace(/,/g, '')} ${i.ctu}` });
    else steps[steps.length - 1].result = `${fmt(raw, 6).replace(/,/g, '')} ${unitOf(k)}`;
    return steps;
  }
  const res = solveIdealGas(i.solve, { pressure: i.pressure, volume: i.volume, moles: i.moles, temperature: i.temperature }, i.molarMass);
  if (!res.ok) return [];
  const r = res.value;
  const R = fmt(GAS_R, 10);
  const conv: string[] = [];
  const convRes: string[] = [];
  if (i.solve !== 'pressure') {
    conv.push(`P = ${fmt(i.p, 8)} ${i.pu} × ${fmt(factorOf(PRESSURE_UNITS, i.pu), 10)}${i.gauge ? ' + 101,325 (gauge to absolute)' : ''}`);
    convRes.push(`P = ${fmt(i.pressure, 6)} Pa`);
  }
  if (i.solve !== 'volume') {
    conv.push(`V = ${fmt(i.v, 8)} ${i.vu} × ${fmt(factorOf(VOLUME_UNITS, i.vu), 10)}`);
    convRes.push(`V = ${fmt(i.volume, 6)} m³`);
  }
  if (i.solve !== 'temperature') {
    conv.push(`T = ${tempWork(i.t, i.tu)}`);
    convRes.push(`T = ${fmt(i.temperature, 6)} K`);
  }
  if (i.solve !== 'moles') {
    conv.push(i.amount.by === 'moles' ? `n = ${fmt(i.amount.n, 8)} ${i.amount.nu}${i.amount.nu === 'mmol' ? ' × 0.001' : i.amount.nu === 'kmol' ? ' × 1,000' : ''}` : `n = m ÷ M = ${fmt(i.amount.m, 8)} ${i.amount.mu} × ${fmt(unitFactor(MASS_UNITS, i.amount.mu), 10)} ÷ ${fmt(i.molarMass ?? NaN, 8)} kg/mol`);
    convRes.push(`n = ${fmt(i.moles, 6)} mol`);
  }
  const steps: ReportStep[] = [
    { label: msg('Inputs in SI units (1 atm = 101,325 Pa, 1 L = 0.001 m³, K = °C + 273.15; NIST SP 811)'), formula: msg('absolute pressure in Pa, volume in m³, temperature in K, amount in mol'), working: conv.join('; '), result: convRes.join(', ') },
  ];
  const P = fmt(r.pressure, 6);
  const V = fmt(r.volume, 6);
  const N = fmt(r.moles, 6);
  const T = fmt(r.temperature, 6);
  const main: Record<GasKey, ReportStep> = {
    pressure: { label: msg('Pressure (absolute)'), formula: 'P = n R T ÷ V', working: `${N} mol × ${R} J/(mol·K) × ${T} K ÷ ${V} m³`, result: `${P} Pa` },
    volume: { label: msg('Volume'), formula: 'V = n R T ÷ P', working: `${N} mol × ${R} J/(mol·K) × ${T} K ÷ ${P} Pa`, result: `${V} m³` },
    moles: { label: msg('Amount of gas'), formula: 'n = P V ÷ (R T)', working: `${P} Pa × ${V} m³ ÷ (${R} × ${T} K)`, result: `${N} mol` },
    temperature: { label: msg('Temperature'), formula: 'T = P V ÷ (n R)', working: `${P} Pa × ${V} m³ ÷ (${N} mol × ${R})`, result: `${T} K` },
  };
  steps.push(main[i.solve]);
  if (r.mass !== null && i.molarMass) steps.push({ label: msg('Mass and density'), formula: 'm = n M; ρ = m ÷ V', working: `${N} mol × ${fmt(i.molarMass, 8)} kg/mol; ÷ ${V} m³`, result: `${fmt(r.mass * 1000, 5)} g, ${fmt(r.density!, 5)} kg/m³` });
  const final: Record<GasKey, ReportStep> = {
    pressure: { ...sayLabel(msg('Pressure in {pu}'), { pu: i.pu }), formula: `P ÷ ${fmt(factorOf(PRESSURE_UNITS, i.pu), 10)} Pa/${i.pu}`, working: `${P} Pa ÷ ${fmt(factorOf(PRESSURE_UNITS, i.pu), 10)}`, result: show(r.pressure, PRESSURE_UNITS, i.pu) },
    volume: { ...sayLabel(msg('Volume in {vu}'), { vu: i.vu }), formula: `V ÷ ${fmt(factorOf(VOLUME_UNITS, i.vu), 10)} m³/${i.vu}`, working: `${V} m³ ÷ ${fmt(factorOf(VOLUME_UNITS, i.vu), 10)}`, result: show(r.volume, VOLUME_UNITS, i.vu) },
    moles: { label: msg('Amount and molecule count'), formula: msg('N = n × N_A, N_A = 6.02214076 × 10²³ /mol (exact)'), ...sayWorking(msg('{N} mol × 6.02214076e23 = {molecules} molecules'), { N, molecules: fmt(r.molecules, 5) }), result: `${fmt(r.moles, 6)} mol` },
    temperature: { label: msg('Temperature'), formula: msg('T in kelvin'), working: `${T} K = ${fmt(r.temperature - 273.15, 5)} °C`, result: `${fmt(r.temperature, 6)} K` },
  };
  steps.push(final[i.solve]);
  return steps;
}

// ---------------------------------------------------------------------------
// Shared display helpers for the kits that use nf / money (constructionShared)
// ---------------------------------------------------------------------------

function nf(x: number | null | undefined, digits = 2): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return 'n/a';
  return x.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: digits });
}
const money = (sym: string, x: number | null | undefined, digits = 2) =>
  x === null || x === undefined || !Number.isFinite(x) ? 'n/a' : `${x < 0 ? '-' : ''}${sym}${Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
/** One decimal, always shown (the fuel injector page's f1). */
const f1 = (x: number) => x.toLocaleString('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 });

// ---------------------------------------------------------------------------
// Fuel injector sizing
// ---------------------------------------------------------------------------

export type FuelInjectorStepsInput = ({ mode: 'size' } & InjectorInput) | ({ mode: 'capacity' } & CapacityInput);

/**
 * Injector flow = crank hp × BSFC ÷ (injectors × duty), with the orifice law
 * Q ∝ √ΔP for the fuel-pressure correction (Bosch Automotive Handbook;
 * the BSFC sizing method in the write-up's sources).
 */
export function fuelInjectorSteps(i: FuelInjectorStepsInput): ReportStep[] {
  const duty = i.maxDutyPct / 100;
  const pf = Math.sqrt(i.operatingPressure / i.ratedPressure);
  if (i.mode === 'size') {
    const r = injectorSize(i);
    if (!r.ok) return [];
    const v = r.value;
    const steps: ReportStep[] = [];
    const hp = i.powerUnit === 'kW' ? i.power * HP_PER_KW : i.power;
    if (i.powerUnit === 'kW') steps.push({ label: msg('Power in horsepower (1 hp = 745.699872 W)'), formula: 'hp = kW ÷ 0.745699872', working: `${fmt(i.power, 6)} ÷ 0.745699872`, result: `${fmt(hp, 5)} hp` });
    if (i.measuredAt === 'wheel') steps.push({ label: msg('Crank power from wheel power'), formula: msg('crank hp = wheel hp ÷ (1 − drivetrain loss)'), working: `${fmt(hp, 6)} ÷ (1 − ${fmt(i.drivetrainLossPct, 4)} / 100)`, result: `${fmt(v.crankHp, 5)} hp` });
    steps.push(
      { label: msg('Fuel flow at peak power'), formula: msg('fuel = crank hp × BSFC'), ...sayWorking(msg('{crankHp} hp × {bsfc} lb/hp·hr'), { crankHp: fmt(v.crankHp, 6), bsfc: fmt(i.bsfc, 4) }), ...said(msg('{n} lb/hr'), { n: f1(v.totalFuelLbHr) }) },
      { label: msg('Flow per injector'), formula: msg('flow = fuel ÷ (injectors × max duty)'), working: `${f1(v.totalFuelLbHr)} ÷ (${i.injectors} × ${fmt(duty, 4)})`, ...said(msg('{n} lb/hr'), { n: f1(v.perInjectorLbHr) }) },
      { label: msg('In cc/min (1 lb = 453.59237 g)'), formula: 'cc/min = lb/hr × 453.59237 ÷ 60 ÷ SG', working: `${fmt(v.perInjectorLbHr, 6)} × 453.59237 ÷ 60 ÷ ${fmt(i.sg, 3)}`, result: `${Math.round(v.perInjectorCcMin)} cc/min` },
      { label: msg('Pressure correction (flow ∝ √ΔP)'), formula: msg('rated = needed ÷ √(P in use ÷ P rated)'), working: `${fmt(v.perInjectorLbHr, 6)} ÷ √(${fmt(i.operatingPressure, 6)} ÷ ${fmt(i.ratedPressure, 6)}) = ${fmt(v.perInjectorLbHr, 6)} ÷ ${pf.toFixed(3)}`, ...said(msg('{n} lb/hr'), { n: f1(v.ratedLbHr) }) },
      { label: msg('Rating to buy'), formula: 'cc/min = lb/hr × 453.59237 ÷ 60 ÷ SG', working: `${fmt(v.ratedLbHr, 6)} × 453.59237 ÷ 60 ÷ ${fmt(i.sg, 3)}`, result: `${Math.round(lbhrToCcmin(v.ratedLbHr, i.sg))} cc/min` },
    );
    return steps;
  }
  const r = injectorCapacity(i);
  if (!r.ok) return [];
  const v = r.value;
  const lbhr = i.flowUnit === 'ccmin' ? ccminToLbhr(i.flow, i.sg) : i.flow;
  const steps: ReportStep[] = [];
  if (i.flowUnit === 'ccmin') steps.push({ label: msg('Rating in lb/hr (1 lb = 453.59237 g)'), formula: 'lb/hr = cc/min × SG × 60 ÷ 453.59237', working: `${fmt(i.flow, 6)} × ${fmt(i.sg, 3)} × 60 ÷ ${fmt(LB_TO_G, 8)}`, ...said(msg('{n} lb/hr'), { n: f1(lbhr) }) });
  steps.push(
    { label: msg('Flow at your fuel pressure (flow ∝ √ΔP)'), formula: msg('flow = rated × √(P in use ÷ P rated)'), working: `${fmt(lbhr, 6)} × √(${fmt(i.operatingPressure, 6)} ÷ ${fmt(i.ratedPressure, 6)})`, ...said(msg('{n} lb/hr'), { n: f1(v.flowLbHrAtPressure) }) },
    { label: msg('Fuel available from all injectors'), formula: msg('fuel = flow × injectors × max duty'), working: `${fmt(v.flowLbHrAtPressure, 6)} × ${i.injectors} × ${fmt(duty, 4)}`, ...said(msg('{n} lb/hr'), { n: f1(v.flowLbHrAtPressure * i.injectors * duty) }) },
    { label: msg('Crank power supported'), formula: msg('hp = fuel ÷ BSFC'), working: `${fmt(v.flowLbHrAtPressure * i.injectors * duty, 6)} ÷ ${fmt(i.bsfc, 4)}`, result: `${Math.round(v.crankHp)} hp` },
  );
  return steps;
}

// ---------------------------------------------------------------------------
// Grass seed and sod
// ---------------------------------------------------------------------------

export type GrassSeedStepsInput = {
  metric: boolean;
  mode: 'seed' | 'sod';
  byDims: boolean;
  l: number;
  w: number;
  area: number;
  /** New-lawn rate as entered: g/m² (metric) or lb per 1,000 ft². */
  rate: number;
  overseed: boolean;
  /** Bag size as entered: kg or lb. */
  bag: number;
  pieceId: string;
  /** One pallet covers, as entered: m² or ft². */
  pallet: number;
  waste: number;
};

/** Seed = area × rate (half rate for overseeding); sod pieces = area × (1 + extra) ÷ piece area. */
export function grassSeedSteps(i: GrassSeedStepsInput): ReportStep[] {
  const area = i.byDims ? i.l * i.w : i.area;
  if (!finite(area) || !(area > 0)) return [];
  const au = i.metric ? 'm²' : 'ft²';
  const lu = i.metric ? 'm' : 'ft';
  const areaM2 = i.metric ? area : area * M2_PER_FT2;
  const steps: ReportStep[] = [
    i.byDims
      ? { label: msg('Lawn area'), formula: msg('A = length × width'), working: `${nf(i.l, 3)} ${lu} × ${nf(i.w, 3)} ${lu}`, result: `${nf(area, 0)} ${au}` }
      : { label: msg('Lawn area'), formula: msg('A as entered'), working: `${nf(i.area, 3)} ${au}`, result: `${nf(area, 0)} ${au}` },
  ];
  if (i.mode === 'seed') {
    if (!finite(i.rate) || !(i.rate > 0)) return [];
    const rateGm2 = i.metric ? i.rate : i.rate * GM2_PER_LB1000FT2;
    const s = seedNeeded(areaM2, rateGm2, i.overseed, i.metric ? i.bag : i.bag * KG_PER_LB);
    steps.push({
      label: i.overseed ? msg('Seeding rate, halved for overseeding') : msg('Seeding rate for a new lawn'),
      formula: i.overseed ? msg('rate used = new-lawn rate × 0.5') : msg('rate used = new-lawn rate'),
      ...(i.metric ? { working: `${nf(i.rate, 3)} g/m²${i.overseed ? ' × 0.5' : ''}` } : sayWorking(msg('{rate} lb per 1,000 ft²{value}'), { rate: nf(i.rate, 3), value: i.overseed ? ' × 0.5' : '' })),
      ...(i.metric ? { result: `${nf(s.rateUsedGm2, 1)} g/m²` } : said(msg('{rate} lb per 1,000 ft²'), { rate: nf(s.rateUsedGm2 / GM2_PER_LB1000FT2, 2) })),
    });
    if (i.metric) {
      steps.push({ label: msg('Seed needed'), formula: msg('seed (kg) = A (m²) × rate (g/m²) ÷ 1,000'), working: `${nf(area, 3)} × ${nf(s.rateUsedGm2, 3)} ÷ 1,000`, result: `${nf(s.kg, 2)} kg` });
    } else {
      steps.push({ label: msg('Seed needed'), formula: msg('seed (lb) = A (ft²) ÷ 1,000 × rate (lb per 1,000 ft²)'), working: `${nf(area, 3)} ÷ 1,000 × ${nf(s.rateUsedGm2 / GM2_PER_LB1000FT2, 3)}`, result: `${nf(s.lb, 2)} lb` });
    }
    if (s.bags) steps.push({ label: msg('Bags to buy'), formula: msg('bags = ceiling(seed ÷ bag size)'), ...sayWorking(msg('ceiling({value} ÷ {bag})'), { value: nf(i.metric ? s.kg : s.lb, 3), bag: nf(i.bag, 3) }), result: String(s.bags) });
    return steps;
  }
  const piece = SOD_PIECES.find((p) => p.id === i.pieceId) ?? SOD_PIECES[0];
  if (!finite(i.waste) || i.waste < 0) return [];
  const sod = sodNeeded(areaM2, piece.areaM2, i.metric ? i.pallet : i.pallet * M2_PER_FT2, i.waste);
  const pieceArea = i.metric ? piece.areaM2 : piece.areaM2 / M2_PER_FT2;
  const withWaste = sod.areaWithWaste / (i.metric ? 1 : M2_PER_FT2);
  steps.push(
    { label: msg('Area to order, with extra for cuts'), formula: msg('A′ = A × (1 + extra / 100)'), working: `${nf(area, 3)} ${au} × (1 + ${nf(i.waste, 2)} / 100)`, result: `${nf(withWaste, 0)} ${au}` },
    { ...sayLabel(msg('Sod pieces ({label})'), { label: piece.label }), formula: msg('pieces = ceiling(A′ ÷ piece area)'), ...sayWorking(msg('ceiling({withWaste} ÷ {pieceArea} {au})'), { withWaste: nf(withWaste, 3), pieceArea: nf(pieceArea, 4), au }), result: sod.pieces.toLocaleString('en-US') },
  );
  if (sod.pallets > 0) steps.push({ label: msg('Pallets'), formula: msg('pallets = pieces × piece area ÷ pallet coverage'), working: `${sod.pieces} × ${nf(pieceArea, 4)} ÷ ${nf(i.pallet, 3)} ${au}`, result: nf(sod.pallets, 2) });
  return steps;
}

// ---------------------------------------------------------------------------
// Heat pump savings
// ---------------------------------------------------------------------------

export type HeatPumpStepsInput = HeatPumpInput & { cur: string; hspf?: number | null; unitLabel: string };

const heatPumpPayback = (y: number | null) => (y === null ? said(msg('No payback')) : y === 0 ? said(msg('Immediate')) : said(msg('{n} years'), { n: nf(y, 1) }));

/**
 * Heat delivered = fuel × energy per unit × AFUE (EIA heat contents), heat pump
 * kWh = Q(1 − b) ÷ SCOP + Q b, SCOP = HSPF2 ÷ 3.412 (AHRI 210/240), payback =
 * net cost ÷ yearly saving.
 */
export function heatPumpSavingsSteps(i: HeatPumpStepsInput): ReportStep[] {
  let r;
  try {
    r = heatPumpSavings(i);
  } catch {
    return [];
  }
  const m0 = (x: number) => money(i.cur, x, 0);
  const unit = i.currentFuel === 'electric' ? HEATING_FUEL_UNITS.electric[0] : fuelUnit(i.currentFuel, i.fuelUnit ?? HEATING_FUEL_UNITS[i.currentFuel][0].id);
  const eff = i.currentEfficiencyPct / 100;
  const b = Math.min(100, Math.max(0, i.backupPct ?? 0)) / 100;
  const steps: ReportStep[] = [];
  if (i.hspf != null) steps.push({ label: msg('Seasonal COP from HSPF2'), formula: msg('SCOP = HSPF2 ÷ 3.412 (Btu per Wh)'), working: `${nf(i.hspf, 2)} ÷ 3.412`, result: nf(i.scop, 2) });
  steps.push(
    i.basis === 'fuel'
      ? { label: msg('Heat delivered a year'), formula: msg('Q = fuel used × kWh per unit × efficiency'), working: `${nf(i.fuelAmount ?? NaN, 2)} ${i.unitLabel} × ${nf(unit.kwh, 4)} kWh × ${nf(eff, 3)}`, result: `${nf(r.heatDemandKwh, 0)} kWh` }
      : { label: msg('Fuel the current system burns'), formula: msg('fuel = Q ÷ efficiency ÷ kWh per unit'), working: `${nf(i.heatDemandKwh ?? NaN, 2)} kWh ÷ ${nf(eff, 3)} ÷ ${nf(unit.kwh, 4)}`, result: `${nf(r.currentFuelUnits, 0)} ${i.unitLabel}` },
    { label: msg('Current yearly cost'), formula: msg('cost = fuel × price'), working: `${nf(r.currentFuelUnits, 2)} × ${money(i.cur, i.fuelPrice, 2)}`, result: m0(r.currentCost) },
    { label: msg('Heat pump electricity'), formula: msg('kWh = Q (1 − backup) ÷ SCOP + Q × backup'), working: `${nf(r.heatDemandKwh, 0)} × (1 − ${nf(b, 3)}) ÷ ${nf(i.scop, 3)} + ${nf(r.heatDemandKwh, 0)} × ${nf(b, 3)}`, result: `${nf(r.heatPumpKwh, 0)} kWh` },
    { label: msg('Heat pump yearly cost'), formula: msg('cost = kWh × electricity price'), working: `${nf(r.heatPumpKwh, 1)} × ${money(i.cur, i.electricityPrice, 2)}`, result: m0(r.heatPumpCost) },
    { label: msg('Yearly saving'), formula: msg('saving = current cost − heat pump cost'), working: `${m0(r.currentCost)} − ${m0(r.heatPumpCost)}`, result: m0(r.annualSavings) },
    { label: msg('Payback'), formula: msg('payback = (installed cost − incentives) ÷ yearly saving'), working: `(${m0(i.installCost ?? 0)} − ${m0(i.incentives ?? 0)}) ÷ ${m0(r.annualSavings)}`, ...heatPumpPayback(r.paybackYears) },
  );
  return steps;
}

// ---------------------------------------------------------------------------
// Insulation
// ---------------------------------------------------------------------------

export type InsulationStepsInput = {
  plan: InsulationInput;
  metric: boolean;
  zone: ClimateZone;
  loc: InsulationLocation;
  /** True when the visitor typed their own target R. */
  customTarget: boolean;
  /** Bag count from the chart (area per bag) instead of the density estimate. */
  bagChart: boolean;
};

/** R add = target − depth × R per inch (DOE), target from the ENERGY STAR / 2021 IECC table; quantities from area, depth and coverage. */
export function insulationSteps(i: InsulationStepsInput): ReportStep[] {
  const p = i.plan;
  if (!finite(p.areaFt2, p.targetR) || !(p.areaFt2 > 0) || p.targetR < 0) return [];
  const r = insulationPlan(p);
  const thick = (inches: number) => (i.metric ? `${nf(inches * 25.4, 0)} mm` : `${nf(inches, 1)} in`);
  const waste = 1 + (p.wastePct ?? 0) / 100;
  const locWorking: Record<InsulationLocation, string> = {
    attic: msg('zone {zone}, attic (table: R{r})'),
    floor: msg('zone {zone}, floor'),
    'basement-wall': msg('zone {zone}, basement wall (batt)'),
    'wall-2x4': msg('zone {zone}, 2x4 wall cavity'),
    'wall-2x6': msg('zone {zone}, 2x6 wall cavity'),
  };
  const steps: ReportStep[] = [
    {
      label: msg('Target R-value'),
      formula: i.customTarget ? msg('R target as entered') : i.loc.startsWith('wall') ? msg('full cavity fill for the stud depth') : msg('ENERGY STAR recommended R (2021 IECC Table R402.1.3)'),
      ...(i.customTarget ? { working: `R-${nf(p.targetR, 1)}` } : sayWorking(locWorking[i.loc], i.loc === 'attic' ? { zone: i.zone, r: ENERGY_STAR_R[i.zone].attic } : { zone: i.zone })),
      result: `R-${nf(p.targetR, 0)}`,
    },
  ];
  if (i.metric) steps.push({ label: msg('Metric inputs in US units (1 ft = 0.3048 m, 1 in = 25.4 mm)'), formula: 'ft² = m² ÷ 0.09290304; in = mm ÷ 25.4', working: `${nf(p.areaFt2 * M2_PER_FT2, 2)} m² ÷ 0.09290304; ${nf(p.existingInches * 25.4, 1)} mm ÷ 25.4`, result: `${nf(p.areaFt2, 1)} ft², ${nf(p.existingInches, 2)} in` });
  steps.push(
    { label: msg('Existing insulation'), formula: msg('R existing = depth (in) × R per inch'), working: `${nf(p.existingInches, 2)} in × ${nf(p.existingRPerInch, 2)}`, result: `R-${nf(r.existingR, 1)}` },
    { label: msg('R to add'), formula: msg('R add = R target − R existing (not below 0)'), working: `${nf(p.targetR, 1)} − ${nf(r.existingR, 1)}`, ...(r.alreadyMeets ? said(msg('none')) : { result: `R-${nf(r.rToAdd, 1)}` }) },
  );
  if (p.material === 'batt') {
    const battR = p.battR ?? 30;
    steps.push(
      { label: msg('Batt layers'), formula: msg('layers = ceiling(R add ÷ batt R)'), ...sayWorking(msg('ceiling({rToAdd} ÷ {battR})'), { rToAdd: nf(r.rToAdd, 1), battR }), result: String(r.layers) },
      { label: msg('Packs'), formula: msg('packs = ceiling(area × layers × (1 + extra) ÷ pack coverage)'), ...sayWorking(msg('ceiling({areaFt2} ft² × {layers} × {waste} ÷ {value} ft²)'), { areaFt2: nf(p.areaFt2, 1), layers: r.layers, waste: nf(waste, 3), value: nf(p.packFt2 ?? NaN, 1) }), result: String(r.packs) },
    );
    return steps;
  }
  const rpi = p.rPerInch && p.rPerInch > 0 ? p.rPerInch : NaN;
  steps.push({ label: p.material.startsWith('spray') ? msg('Foam depth') : msg('Settled depth to add'), formula: msg('depth = R add ÷ R per inch'), working: `${nf(r.rToAdd, 1)} ÷ ${nf(rpi, 2)}`, result: thick(r.inches) });
  if (p.material === 'spray-open' || p.material === 'spray-closed') {
    steps.push({ label: msg('Board feet of foam'), formula: msg('board feet = area (ft²) × depth (in) × (1 + extra)'), working: `${nf(p.areaFt2, 1)} × ${nf(r.inches, 3)} × ${nf(waste, 3)}`, result: nf(r.boardFeet, 0) });
    return steps;
  }
  if (i.bagChart) {
    steps.push({ label: msg('Bags (coverage chart)'), formula: msg('bags = ceiling(area × (1 + extra) ÷ area per bag)'), ...sayWorking(msg('ceiling({areaFt2} × {waste} ÷ {value} ft²)'), { areaFt2: nf(p.areaFt2, 1), waste: nf(waste, 3), value: nf(p.bagFt2 ?? NaN, 1) }), result: String(r.bags) });
  } else {
    steps.push(
      { label: msg('Weight of fill'), formula: msg('weight = area × (1 + extra) × depth ÷ 12 × density'), working: `${nf(p.areaFt2, 1)} ft² × ${nf(waste, 3)} × ${nf(r.inches, 3)} in ÷ 12 × ${nf(p.densityLbFt3 ?? NaN, 2)} lb/ft³`, result: `${nf(r.weightLb, 0)} lb` },
      { label: msg('Bags'), formula: msg('bags = ceiling(weight ÷ bag weight)'), ...sayWorking(msg('ceiling({weightLb} ÷ {value} lb)'), { weightLb: nf(r.weightLb, 1), value: nf(p.bagLb ?? NaN, 1) }), result: String(r.bags) },
    );
  }
  return steps;
}

// ---------------------------------------------------------------------------
// Paint
// ---------------------------------------------------------------------------

/**
 * `metric` means paint in litres. Lengths follow it unless `lengthUnit` says
 * otherwise (feet with litre tins, as Indian painters quote sq ft per litre).
 * `tins` is the metric tin range, largest first (default 10, 5, 2.5, 1 L).
 */
export type PaintStepsInput = PaintInput & { metric: boolean; lengthUnit?: 'ft' | 'm'; tins?: readonly number[] };

const paintSizeLabel = (s: number, metric: boolean) => (metric ? `${s} L tin` : s === 5 ? '5 gal bucket' : s === 1 ? '1 gal can' : '1 qt can');

/** Paint = (net wall area × coats + ceiling × coats) ÷ coverage × (1 + extra) × rooms, then whole cans. */
export function paintSteps(i: PaintStepsInput): ReportStep[] {
  if (!finite(i.length, i.width, i.coverage) || !(i.coverage > 0) || !(i.length > 0) || !(i.width > 0)) return [];
  if (i.includeWalls && !(i.height > 0)) return [];
  const est = paintEstimate(i);
  const buy = paintPurchase(est.paint, i.metric, i.tins);
  const lu = i.lengthUnit ?? (i.metric ? 'm' : 'ft');
  const au = lu === 'm' ? 'm²' : 'ft²';
  const vu = i.metric ? 'L' : 'gal';
  const rooms = Math.max(1, Math.floor(i.rooms ?? 1));
  const waste = 1 + (i.wastePct ?? 0) / 100;
  const perRoom = (x: number) => x / rooms;
  const steps: ReportStep[] = [];
  if (i.includeWalls) {
    const gross = 2 * (i.length + i.width) * i.height;
    steps.push(
      { label: msg('Wall area, one room'), formula: msg('walls = 2 × (length + width) × height'), working: `2 × (${nf(i.length, 3)} + ${nf(i.width, 3)}) ${lu} × ${nf(i.height, 3)} ${lu}`, result: `${nf(gross, 1)} ${au}` },
      {
        label: msg('Less doors, windows and other areas'),
        formula: msg('net = walls − doors × door area − windows × window area − other'),
        working: `${nf(gross, 1)} − ${i.doors} × ${nf(i.doorArea, 2)} − ${i.windows} × ${nf(i.windowArea, 2)} − ${nf(i.otherArea ?? 0, 2)}`,
        result: `${nf(perRoom(est.wallNet), 1)} ${au}`,
      },
    );
  }
  if (i.includeCeiling) steps.push({ label: msg('Ceiling area, one room'), formula: msg('ceiling = length × width'), working: `${nf(i.length, 3)} × ${nf(i.width, 3)} ${lu}`, result: `${nf(perRoom(est.ceiling), 1)} ${au}` });
  if (i.includeWalls) steps.push({ label: msg('Wall paint'), formula: msg('paint = net walls × coats ÷ coverage × (1 + extra) × rooms'), working: `${nf(perRoom(est.wallNet), 1)} × ${i.wallCoats} ÷ ${nf(i.coverage, 2)} × ${nf(waste, 3)} × ${rooms}`, result: `${nf(est.wallPaint, 2)} ${vu}` });
  if (i.includeCeiling) steps.push({ label: msg('Ceiling paint'), formula: msg('paint = ceiling × coats ÷ coverage × (1 + extra) × rooms'), working: `${nf(perRoom(est.ceiling), 1)} × ${i.ceilingCoats} ÷ ${nf(i.coverage, 2)} × ${nf(waste, 3)} × ${rooms}`, result: `${nf(est.ceilingPaint, 2)} ${vu}` });
  if (est.primer > 0) {
    const pc = i.primerCoverage && i.primerCoverage > 0 ? i.primerCoverage : i.coverage;
    steps.push({ label: msg('Primer (bought separately)'), formula: msg('primer = (net walls + ceiling) × primer coats ÷ primer coverage × (1 + extra) × rooms'), working: `${nf(perRoom(est.paintedArea), 1)} × ${i.primerCoats} ÷ ${nf(pc, 2)} × ${nf(waste, 3)} × ${rooms}`, result: `${nf(est.primer, 2)} ${vu}` });
  }
  steps.push({ label: msg('Paint needed'), formula: msg('total = wall paint + ceiling paint'), working: `${nf(est.wallPaint, 2)} + ${nf(est.ceilingPaint, 2)} ${vu}`, result: `${nf(est.paint, 2)} ${vu}` });
  const cans = buy.counts.filter((c) => c.count > 0);
  const list = cans.length ? said('{cans}', { cans: stepList(cans.map((c) => ['{count} x {size}', { count: c.count, size: paintSizeLabel(c.size, i.metric) }]), ' + ') }) : said(msg('nothing'));
  steps.push({
    label: msg('Containers to buy'),
    ...(i.metric ? sayFormula(msg('least total volume from {value} and {value2} L tins'), { value: (i.tins ?? [10, 5, 2.5, 1]).slice(0, -1).join(', '), value2: (i.tins ?? [10, 5, 2.5, 1]).slice(-1)[0] }) : { formula: msg('least total volume from 5 gal, 1 gal and 1 qt cans, at most two quarts') }),
    ...sayWorking(msg('at least {paint} {vu}; buys {total} {vu}'), { paint: nf(est.paint, 2), vu, total: nf(buy.total, 2) }),
    ...list,
  });
  return steps;
}

// ---------------------------------------------------------------------------
// ISO 286 fits
// ---------------------------------------------------------------------------

export type IsoFitsStepsInput = { sizeMm: number; hole: string; shaft: string; inch: boolean };

const sgnUm = (x: number) => (x > 0 ? `+${x}` : x < 0 ? `−${Math.abs(x)}` : '0');

/** Limits from ISO 286-1 Table 1 (IT grades) and Tables 2 and 3 (fundamental deviations); clearance = hole limit − shaft limit. */
export function isoFitsSteps(i: IsoFitsStepsInput): ReportStep[] {
  const res = computeFit(i.hole, i.shaft, i.sizeMm);
  if (!res.ok) return [];
  const f = res.value;
  const D = (um: number) => (i.inch ? stepPart(msg('{n} thou'), { n: sgnUm(Number((um / 25.4).toFixed(2))) }) : `${sgnUm(um)} µm`);
  const mm = (x: number) => (i.inch ? `${(x / 25.4).toFixed(5)} in` : `${x.toFixed(3)} mm`);
  const zoneStep = (z: Zone): ReportStep => {
    const H = z.kind === 'hole';
    const up = H ? 'ES' : 'es';
    const lo = H ? 'EI' : 'ei';
    const fundIsLower = H ? ['F', 'G', 'H'].includes(z.letter) : ['k', 'm', 'n', 'p', 'r', 's'].includes(z.letter);
    const js = z.letter === 'JS' || z.letter === 'js';
    const formula = js
      ? { formula: `${up} = +IT/2, ${lo} = −IT/2` }
      : fundIsLower
        ? sayFormula(msg('{lo} = fundamental deviation; {up} = {lo} + IT{grade}'), { lo, up, grade: z.grade })
        : H && ['K', 'M', 'N', 'P'].includes(z.letter)
          ? sayFormula(msg('{up} = fundamental deviation (with Δ where ISO 286-1 applies it); {lo} = {up} − IT{grade}'), { lo, up, grade: z.grade })
          : sayFormula(msg('{up} = fundamental deviation; {lo} = {up} − IT{grade}'), { lo, up, grade: z.grade });
    const working = js ? { working: `±${z.it} / 2` } : fundIsLower ? sayWorking('{lo} = {limit}; {up} = {limit} + {it}', { lo, up, limit: sgnUm(z.lower), it: z.it }) : sayWorking('{up} = {limit}; {lo} = {limit} − {it}', { lo, up, limit: sgnUm(z.upper), it: z.it });
    return { ...(H ? sayLabel(msg('Hole {zone} deviations (ISO 286-1 Table 3)'), { zone: z.label }) : sayLabel(msg('Shaft {zone} deviations (ISO 286-1 Table 2)'), { zone: z.label })), ...formula, ...working, ...said('{upper} / {lower}', { upper: D(z.upper), lower: D(z.lower) }) };
  };
  const type = f.type === 'clearance' ? msg('Clearance fit') : f.type === 'interference' ? msg('Interference fit') : msg('Transition fit');
  return [
    {
      label: msg('Size range and standard tolerance grades (ISO 286-1 Table 1)'),
      formula: msg('IT value for the grade in the size range'),
      ...sayWorking(msg('{sizeMm} mm is over {range} to {range2} mm'), { sizeMm: fmt(i.sizeMm, 6), range: f.hole.range[0], range2: f.hole.range[1] }),
      result: `IT${f.hole.grade} = ${f.hole.it} µm, IT${f.shaft.grade} = ${f.shaft.it} µm`,
    },
    zoneStep(f.hole),
    zoneStep(f.shaft),
    { label: msg('Limits of size'), formula: msg('limit = nominal + deviation'), ...sayWorking(msg('hole {sizeMm} + ({lower} to {upper}) µm; shaft {sizeMm} + ({lower2} to {upper2}) µm'), { sizeMm: fmt(i.sizeMm, 6), lower: sgnUm(f.hole.lower), upper: sgnUm(f.hole.upper), lower2: sgnUm(f.shaft.lower), upper2: sgnUm(f.shaft.upper) }), ...said(msg('hole {holeMin} to {holeMax}, shaft {shaftMin} to {shaftMax}'), { holeMin: mm(f.hole.minMm), holeMax: mm(f.hole.maxMm), shaftMin: mm(f.shaft.minMm), shaftMax: mm(f.shaft.maxMm) }) },
    { label: msg('Maximum clearance'), formula: msg('max = ES − ei (largest hole − smallest shaft)'), working: `${sgnUm(f.hole.upper)} − (${sgnUm(f.shaft.lower)})`, ...said('{d}', { d: D(f.maxClearance) }) },
    { label: msg('Minimum clearance'), formula: msg('min = EI − es (smallest hole − largest shaft)'), working: `${sgnUm(f.hole.lower)} − (${sgnUm(f.shaft.upper)})`, ...said('{d}', { d: D(f.minClearance) }) },
    { label: msg('Fit type'), formula: msg('clearance if min ≥ 0; interference if max ≤ 0; otherwise transition'), working: `min ${sgnUm(f.minClearance)} µm, max ${sgnUm(f.maxClearance)} µm`, ...said(type) },
  ];
}

// ---------------------------------------------------------------------------
// Shaft key size
// ---------------------------------------------------------------------------

const LBF_IN = 0.1129848290276167;
const HP_W = 745.69987158227;

/** Torque for the key page: as entered, or from power and speed (T = P ÷ ω). N·m (metric) or lbf·in (inch). */
export function keyDesignTorque(units: 'si' | 'us', byPower: boolean, power: number, rpm: number, torque: number): number {
  if (!byPower) return torque;
  return units === 'si' ? torqueFromPower(power * 1000, rpm) : torqueFromPower(power * HP_W, rpm) / LBF_IN;
}

/** The key page's length label: mm, or inches as the nearest 64th when exact. */
function keyLen(x: number, units: 'si' | 'us'): string {
  if (units === 'si') return `${fmt(x, 4)} mm`;
  const s = Math.round(x * 64);
  if (Math.abs(s / 64 - x) > 1e-9) return `${fmt(x, 4)} in`;
  const whole = Math.floor(s / 64);
  let num = s % 64;
  let den = 64;
  while (num > 0 && num % 2 === 0) {
    num /= 2;
    den /= 2;
  }
  return `${whole > 0 ? whole : ''}${whole > 0 && num > 0 ? '-' : ''}${num > 0 ? `${num}/${den}` : whole === 0 ? '0' : ''} in (${nf(x, 4)})`;
}

export type KeySizeStepsInput = KeyDesignInput & { byPower: boolean; power?: number; rpm?: number };

/** Key from DIN 6885-1 / ASME B17.1 by shaft size; length for shear F n ÷ (0.577 Sy w) and crushing F n ÷ (Sy h_b), F = 2T/d (Shigley, section 7-7). */
export function keySizeSteps(i: KeySizeStepsInput): ReportStep[] {
  let r;
  try {
    r = designKey(i);
  } catch {
    return [];
  }
  const u = i.units;
  const L = (x: number) => keyLen(x, u);
  const TL = u === 'si' ? 'N·m' : 'lbf·in';
  const S = u === 'si' ? 'MPa' : 'kpsi';
  const F = u === 'si' ? 'N' : 'lbf';
  const k = r.key;
  const steps: ReportStep[] = [];
  if (i.byPower) {
    steps.push({
      label: msg('Torque from power and speed'),
      formula: u === 'si' ? 'T = P ÷ ω, ω = 2π n ÷ 60' : msg('T = P ÷ ω, P in W (1 hp = 745.7 W), T ÷ 0.11298 N·m per lbf·in'),
      ...(u === 'si' ? { working: `${fmt(i.power ?? NaN, 6)} kW × 1,000 ÷ (2π × ${fmt(i.rpm ?? NaN, 6)} ÷ 60)` } : sayWorking(msg('{value} hp × 745.7 ÷ (2π × {value2} ÷ 60) ÷ 0.11298'), { value: fmt(i.power ?? NaN, 6), value2: fmt(i.rpm ?? NaN, 6) })),
      result: `${fmt(i.torque, 5)} ${TL}`,
    });
  }
  const Tw = u === 'si' ? `${fmt(i.torque, 6)} N·m × 1,000` : `${fmt(i.torque, 6)} lbf·in`;
  const s = u === 'si' ? '' : ' × 1,000';
  steps.push(
    { ...sayLabel(msg('Standard key for the shaft ({standard})'), { standard: k.standard }), formula: u === 'si' ? msg('table row: shaft over to, b × h, t1, t2') : msg('table row: shaft over to, W × H'), ...sayWorking('d = {d} {unit}, {range}', { d: fmt(i.d, 6), unit: u === 'si' ? 'mm' : 'in', range: k.range }), result: k.label },
    { label: msg('Force at the shaft surface'), formula: 'F = 2T ÷ d', working: `2 × ${Tw} ÷ ${fmt(i.d, 6)}`, result: `${fmt(r.force, 5)} ${F}` },
    { label: msg('Length for shear of the key'), formula: msg('L = F n ÷ (0.577 Sy,key w)'), working: `${fmt(r.force, 6)} × ${fmt(i.n, 4)} ÷ (0.577 × ${fmt(i.SyKey, 5)}${s} × ${fmt(k.w, 5)})`, result: L(r.lShear) },
    { label: msg('Length for crushing'), formula: u === 'si' ? 'L = F n ÷ (Sy,min (h − t1))' : 'L = F n ÷ (Sy,min h/2)', working: `${fmt(r.force, 6)} × ${fmt(i.n, 4)} ÷ (${fmt(r.SyCrush, 5)}${s} × ${fmt(r.bearingHeight, 5)})`, result: L(r.lCrush) },
    { label: msg('Required bearing length'), formula: msg('L = max(L shear, L crushing)'), ...sayWorking(r.governedBy === 'crushing' ? msg('max({lShear}, {lCrush}), crushing governs') : msg('max({lShear}, {lCrush}), shear governs'), { lShear: L(r.lShear), lCrush: L(r.lCrush) }), result: L(r.lRequired) },
    {
      label: msg('Key length'),
      formula: u === 'si' ? (i.roundEnds ? msg('l = L + b (form A), then the next DIN 6885 length') : msg('next DIN 6885 length')) : msg('rounded up to the next 1/8 in'),
      ...(u === 'si' ? sayWorking(msg('{lRequired}{value} mm, series {lMin} to {lMax} mm'), { lRequired: fmt(r.lRequired, 5), value: i.roundEnds ? ` + ${k.w}` : '', lMin: k.lMin, lMax: k.lMax }) : sayWorking(msg('{lRequired} in × 8, rounded up, ÷ 8'), { lRequired: fmt(r.lRequired, 5) })),
      ...(r.standardLength ? { result: L(r.standardLength) } : said(msg('none fits'))),
    },
  );
  return steps;
}

// ---------------------------------------------------------------------------
// IEEE 754 float converter
// ---------------------------------------------------------------------------

export type Ieee754StepsInput = { mode: 'encode' | 'decode'; format: FloatFormat; value: string };

/** IEEE 754-2019 section 3.4: value = (−1)^s × 1.f × 2^(E − bias) for normal numbers, 0.f × 2^emin for subnormals; encoding rounds to nearest, ties to even. */
export function ieee754Steps(i: Ieee754StepsInput): ReportStep[] {
  let r;
  try {
    r = i.mode === 'encode' ? encodeFloat(i.value, i.format) : decodeFloat(i.value, i.format);
  } catch {
    return [];
  }
  const f = FORMATS[i.format];
  const t = f.fractionBits;
  const F = BigInt('0b' + (r.fractionBits || '0'));
  const steps: ReportStep[] = [];
  if (i.mode === 'decode') steps.push({ ...sayLabel(msg('Bit pattern ({bits} bits: 1 sign, {exponentBits} exponent, {t} fraction)'), { bits: f.bits, exponentBits: f.exponentBits, t }), formula: msg('hex digit = 4 bits'), working: `0x${r.hex}`, result: `${r.bits[0]} ${r.exponentBits} ${r.fractionBits}` });
  steps.push({ label: msg('Sign bit'), formula: msg('s = 0 for positive, 1 for negative'), ...(i.mode === 'encode' ? sayWorking(msg('input {value}'), { value: i.value.trim() }) : sayWorking(msg('first bit {bits}'), { bits: r.bits[0] })), result: `s = ${r.sign}` });
  if (r.class === 'nan' || r.class === 'infinity') {
    steps.push({ label: msg('Exponent field'), ...sayFormula(msg('all ones ({value}) marks infinity or NaN'), { value: 2 ** f.exponentBits - 1 }), working: `E = ${r.exponentBits}₂`, result: `E = ${r.biasedExponent}` });
    steps.push({ label: msg('Fraction field'), formula: msg('zero for infinity, not zero for NaN'), working: `F = ${F.toString()}`, ...(r.class === 'nan' ? { result: 'NaN' } : said(msg('infinity'))) });
  } else if (r.class === 'normal') {
    steps.push(
      { ...sayLabel(msg('Exponent (bias {bias})'), { bias: f.bias }), formula: i.mode === 'encode' ? msg('e = ⌊log₂|x|⌋; E = e + bias') : msg('e = E − bias'), working: i.mode === 'encode' ? `e = ${r.exponent}; E = ${r.exponent} + ${f.bias}` : `${r.biasedExponent} − ${f.bias}`, result: `E = ${r.biasedExponent} = ${r.exponentBits}₂, e = ${r.exponent}` },
      { ...sayLabel(msg('Fraction ({t} bits)'), { t }), ...(i.mode === 'encode' ? sayFormula(msg('F = round((|x| ÷ 2^e − 1) × 2^{t}), to nearest, ties to even'), { t }) : sayFormula(msg('significand = 1 + F ÷ 2^{t}'), { t })), working: `F = ${F.toString()} = ${r.fractionBits}₂`, result: `1 + ${F.toString()} / 2^${t}` },
    );
  } else {
    steps.push(
      { ...(r.class === 'zero' ? { label: msg('Exponent (zero)') } : r.class === 'subnormal' ? { label: msg('Exponent (subnormal)') } : sayLabel(msg('Exponent ({class})'), { class: r.class })), ...sayFormula(msg('E = 0, value uses emin = {emin}'), { emin: f.emin }), working: `E = ${r.exponentBits}₂`, result: `E = 0, e = ${f.emin}` },
      { ...sayLabel(msg('Fraction ({t} bits)'), { t }), ...sayFormula(msg('significand = 0 + F ÷ 2^{t}'), { t }), working: `F = ${F.toString()}`, result: `${F.toString()} / 2^${t}` },
    );
  }
  steps.push({ label: msg('Stored value'), formula: r.class === 'normal' ? 'v = (−1)^s × (1 + F ÷ 2^t) × 2^e' : r.class === 'subnormal' || r.class === 'zero' ? msg('v = (−1)^s × (F ÷ 2^t) × 2^emin') : msg('special value'), working: r.formula, result: r.exactValue });
  if (i.mode === 'encode') {
    if (r.rounding) steps.push({ label: msg('Rounding error'), formula: msg('error = stored value − input'), working: `${r.exactValue} − ${r.rounding.input}`, ...(r.rounding.exact ? said(msg('none, exact')) : { result: r.rounding.error }) });
    steps.push({ label: msg('Bit pattern'), formula: msg('s | E | F, grouped 4 bits per hex digit'), working: `${r.bits[0]} ${r.exponentBits} ${r.fractionBits}`, result: `0x${r.hex}` });
  } else {
    steps.push({ label: msg('Shortest decimal'), formula: msg('fewest digits that read back to the same bits'), working: r.exactValue, result: r.shortest });
  }
  return steps;
}

// ---------------------------------------------------------------------------
// Number base converter
// ---------------------------------------------------------------------------

export type NumberBaseStepsInput = { value: string; from: number | 'auto'; to?: number; width?: number; pattern?: boolean; group: boolean };

function groupedBase(r: BaseString, size: number, on: boolean): string {
  if (!on) return r.text;
  const neg = r.text.startsWith('-');
  const rest = r.text.slice(neg ? 1 : 0);
  const dot = rest.indexOf('.');
  const int = dot < 0 ? rest : rest.slice(0, dot);
  return (neg ? '-' : '') + groupDigits(int, size) + (dot < 0 ? '' : rest.slice(dot));
}

/** "255 ÷ 16 = 15 r 15; 15 ÷ 16 = 0 r 15", the repeated division that writes an integer in a base. */
function divisionChain(v: bigint, base: number, max = 6): string {
  if (v === 0n) return '0';
  const b = BigInt(base);
  const parts: string[] = [];
  let x = v;
  let n = 0;
  while (x > 0n) {
    if (n < max) parts.push(`${x} ÷ ${base} = ${x / b} r ${x % b}`);
    x /= b;
    n++;
  }
  return n > max ? `${parts.join('; ')}; … (${n} divisions)` : parts.join('; ');
}

/** Positional notation: value = Σ dᵢ × bⁱ; conversion out by repeated division (integer) and multiplication (fraction) by the base. */
export function numberBaseSteps(i: NumberBaseStepsInput): ReportStep[] {
  let r;
  try {
    r = convertNumber(i.value, { from: i.from, to: i.to, width: i.width && i.width > 0 ? i.width : undefined, inputIsPattern: !!i.pattern && !!i.width && i.width > 0 });
  } catch {
    return [];
  }
  const mag = r.isInteger ? BigInt(r.decimal.text.replace('-', '')) : null;
  const exp = r.isInteger && !r.negative ? positionalExpansion(BigInt(r.decimal.text), r.fromBase) : null;
  const steps: ReportStep[] = [
    { label: msg('Input base'), ...(r.prefix ? sayFormula(msg('{prefix} prefix → base {fromBase}'), { prefix: r.prefix, fromBase: r.fromBase }) : { formula: msg('base as chosen (decimal if no prefix)') }), working: i.value.trim(), ...said(msg('base {base}'), { base: r.fromBase }) },
    {
      label: msg('Value in decimal'),
      formula: msg('value = Σ dᵢ × baseⁱ'),
      ...(exp ? { working: `${BigInt(r.decimal.text).toString(r.fromBase).toUpperCase()} = ${exp}` } : (r.isInteger ? sayWorking(msg('{value} read in base {fromBase}'), { value: i.value.trim(), fromBase: r.fromBase }) : sayWorking(msg('exact fraction {fraction}'), { fraction: r.fraction }))),
      result: groupedBase(r.decimal, 3, i.group),
    },
  ];
  const chain = (b: number) => {
    if (mag === null) return r.isInteger ? sayWorking(msg('integer part by repeated ÷ {base}'), { base: b }) : sayWorking(msg('integer part by repeated ÷ {base}; fraction by repeated × base'), { base: b });
    const text = divisionChain(mag, b);
    const more = /; … \((\d+) divisions\)$/.exec(text);
    return more ? sayWorking(msg('{chain}; … ({n} divisions)'), { chain: text.slice(0, more.index), n: Number(more[1]) }) : { working: text };
  };
  steps.push(
    { label: msg('Binary (base 2)'), formula: msg('repeated division by 2, remainders read upwards'), ...chain(2), result: groupedBase(r.binary, 4, i.group) },
    { label: msg('Octal (base 8)'), formula: msg('repeated division by 8 (or binary in groups of 3)'), ...chain(8), result: groupedBase(r.octal, 3, i.group) },
    { label: msg('Hexadecimal (base 16)'), formula: msg('repeated division by 16 (or binary in groups of 4)'), ...chain(16), result: groupedBase(r.hex, 4, i.group) },
  );
  if (r.target && ![2, 8, 10, 16].includes(r.target.base)) steps.push({ ...sayLabel(msg('Base {base}'), { base: r.target.base }), ...sayFormula(msg('repeated division by {base}, digits 0 to 9 then A to Z'), { base: r.target.base }), ...chain(r.target.base), result: r.target.text });
  if (r.twos) {
    steps.push({ ...sayLabel(msg('{width}-bit two\'s complement'), { width: r.twos.width }), ...sayFormula(msg('pattern = value mod 2^{width}'), { width: r.twos.width }), working: `${r.negative ? '-' : ''}${mag ?? ''} mod 2^${r.twos.width} = ${r.twos.unsigned}`, result: `0x${r.twos.hex}` });
  }
  return steps;
}

// ---------------------------------------------------------------------------
// Chemistry: limiting reactant and percent yield
// ---------------------------------------------------------------------------

const showChem = (x: number, sf: number | undefined, exact: boolean) => (exact || !sf ? fmt(x, 6) : formatSig(x, sf));

function molesWorking(value: number, unit: string, M: number, gas: GasConvention): string {
  if (unit === 'g') return `${fmt(value, 8)} g ÷ ${fmt(M, 6)} g/mol`;
  if (unit === 'kg') return `${fmt(value, 8)} kg × 1,000 ÷ ${fmt(M, 6)} g/mol`;
  if (unit === 'mg') return `${fmt(value, 8)} mg ÷ 1,000 ÷ ${fmt(M, 6)} g/mol`;
  if (unit === 'mol') return `${fmt(value, 8)} mol`;
  if (unit === 'mmol') return `${fmt(value, 8)} mmol ÷ 1,000`;
  if (unit === 'L' || unit === 'mL') return `${fmt(value, 8)} ${unit}${unit === 'mL' ? ' ÷ 1,000' : ''} ÷ ${fmt(GAS_CONVENTIONS[gas].litresPerMol, 6)} L/mol`;
  return `${fmt(value, 8)} ÷ 6.02214076e23`;
}

export type LimitingReactantStepsInput = { equation: BalancedEquation; amounts: { species: number; amount: AmountInput }[]; gas: GasConvention; exact: boolean };

/** n = m ÷ M; extent each reactant allows = n ÷ ν; the smallest is ξ (IUPAC Gold Book, extent of reaction); product = ξ ν M (OpenStax Chemistry 2e, 4.4). */
export function limitingReactantSteps(i: LimitingReactantStepsInput): ReportStep[] {
  const res = limitingReactant(i.equation, i.amounts, i.gas);
  if (!res.ok) return [];
  const r = res.value;
  const given = r.reactants.filter((x) => x.moles !== undefined);
  const amt = new Map(i.amounts.map((a) => [a.species, a.amount]));
  const show = (x: number) => showChem(x, r.sigFigs, i.exact);
  const lim = stepList(r.limitingIndexes.map((k) => ['{label}', { label: r.equation.species[k].label }]), msg(' and '));
  const steps: ReportStep[] = [
    { label: msg('Balanced equation'), formula: msg('coefficients ν that conserve every element'), working: r.equation.species.map((s) => `${s.coefficient} ${s.label}`).join(', '), result: r.equation.text },
    { label: msg('Moles of each reactant'), formula: msg('n = m ÷ M (or V ÷ Vm for a gas)'), working: given.map((x) => `${x.label}: ${molesWorking(amt.get(x.index)!.value, amt.get(x.index)!.unit, x.molarMass, i.gas)}`).join('; '), result: given.map((x) => `${x.label} ${fmt(x.moles!, 5)} mol`).join(', ') },
    { label: msg('Extent each reactant allows'), formula: 'ξᵢ = n ÷ ν', working: given.map((x) => `${x.label}: ${fmt(x.moles!, 6)} ÷ ${x.coefficient}`).join('; '), result: given.map((x) => `${x.label} ${fmt(x.extentAllowed!, 5)} mol`).join(', ') },
    { label: r.exactMix ? msg('Exact stoichiometric mix') : msg('Limiting reactant'), formula: msg('ξ = smallest n ÷ ν'), working: `min(${given.map((x) => fmt(x.extentAllowed!, 5)).join(', ')})`, ...said('{lim}, ξ = {extent} mol', { lim, extent: fmt(r.extent, 5) }) },
  ];
  const excess = r.reactants.filter((x) => x.excessGrams !== undefined && !x.limiting);
  if (excess.length) steps.push({ label: msg('Excess left over'), formula: msg('left = (n − ξ ν) × M'), working: excess.map((x) => `${x.label}: (${fmt(x.moles!, 6)} − ${fmt(r.extent, 6)} × ${x.coefficient}) × ${fmt(x.molarMass, 6)}`).join('; '), result: excess.map((x) => `${x.label} ${show(x.excessGrams!)} g`).join(', ') });
  const p = r.products[0];
  if (p) steps.push({ ...sayLabel(msg('Theoretical yield of {label}'), { label: p.label }), formula: 'm = ξ × ν × M', working: `${fmt(r.extent, 6)} mol × ${p.coefficient} × ${fmt(p.molarMass, 6)} g/mol`, result: `${show(p.grams)} g` });
  return steps;
}

export type PercentYieldStepsInput =
  | { mode: 'simple'; solveFor: YieldKey; actual?: number; theoretical?: number; percent?: number; sf?: number; exact: boolean; typed: Record<YieldKey, string> }
  | { mode: 'equation'; equation: BalancedEquation; amounts: { species: number; amount: AmountInput }[]; product: number; actual: number; gas: GasConvention; sfs: { theoretical?: number; percent?: number }; exact: boolean }
  | { mode: 'atom'; equation: BalancedEquation; product: number };

/** Percent yield = actual ÷ theoretical × 100 (IUPAC; OpenStax Chemistry 2e, 4.4) and atom economy = ν M(product) ÷ Σ ν M(reactants) × 100 (Trost, 1991). */
export function percentYieldSteps(i: PercentYieldStepsInput): ReportStep[] {
  if (i.mode === 'simple') {
    const res = solvePercentYield(i.solveFor, { actual: i.actual, theoretical: i.theoretical, percent: i.percent });
    if (!res.ok) return [];
    const r = res.value;
    const shown = (k: YieldKey, x: number) => (k === i.solveFor ? showChem(x, i.sf, i.exact) : String(i.typed[k]).trim());
    const solve: Record<YieldKey, ReportStep> = {
      percent: { label: msg('Percent yield'), formula: msg('percent = actual ÷ theoretical × 100'), working: `${fmt(r.actual, 6)} ÷ ${fmt(r.theoretical, 6)} × 100`, result: `${fmt(r.percent, 6)}%` },
      actual: { label: msg('Actual yield'), formula: msg('actual = percent ÷ 100 × theoretical'), working: `${fmt(r.percent, 6)} ÷ 100 × ${fmt(r.theoretical, 6)}`, result: fmt(r.actual, 6) },
      theoretical: { label: msg('Theoretical yield'), formula: msg('theoretical = actual ÷ (percent ÷ 100)'), working: `${fmt(r.actual, 6)} ÷ (${fmt(r.percent, 6)} ÷ 100)`, result: fmt(r.theoretical, 6) },
    };
    const x = r[i.solveFor];
    return [
      solve[i.solveFor],
      { label: msg('Shortfall'), formula: msg('theoretical − actual'), working: `${fmt(r.theoretical, 6)} − ${fmt(r.actual, 6)}`, result: fmt(r.shortfall, 6) },
      { label: msg('Rounded to the precision of the data'), ...(i.exact || !i.sf ? { formula: msg('shown to 6 significant figures') } : sayFormula(msg('{sf} significant figures (fewest in the measured masses)'), { sf: i.sf })), working: fmt(x, 8), result: i.solveFor === 'percent' ? `${shown('percent', x)}%` : shown(i.solveFor, x) },
    ];
  }
  if (i.mode === 'atom') {
    const res = atomEconomy(i.equation, i.product);
    if (!res.ok) return [];
    const a = res.value;
    const reactants = a.equation.species.filter((s) => s.side === 'reactant');
    const sp = a.equation.species[i.product];
    return [
      { label: msg('Balanced equation'), formula: msg('coefficients ν that conserve every element'), working: a.equation.species.map((s) => `${s.coefficient} ${s.label}`).join(', '), result: a.equation.text },
      { label: msg('Mass of reactants per mole of reaction'), formula: msg('Σ ν × M(reactant)'), working: reactants.map((s) => `${s.coefficient} × ${fmt(s.molarMass, 6)}`).join(' + '), result: `${fmt(a.reactantMass, 6)} g` },
      { ...sayLabel(msg('Mass of {productLabel}'), { productLabel: a.productLabel }), formula: msg('ν × M(product)'), working: `${sp.coefficient} × ${fmt(sp.molarMass, 6)}`, result: `${fmt(a.productMass, 6)} g` },
      { label: msg('Atom economy'), formula: msg('AE = ν M(product) ÷ Σ ν M(reactants) × 100'), working: `${fmt(a.productMass, 6)} ÷ ${fmt(a.reactantMass, 6)} × 100`, result: `${fmt(a.percent, 4)}%` },
    ];
  }
  const res = percentYieldFromEquation(i.equation, i.amounts, i.product, i.actual, i.gas);
  if (!res.ok) return [];
  const r = res.value;
  const y = r.yieldResult;
  const given = y.reactants.filter((x) => x.moles !== undefined);
  const amt = new Map(i.amounts.map((a) => [a.species, a.amount]));
  const sp = y.equation.species[r.productIndex];
  return [
    { label: msg('Balanced equation'), formula: msg('coefficients ν that conserve every element'), working: y.equation.species.map((s) => `${s.coefficient} ${s.label}`).join(', '), result: y.equation.text },
    { label: msg('Moles of reactant'), formula: msg('n = m ÷ M (or V ÷ Vm for a gas)'), working: given.map((x) => `${x.label}: ${molesWorking(amt.get(x.index)!.value, amt.get(x.index)!.unit, x.molarMass, i.gas)}`).join('; '), result: given.map((x) => `${x.label} ${fmt(x.moles!, 5)} mol`).join(', ') },
    { label: msg('Extent of reaction (limiting reactant)'), formula: msg('ξ = smallest n ÷ ν'), working: given.map((x) => `${x.label}: ${fmt(x.moles!, 6)} ÷ ${x.coefficient}`).join('; '), result: `${r.limitingLabels.join(' and ')}, ξ = ${fmt(y.extent, 5)} mol` },
    { ...sayLabel(msg('Theoretical yield of {productLabel}'), { productLabel: r.productLabel }), formula: 'm = ξ × ν × M', working: `${fmt(y.extent, 6)} mol × ${sp.coefficient} × ${fmt(sp.molarMass, 6)} g/mol`, result: `${showChem(r.theoreticalGrams, i.sfs.theoretical, i.exact)} g` },
    { label: msg('Percent yield'), formula: msg('percent = actual ÷ theoretical × 100'), working: `${fmt(r.actual, 6)} g ÷ ${fmt(r.theoreticalGrams, 6)} g × 100`, result: `${showChem(r.percent, i.sfs.percent, i.exact)}%` },
  ];
}

// ---------------------------------------------------------------------------
// Linear regression
// ---------------------------------------------------------------------------

export type LinearRegressionStepsInput = { xs: number[]; ys: number[]; confidence: number; at: number | null };

const sumList = (v: number[], max = 8) => (v.length <= max ? v.map((x) => fmtStats(x, 8)).join(' + ') : `${v.slice(0, max).map((x) => fmtStats(x, 8)).join(' + ')} + … (${v.length} values)`);

/** Ordinary least squares with centred sums: b = Sxy ÷ Sxx, a = ȳ − b x̄ (NIST/SEMATECH e-Handbook, 4.1.4.1). */
export function linearRegressionSteps(i: LinearRegressionStepsInput): ReportStep[] {
  const res = linearRegression(i.xs, i.ys, i.confidence);
  if (!res.ok) return [];
  const g = res.value;
  const sign = g.slope < 0 ? '-' : '+';
  const equation = `ŷ = ${fmtStats(g.intercept, 6)} ${sign} ${fmtStats(Math.abs(g.slope), 6)}x`;
  const dev = (v: number[], m: number, n = 3) => v.slice(0, n).map((x) => `(${fmtStats(x, 8)} − ${fmtStats(m, 6)})²`).join(' + ') + (v.length > n ? ' + …' : '');
  const steps: ReportStep[] = [
    { label: msg('Means'), formula: 'x̄ = Σx ÷ n, ȳ = Σy ÷ n', ...(i.xs.length > 8 && i.ys.length > 8
      ? sayWorking(msg('x̄ = ({xs} + … ({nx} values)) ÷ {n}; ȳ = ({ys} + … ({ny} values)) ÷ {n}'), { xs: sumList(i.xs.slice(0, 8)), nx: i.xs.length, ys: sumList(i.ys.slice(0, 8)), ny: i.ys.length, n: g.n })
      : { working: `x̄ = (${sumList(i.xs)}) ÷ ${g.n}; ȳ = (${sumList(i.ys)}) ÷ ${g.n}` }), result: `x̄ = ${fmtStats(g.meanX, 8)}, ȳ = ${fmtStats(g.meanY, 8)}` },
    { label: msg('Sums of squares about the means'), formula: msg('Sxx = Σ(x − x̄)², Sxy = Σ(x − x̄)(y − ȳ), Syy = Σ(y − ȳ)²'), ...sayWorking(msg('Sxx = {xs}'), { xs: dev(i.xs, g.meanX) }), ...said('Sxx = {sxx}, Sxy = {sxy}, Syy = {syy}', { sxx: fmtStats(g.sxx, 8), sxy: fmtStats(g.sxy, 8), syy: fmtStats(g.syy, 8) }) },
    { label: msg('Slope'), formula: msg('b = Sxy ÷ Sxx'), working: `${fmtStats(g.sxy, 8)} ÷ ${fmtStats(g.sxx, 8)}`, result: fmtStats(g.slope, 7) },
    { label: msg('Intercept'), formula: 'a = ȳ − b x̄', working: `${fmtStats(g.meanY, 8)} − ${fmtStats(g.slope, 8)} × ${fmtStats(g.meanX, 8)}`, result: fmtStats(g.intercept, 7) },
    { label: msg('Correlation and R²'), formula: msg('r = Sxy ÷ √(Sxx Syy); R² = 1 − SSE ÷ SST'), working: `${fmtStats(g.sxy, 8)} ÷ √(${fmtStats(g.sxx, 8)} × ${fmtStats(g.syy, 8)}); 1 − ${fmtStats(g.sse, 8)} ÷ ${fmtStats(g.sst, 8)}`, result: `r = ${fmtStats(g.r, 5)}, R² = ${fmtStats(g.r2, 5)}` },
    { label: msg('Residual standard error and SE of the slope'), formula: msg('s = √(SSE ÷ (n − 2)); SE(b) = s ÷ √Sxx'), working: `√(${fmtStats(g.sse, 8)} ÷ ${g.df}); s ÷ √${fmtStats(g.sxx, 8)}`, result: `s = ${fmtStats(g.se, 5)}, SE(b) = ${fmtStats(g.seSlope, 4)}` },
  ];
  if (i.at !== null && Number.isFinite(i.at)) {
    const p = predict(g, i.at);
    steps.push({ ...sayLabel(msg('Predicted y at x = {x}'), { x: fmtStats(p.x, 6) }), formula: 'ŷ = a + b x', working: `${fmtStats(g.intercept, 8)} + ${fmtStats(g.slope, 8)} × ${fmtStats(p.x, 8)}`, result: fmtStats(p.y, 7) });
  } else {
    steps.push({ label: msg('Regression line'), formula: 'ŷ = a + b x', working: `a = ${fmtStats(g.intercept, 6)}, b = ${fmtStats(g.slope, 6)}`, result: equation });
  }
  return steps;
}

// ---------------------------------------------------------------------------
// LLM GPU memory
// ---------------------------------------------------------------------------

const gb = (b: number) => `${fmtNum(b / GIB, 3)} GB`;
const big = (x: number) => (x >= 1e9 ? `${fmtNum(x / 1e9, 4)}B` : x >= 1e6 ? `${fmtNum(x / 1e6, 4)}M` : fmtNum(x, 4));

/** Weights P × bytes, KV cache 2 L h_kv d bytes s b, AdamW 16 bytes/param (ZeRO), LoRA r(in + out), activations per Korthikanti et al. 2022. 1 GB = 2³⁰ bytes. */
export function llmGpuMemorySteps(i: MemoryInput): ReportStep[] {
  const m = i.model;
  if ([m.paramsB, m.layers, m.hidden, m.heads, m.kvHeads, m.headDim, m.intermediate, m.vocab, i.contextTokens, i.batch].some((v) => !(v > 0)) || !(i.overheadPct >= 0)) return [];
  const r = estimateMemory(i);
  const P = m.paramsB * 1e9;
  const emb = embeddingParams(m);
  const part = (key: string) => r.parts.find((p) => p.key === key)?.bytes ?? 0;
  const sbh = i.contextTokens * i.batch * m.hidden;
  const actWork = i.checkpointing
    ? `${m.layers} × 2 × ${sbh.toLocaleString('en-US')} + 34 × ${sbh.toLocaleString('en-US')} + ${i.contextTokens} × ${i.batch} × ${m.vocab} × 4`
    : `${m.layers} × 34 × ${sbh.toLocaleString('en-US')} + ${i.contextTokens} × ${i.batch} × ${m.vocab} × 4`;
  const act: ReportStep = { label: msg('Activations'), formula: i.checkpointing ? msg('L × 2 s b h + 34 s b h + s b V × 4 (checkpointing)') : 'L × 34 s b h + s b V × 4', working: actWork, result: gb(part('act')) };
  const steps: ReportStep[] = [];
  if (i.mode === 'inference') {
    const b = PRECISION_BYTES[i.precision];
    steps.push(
      b >= 2
        ? { label: msg('Weights'), formula: msg('parameters × bytes per weight'), working: `${big(P)} × ${b}`, result: gb(part('weights')) }
        : { label: msg('Weights (embeddings kept in BF16)'), formula: msg('(P − embeddings) × bytes + embeddings × 2'), working: `(${big(P)} − ${big(emb)}) × ${b} + ${big(emb)} × 2`, result: gb(part('weights')) },
      { label: msg('KV cache'), formula: msg('2 × layers × KV heads × head dim × bytes × context × batch'), working: `2 × ${m.layers} × ${m.kvHeads} × ${m.headDim} × ${i.kvBytes} × ${i.contextTokens} × ${i.batch}`, result: gb(part('kv')) },
    );
  } else if (i.mode === 'full') {
    steps.push(
      { label: msg('Weights and gradients (BF16)'), formula: msg('2 bytes + 2 bytes per parameter'), working: `${big(P)} × (2 + 2)`, result: gb(part('weights') + part('grads')) },
      { label: msg('AdamW state and FP32 master weights'), formula: msg('12 bytes per parameter (ZeRO, Rajbhandari et al. 2019)'), working: `${big(P)} × 12`, result: gb(part('optim')) },
      act,
    );
  } else {
    const A = loraParams(m, i.loraRank, i.loraTargets);
    steps.push(
      i.mode === 'lora'
        ? { label: msg('Frozen base (BF16)'), formula: msg('parameters × 2 bytes'), working: `${big(P)} × 2`, result: gb(part('weights')) }
        : { label: msg('Frozen base (NF4, double-quantised)'), formula: msg('(P − embeddings) × 4.127 bits ÷ 8 + embeddings × 2'), working: `(${big(P)} − ${big(emb)}) × ${fmtNum(NF4_BYTES_PER_PARAM, 5)} + ${big(emb)} × 2`, result: gb(part('weights')) },
      { label: msg('LoRA adapters'), formula: msg('A = r × Σ(in + out) over target matrices × layers; 16 bytes each with AdamW'), ...sayWorking(msg('r = {loraRank}, targets {value}, {layers} layers → {A} params × 16'), { loraRank: i.loraRank, value: i.loraTargets.join(', '), layers: m.layers, A: big(A) }), result: gb(part('adapter')) },
      act,
    );
  }
  const sub = r.parts.filter((p) => p.key !== 'overhead').reduce((s, p) => s + p.bytes, 0);
  steps.push(
    { label: msg('Overhead allowance'), formula: msg('subtotal × overhead %'), working: `${gb(sub)} × ${fmtNum(i.overheadPct, 4)}%`, result: gb(part('overhead')) },
    { label: msg('Total memory'), formula: msg('sum of the parts'), working: r.parts.map((p) => gb(p.bytes)).join(' + '), result: gb(r.totalBytes) },
  );
  return steps;
}

// ---------------------------------------------------------------------------
// LLM training compute
// ---------------------------------------------------------------------------

export type ComputeSolve = 'flops' | 'tokens' | 'params' | 'optimal';

/** N, D and C for the chosen unknown (C ≈ 6ND; Chinchilla D = 20N), or null when an input is missing. */
export function trainingComputeSolve(solve: string, N0: number, D0: number, C0: number): { N: number; D: number; C: number } | null {
  if (solve === 'flops') return N0 > 0 && D0 > 0 ? { N: N0, D: D0, C: trainingFlops(N0, D0) } : null;
  if (solve === 'tokens') return N0 > 0 && C0 > 0 ? { N: N0, D: tokensForCompute(C0, N0), C: C0 } : null;
  if (solve === 'params') return D0 > 0 && C0 > 0 ? { N: paramsForCompute(C0, D0), D: D0, C: C0 } : null;
  if (C0 > 0) {
    const o = chinchillaOptimal(C0);
    return { N: o.params, D: o.tokens, C: C0 };
  }
  return null;
}

export type TrainingComputeStepsInput = { solve: ComputeSolve; N0: number; D0: number; C0: number; hw: Omit<HardwareInput, 'flops'> | null };

const usd = (x: number) => (Number.isFinite(x) ? `$${x >= 1e6 ? `${fmtNum(x / 1e6, 3)}M` : Math.round(x).toLocaleString('en-US')}` : 'n/a');

/** C ≈ 6ND (Kaplan et al. 2020), compute-optimal D = 20N (Hoffmann et al. 2022), GPU-hours = C ÷ (peak × MFU) ÷ 3,600. */
export function llmTrainingComputeSteps(i: TrainingComputeStepsInput): ReportStep[] {
  const s = trainingComputeSolve(i.solve, i.N0, i.D0, i.C0);
  if (!s) return [];
  const solveStep: Record<ComputeSolve, ReportStep> = {
    flops: { label: msg('Training compute'), formula: 'C ≈ 6 × N × D', working: `6 × ${formatSci(s.N, 4)} × ${formatSci(s.D, 4)}`, result: formatSci(s.C) },
    tokens: { label: msg('Training tokens'), formula: 'D = C ÷ (6 N)', working: `${formatSci(s.C, 4)} ÷ (6 × ${formatSci(s.N, 4)})`, result: formatScaled(s.D) },
    params: { label: msg('Parameters'), formula: 'N = C ÷ (6 D)', working: `${formatSci(s.C, 4)} ÷ (6 × ${formatSci(s.D, 4)})`, result: formatScaled(s.N) },
    optimal: { label: msg('Chinchilla compute-optimal split'), formula: 'D = 20 N, so C = 120 N², N = √(C ÷ 120)', working: `√(${formatSci(s.C, 4)} ÷ 120); D = 20 × N`, result: `N = ${formatScaled(s.N)}, D = ${formatScaled(s.D)}` },
  };
  const steps: ReportStep[] = [solveStep[i.solve], { label: msg('Tokens per parameter'), formula: msg('D ÷ N (Chinchilla optimum about 20)'), working: `${formatScaled(s.D)} ÷ ${formatScaled(s.N)}`, result: fmtNum(s.D / s.N) }];
  if (!i.hw) return steps;
  const hw = hardwareEstimate({ ...i.hw, flops: s.C });
  if (!Number.isFinite(hw.gpuHours)) return steps;
  steps.push(
    { label: msg('Useful throughput per GPU'), formula: msg('peak TFLOPS × MFU'), working: `${fmtNum(i.hw.peakTflops, 6)} × ${fmtNum(i.hw.mfuPct, 4)}%`, result: `${fmtNum(hw.effectiveTflopsPerGpu)} TFLOPS` },
    { label: msg('GPU-hours'), formula: msg('C ÷ (TFLOPS × 10¹²) ÷ 3,600'), working: `${formatSci(s.C, 4)} ÷ (${fmtNum(hw.effectiveTflopsPerGpu, 6)} × 10¹²) ÷ 3,600`, result: fmtNum(hw.gpuHours) },
    { label: msg('Wall-clock time'), formula: msg('GPU-hours ÷ GPUs ÷ 24'), working: `${fmtNum(hw.gpuHours, 6)} ÷ ${i.hw.gpus} ÷ 24`, ...(hw.wallClockDays >= 1 ? said(msg('{n} days'), { n: fmtNum(hw.wallClockDays) }) : said(msg('{n} hours'), { n: fmtNum(hw.wallClockDays * 24) })) },
    { label: msg('Compute cost'), formula: msg('GPU-hours × price per GPU-hour'), working: `${fmtNum(hw.gpuHours, 6)} × $${i.hw.pricePerGpuHour}`, result: usd(hw.cost) },
    { label: msg('Energy'), formula: msg('GPU-hours × board power × PUE'), working: `${fmtNum(hw.gpuHours, 6)} h × ${i.hw.tdpW} W × ${i.hw.pue}`, result: hw.energyMwh >= 1 ? `${fmtNum(hw.energyMwh)} MWh` : `${fmtNum(hw.energyMwh * 1000)} kWh` },
  );
  return steps;
}

// ---------------------------------------------------------------------------
// ND filter
// ---------------------------------------------------------------------------

export type NdFilterStepsInput =
  | { mode: 'exposure'; base: number; by: 'preset' | 'stops' | 'density'; factors?: number[]; stops?: number; density?: number; stopsList: number[]; p: number | null }
  | { mode: 'target'; base: number; target: number };

/** One stop doubles the light: factor = 2^stops, optical density D = stops × log₁₀2, time = metered × factor; film reciprocity t^p (Schwarzschild). */
export function ndFilterSteps(i: NdFilterStepsInput): ReportStep[] {
  if (i.mode === 'target') {
    const res = ndForTarget(i.base, i.target);
    if (!res.ok) return [];
    const v = res.value;
    return [
      { label: msg('Ratio of target to metered time'), formula: msg('ratio = t target ÷ t metered'), working: `${fmt(i.target, 6)} s ÷ ${fmt(i.base, 6)} s`, result: fmt(i.target / i.base, 5) },
      { label: msg('Filter strength needed'), formula: msg('stops = log₂(ratio); D = stops × log₁₀2'), working: `log₂(${fmt(i.target / i.base, 6)})`, ...said(msg('{stops} stops (density {density})'), { stops: fmt(v.stops, 3), density: fmt(v.density, 2) }) },
      { label: msg('Closest stock filter'), formula: msg('filter with the nearest stop count; time = metered × its factor'), ...sayWorking('{filter}: {base} s × {factor}', { filter: v.nearest?.label, base: fmt(i.base, 6), factor: v.nearest?.factor }), result: formatShutter(i.base * (v.nearest?.factor ?? 1)) },
    ];
  }
  const res = ndExposure(i.base, i.stopsList.length ? i.stopsList : [0], i.p);
  if (!res.ok) return [];
  const v = res.value;
  const strength: ReportStep =
    i.by === 'density'
      ? { label: msg('Stops from optical density'), formula: msg('stops = D ÷ log₁₀2'), working: `${fmt(i.density ?? NaN, 4)} ÷ 0.30103`, ...said(msg('{stops} stops'), { stops: fmt(v.stops, 3) }) }
      : i.by === 'stops'
        ? { label: msg('Filter strength'), formula: msg('stops as entered (stacked filters add)'), ...sayWorking(msg('{value} stops'), { value: fmt(i.stops ?? NaN, 4) }), ...said(msg('{stops} stops'), { stops: fmt(v.stops, 3) }) }
        : { label: msg('Stops from the filter factor'), formula: msg('stops = log₂(ND factor), summed over stacked filters'), working: (i.factors ?? []).map((f) => `log₂(${f}) = ${fmt(ndStopsFromFactor(f), 4)}`).join(' + ') || '0', ...said(msg('{stops} stops'), { stops: fmt(v.stops, 3) }) };
  const steps: ReportStep[] = [
    strength,
    { label: msg('Exposure factor and density'), formula: msg('factor = 2^stops; D = stops × log₁₀2'), working: `2^${fmt(v.stops, 4)}; ${fmt(v.stops, 4)} × 0.30103`, ...said(msg('factor {factor}, density {density}'), { factor: fmt(v.factor, 4), density: fmt(v.density, 3) }) },
    { label: msg('New shutter speed'), formula: msg('t = metered time × factor'), working: `${fmt(i.base, 6)} s × ${fmt(v.factor, 5)}`, result: formatShutter(v.seconds) },
  ];
  if (i.p != null) steps.push({ label: msg('Film reciprocity correction'), formula: msg('t corrected = t^p for t over 1 s'), ...(v.seconds > 1 ? { working: `${fmt(v.seconds, 5)}^${fmt(i.p, 4)}` } : sayWorking(msg('under 1 s, no correction'))), result: formatShutter(v.correctedSeconds) });
  return steps;
}

// ---------------------------------------------------------------------------
// Net worth
// ---------------------------------------------------------------------------

export type NetWorthStepsInput = { assets: NetWorthItem<AssetKind>[]; liabilities: NetWorthItem<LiabilityKind>[]; age?: number; income?: number; currency: string };

/** Net worth = total assets − total liabilities (Federal Reserve SCF definition); liquid and excluding-home variants; Stanley and Danko's age × income ÷ 10. */
export function netWorthSteps(i: NetWorthStepsInput): ReportStep[] {
  const res = calculateNetWorth(i.assets, i.liabilities, { age: i.age, annualIncome: i.income });
  if (!res.ok) return [];
  const r = res.value;
  const m = (v: number) => formatMoney(v, i.currency);
  const plain = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 });
  const list = (xs: { amount: number }[]) => (xs.length ? xs.map((x) => plain(x.amount)).join(' + ') : '0');
  const liquid = new Set(ASSET_KINDS.filter((k) => k.liquid).map((k) => k.id));
  const steps: ReportStep[] = [
    { label: msg('Total assets'), formula: msg('A = sum of asset values'), working: list(i.assets), result: m(r.totalAssets) },
    { label: msg('Total liabilities'), formula: msg('L = sum of balances owed'), working: list(i.liabilities), result: m(r.totalLiabilities) },
    { label: msg('Liquid net worth'), formula: msg('cash and taxable investments − all liabilities'), working: `(${list(i.assets.filter((a) => liquid.has(a.kind)))}) − ${plain(r.totalLiabilities)}`, result: m(r.liquidNetWorth) },
    { label: msg('Home equity'), formula: msg('primary home − mortgage − HELOC'), working: `${plain(r.homeEquity + i.liabilities.filter((l) => l.kind === 'mortgage' || l.kind === 'heloc').reduce((s, l) => s + l.amount, 0))} − ${plain(i.liabilities.filter((l) => l.kind === 'mortgage' || l.kind === 'heloc').reduce((s, l) => s + l.amount, 0))}`, result: m(r.homeEquity) },
  ];
  if (r.expectedNetWorth !== null) steps.push({ label: msg('Millionaire Next Door benchmark'), formula: msg('expected = age × income ÷ 10'), working: `${plain(i.age!)} × ${plain(i.income!)} ÷ 10`, result: m(r.expectedNetWorth) });
  steps.push(
    { label: msg('Net worth excluding home equity'), formula: msg('(A − L) − home equity'), working: `(${plain(r.totalAssets)} − ${plain(r.totalLiabilities)}) − ${plain(r.homeEquity)}`, result: m(r.netWorthExcludingHome) },
    { label: msg('Net worth'), formula: 'NW = A − L', working: `${plain(r.totalAssets)} − ${plain(r.totalLiabilities)}`, result: m(r.netWorth) },
  );
  return steps;
}
