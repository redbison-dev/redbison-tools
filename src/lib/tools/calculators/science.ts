/**
 * Pure logic for the science and electronics calculators: Ohm's law, resistor
 * colour codes, voltage drop, molecular weight, molarity, half-life,
 * speed/distance/time and download time. No React here, so the regression
 * tests in src/test/tools/calc-science.test.ts exercise the same code as the UI.
 */
import { msg, fillMsg, type MsgText } from '../../msg';

/** A failure's error is English; errorMsg, when the text carries values, is its template for t(text, vars). */
export type Result<T> = { ok: true; value: T; error?: undefined; errorMsg?: undefined } | { ok: false; error: string; errorMsg?: MsgText; value?: undefined };
const ok = <T,>(value: T): Result<T> => ({ ok: true, value });
const fail = <T,>(error: string, vars?: MsgText['vars']): Result<T> => (vars ? { ok: false, error: fillMsg({ text: error, vars }), errorMsg: { text: error, vars } } : { ok: false, error });

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/* ------------------------------------------------------------------ */
/* SI prefixes                                                         */
/* ------------------------------------------------------------------ */

export const SI_PREFIXES: { id: string; label: string; factor: number }[] = [
  { id: 'p', label: msg('p (pico)'), factor: 1e-12 },
  { id: 'n', label: msg('n (nano)'), factor: 1e-9 },
  { id: 'u', label: msg('µ (micro)'), factor: 1e-6 },
  { id: 'm', label: msg('m (milli)'), factor: 1e-3 },
  { id: '', label: msg('(none)'), factor: 1 },
  { id: 'k', label: msg('k (kilo)'), factor: 1e3 },
  { id: 'M', label: msg('M (mega)'), factor: 1e6 },
  { id: 'G', label: msg('G (giga)'), factor: 1e9 },
];

export function prefixFactor(id: string): number {
  return SI_PREFIXES.find((p) => p.id === id)?.factor ?? 1;
}

/** Format a value with the best engineering prefix, e.g. 4700 'Ω' -> '4.7 kΩ'. */
export function formatSI(x: number, unit: string, sig = 4): string {
  if (!Number.isFinite(x)) return x > 0 ? `∞ ${unit}` : 'n/a';
  if (x === 0) return `0 ${unit}`;
  const ax = Math.abs(x);
  const steps: [number, string][] = [
    [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p'],
  ];
  let chosen = steps[steps.length - 1];
  for (const s of steps) {
    // Round first so 999.99 k does not show as 1000 k.
    if (Number((ax / s[0]).toPrecision(sig)) >= 1) { chosen = s; break; }
  }
  const v = Number((x / chosen[0]).toPrecision(sig));
  return `${v.toLocaleString('en-US', { maximumFractionDigits: 12 })} ${chosen[1]}${unit}`;
}

/* ------------------------------------------------------------------ */
/* Ohm's law                                                           */
/* ------------------------------------------------------------------ */

export type OhmKey = 'V' | 'I' | 'R' | 'P';
export type OhmValues = { V: number; I: number; R: number; P: number };

/** The 12 formulas of the Ohm's law wheel, grouped by the quantity they give. */
export const OHM_WHEEL: Record<OhmKey, string[]> = {
  V: ['V = I × R', 'V = P ÷ I', 'V = √(P × R)'],
  I: ['I = V ÷ R', 'I = P ÷ V', 'I = √(P ÷ R)'],
  R: ['R = V ÷ I', 'R = V² ÷ P', 'R = P ÷ I²'],
  P: ['P = V × I', 'P = I² × R', 'P = V² ÷ R'],
};

/**
 * Solve Ohm's law and the power law from exactly two known quantities
 * (SI base units: volts, amps, ohms, watts). All values must be positive.
 */
export function solveOhm(known: Partial<Record<OhmKey, number>>): Result<OhmValues & { used: string[] }> {
  const keys = (Object.keys(known) as OhmKey[]).filter((k) => known[k] !== undefined);
  if (keys.length !== 2) return fail(msg('Enter exactly two of voltage, current, resistance and power.'));
  for (const k of keys) {
    const v = known[k]!;
    if (!isNum(v)) return fail(msg('Every value must be a number.'));
    if (v <= 0) return fail(msg('Values must be greater than zero.'));
  }
  const has = (a: OhmKey, b: OhmKey) => keys.includes(a) && keys.includes(b);
  let V: number, I: number, R: number, P: number;
  let used: string[];
  if (has('V', 'I')) {
    V = known.V!; I = known.I!; R = V / I; P = V * I; used = ['R = V ÷ I', 'P = V × I'];
  } else if (has('V', 'R')) {
    V = known.V!; R = known.R!; I = V / R; P = (V * V) / R; used = ['I = V ÷ R', 'P = V² ÷ R'];
  } else if (has('V', 'P')) {
    V = known.V!; P = known.P!; I = P / V; R = (V * V) / P; used = ['I = P ÷ V', 'R = V² ÷ P'];
  } else if (has('I', 'R')) {
    I = known.I!; R = known.R!; V = I * R; P = I * I * R; used = ['V = I × R', 'P = I² × R'];
  } else if (has('I', 'P')) {
    I = known.I!; P = known.P!; V = P / I; R = P / (I * I); used = ['V = P ÷ I', 'R = P ÷ I²'];
  } else {
    R = known.R!; P = known.P!; V = Math.sqrt(P * R); I = Math.sqrt(P / R); used = ['V = √(P × R)', 'I = √(P ÷ R)'];
  }
  return ok({ V, I, R, P, used });
}

export function seriesResistance(rs: number[]): number {
  return rs.reduce((a, b) => a + b, 0);
}

export function parallelResistance(rs: number[]): number {
  if (rs.length === 0) return NaN;
  if (rs.some((r) => r === 0)) return 0;
  return 1 / rs.reduce((a, r) => a + 1 / r, 0);
}

/* ------------------------------------------------------------------ */
/* Resistor colour code (IEC 60062:2016)                               */
/* ------------------------------------------------------------------ */

export type BandColor =
  | 'black' | 'brown' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'violet' | 'grey' | 'white'
  | 'gold' | 'silver' | 'pink' | 'none';

export type ColorInfo = {
  id: BandColor;
  name: string;
  hex: string;
  digit?: number;
  /** Power of ten for the multiplier band. */
  exp?: number;
  /** Tolerance in percent. */
  tol?: number;
  tolLetter?: string;
  /** Catalog key for pages when `name` is a homonym (msg.ctx); English output keeps `name`. */
  nameMsg?: string;
  /** Temperature coefficient in ppm/K. */
  tcr?: number;
};

/** IEC 60062:2016 colour code (digits, multipliers, tolerances, temperature coefficients). */
export const RESISTOR_COLORS: ColorInfo[] = [
  { id: 'black', name: msg('Black'), hex: '#111111', digit: 0, exp: 0, tcr: 250 },
  { id: 'brown', name: msg('Brown'), hex: '#7c4a1e', digit: 1, exp: 1, tol: 1, tolLetter: 'F', tcr: 100 },
  { id: 'red', name: msg('Red'), hex: '#d32f2f', digit: 2, exp: 2, tol: 2, tolLetter: 'G', tcr: 50 },
  { id: 'orange', name: msg('Orange'), hex: '#f57c00', digit: 3, exp: 3, tol: 0.05, tolLetter: 'W', tcr: 15 },
  { id: 'yellow', name: msg('Yellow'), hex: '#fbc02d', digit: 4, exp: 4, tol: 0.02, tolLetter: 'P', tcr: 25 },
  { id: 'green', name: msg('Green'), hex: '#388e3c', digit: 5, exp: 5, tol: 0.5, tolLetter: 'D', tcr: 20 },
  { id: 'blue', name: msg('Blue'), hex: '#1976d2', digit: 6, exp: 6, tol: 0.25, tolLetter: 'C', tcr: 10 },
  { id: 'violet', name: msg('Violet'), hex: '#7b1fa2', digit: 7, exp: 7, tol: 0.1, tolLetter: 'B', tcr: 5 },
  { id: 'grey', name: msg('Grey'), hex: '#8a8a8a', digit: 8, exp: 8, tol: 0.01, tolLetter: 'L', tcr: 1 },
  { id: 'white', name: msg('White'), hex: '#f5f5f5', digit: 9, exp: 9 },
  { id: 'gold', name: msg('Gold'), nameMsg: msg.ctx('resistor colour', 'Gold'), hex: '#c9a227', exp: -1, tol: 5, tolLetter: 'J' },
  { id: 'silver', name: msg('Silver'), nameMsg: msg.ctx('resistor colour', 'Silver'), hex: '#c0c0c0', exp: -2, tol: 10, tolLetter: 'K' },
  { id: 'pink', name: msg('Pink'), hex: '#f8a5c2', exp: -3 },
  { id: 'none', name: msg('None'), hex: 'transparent', tol: 20, tolLetter: 'M' },
];

export const colorInfo = (id: BandColor): ColorInfo => RESISTOR_COLORS.find((c) => c.id === id)!;
/** The catalog key a page shows a band colour under: its context key where the word has another meaning (gold and silver the elements), else its name. */
export const colourKey = (c: ColorInfo): string => c.nameMsg ?? c.name;

export type BandCount = 3 | 4 | 5 | 6;

/** Which colours are allowed in each band position for a given band count. */
export function bandRoles(count: BandCount): ('digit' | 'mult' | 'tol' | 'tcr')[] {
  if (count === 3) return ['digit', 'digit', 'mult'];
  if (count === 4) return ['digit', 'digit', 'mult', 'tol'];
  if (count === 5) return ['digit', 'digit', 'digit', 'mult', 'tol'];
  return ['digit', 'digit', 'digit', 'mult', 'tol', 'tcr'];
}

export function allowedColors(role: 'digit' | 'mult' | 'tol' | 'tcr'): ColorInfo[] {
  if (role === 'digit') return RESISTOR_COLORS.filter((c) => c.digit !== undefined);
  if (role === 'mult') return RESISTOR_COLORS.filter((c) => c.exp !== undefined);
  if (role === 'tol') return RESISTOR_COLORS.filter((c) => c.tol !== undefined && c.id !== 'none');
  return RESISTOR_COLORS.filter((c) => c.tcr !== undefined);
}

export type DecodedResistor = {
  ohms: number;
  tolerance: number;
  min: number;
  max: number;
  tcr?: number;
  digits: string;
  exp: number;
};

export function decodeBands(bands: BandColor[]): Result<DecodedResistor> {
  const count = bands.length as BandCount;
  if (![3, 4, 5, 6].includes(count)) return fail(msg('A resistor has 3, 4, 5 or 6 bands.'));
  const roles = bandRoles(count);
  let digits = '';
  let exp = 0;
  let tolerance = 20;
  let tcr: number | undefined;
  for (let i = 0; i < count; i++) {
    const c = colorInfo(bands[i]);
    const role = roles[i];
    if (role === 'digit') {
      if (c.digit === undefined) return fail(msg('{colour} cannot be a digit band.'), { colour: c.name });
      digits += String(c.digit);
    } else if (role === 'mult') {
      if (c.exp === undefined) return fail(msg('{colour} cannot be a multiplier band.'), { colour: c.name });
      exp = c.exp;
    } else if (role === 'tol') {
      if (c.tol === undefined) return fail(msg('{colour} is not a tolerance colour.'), { colour: c.name });
      tolerance = c.tol;
    } else {
      if (c.tcr === undefined) return fail(msg('{colour} is not a temperature coefficient colour.'), { colour: c.name });
      tcr = c.tcr;
    }
  }
  // Avoid 0.1 * 3 style float error by building the number from a decimal string.
  const ohms = Number(`${Number(digits)}e${exp}`);
  return ok({ ohms, tolerance, min: ohms * (1 - tolerance / 100), max: ohms * (1 + tolerance / 100), tcr, digits, exp });
}

/** Turn a value into colour bands. Rounds to 2 significant digits (4-band) or 3 (5/6-band). */
export function encodeResistor(ohms: number, count: 4 | 5 | 6, tolerance: number, tcr?: number): Result<{ bands: BandColor[]; ohms: number; rounded: boolean }> {
  if (!isNum(ohms) || ohms <= 0) return fail(msg('Enter a resistance greater than zero.'));
  const sig = count === 4 ? 2 : 3;
  const rounded = Number(ohms.toPrecision(sig));
  const e = Math.floor(Math.log10(rounded) + 1e-9);
  const exp = e - (sig - 1);
  if (exp < -3 || exp > 9) return fail(msg('That value is outside what colour bands can express (about 0.1 Ω to 999 GΩ).'));
  const mant = Math.round(rounded / Math.pow(10, exp));
  const digitStr = String(mant).padStart(sig, '0');
  const byDigit = (d: number) => RESISTOR_COLORS.find((c) => c.digit === d)!.id;
  const bands: BandColor[] = digitStr.split('').map((d) => byDigit(Number(d)));
  bands.push(RESISTOR_COLORS.find((c) => c.exp === exp)!.id);
  const tolColor = RESISTOR_COLORS.find((c) => c.tol === tolerance && c.id !== 'none');
  if (!tolColor) return fail(msg('Pick a standard tolerance.'));
  bands.push(tolColor.id);
  if (count === 6) {
    const t = RESISTOR_COLORS.find((c) => c.tcr === (tcr ?? 100));
    if (!t) return fail(msg('Pick a standard temperature coefficient.'));
    bands.push(t.id);
  }
  return ok({ bands, ohms: Number(`${mant}e${exp}`), rounded: Math.abs(rounded - ohms) > Math.abs(ohms) * 1e-12 });
}

/** IEC 60063 preferred numbers (one decade). */
export const E_SERIES: Record<'E12' | 'E24' | 'E96', number[]> = {
  E12: [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2],
  E24: [1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1],
  E96: [
    1.0, 1.02, 1.05, 1.07, 1.1, 1.13, 1.15, 1.18, 1.21, 1.24, 1.27, 1.3, 1.33, 1.37, 1.4, 1.43, 1.47, 1.5, 1.54, 1.58,
    1.62, 1.65, 1.69, 1.74, 1.78, 1.82, 1.87, 1.91, 1.96, 2.0, 2.05, 2.1, 2.15, 2.21, 2.26, 2.32, 2.37, 2.43, 2.49, 2.55,
    2.61, 2.67, 2.74, 2.8, 2.87, 2.94, 3.01, 3.09, 3.16, 3.24, 3.32, 3.4, 3.48, 3.57, 3.65, 3.74, 3.83, 3.92, 4.02, 4.12,
    4.22, 4.32, 4.42, 4.53, 4.64, 4.75, 4.87, 4.99, 5.11, 5.23, 5.36, 5.49, 5.62, 5.76, 5.9, 6.04, 6.19, 6.34, 6.49, 6.65,
    6.81, 6.98, 7.15, 7.32, 7.5, 7.68, 7.87, 8.06, 8.25, 8.45, 8.66, 8.87, 9.09, 9.31, 9.53, 9.76,
  ],
};

/** Nearest preferred value (closest in ratio, as the series is geometric). */
export function nearestPreferred(ohms: number, series: keyof typeof E_SERIES): { value: number; errorPct: number } {
  const e = Math.floor(Math.log10(ohms));
  let best = NaN;
  let bestDist = Infinity;
  for (const k of [e - 1, e, e + 1]) {
    for (const m of E_SERIES[series]) {
      const v = Number((m * Math.pow(10, k)).toPrecision(6));
      const d = Math.abs(Math.log(v / ohms));
      if (d < bestDist) { bestDist = d; best = v; }
    }
  }
  return { value: best, errorPct: ((best - ohms) / ohms) * 100 };
}

/* ------------------------------------------------------------------ */
/* Voltage drop                                                        */
/* ------------------------------------------------------------------ */

export type Conductor = 'copper' | 'aluminum';
export type WireSize = {
  id: string;
  label: string;
  /** DC resistance in ohms per metre at refTempC. */
  cu?: number;
  al?: number;
  refTempC: number;
  /** Cross-sectional area in mm² (nominal for metric; from circular mils for AWG). */
  areaMm2: number;
};

const OHM_PER_KFT_TO_PER_M = 1 / 304.8;
const CMIL_TO_MM2 = 0.0005067075;

/**
 * NEC (NFPA 70) Chapter 9, Table 8: DC resistance at 75 °C, ohms per 1,000 ft,
 * stranded uncoated copper and aluminium. [label, circular mils, Cu, Al]
 */
const NEC_TABLE8: [string, number, number, number | undefined][] = [
  ['18 AWG', 1620, 8.08, undefined],
  ['16 AWG', 2580, 5.08, undefined],
  ['14 AWG', 4110, 3.14, undefined],
  ['12 AWG', 6530, 1.98, 3.25],
  ['10 AWG', 10380, 1.24, 2.04],
  ['8 AWG', 16510, 0.778, 1.28],
  ['6 AWG', 26240, 0.491, 0.808],
  ['4 AWG', 41740, 0.308, 0.508],
  ['3 AWG', 52620, 0.245, 0.403],
  ['2 AWG', 66360, 0.194, 0.319],
  ['1 AWG', 83690, 0.154, 0.253],
  ['1/0 AWG', 105600, 0.122, 0.201],
  ['2/0 AWG', 133100, 0.0967, 0.159],
  ['3/0 AWG', 167800, 0.0766, 0.126],
  ['4/0 AWG', 211600, 0.0608, 0.1],
  ['250 kcmil', 250000, 0.0515, 0.0847],
  ['300 kcmil', 300000, 0.0429, 0.0707],
  ['350 kcmil', 350000, 0.0367, 0.0605],
  ['400 kcmil', 400000, 0.0321, 0.0529],
  ['500 kcmil', 500000, 0.0258, 0.0424],
  ['600 kcmil', 600000, 0.0214, 0.0353],
  ['750 kcmil', 750000, 0.0171, 0.0282],
  ['1000 kcmil', 1000000, 0.0129, 0.0212],
];

/** IEC 60228 class 2 (stranded) maximum DC resistance at 20 °C, ohms per km. [mm², Cu plain, Al] */
const IEC_60228: [number, number, number | undefined][] = [
  [0.75, 24.5, undefined],
  [1, 18.1, undefined],
  [1.5, 12.1, undefined],
  [2.5, 7.41, undefined],
  [4, 4.61, undefined],
  [6, 3.08, undefined],
  [10, 1.83, 3.08],
  [16, 1.15, 1.91],
  [25, 0.727, 1.2],
  [35, 0.524, 0.868],
  [50, 0.387, 0.641],
  [70, 0.268, 0.443],
  [95, 0.193, 0.32],
  [120, 0.153, 0.253],
  [150, 0.124, 0.206],
  [185, 0.0991, 0.164],
  [240, 0.0754, 0.125],
  [300, 0.0601, 0.1],
];

export const AWG_SIZES: WireSize[] = NEC_TABLE8.map(([label, cmil, cu, al]) => ({
  id: label.replace(/\s+/g, '').toLowerCase(),
  label,
  cu: cu * OHM_PER_KFT_TO_PER_M,
  al: al === undefined ? undefined : al * OHM_PER_KFT_TO_PER_M,
  refTempC: 75,
  areaMm2: cmil * CMIL_TO_MM2,
}));

export const METRIC_SIZES: WireSize[] = IEC_60228.map(([mm2, cu, al]) => ({
  id: `${mm2}mm2`,
  label: `${mm2} mm²`,
  cu: cu / 1000,
  al: al === undefined ? undefined : al / 1000,
  refTempC: 20,
  areaMm2: mm2,
}));

/** Temperature coefficients at 20 °C (IEC 60228 Annex B). */
export const ALPHA20: Record<Conductor, number> = { copper: 0.00393, aluminum: 0.00403 };

/**
 * Resistance per metre of one conductor at tempC. Uses the inferred zero-resistance
 * temperature (234.5 °C below zero for copper, 228 °C for aluminium), which gives the
 * same coefficients NEC Table 8 Note 2 quotes at 75 °C (0.00323 and 0.00330).
 */
export function resistancePerMetre(size: WireSize, material: Conductor, tempC: number): number | undefined {
  const r = material === 'copper' ? size.cu : size.al;
  if (r === undefined) return undefined;
  const T0 = 1 / ALPHA20[material] - 20; // 234.5 for Cu, 228.1 for Al
  return r * (T0 + tempC) / (T0 + size.refTempC);
}

export type VoltageSystem = 'dc' | 'single' | 'three';

export type VoltageDropInput = {
  system: VoltageSystem;
  material: Conductor;
  size: WireSize;
  /** One-way length in metres. */
  lengthM: number;
  currentA: number;
  voltageV: number;
  tempC: number;
  /** Conductors in parallel per phase. */
  parallel?: number;
};

export type VoltageDropResult = {
  ohmsPerMetre: number;
  /** Resistance of one conductor over the one-way length (after paralleling). */
  conductorOhms: number;
  factor: number;
  dropV: number;
  dropPct: number;
  endVoltage: number;
  powerLossW: number;
};

export function voltageDrop(inp: VoltageDropInput): Result<VoltageDropResult> {
  const { system, material, size, lengthM, currentA, voltageV, tempC } = inp;
  const parallel = inp.parallel ?? 1;
  if (!isNum(lengthM) || lengthM <= 0) return fail(msg('Enter a cable length greater than zero.'));
  if (!isNum(currentA) || currentA <= 0) return fail(msg('Enter a load current greater than zero.'));
  if (!isNum(voltageV) || voltageV <= 0) return fail(msg('Enter a supply voltage greater than zero.'));
  if (!isNum(tempC) || tempC < -50 || tempC > 250) return fail(msg('Conductor temperature should be between -50 and 250 °C.'));
  if (!Number.isInteger(parallel) || parallel < 1) return fail(msg('Parallel sets must be a whole number of 1 or more.'));
  const rpm = resistancePerMetre(size, material, tempC);
  if (rpm === undefined) return fail(msg('{size} is not listed for aluminium. Choose a larger size or copper.'), { size: size.label });
  const conductorOhms = (rpm * lengthM) / parallel;
  // DC and single-phase: current flows out and back (2 x length). Balanced three-phase: √3 x length.
  const factor = system === 'three' ? Math.sqrt(3) : 2;
  const dropV = factor * conductorOhms * currentA;
  const conductors = system === 'three' ? 3 : 2;
  return ok({
    ohmsPerMetre: rpm,
    conductorOhms,
    factor,
    dropV,
    dropPct: (dropV / voltageV) * 100,
    endVoltage: voltageV - dropV,
    powerLossW: conductors * currentA * currentA * conductorOhms,
  });
}

/** Smallest size in the list whose drop is at or below maxPct, or null. */
export function smallestSizeFor(inp: Omit<VoltageDropInput, 'size'>, sizes: WireSize[], maxPct: number): WireSize | null {
  for (const s of sizes) {
    const r = voltageDrop({ ...inp, size: s });
    if (r.ok && r.value.dropPct <= maxPct) return s;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Atomic weights and formula parsing                                 */
/* ------------------------------------------------------------------ */

/**
 * CIAAW/IUPAC abridged standard atomic weights (2024 table, five significant
 * figures where the standard allows). Elements with no standard atomic weight
 * use the mass number of their longest-lived isotope and are flagged.
 */
export const ATOMIC_WEIGHTS: Record<string, { name: string; z: number; w: number; massNumber?: boolean }> = {
  H: { name: msg('Hydrogen'), z: 1, w: 1.008 }, He: { name: msg('Helium'), z: 2, w: 4.0026 }, Li: { name: msg('Lithium'), z: 3, w: 6.94 },
  Be: { name: msg('Beryllium'), z: 4, w: 9.0122 }, B: { name: msg('Boron'), z: 5, w: 10.81 }, C: { name: msg('Carbon'), z: 6, w: 12.011 },
  N: { name: msg('Nitrogen'), z: 7, w: 14.007 }, O: { name: msg('Oxygen'), z: 8, w: 15.999 }, F: { name: msg('Fluorine'), z: 9, w: 18.998 },
  Ne: { name: msg('Neon'), z: 10, w: 20.18 }, Na: { name: msg('Sodium'), z: 11, w: 22.99 }, Mg: { name: msg('Magnesium'), z: 12, w: 24.305 },
  Al: { name: msg('Aluminium'), z: 13, w: 26.982 }, Si: { name: msg('Silicon'), z: 14, w: 28.085 }, P: { name: msg('Phosphorus'), z: 15, w: 30.974 },
  S: { name: msg('Sulfur'), z: 16, w: 32.06 }, Cl: { name: msg('Chlorine'), z: 17, w: 35.45 }, Ar: { name: msg('Argon'), z: 18, w: 39.95 },
  K: { name: msg('Potassium'), z: 19, w: 39.098 }, Ca: { name: msg('Calcium'), z: 20, w: 40.078 }, Sc: { name: msg('Scandium'), z: 21, w: 44.956 },
  Ti: { name: msg('Titanium'), z: 22, w: 47.867 }, V: { name: msg('Vanadium'), z: 23, w: 50.942 }, Cr: { name: msg('Chromium'), z: 24, w: 51.996 },
  Mn: { name: msg('Manganese'), z: 25, w: 54.938 }, Fe: { name: msg('Iron'), z: 26, w: 55.845 }, Co: { name: msg('Cobalt'), z: 27, w: 58.933 },
  Ni: { name: msg('Nickel'), z: 28, w: 58.693 }, Cu: { name: msg('Copper'), z: 29, w: 63.546 }, Zn: { name: msg('Zinc'), z: 30, w: 65.38 },
  Ga: { name: msg('Gallium'), z: 31, w: 69.723 }, Ge: { name: msg('Germanium'), z: 32, w: 72.63 }, As: { name: msg('Arsenic'), z: 33, w: 74.922 },
  Se: { name: msg('Selenium'), z: 34, w: 78.971 }, Br: { name: msg('Bromine'), z: 35, w: 79.904 }, Kr: { name: msg('Krypton'), z: 36, w: 83.798 },
  Rb: { name: msg('Rubidium'), z: 37, w: 85.468 }, Sr: { name: msg('Strontium'), z: 38, w: 87.62 }, Y: { name: msg('Yttrium'), z: 39, w: 88.906 },
  Zr: { name: msg('Zirconium'), z: 40, w: 91.222 }, Nb: { name: msg('Niobium'), z: 41, w: 92.906 }, Mo: { name: msg('Molybdenum'), z: 42, w: 95.95 },
  Tc: { name: msg('Technetium'), z: 43, w: 97, massNumber: true }, Ru: { name: msg('Ruthenium'), z: 44, w: 101.07 }, Rh: { name: msg('Rhodium'), z: 45, w: 102.91 },
  Pd: { name: msg('Palladium'), z: 46, w: 106.42 }, Ag: { name: msg('Silver'), z: 47, w: 107.87 }, Cd: { name: msg('Cadmium'), z: 48, w: 112.41 },
  In: { name: msg('Indium'), z: 49, w: 114.82 }, Sn: { name: msg('Tin'), z: 50, w: 118.71 }, Sb: { name: msg('Antimony'), z: 51, w: 121.76 },
  Te: { name: msg('Tellurium'), z: 52, w: 127.6 }, I: { name: msg('Iodine'), z: 53, w: 126.9 }, Xe: { name: msg('Xenon'), z: 54, w: 131.29 },
  Cs: { name: msg('Caesium'), z: 55, w: 132.91 }, Ba: { name: msg('Barium'), z: 56, w: 137.33 }, La: { name: msg('Lanthanum'), z: 57, w: 138.91 },
  Ce: { name: msg('Cerium'), z: 58, w: 140.12 }, Pr: { name: msg('Praseodymium'), z: 59, w: 140.91 }, Nd: { name: msg('Neodymium'), z: 60, w: 144.24 },
  Pm: { name: msg('Promethium'), z: 61, w: 145, massNumber: true }, Sm: { name: msg('Samarium'), z: 62, w: 150.36 }, Eu: { name: msg('Europium'), z: 63, w: 151.96 },
  Gd: { name: msg('Gadolinium'), z: 64, w: 157.25 }, Tb: { name: msg('Terbium'), z: 65, w: 158.93 }, Dy: { name: msg('Dysprosium'), z: 66, w: 162.5 },
  Ho: { name: msg('Holmium'), z: 67, w: 164.93 }, Er: { name: msg('Erbium'), z: 68, w: 167.26 }, Tm: { name: msg('Thulium'), z: 69, w: 168.93 },
  Yb: { name: msg('Ytterbium'), z: 70, w: 173.05 }, Lu: { name: msg('Lutetium'), z: 71, w: 174.97 }, Hf: { name: msg('Hafnium'), z: 72, w: 178.49 },
  Ta: { name: msg('Tantalum'), z: 73, w: 180.95 }, W: { name: msg('Tungsten'), z: 74, w: 183.84 }, Re: { name: msg('Rhenium'), z: 75, w: 186.21 },
  Os: { name: msg('Osmium'), z: 76, w: 190.23 }, Ir: { name: msg('Iridium'), z: 77, w: 192.22 }, Pt: { name: msg('Platinum'), z: 78, w: 195.08 },
  Au: { name: msg('Gold'), z: 79, w: 196.97 }, Hg: { name: msg('Mercury'), z: 80, w: 200.59 }, Tl: { name: msg('Thallium'), z: 81, w: 204.38 },
  Pb: { name: msg('Lead'), z: 82, w: 207.2 }, Bi: { name: msg('Bismuth'), z: 83, w: 208.98 }, Po: { name: msg('Polonium'), z: 84, w: 209, massNumber: true },
  At: { name: msg('Astatine'), z: 85, w: 210, massNumber: true }, Rn: { name: msg('Radon'), z: 86, w: 222, massNumber: true },
  Fr: { name: msg('Francium'), z: 87, w: 223, massNumber: true }, Ra: { name: msg('Radium'), z: 88, w: 226, massNumber: true },
  Ac: { name: msg('Actinium'), z: 89, w: 227, massNumber: true }, Th: { name: msg('Thorium'), z: 90, w: 232.04 }, Pa: { name: msg('Protactinium'), z: 91, w: 231.04 },
  U: { name: msg('Uranium'), z: 92, w: 238.03 }, Np: { name: msg('Neptunium'), z: 93, w: 237, massNumber: true }, Pu: { name: msg('Plutonium'), z: 94, w: 244, massNumber: true },
  Am: { name: msg('Americium'), z: 95, w: 243, massNumber: true }, Cm: { name: msg('Curium'), z: 96, w: 247, massNumber: true },
  Bk: { name: msg('Berkelium'), z: 97, w: 247, massNumber: true }, Cf: { name: msg('Californium'), z: 98, w: 251, massNumber: true },
  Es: { name: msg('Einsteinium'), z: 99, w: 252, massNumber: true }, Fm: { name: msg('Fermium'), z: 100, w: 257, massNumber: true },
  Md: { name: msg('Mendelevium'), z: 101, w: 258, massNumber: true }, No: { name: msg('Nobelium'), z: 102, w: 259, massNumber: true },
  Lr: { name: msg('Lawrencium'), z: 103, w: 262, massNumber: true },
};

export type ElementShare = { symbol: string; name: string; count: number; atomicWeight: number; mass: number; percent: number; massNumber?: boolean };
export type FormulaResult = { molarMass: number; elements: ElementShare[]; normalized: string; atoms: number };

const SUBSCRIPTS: Record<string, string> = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9' };

/** Strip ionic charges such as ^2-, ^{3+}, ⁺, ²⁻, a spaced "2-" or a trailing "+". */
function stripCharge(s: string): string {
  return s
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+/g, '')
    .replace(/\^\{?\d*[+-]\d*\}?/g, '')
    .replace(/\s+\d*[+-]+$/, '')
    .replace(/[+-]+$/, '');
}

/**
 * Parse a chemical formula into element counts. Supports nested (), [] and {},
 * hydrate dots (·, •, * or ".") with a leading coefficient and Unicode
 * subscripts. Charges are ignored.
 */
export function parseFormula(input: string): Result<Map<string, number>> {
  let s = input.trim();
  if (!s) return fail(msg('Enter a chemical formula, for example H2SO4 or CuSO4·5H2O.'));
  s = s.replace(/[₀-₉]/g, (c) => SUBSCRIPTS[c] ?? c);
  s = stripCharge(s);
  // Hydrate separators: middle dot, bullet, asterisk or a full stop (CuSO4.5H2O).
  const parts = s.split(/[·•∙*.]/).map((p) => p.trim()).filter((p) => p.length > 0);
  const total = new Map<string, number>();
  for (const raw of parts) {
    const part = raw.replace(/\s+/g, '');
    const m = /^(\d+)(.*)$/.exec(part);
    const coef = m ? Number(m[1]) : 1;
    const body = m ? m[2] : part;
    if (!body) return fail(msg('"{raw}" has a number but no formula after it.'), { raw });
    const r = parseGroup(body);
    if (!r.ok) return r;
    for (const [el, n] of r.value) total.set(el, (total.get(el) ?? 0) + n * coef);
  }
  if (total.size === 0) return fail(msg('No elements found in that formula.'));
  return ok(total);
}

function parseGroup(s: string): Result<Map<string, number>> {
  const stack: Map<string, number>[] = [new Map()];
  const closers: string[] = [];
  let i = 0;
  const readNum = (): number => {
    const m = /^\d+/.exec(s.slice(i));
    if (!m) return 1;
    i += m[0].length;
    return Number(m[0]);
  };
  while (i < s.length) {
    const ch = s[i];
    if (ch === '(' || ch === '[' || ch === '{') {
      stack.push(new Map());
      closers.push(ch === '(' ? ')' : ch === '[' ? ']' : '}');
      i++;
    } else if (ch === ')' || ch === ']' || ch === '}') {
      const want = closers.pop();
      if (want !== ch) return fail(msg('Unmatched "{ch}" in the formula.'), { ch });
      i++;
      const n = readNum();
      const group = stack.pop()!;
      const top = stack[stack.length - 1];
      for (const [el, c] of group) top.set(el, (top.get(el) ?? 0) + c * n);
    } else if (/[A-Z]/.test(ch)) {
      let sym = ch;
      i++;
      while (i < s.length && /[a-z]/.test(s[i])) { sym += s[i]; i++; }
      if (!ATOMIC_WEIGHTS[sym]) {
        return fail(msg('"{sym}" is not an element symbol. Symbols start with a capital letter, e.g. Co (cobalt) vs CO (carbon + oxygen).'), { sym });
      }
      const n = readNum();
      const top = stack[stack.length - 1];
      top.set(sym, (top.get(sym) ?? 0) + n);
    } else if (/[a-z]/.test(ch)) {
      return fail(msg('Element symbols start with a capital letter ("{ch}" at position {pos}).'), { ch, pos: i + 1 });
    } else if (/\d/.test(ch)) {
      return fail(msg('Unexpected number at position {pos}. Counts go after the element or bracket.'), { pos: i + 1 });
    } else {
      return fail(msg('Unexpected character "{ch}" in the formula.'), { ch });
    }
  }
  if (closers.length) return fail(msg('A bracket was opened but not closed.'));
  return ok(stack[0]);
}

export function molarMass(formula: string): Result<FormulaResult> {
  const r = parseFormula(formula);
  if (!r.ok) return fail(r.error);
  let total = 0;
  let atoms = 0;
  const rows: ElementShare[] = [];
  for (const [symbol, count] of r.value) {
    const el = ATOMIC_WEIGHTS[symbol];
    const mass = el.w * count;
    total += mass;
    atoms += count;
    rows.push({ symbol, name: el.name, count, atomicWeight: el.w, mass, percent: 0, massNumber: el.massNumber });
  }
  for (const row of rows) row.percent = (row.mass / total) * 100;
  const normalized = rows.map((x) => `${x.symbol}${x.count === 1 ? '' : Number(x.count.toPrecision(10))}`).join('');
  return ok({ molarMass: total, elements: rows, normalized, atoms });
}

/* ------------------------------------------------------------------ */
/* Molarity                                                            */
/* ------------------------------------------------------------------ */

export const MASS_UNITS: Record<string, number> = { kg: 1000, g: 1, mg: 1e-3, 'µg': 1e-6 };
export const VOLUME_UNITS: Record<string, number> = { L: 1, mL: 1e-3, 'µL': 1e-6 };
export const CONC_UNITS: Record<string, number> = { M: 1, mM: 1e-3, 'µM': 1e-6, nM: 1e-9 };

export type MolarityKey = 'molarity' | 'mass' | 'volume' | 'molarMass';

/**
 * Solve c = m / (M × V) for whichever of molarity (mol/L), mass (g),
 * volume (L) and molar mass (g/mol) is missing.
 */
const MOLARITY_MISSING: Record<MolarityKey, string> = { molarity: msg('Enter a molarity greater than zero.'), mass: msg('Enter a mass greater than zero.'), volume: msg('Enter a volume greater than zero.'), molarMass: msg('Enter a molar mass greater than zero.') };

export function solveMolarity(solveFor: MolarityKey, v: { molarity?: number; mass?: number; volume?: number; molarMass?: number }): Result<{ molarity: number; mass: number; volume: number; molarMass: number; moles: number }> {
  const need = (['molarity', 'mass', 'volume', 'molarMass'] as MolarityKey[]).filter((k) => k !== solveFor);
  for (const k of need) {
    const x = v[k];
    if (!isNum(x) || x <= 0) return fail(MOLARITY_MISSING[k]);
  }
  let { molarity, mass, volume, molarMass } = v as Required<typeof v>;
  if (solveFor === 'molarity') molarity = mass / molarMass / volume;
  else if (solveFor === 'mass') mass = molarity * volume * molarMass;
  else if (solveFor === 'volume') volume = mass / molarMass / molarity;
  else molarMass = mass / (molarity * volume);
  return ok({ molarity, mass, volume, molarMass, moles: mass / molarMass });
}

export type DilutionKey = 'c1' | 'v1' | 'c2' | 'v2';

/** C1·V1 = C2·V2: solve the missing one (any consistent units). */
export function solveDilution(solveFor: DilutionKey, v: Partial<Record<DilutionKey, number>>): Result<Record<DilutionKey, number> & { solventToAdd: number }> {
  for (const k of ['c1', 'v1', 'c2', 'v2'] as DilutionKey[]) {
    if (k === solveFor) continue;
    const x = v[k];
    if (!isNum(x) || x <= 0) return fail(msg('Enter positive values for the three known quantities.'));
  }
  let { c1, v1, c2, v2 } = v as Record<DilutionKey, number>;
  if (solveFor === 'c1') c1 = (c2 * v2) / v1;
  else if (solveFor === 'v1') v1 = (c2 * v2) / c1;
  else if (solveFor === 'c2') c2 = (c1 * v1) / v2;
  else v2 = (c1 * v1) / c2;
  if (c2 > c1 * (1 + 1e-12)) return fail(msg('The final concentration cannot be higher than the stock. Dilution only lowers concentration.'));
  return ok({ c1, v1, c2, v2, solventToAdd: v2 - v1 });
}

/* ------------------------------------------------------------------ */
/* Half-life                                                           */
/* ------------------------------------------------------------------ */

/** Seconds per time unit. A year is the Julian year (365.25 days), as used in nuclear data. */
export const TIME_UNITS: Record<string, number> = {
  s: 1, min: 60, h: 3600, d: 86400, y: 365.25 * 86400,
};

export type Isotope = { id: string; label: string; halfLife: number; unit: keyof typeof TIME_UNITS; note: string };

/** Half-lives from the NNDC NuDat 3 / ENSDF evaluations (rounded). */
export const ISOTOPES: Isotope[] = [
  { id: 'c14', label: msg('Carbon-14'), halfLife: 5700, unit: 'y', note: msg('Radiocarbon dating. Conventional radiocarbon ages still use the older Libby value of 5,568 years.') },
  { id: 'h3', label: msg('Tritium (H-3)'), halfLife: 12.32, unit: 'y', note: msg('Exit signs, watch dials, fusion fuel.') },
  { id: 'f18', label: msg('Fluorine-18'), halfLife: 109.77, unit: 'min', note: msg('PET imaging tracer (FDG).') },
  { id: 'tc99m', label: msg('Technetium-99m'), halfLife: 6.0067, unit: 'h', note: msg('The most used medical imaging isotope.') },
  { id: 'i131', label: msg('Iodine-131'), halfLife: 8.0252, unit: 'd', note: msg('Thyroid treatment; fission product.') },
  { id: 'p32', label: msg('Phosphorus-32'), halfLife: 14.268, unit: 'd', note: msg('Molecular biology labelling.') },
  { id: 'rn222', label: msg('Radon-222'), halfLife: 3.8235, unit: 'd', note: msg('Indoor radon gas.') },
  { id: 'co60', label: msg('Cobalt-60'), halfLife: 5.2714, unit: 'y', note: msg('Radiotherapy and industrial sterilisation.') },
  { id: 'sr90', label: msg('Strontium-90'), halfLife: 28.79, unit: 'y', note: msg('Fission product.') },
  { id: 'cs137', label: msg('Caesium-137'), halfLife: 30.08, unit: 'y', note: msg('Fission product; Chernobyl and Fukushima.') },
  { id: 'am241', label: msg('Americium-241'), halfLife: 432.6, unit: 'y', note: msg('Ionisation smoke detectors.') },
  { id: 'ra226', label: msg('Radium-226'), halfLife: 1600, unit: 'y', note: msg('Historic luminous paint.') },
  { id: 'pu239', label: msg('Plutonium-239'), halfLife: 24110, unit: 'y', note: msg('Reactor and weapons material.') },
  { id: 'u235', label: msg('Uranium-235'), halfLife: 7.04e8, unit: 'y', note: msg('Fissile uranium.') },
  { id: 'k40', label: msg('Potassium-40'), halfLife: 1.248e9, unit: 'y', note: msg('Natural radioactivity in bananas and in the body; K-Ar dating.') },
  { id: 'u238', label: msg('Uranium-238'), halfLife: 4.468e9, unit: 'y', note: msg('About the age of the Earth.') },
];

export type HalfLifeKey = 'remaining' | 'initial' | 'halfLife' | 'time';
export type HalfLifeValues = { remaining: number; initial: number; halfLife: number; time: number };

/** N = N0 × (1/2)^(t / T½). Times share one unit. */
export function solveHalfLife(solveFor: HalfLifeKey, v: Partial<HalfLifeValues>): Result<HalfLifeValues & { decayConstant: number; meanLife: number; halfLives: number; fractionRemaining: number }> {
  const need = (['remaining', 'initial', 'halfLife', 'time'] as HalfLifeKey[]).filter((k) => k !== solveFor);
  for (const k of need) {
    const x = v[k];
    if (!isNum(x)) return fail(msg('Fill in the three known values.'));
    if (k === 'time' ? x < 0 : x <= 0) return fail(k === 'time' ? 'Elapsed time cannot be negative.' : 'Amounts and half-life must be greater than zero.');
  }
  let { remaining, initial, halfLife, time } = v as HalfLifeValues;
  if (solveFor === 'remaining') remaining = initial * Math.pow(0.5, time / halfLife);
  else if (solveFor === 'initial') initial = remaining / Math.pow(0.5, time / halfLife);
  else if (solveFor === 'time') {
    if (remaining > initial) return fail(msg('The remaining amount must be smaller than the initial amount for decay.'));
    time = halfLife * Math.log2(initial / remaining);
  } else {
    if (remaining >= initial) return fail(msg('The remaining amount must be smaller than the initial amount to find a half-life.'));
    if (time <= 0) return fail(msg('Elapsed time must be greater than zero to find a half-life.'));
    halfLife = time / Math.log2(initial / remaining);
  }
  const decayConstant = Math.LN2 / halfLife;
  return ok({ remaining, initial, halfLife, time, decayConstant, meanLife: 1 / decayConstant, halfLives: time / halfLife, fractionRemaining: remaining / initial });
}

/* ------------------------------------------------------------------ */
/* Speed, distance, time                                               */
/* ------------------------------------------------------------------ */

/** Metres per unit. */
export const DISTANCE_UNITS: Record<string, { label: string; m: number }> = {
  m: { label: msg('metres'), m: 1 },
  km: { label: msg('kilometres'), m: 1000 },
  mi: { label: msg('miles'), m: 1609.344 },
  ft: { label: msg('feet'), m: 0.3048 },
  yd: { label: msg('yards'), m: 0.9144 },
  nmi: { label: msg('nautical miles'), m: 1852 },
};

/** Metres per second per unit. */
export const SPEED_UNITS: Record<string, { label: string; mps: number }> = {
  kmh: { label: 'km/h', mps: 1000 / 3600 },
  mph: { label: msg('mph'), mps: 1609.344 / 3600 },
  mps: { label: 'm/s', mps: 1 },
  kn: { label: msg('knots'), mps: 1852 / 3600 },
  fps: { label: 'ft/s', mps: 0.3048 },
};

export type SdtKey = 'speed' | 'distance' | 'time';

const SDT_MISSING: Record<SdtKey, string> = { speed: msg('Enter a speed greater than zero.'), distance: msg('Enter a distance greater than zero.'), time: msg('Enter a time greater than zero.') };

/** SI in and out: speed m/s, distance m, time s. */
export function solveSdt(solveFor: SdtKey, v: { speed?: number; distance?: number; time?: number }): Result<{ speed: number; distance: number; time: number }> {
  const need = (['speed', 'distance', 'time'] as SdtKey[]).filter((k) => k !== solveFor);
  for (const k of need) {
    const x = v[k];
    if (!isNum(x) || x <= 0) return fail(SDT_MISSING[k]);
  }
  let { speed, distance, time } = v as { speed: number; distance: number; time: number };
  if (solveFor === 'speed') speed = distance / time;
  else if (solveFor === 'distance') distance = speed * time;
  else time = distance / speed;
  return ok({ speed, distance, time });
}

/** Parse "1:30:15", "45:00", "90" (minutes) or "1h 20m 5s" into seconds. */
export function parseDuration(s: string): number | null {
  const t = s.trim().toLowerCase();
  if (!t) return null;
  if (/^\d+(\.\d+)?(:\d+(\.\d+)?){1,2}$/.test(t)) {
    const parts = t.split(':').map(Number);
    if (parts.slice(1).some((p) => p >= 60)) return null;
    return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
  }
  const re = /(\d+(?:\.\d+)?)\s*(d|h|hr|hrs|hours?|m|min|mins|minutes?|s|sec|secs|seconds?)\b/g;
  let total = 0;
  let matched = '';
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const n = Number(m[1]);
    const u = m[2];
    total += u === 'd' ? n * 86400 : u.startsWith('h') ? n * 3600 : u.startsWith('m') ? n * 60 : n;
    matched += m[0];
  }
  if (matched && matched.replace(/\s/g, '').length === t.replace(/\s/g, '').length) return total;
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t) * 60;
  return null;
}

/** 5025 -> "1:23:45"; adds days when needed. */
export function formatHms(seconds: number, decimals = 0): string {
  if (!Number.isFinite(seconds)) return 'n/a';
  const sign = seconds < 0 ? '-' : '';
  let s = Math.abs(seconds);
  const scale = Math.pow(10, decimals);
  s = Math.round(s * scale) / scale;
  const d = Math.floor(s / 86400);
  s -= d * 86400;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  const ss = decimals > 0 ? s.toFixed(decimals).padStart(decimals + 3, '0') : String(Math.round(s)).padStart(2, '0');
  const core = `${h}:${String(m).padStart(2, '0')}:${ss}`;
  return sign + (d > 0 ? `${d}d ${core}` : core);
}

/** Pace in seconds per unit distance for a speed in m/s. */
export function paceFromSpeed(mps: number, unitMetres: number): number {
  return unitMetres / mps;
}

/* ------------------------------------------------------------------ */
/* Download time                                                       */
/* ------------------------------------------------------------------ */

/** Bytes per unit. Decimal (SI) and binary (IEC 80000-13) prefixes. */
export const SIZE_UNITS: Record<string, { label: string; bytes: number }> = {
  B: { label: 'B', bytes: 1 },
  kB: { label: 'kB', bytes: 1e3 },
  MB: { label: 'MB', bytes: 1e6 },
  GB: { label: 'GB', bytes: 1e9 },
  TB: { label: 'TB', bytes: 1e12 },
  KiB: { label: msg('KiB'), bytes: 1024 },
  MiB: { label: 'MiB', bytes: 1024 ** 2 },
  GiB: { label: msg('GiB'), bytes: 1024 ** 3 },
  TiB: { label: msg('TiB'), bytes: 1024 ** 4 },
};

/** Bits per second per unit. Network rates are always decimal. */
export const RATE_UNITS: Record<string, { label: string; bps: number }> = {
  bps: { label: 'bit/s', bps: 1 },
  kbps: { label: msg('kbit/s'), bps: 1e3 },
  Mbps: { label: 'Mbit/s', bps: 1e6 },
  Gbps: { label: msg('Gbit/s'), bps: 1e9 },
  MBps: { label: 'MB/s', bps: 8e6 },
  MiBps: { label: msg('MiB/s'), bps: 8 * 1024 ** 2 },
};

export const CONNECTION_PRESETS: { label: string; value: number; unit: string }[] = [
  { label: msg('Dial-up 56k'), value: 56, unit: 'kbps' },
  { label: 'T1 1.544M', value: 1.544, unit: 'Mbps' },
  { label: msg('25 Mbit/s'), value: 25, unit: 'Mbps' },
  { label: msg('100 Mbit/s'), value: 100, unit: 'Mbps' },
  { label: msg('300 Mbit/s'), value: 300, unit: 'Mbps' },
  { label: msg('1 Gbit/s'), value: 1, unit: 'Gbps' },
  { label: msg('2.5 Gbit/s'), value: 2.5, unit: 'Gbps' },
  { label: msg('10 Gbit/s'), value: 10, unit: 'Gbps' },
];

export const FILE_PRESETS: { label: string; value: number; unit: string }[] = [
  { label: msg('MP3 song (5 MB)'), value: 5, unit: 'MB' },
  { label: msg('CD image (700 MiB)'), value: 700, unit: 'MiB' },
  { label: 'DVD (4.7 GB)', value: 4.7, unit: 'GB' },
  { label: 'Blu-ray (25 GB)', value: 25, unit: 'GB' },
  { label: msg('Large game (100 GB)'), value: 100, unit: 'GB' },
  { label: msg('1 TB backup'), value: 1, unit: 'TB' },
];

/**
 * Transfer time in seconds: bits / (rate × (1 − overhead)).
 * overheadPct is the share of the line rate lost to protocol headers, retransmits and contention.
 */
export function downloadTime(bytes: number, bps: number, overheadPct = 0): Result<{ seconds: number; effectiveBps: number; bits: number }> {
  if (!isNum(bytes) || bytes <= 0) return fail(msg('Enter a file size greater than zero.'));
  if (!isNum(bps) || bps <= 0) return fail(msg('Enter a connection speed greater than zero.'));
  if (!isNum(overheadPct) || overheadPct < 0 || overheadPct >= 100) return fail(msg('Overhead must be at least 0% and below 100%.'));
  const effectiveBps = bps * (1 - overheadPct / 100);
  const bits = bytes * 8;
  return ok({ seconds: bits / effectiveBps, effectiveBps, bits });
}

/** Line rate (bit/s) needed to move `bytes` in `seconds` with the given overhead. */
export function requiredSpeed(bytes: number, seconds: number, overheadPct = 0): Result<{ bps: number; effectiveBps: number }> {
  if (!isNum(bytes) || bytes <= 0) return fail(msg('Enter a file size greater than zero.'));
  if (!isNum(seconds) || seconds <= 0) return fail(msg('Enter a target time greater than zero.'));
  if (!isNum(overheadPct) || overheadPct < 0 || overheadPct >= 100) return fail(msg('Overhead must be at least 0% and below 100%.'));
  const effectiveBps = (bytes * 8) / seconds;
  return ok({ bps: effectiveBps / (1 - overheadPct / 100), effectiveBps });
}

/** Human duration like "2 h 13 min 20 s" or "3.2 s". */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return 'n/a';
  if (seconds < 1) return `${Number((seconds * 1000).toPrecision(3))} ms`;
  if (seconds < 60) return `${Number(seconds.toPrecision(3))} s`;
  let s = Math.round(seconds);
  const parts: string[] = [];
  const units: [number, string][] = [[365.25 * 86400, 'y'], [86400, 'd'], [3600, 'h'], [60, 'min'], [1, 's']];
  for (const [size, name] of units) {
    if (s >= size) {
      const n = Math.floor(s / size);
      s -= n * size;
      parts.push(`${n} ${name}`);
    }
  }
  return parts.slice(0, 3).join(' ');
}
