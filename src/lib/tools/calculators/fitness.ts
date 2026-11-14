/**
 * Pure maths for the fitness calculator group: body fat, ideal weight,
 * running pace, heart rate zones, one-rep max, calories burned (MET),
 * macros and blood alcohol (Widmark). No React here so the regression
 * tests in src/test/tools/calc-fitness.test.ts exercise the same code as
 * the UI.
 */
import { msg } from '../../msg';

export type Sex = 'male' | 'female';

export const CM_PER_IN = 2.54;
export const KG_PER_LB = 0.45359237;
export const M_PER_MILE = 1609.344;

export const inToCm = (inches: number) => inches * CM_PER_IN;
export const cmToIn = (cm: number) => cm / CM_PER_IN;
export const lbToKg = (lb: number) => lb * KG_PER_LB;
export const kgToLb = (kg: number) => kg / KG_PER_LB;

const finitePositive = (...values: number[]) => values.every((v) => Number.isFinite(v) && v > 0);

export const round = (value: number, digits = 1) => {
  const f = 10 ** digits;
  return Math.round((value + Number.EPSILON) * f) / f;
};

/* ------------------------------------------------------------------ */
/* Body fat                                                            */
/* ------------------------------------------------------------------ */

/**
 * US Navy circumference method, inch form as published in DoD Instruction
 * 1308.3 (Hodgdon and Beckett, Naval Health Research Center, 1984).
 * Men:   86.010 log10(abdomen - neck) - 70.041 log10(height) + 36.76
 * Women: 163.205 log10(waist + hip - neck) - 97.684 log10(height) - 78.387
 * All measurements in inches. Returns null when the logs are undefined.
 */
export function navyBodyFatInches(input: {
  sex: Sex;
  heightIn: number;
  neckIn: number;
  waistIn: number;
  hipIn?: number;
}): number | null {
  const { sex, heightIn, neckIn, waistIn, hipIn = 0 } = input;
  if (!finitePositive(heightIn, neckIn, waistIn)) return null;
  if (sex === 'male') {
    const diff = waistIn - neckIn;
    if (diff <= 0) return null;
    return 86.01 * Math.log10(diff) - 70.041 * Math.log10(heightIn) + 36.76;
  }
  if (!finitePositive(hipIn)) return null;
  const sum = waistIn + hipIn - neckIn;
  if (sum <= 0) return null;
  return 163.205 * Math.log10(sum) - 97.684 * Math.log10(heightIn) - 78.387;
}

/**
 * Metric (body density) form of the Navy equations, widely used for cm:
 * Men:   495 / (1.0324 - 0.19077 log10(waist - neck) + 0.15456 log10(height)) - 450
 * Women: 495 / (1.29579 - 0.35004 log10(waist + hip - neck) + 0.22100 log10(height)) - 450
 * Kept for comparison; it agrees with the inch form to within about 0.5 points.
 */
export function navyBodyFatMetricDensity(input: {
  sex: Sex;
  heightCm: number;
  neckCm: number;
  waistCm: number;
  hipCm?: number;
}): number | null {
  const { sex, heightCm, neckCm, waistCm, hipCm = 0 } = input;
  if (!finitePositive(heightCm, neckCm, waistCm)) return null;
  if (sex === 'male') {
    const diff = waistCm - neckCm;
    if (diff <= 0) return null;
    return 495 / (1.0324 - 0.19077 * Math.log10(diff) + 0.15456 * Math.log10(heightCm)) - 450;
  }
  if (!finitePositive(hipCm)) return null;
  const sum = waistCm + hipCm - neckCm;
  if (sum <= 0) return null;
  return 495 / (1.29579 - 0.35004 * Math.log10(sum) + 0.221 * Math.log10(heightCm)) - 450;
}

/**
 * US Army one-site tape equation (Army Directive 2023-11, used since 2023):
 * Men:   -26.97 - 0.12 x weight (lb) + 1.99 x abdomen (in)
 * Women: -9.15 - 0.015 x weight (lb) + 1.27 x abdomen (in)
 */
export function armyOneSiteBodyFat(input: { sex: Sex; weightLb: number; abdomenIn: number }): number | null {
  const { sex, weightLb, abdomenIn } = input;
  if (!finitePositive(weightLb, abdomenIn)) return null;
  return sex === 'male'
    ? -26.97 - 0.12 * weightLb + 1.99 * abdomenIn
    : -9.15 - 0.015 * weightLb + 1.27 * abdomenIn;
}

/** Deurenberg et al. 1991 adult equation: 1.2 x BMI + 0.23 x age - 10.8 x sex - 5.4 (sex = 1 for men). */
export function deurenbergBodyFat(input: { sex: Sex; bmi: number; age: number }): number | null {
  const { sex, bmi, age } = input;
  if (!finitePositive(bmi, age)) return null;
  return 1.2 * bmi + 0.23 * age - 10.8 * (sex === 'male' ? 1 : 0) - 5.4;
}

export const bmiFromMetric = (weightKg: number, heightCm: number) =>
  finitePositive(weightKg, heightCm) ? weightKg / (heightCm / 100) ** 2 : NaN;

export type AceCategory = 'Below essential fat' | 'Essential fat' | 'Athletes' | 'Fitness' | 'Average' | 'Obese';

/**
 * American Council on Exercise body fat ranges.
 * Women: essential 10-13, athletes 14-20, fitness 21-24, average 25-31, obese 32+.
 * Men:   essential 2-5,   athletes 6-13,  fitness 14-17, average 18-24, obese 25+.
 * Values between table rows (e.g. 13.5 for women) go to the higher band.
 */
export const ACE_BANDS: Record<Sex, { category: AceCategory; min: number; label: string }[]> = {
  female: [
    { category: msg('Essential fat'), min: 10, label: msg('10 to 13%') },
    { category: msg('Athletes'), min: 14, label: msg('14 to 20%') },
    { category: msg('Fitness'), min: 21, label: msg('21 to 24%') },
    { category: msg('Average'), min: 25, label: msg('25 to 31%') },
    { category: msg('Obese'), min: 32, label: msg('32% and over') },
  ],
  male: [
    { category: msg('Essential fat'), min: 2, label: msg('2 to 5%') },
    { category: msg('Athletes'), min: 6, label: msg('6 to 13%') },
    { category: msg('Fitness'), min: 14, label: msg('14 to 17%') },
    { category: msg('Average'), min: 18, label: msg('18 to 24%') },
    { category: msg('Obese'), min: 25, label: msg('25% and over') },
  ],
};

export function aceCategory(sex: Sex, bodyFatPct: number): AceCategory {
  const bands = ACE_BANDS[sex];
  if (bodyFatPct < bands[0].min) return msg('Below essential fat');
  let current: AceCategory = bands[0].category;
  for (let i = 0; i < bands.length; i++) {
    // A reading above the previous band's upper whole number belongs to the next band.
    const threshold = i === 0 ? bands[0].min : bands[i].min - 1;
    if (i === 0 ? bodyFatPct >= threshold : bodyFatPct > threshold) current = bands[i].category;
  }
  return current;
}

export function bodyComposition(weightKg: number, bodyFatPct: number) {
  const fatMassKg = (weightKg * bodyFatPct) / 100;
  return { fatMassKg, leanMassKg: weightKg - fatMassKg };
}

/* ------------------------------------------------------------------ */
/* Ideal weight                                                        */
/* ------------------------------------------------------------------ */

export type IdealWeightFormula = 'devine' | 'robinson' | 'miller' | 'hamwi';

/** kg at 5 ft and kg per inch over 5 ft. Hamwi is defined in pounds (106 + 6 lb/in men, 100 + 5 lb/in women). */
export const IDEAL_WEIGHT_FORMULAS: Record<IdealWeightFormula, { name: string; year: number; male: [number, number]; female: [number, number] }> = {
  devine: { name: 'Devine', year: 1974, male: [50, 2.3], female: [45.5, 2.3] },
  robinson: { name: 'Robinson', year: 1983, male: [52, 1.9], female: [49, 1.7] },
  miller: { name: 'Miller', year: 1983, male: [56.2, 1.41], female: [53.1, 1.36] },
  hamwi: { name: 'Hamwi', year: 1964, male: [lbToKg(106), lbToKg(6)], female: [lbToKg(100), lbToKg(5)] },
};

/**
 * Ideal body weight in kg for a height in cm. The formulas are defined for
 * 5 ft (152.4 cm) and taller; below that the same slope is extended
 * downwards and `extrapolated` is set so the UI can warn.
 */
export function idealWeightKg(formula: IdealWeightFormula, sex: Sex, heightCm: number) {
  if (!finitePositive(heightCm)) return null;
  const [base, perInch] = IDEAL_WEIGHT_FORMULAS[formula][sex];
  const inchesOver5ft = cmToIn(heightCm) - 60;
  return { kg: base + perInch * inchesOver5ft, extrapolated: inchesOver5ft < 0 };
}

/**
 * Which healthy BMI range an ideal weight is compared with.
 * - who: WHO adult range 18.5 to 24.9 (NHS, Health Canada, healthdirect).
 * - asian: 18.5 to 22.9, the healthy band below the lower overweight action
 *   point of 23 used for Asian populations: the WHO Asia-Pacific cut-offs used
 *   in the ICMR-INDIAB study, and NICE NG246 rec. 1.9.11 / the NHS for people
 *   of South Asian, Chinese, other Asian, Middle Eastern, Black African or
 *   African-Caribbean background.
 */
export type HealthyBmiScale = 'who' | 'asian';
export const HEALTHY_BMI_SCALES: Record<HealthyBmiScale, { minBmi: number; maxBmi: number; label: string }> = {
  who: { minBmi: 18.5, maxBmi: 24.9, label: msg('WHO adult range') },
  asian: { minBmi: 18.5, maxBmi: 22.9, label: msg('Asian and lower-threshold range') },
};
export const healthyBmiScale = (scale?: string): HealthyBmiScale => (scale === 'asian' ? 'asian' : 'who');

/** Weight range for the healthy BMI band at a given height: 18.5 to 24.9 (WHO, the default) or 18.5 to 22.9 (asian). */
export function healthyBmiRangeKg(heightCm: number, scale?: string) {
  if (!finitePositive(heightCm)) return null;
  const m2 = (heightCm / 100) ** 2;
  const { minBmi, maxBmi } = HEALTHY_BMI_SCALES[healthyBmiScale(scale)];
  return { minKg: minBmi * m2, maxKg: maxBmi * m2, minBmi, maxBmi };
}

/** Whole stones and pounds for a weight in kg (1 st = 14 lb), pounds rounded to the nearest whole pound. */
export function kgToStLb(kg: number): { st: number; lb: number } | null {
  if (!Number.isFinite(kg) || kg < 0) return null;
  const total = Math.round(kgToLb(kg));
  return { st: Math.floor(total / 14), lb: total % 14 };
}

/** "10 st 3 lb", the way UK scales and the NHS show body weight. */
export function formatStLb(kg: number): string {
  const v = kgToStLb(kg);
  return v ? `${v.st} st ${v.lb} lb` : '-';
}

/** Stones and pounds (either part may be blank) to kg; NaN when both are blank or not numbers. */
export function stLbToKg(st: string, lb: string): number {
  const blank = (v: string) => v.trim() === '';
  if (blank(st) && blank(lb)) return NaN;
  const s = blank(st) ? 0 : Number(st.trim().replace(',', '.'));
  const p = blank(lb) ? 0 : Number(lb.trim().replace(',', '.'));
  if (!Number.isFinite(s) || !Number.isFinite(p)) return NaN;
  return lbToKg(s * 14 + p);
}

/** Thermochemical kilocalorie, the factor on Australian and UK food labels. */
export const KJ_PER_KCAL_FITNESS = 4.184;

/** Energy for an activity in kcal ("412 kcal", as the tool always showed) or in kilojoules rounded to the nearest 10 kJ ("1,720 kJ"). */
export function formatBurn(kcal: number, unit?: string): string {
  if (!Number.isFinite(kcal)) return '-';
  if (unit === 'kj') return `${(Math.round((kcal * KJ_PER_KCAL_FITNESS) / 10) * 10).toLocaleString('en')} kJ`;
  return `${Math.round(kcal)} kcal`;
}

/* ------------------------------------------------------------------ */
/* Pace                                                                */
/* ------------------------------------------------------------------ */

export const RACE_DISTANCES_KM: { id: string; label: string; km: number }[] = [
  { id: '1500m', label: '1500 m', km: 1.5 },
  { id: 'mile', label: msg('1 mile'), km: M_PER_MILE / 1000 },
  { id: '5k', label: '5K', km: 5 },
  { id: '10k', label: '10K', km: 10 },
  { id: '15k', label: '15K', km: 15 },
  { id: '10mile', label: msg('10 miles'), km: (10 * M_PER_MILE) / 1000 },
  { id: 'half', label: msg('Half marathon'), km: 21.0975 },
  { id: 'marathon', label: msg('Marathon'), km: 42.195 },
];

/**
 * Parse "h:mm:ss", "mm:ss" or plain seconds/minutes into seconds.
 * A single number is read as minutes when `singleUnit` is 'min'.
 */
export function parseDuration(text: string, singleUnit: 'sec' | 'min' = 'min'): number | null {
  const t = text.trim();
  if (!t) return null;
  const parts = t.split(':');
  if (parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p.trim()))) return null;
  const nums = parts.map((p) => parseFloat(p));
  let secs: number;
  if (nums.length === 1) secs = singleUnit === 'min' ? nums[0] * 60 : nums[0];
  else if (nums.length === 2) secs = nums[0] * 60 + nums[1];
  else secs = nums[0] * 3600 + nums[1] * 60 + nums[2];
  return Number.isFinite(secs) ? secs : null;
}

/** Seconds to "h:mm:ss" (or "m:ss" under an hour). Rounds to whole seconds unless `decimals` is set. */
export function formatDuration(totalSeconds: number, decimals = 0): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '';
  const f = 10 ** decimals;
  const rounded = Math.round(totalSeconds * f) / f;
  const h = Math.floor(rounded / 3600);
  const m = Math.floor((rounded - h * 3600) / 60);
  const s = rounded - h * 3600 - m * 60;
  const sStr = decimals > 0 ? s.toFixed(decimals).padStart(3 + decimals, '0') : String(Math.round(s)).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sStr}` : `${m}:${sStr}`;
}

export type DistanceUnit = 'km' | 'mi' | 'm';
export const toKm = (value: number, unit: DistanceUnit) =>
  unit === 'km' ? value : unit === 'mi' ? (value * M_PER_MILE) / 1000 : value / 1000;
export const fromKm = (km: number, unit: DistanceUnit) =>
  unit === 'km' ? km : unit === 'mi' ? (km * 1000) / M_PER_MILE : km * 1000;

/** Seconds per km to seconds per mile and back. */
export const paceKmToMile = (secPerKm: number) => (secPerKm * M_PER_MILE) / 1000;
export const paceMileToKm = (secPerMile: number) => (secPerMile * 1000) / M_PER_MILE;

export function solvePace(input: { km?: number; seconds?: number; secPerKm?: number }) {
  const { km, seconds, secPerKm } = input;
  if (km && seconds && km > 0 && seconds > 0) return { km, seconds, secPerKm: seconds / km };
  if (km && secPerKm && km > 0 && secPerKm > 0) return { km, seconds: km * secPerKm, secPerKm };
  if (seconds && secPerKm && seconds > 0 && secPerKm > 0) return { km: seconds / secPerKm, seconds, secPerKm };
  return null;
}

export const speedKmh = (secPerKm: number) => 3600 / secPerKm;

/** Riegel (1977/1981): T2 = T1 x (D2 / D1)^exponent, exponent 1.06 by default. */
export function riegelPredict(t1Seconds: number, d1Km: number, d2Km: number, exponent = 1.06): number | null {
  if (!finitePositive(t1Seconds, d1Km, d2Km)) return null;
  return t1Seconds * (d2Km / d1Km) ** exponent;
}

/** Cumulative split times at every whole unit, plus the final partial split. */
export function splitTable(totalKm: number, secPerKm: number, unit: 'km' | 'mi') {
  if (!finitePositive(totalKm, secPerKm)) return [];
  const unitKm = unit === 'km' ? 1 : M_PER_MILE / 1000;
  const total = totalKm / unitKm;
  const rows: { at: number; elapsed: number }[] = [];
  const whole = Math.floor(total + 1e-9);
  for (let i = 1; i <= Math.min(whole, 200); i++) rows.push({ at: i, elapsed: i * unitKm * secPerKm });
  if (total - whole > 1e-6 && whole < 200) rows.push({ at: total, elapsed: totalKm * secPerKm });
  return rows;
}

/* ------------------------------------------------------------------ */
/* Heart rate                                                          */
/* ------------------------------------------------------------------ */

export type MaxHrFormula = 'fox' | 'tanaka' | 'gellish' | 'gulati';

export const MAX_HR_FORMULAS: Record<MaxHrFormula, { name: string; expr: string; fn: (age: number) => number; note: string }> = {
  fox: { name: msg('Fox (220 - age)'), expr: msg('220 - age'), fn: (a) => 220 - a, note: msg('The classic rule of thumb, with no strong study behind it.') },
  tanaka: { name: msg('Tanaka (2001)'), expr: msg('208 - 0.7 x age'), fn: (a) => 208 - 0.7 * a, note: msg('Meta-analysis of 351 studies, about 18,700 adults.') },
  gellish: { name: msg('Gellish (2007)'), expr: msg('207 - 0.7 x age'), fn: (a) => 207 - 0.7 * a, note: msg('Longitudinal treadmill data from 132 adults.') },
  gulati: { name: msg('Gulati (2010, women)'), expr: msg('206 - 0.88 x age'), fn: (a) => 206 - 0.88 * a, note: msg('Derived from 5,437 women; intended for women only.') },
};

export function maxHeartRate(formula: MaxHrFormula, age: number): number | null {
  if (!finitePositive(age)) return null;
  return MAX_HR_FORMULAS[formula].fn(age);
}

/** Percentage of max heart rate. */
export const hrAtPercentMax = (hrMax: number, pct: number) => (hrMax * pct) / 100;

/** Karvonen: resting + pct x (max - resting). */
export const hrKarvonen = (hrMax: number, hrRest: number, pct: number) => hrRest + ((hrMax - hrRest) * pct) / 100;

export const HR_ZONES = [
  { zone: 1, name: msg('Very light (recovery)'), low: 50, high: 60 },
  { zone: 2, name: msg('Light (endurance base)'), low: 60, high: 70 },
  { zone: 3, name: msg('Moderate (aerobic)'), low: 70, high: 80 },
  { zone: 4, name: msg('Hard (threshold)'), low: 80, high: 90 },
  { zone: 5, name: msg('Maximum (VO2 max)'), low: 90, high: 100 },
];

/**
 * American Heart Association bands as % of max heart rate. They are defined on
 * maximum heart rate only, so they are always computed with hrAtPercentMax and
 * never applied to heart rate reserve.
 */
export const AHA_INTENSITY = {
  moderate: { low: 50, high: 70 },
  vigorous: { low: 70, high: 85 },
};

/**
 * Reserve bands shown with the Karvonen method. They are plain percentages of
 * heart rate reserve, not a guideline's definition of moderate or vigorous.
 */
export const KARVONEN_RESERVE_BANDS = [
  { low: 50, high: 70 },
  { low: 70, high: 85 },
];

/**
 * The AHA moderate and vigorous ranges (always % of max) plus, for the Karvonen
 * method, the heart rate reserve bands in KARVONEN_RESERVE_BANDS.
 */
export function targetHeartRateBands(hrMax: number, method: 'percent' | 'karvonen', hrRest = 0) {
  const pm = (p: number) => hrAtPercentMax(hrMax, p);
  return {
    moderate: [pm(AHA_INTENSITY.moderate.low), pm(AHA_INTENSITY.moderate.high)] as [number, number],
    vigorous: [pm(AHA_INTENSITY.vigorous.low), pm(AHA_INTENSITY.vigorous.high)] as [number, number],
    reserve: method === 'karvonen'
      ? KARVONEN_RESERVE_BANDS.map((b) => ({ ...b, lowBpm: hrKarvonen(hrMax, hrRest, b.low), highBpm: hrKarvonen(hrMax, hrRest, b.high) }))
      : null,
  };
}

export function heartRateZones(hrMax: number, method: 'percent' | 'karvonen', hrRest = 0) {
  return HR_ZONES.map((z) => {
    const f = (p: number) => (method === 'karvonen' ? hrKarvonen(hrMax, hrRest, p) : hrAtPercentMax(hrMax, p));
    return { ...z, lowBpm: f(z.low), highBpm: f(z.high) };
  });
}

/* ------------------------------------------------------------------ */
/* One-rep max                                                         */
/* ------------------------------------------------------------------ */

export type OneRmFormula = 'epley' | 'brzycki' | 'lombardi' | 'oconner' | 'lander' | 'mayhew' | 'wathan';

export const ONE_RM_FORMULAS: Record<OneRmFormula, { name: string; expr: string; fn: (w: number, r: number) => number }> = {
  epley: { name: msg('Epley (1985)'), expr: 'w x (1 + r / 30)', fn: (w, r) => (r === 1 ? w : w * (1 + r / 30)) },
  brzycki: { name: msg('Brzycki (1993)'), expr: 'w x 36 / (37 - r)', fn: (w, r) => (w * 36) / (37 - r) },
  lombardi: { name: msg('Lombardi (1989)'), expr: 'w x r^0.10', fn: (w, r) => w * r ** 0.1 },
  oconner: { name: msg("O'Conner (1989)"), expr: 'w x (1 + 0.025 r)', fn: (w, r) => w * (1 + 0.025 * r) },
  lander: { name: msg('Lander (1985)'), expr: '100 w / (101.3 - 2.67123 r)', fn: (w, r) => (100 * w) / (101.3 - 2.67123 * r) },
  mayhew: { name: msg('Mayhew (1992)'), expr: '100 w / (52.2 + 41.9 e^(-0.055 r))', fn: (w, r) => (100 * w) / (52.2 + 41.9 * Math.exp(-0.055 * r)) },
  wathan: { name: msg('Wathan (1994)'), expr: '100 w / (48.8 + 53.8 e^(-0.075 r))', fn: (w, r) => (100 * w) / (48.8 + 53.8 * Math.exp(-0.075 * r)) },
};

export function oneRepMax(weight: number, reps: number) {
  if (!finitePositive(weight, reps) || !Number.isInteger(reps) || reps > 30) return null;
  const byFormula = (Object.keys(ONE_RM_FORMULAS) as OneRmFormula[]).map((id) => ({
    id,
    name: ONE_RM_FORMULAS[id].name,
    value: reps === 1 ? weight : ONE_RM_FORMULAS[id].fn(weight, reps),
  }));
  const average = byFormula.reduce((s, f) => s + f.value, 0) / byFormula.length;
  return { byFormula, average };
}

/** Load you could lift for `reps` reps, from the mean of the inverted Epley and Brzycki equations. */
export function loadForReps(oneRm: number, reps: number) {
  if (reps <= 1) return oneRm;
  const epley = oneRm / (1 + reps / 30);
  const brzycki = (oneRm * (37 - reps)) / 36;
  return (epley + brzycki) / 2;
}

/**
 * Options for the inventory-aware form of platesPerSide (barbell plate
 * calculator). `pairs[i]` is how many pairs of `plates[i]` you have; null
 * or a missing entry means unlimited. `collarEach` is added to the bar on
 * both sides (IPF competition collars weigh 2.5 kg each).
 */
export type PlateOptions = { pairs?: (number | null)[]; collarEach?: number };

export type PlateLoad = { plates: number[]; perSide: number; total: number };

export type PlateLoadResult = {
  /** Weight each side must carry: (target - bar - 2 x collar) / 2. */
  targetPerSide: number;
  /** Bar plus both collars, the lightest load possible. */
  emptyBar: number;
  /** Heaviest-first plates for an exact load, or null when none exists with these plates. */
  exact: PlateLoad | null;
  /** Nearest loads you can make below and above the target when there is no exact one. */
  below: PlateLoad | null;
  above: PlateLoad | null;
};

/** Plate weights are handled as whole multiples of 0.01 so 1.25 and 2.5 add up exactly. */
const PLATE_RES = 100;
/** Search ceiling per side (units of 0.01): 1,000 kg or lb is far above any real bar. */
const MAX_SIDE_UNITS = 100_000;

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/**
 * Exact search over a bounded plate inventory. For each suffix of the
 * plate list (heaviest first) it records which per-side sums can be made,
 * then rebuilds a load by taking as many of each plate as still leaves the
 * rest reachable. That gives the heaviest-first loading a lifter would do
 * by hand (the greedy answer whenever greedy works), and it still finds
 * 15 + 15 for a 30 kg side when the only 25 kg plate cannot be topped up.
 */
function plateSearch(sizes: number[], counts: number[], limitUnits: number) {
  const n = sizes.length;
  // reach[i][v]: v is a sum of plates i..n-1 within their counts.
  const reach: Uint8Array[] = Array.from({ length: n + 1 }, () => new Uint8Array(limitUnits + 1));
  reach[n][0] = 1;
  for (let i = n - 1; i >= 0; i--) {
    const next = reach[i + 1];
    const cur = reach[i];
    const p = sizes[i];
    const c = counts[i];
    // Bounded reachability in one pass: used[v] is the fewest plates of size p needed to reach v.
    const used = new Int32Array(limitUnits + 1);
    for (let v = 0; v <= limitUnits; v++) {
      if (next[v]) cur[v] = 1;
      else if (v >= p && cur[v - p] && used[v - p] < c) {
        cur[v] = 1;
        used[v] = used[v - p] + 1;
      }
    }
  }
  const build = (target: number): number[] | null => {
    if (target < 0 || target > limitUnits || !reach[0][target]) return null;
    const used: number[] = [];
    let left = target;
    for (let i = 0; i < n; i++) {
      let k = Math.min(counts[i], Math.floor(left / sizes[i]));
      while (k > 0 && !reach[i + 1][left - k * sizes[i]]) k--;
      for (let j = 0; j < k; j++) used.push(sizes[i]);
      left -= k * sizes[i];
    }
    return used;
  };
  return { reach: reach[0], build };
}

function platesWithInventory(total: number, bar: number, plates: number[], options: PlateOptions): PlateLoadResult | null {
  const collar = options.collarEach ?? 0;
  if (!Number.isFinite(total) || !Number.isFinite(bar) || !Number.isFinite(collar) || bar < 0 || collar < 0) return null;
  const emptyBar = bar + 2 * collar;
  if (total < emptyBar - 1e-9) return null;
  // Keep real plate sizes with their pair counts, heaviest first, merging duplicates.
  const merged = new Map<number, number>();
  plates.forEach((p, i) => {
    if (!Number.isFinite(p) || p <= 0) return;
    const units = Math.round(p * PLATE_RES);
    if (units <= 0) return;
    const raw = options.pairs?.[i];
    const count = raw === null || raw === undefined ? Infinity : Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
    merged.set(units, (merged.get(units) ?? 0) + count);
  });
  const entries = [...merged.entries()].filter(([, c]) => c > 0).sort((a, b) => b[0] - a[0]);
  const targetPerSide = (total - emptyBar) / 2;
  const targetUnits = Math.round(targetPerSide * PLATE_RES);
  if (targetUnits > MAX_SIDE_UNITS) return null;
  const toLoad = (units: number[]): PlateLoad => {
    const perSide = units.reduce((s, u) => s + u, 0) / PLATE_RES;
    return { plates: units.map((u) => u / PLATE_RES), perSide, total: emptyBar + 2 * perSide };
  };
  if (targetUnits === 0) return { targetPerSide: 0, emptyBar, exact: { plates: [], perSide: 0, total: emptyBar }, below: null, above: null };
  if (entries.length === 0) return { targetPerSide, emptyBar, exact: null, below: { plates: [], perSide: 0, total: emptyBar }, above: null };

  // Scale every weight by the common divisor so the table stays small (2.5 kg steps become 1s).
  const g = entries.reduce((acc, [u]) => gcd(acc, u), 0);
  const sizes = entries.map(([u]) => u / g);
  const available = entries.reduce((s, [u, c]) => s + (Number.isFinite(c) ? u * c : Infinity), 0);
  // Search up to one heaviest plate past the target, or everything you own if that is less.
  const limitUnits = Math.floor(Math.min(available, targetUnits + entries[0][0]) / g);
  const counts = entries.map(([u, c]) => (Number.isFinite(c) ? c : Math.floor(limitUnits / (u / g))));
  const { reach, build } = plateSearch(sizes, counts, limitUnits);
  const unitsOf = (scaled: number[]) => scaled.map((s) => s * g);

  if (targetUnits % g === 0) {
    const exact = build(targetUnits / g);
    if (exact) return { targetPerSide, emptyBar, exact: toLoad(unitsOf(exact)), below: null, above: null };
  }
  let lo = Math.min(Math.floor(targetUnits / g), limitUnits);
  while (lo >= 0 && !reach[lo]) lo--;
  let hi = Math.ceil(targetUnits / g);
  while (hi <= limitUnits && !reach[hi]) hi++;
  return {
    targetPerSide,
    emptyBar,
    exact: null,
    below: lo >= 0 ? toLoad(unitsOf(build(lo)!)) : null,
    above: hi <= limitUnits ? toLoad(unitsOf(build(hi)!)) : null,
  };
}

/**
 * Plates per side for a barbell load. With three arguments it is the
 * original greedy fill from the heaviest plate (unlimited plates, used by
 * the one-rep max calculator). With options it searches a limited
 * inventory and collars too, and reports the nearest loads when the
 * target cannot be made exactly (barbell plate calculator).
 */
export function platesPerSide(total: number, bar: number, plates: number[]): { plates: number[]; remainderPerSide: number } | null;
export function platesPerSide(total: number, bar: number, plates: number[], options: PlateOptions): PlateLoadResult | null;
export function platesPerSide(total: number, bar: number, plates: number[], options?: PlateOptions) {
  if (options) return platesWithInventory(total, bar, plates, options);
  if (!Number.isFinite(total) || !Number.isFinite(bar) || total < bar) return null;
  let perSide = (total - bar) / 2;
  const used: number[] = [];
  // Only real plate sizes: a 0 or negative plate would never reduce perSide and loop forever.
  for (const p of plates.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => b - a)) {
    while (perSide + 1e-9 >= p) {
      used.push(p);
      perSide -= p;
    }
  }
  return { plates: used, remainderPerSide: perSide < 1e-9 ? 0 : perSide };
}

/* ------------------------------------------------------------------ */
/* Calories burned (MET)                                               */
/* ------------------------------------------------------------------ */

/**
 * Gross energy from METs, using 1 MET = 3.5 mL O2/kg/min and about 5 kcal
 * per litre of oxygen: kcal/min = MET x 3.5 x kg / 200.
 */
export function metCalories(met: number, weightKg: number, minutes: number): number | null {
  if (!finitePositive(met, weightKg, minutes)) return null;
  return (met * 3.5 * weightKg * minutes) / 200;
}

/** Energy above rest only: (MET - 1) x 3.5 x kg / 200 per minute. */
export function metNetCalories(met: number, weightKg: number, minutes: number): number | null {
  if (!finitePositive(met, weightKg, minutes)) return null;
  return (Math.max(0, met - 1) * 3.5 * weightKg * minutes) / 200;
}

/** Harris-Benedict (1919) RMR in kcal/day, as used on pacompendium.com for corrected METs. */
export function harrisBenedictRmr(sex: Sex, weightKg: number, heightCm: number, age: number): number | null {
  if (!finitePositive(weightKg, heightCm, age)) return null;
  return sex === 'male'
    ? 66.473 + 13.7516 * weightKg + 5.0033 * heightCm - 6.755 * age
    : 655.0955 + 9.5634 * weightKg + 1.8496 * heightCm - 4.6756 * age;
}

/**
 * Personalised estimate: MET x your own resting rate per minute. Equivalent
 * to the Compendium's "corrected MET" idea for people whose resting
 * oxygen use differs from 3.5 mL/kg/min.
 */
export function metCaloriesCorrected(met: number, rmrKcalPerDay: number, minutes: number): number | null {
  if (!finitePositive(met, rmrKcalPerDay, minutes)) return null;
  return (met * rmrKcalPerDay * minutes) / 1440;
}

/** Minutes needed to burn a calorie target at a given MET. */
export function minutesToBurn(targetKcal: number, met: number, weightKg: number): number | null {
  if (!finitePositive(targetKcal, met, weightKg)) return null;
  return (targetKcal * 200) / (met * 3.5 * weightKg);
}

/* ------------------------------------------------------------------ */
/* Macros                                                              */
/* ------------------------------------------------------------------ */

export const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const;

export function mifflinStJeor(sex: Sex, weightKg: number, heightCm: number, age: number): number | null {
  if (!finitePositive(weightKg, heightCm, age)) return null;
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161);
}

export const ACTIVITY_FACTORS = [
  { id: 'sedentary', label: msg('Sedentary (desk job, little exercise)'), factor: 1.2 },
  { id: 'light', label: msg('Light (exercise 1 to 3 days a week)'), factor: 1.375 },
  { id: 'moderate', label: msg('Moderate (exercise 3 to 5 days a week)'), factor: 1.55 },
  { id: 'active', label: msg('Very active (hard exercise 6 to 7 days)'), factor: 1.725 },
  { id: 'extra', label: msg('Extra active (physical job plus training)'), factor: 1.9 },
] as const;

export type MacroGoal = 'lose' | 'maintain' | 'gain';
export const GOAL_ADJUST: Record<MacroGoal, { label: string; factor: number }> = {
  lose: { label: msg('Lose weight (20% below maintenance)'), factor: 0.8 },
  maintain: { label: msg('Maintain weight'), factor: 1 },
  gain: { label: msg('Build muscle (10% above maintenance)'), factor: 1.1 },
};

export type MacroPreset = 'balanced' | 'low-carb' | 'high-protein' | 'keto' | 'custom';

/** Percent of calories from protein / carbs / fat. */
export const MACRO_PRESETS: Record<Exclude<MacroPreset, 'custom'>, { label: string; protein: number; carbs: number; fat: number }> = {
  balanced: { label: msg('Balanced'), protein: 25, carbs: 45, fat: 30 },
  'low-carb': { label: msg('Low carb'), protein: 30, carbs: 25, fat: 45 },
  'high-protein': { label: msg('High protein'), protein: 35, carbs: 35, fat: 30 },
  keto: { label: msg('Keto'), protein: 20, carbs: 5, fat: 75 },
};

/** IOM Acceptable Macronutrient Distribution Ranges for adults, % of energy. */
export const AMDR = { protein: [10, 35], carbs: [45, 65], fat: [20, 35] } as const;

export type MacroSplit = {
  calories: number;
  protein: { g: number; kcal: number; pct: number };
  carbs: { g: number; kcal: number; pct: number };
  fat: { g: number; kcal: number; pct: number };
};

/** Split calories by percentages (must add up to 100). */
export function macrosFromPercent(calories: number, pct: { protein: number; carbs: number; fat: number }): MacroSplit | null {
  if (!finitePositive(calories)) return null;
  const sum = pct.protein + pct.carbs + pct.fat;
  if (!(Math.abs(sum - 100) <= 0.01) || [pct.protein, pct.carbs, pct.fat].some((v) => v < 0)) return null;
  const part = (p: number, perG: number) => ({ g: (calories * p) / 100 / perG, kcal: (calories * p) / 100, pct: p });
  return { calories, protein: part(pct.protein, 4), carbs: part(pct.carbs, 4), fat: part(pct.fat, 9) };
}

/**
 * Protein fixed by body weight (g/kg), fat as a share of calories, the rest
 * to carbs. Returns null when protein plus fat already exceed the target.
 */
export function macrosFromProteinPerKg(calories: number, weightKg: number, proteinGPerKg: number, fatPct: number): MacroSplit | null {
  if (!finitePositive(calories, weightKg, proteinGPerKg) || !(fatPct >= 0 && fatPct < 100)) return null;
  const proteinG = weightKg * proteinGPerKg;
  const proteinKcal = proteinG * 4;
  const fatKcal = (calories * fatPct) / 100;
  const carbKcal = calories - proteinKcal - fatKcal;
  if (carbKcal < 0) return null;
  const pct = (k: number) => (k / calories) * 100;
  return {
    calories,
    protein: { g: proteinG, kcal: proteinKcal, pct: pct(proteinKcal) },
    carbs: { g: carbKcal / 4, kcal: carbKcal, pct: pct(carbKcal) },
    fat: { g: fatKcal / 9, kcal: fatKcal, pct: fatPct },
  };
}

/** Dietary Guidelines for Americans fibre target: 14 g per 1,000 kcal. */
export const fibreTargetG = (calories: number) => (calories / 1000) * 14;

/**
 * National reference ranges a macro split is checked against, % of energy.
 * A side with no limit is 0 (no floor) or 100 (no ceiling).
 * - iom: US Institute of Medicine AMDRs (the tool's original check).
 * - dri-ca: the same DRI AMDRs as adopted in Health Canada's DRI tables; fibre AI 38 g men, 25 g women aged 19 to 50.
 * - uk: UK Government Dietary Recommendations (PHE 2016): carbohydrate at least 50% of energy (SACN 2015),
 *   total fat no more than 35% of food energy (COMA 1991), fibre 30 g a day for adults.
 * - nrv: Australian guidance as published by healthdirect (Australian Government), which cites the NHMRC
 *   Nutrient Reference Values: protein 10 to 35% of energy; fibre 30 g men, 25 g women. Carbohydrate and
 *   fat carry no Australian range here because none was confirmed on an official page.
 */
export type MacroReference = 'iom' | 'dri-ca' | 'uk' | 'nrv';

type Range = readonly [number, number];
export const MACRO_REFERENCES: Record<MacroReference, { authority: string; ranges: { protein: Range; carbs: Range; fat: Range }; fibre: (calories: number, sex: Sex) => number; fibreNote: string }> = {
  iom: { authority: msg('the US Institute of Medicine'), ranges: AMDR, fibre: (c) => fibreTargetG(c), fibreNote: msg('14 g per 1,000 kcal') },
  'dri-ca': { authority: msg('the Dietary Reference Intakes used by Health Canada'), ranges: AMDR, fibre: (_c, sex) => (sex === 'female' ? 25 : 38), fibreNote: msg('Health Canada adequate intake, adults 19 to 50') },
  uk: { authority: msg('UK government dietary recommendations'), ranges: { protein: [0, 100], carbs: [50, 100], fat: [0, 35] }, fibre: () => 30, fibreNote: msg('UK recommendation for adults, SACN') },
  nrv: { authority: msg('Australian guidance (healthdirect)'), ranges: { protein: [10, 35], carbs: [0, 100], fat: [0, 100] }, fibre: (_c, sex) => (sex === 'female' ? 25 : 30), fibreNote: msg('healthdirect recommendation for adults') },
};

/** Translation function for macroRangeNotes; the page passes its t(), other callers get English. */
export type FitnessT = (source: string, vars?: Record<string, string | number>) => string;
const enT: FitnessT = (source, vars) => (vars ? source.replace(/\{(\w+)\}/g, (all, k: string) => (vars[k] === undefined ? all : String(vars[k]))) : source);
const MACRO_NAMES = { protein: msg('Protein'), carbs: msg('Carbohydrate'), fat: msg('Fat') } as const;

export const macroReference = (ref?: string): MacroReference => (ref === 'dri-ca' || ref === 'uk' || ref === 'nrv' ? ref : 'iom');

/** Notes for each macro whose share is outside the reference range (0.05 point tolerance), worded for one- or two-sided limits. */
export function macroRangeNotes(split: MacroSplit, ref?: string, t: FitnessT = enT): string[] {
  const r = MACRO_REFERENCES[macroReference(ref)];
  const pct = (v: number) => Math.round(v).toString();
  return (['protein', 'carbs', 'fat'] as const)
    .filter((k) => split[k].pct < r.ranges[k][0] - 0.05 || split[k].pct > r.ranges[k][1] + 0.05)
    .map((k) => {
      const [lo, hi] = r.ranges[k];
      const v = { name: t(MACRO_NAMES[k]), pct: pct(split[k].pct), lo, hi, authority: t(r.authority) };
      return hi >= 100
        ? t('{name} is {pct}% of calories, outside the minimum of {lo}% in {authority}.', v)
        : lo <= 0
          ? t('{name} is {pct}% of calories, outside the maximum of {hi}% in {authority}.', v)
          : t('{name} is {pct}% of calories, outside the {lo} to {hi}% adult range set by {authority}.', v);
    });
}

/* ------------------------------------------------------------------ */
/* Blood alcohol (Widmark)                                             */
/* ------------------------------------------------------------------ */

export const ETHANOL_DENSITY_G_PER_ML = 0.789;

/** Grams of pure alcohol in one standard drink or unit, by country. */
export const STANDARD_DRINKS = [
  { id: 'us', label: msg('United States (14 g)'), grams: 14 },
  { id: 'uk', label: msg('UK unit (8 g, 10 mL)'), grams: 8 },
  { id: 'ca', label: msg('Canada (13.45 g, 17.05 mL)'), grams: 13.45 },
  { id: 'au', label: msg('Australia (10 g)'), grams: 10 },
  { id: 'nz', label: msg('New Zealand (10 g)'), grams: 10 },
  { id: 'ie', label: msg('Ireland (10 g)'), grams: 10 },
  { id: 'who', label: msg('WHO reference (10 g)'), grams: 10 },
] as const;

/**
 * Drink-driving limits to compare an estimate against, by market. Each row is
 * a blood alcohol level in % (g/100 mL); 0 means a zero limit, where any
 * measurable alcohol is an offence. 'intl' is the original mixed table.
 * Sources: gov.uk/drink-drive-limit; Criminal Code s.320.14 (justice.gc.ca)
 * and ontario.ca/page/impaired-driving; qld.gov.au (transport/safety/road-safety/drink-driving/blood-alcohol);
 * Ireland: Road Traffic Act 2010 ss.3-4 (irishstatutebook.ie) and www2.hse.ie (drinking and driving);
 * New Zealand: police.govt.nz (being safe: road rules and reasons, alcohol limits when driving).
 */
export type BacLimitRow = { level: number; where: string };
export type BacLimitSetId = 'intl' | 'gb' | 'ca' | 'au' | 'ie' | 'nz';
export const BAC_LIMIT_SETS: Record<BacLimitSetId, { label: string; rows: BacLimitRow[]; note: string }> = {
  intl: {
    label: msg('International (common limits)'),
    rows: [
      { level: 0.08, where: msg('Every US state except Utah, England, Wales, Northern Ireland, Canada (criminal limit)') },
      { level: 0.05, where: msg('Scotland, Australia, most of the EU, Utah') },
      { level: 0.02, where: msg('Many countries for new or commercial drivers') },
    ],
    note: msg('Legal limits change and many places set lower ones for young, new or professional drivers. Being under a limit does not mean you are unimpaired.'),
  },
  gb: {
    label: msg('United Kingdom'),
    rows: [
      { level: 0.08, where: msg('England, Wales and Northern Ireland: 80 mg per 100 ml of blood (35 µg per 100 ml of breath, 107 mg per 100 ml of urine)') },
      { level: 0.05, where: msg('Scotland: 50 mg per 100 ml of blood (22 µg per 100 ml of breath, 67 mg per 100 ml of urine)') },
    ],
    note: msg('Police test breath, so the breath figure is the one that counts at the roadside. GOV.UK says it is impossible to say exactly how many drinks keep you under the limit. Being under it does not mean you are safe to drive.'),
  },
  ca: {
    label: msg('Canada'),
    rows: [
      { level: 0.08, where: msg('Criminal Code: 80 mg per 100 ml of blood or more within 2 hours of driving') },
      { level: 0.05, where: msg('Provincial warn range (Ontario: 0.05 to 0.079 brings licence suspensions and fines)') },
      { level: 0, where: msg('Zero tolerance: in Ontario, drivers 21 or under, G1, G2, M1 and M2 licence holders and commercial drivers') },
    ],
    note: msg('Provinces and territories set their own sanctions below the criminal limit and their own novice rules. Being under a limit does not mean you are unimpaired.'),
  },
  au: {
    label: msg('Australia (Queensland limits)'),
    rows: [
      { level: 0.05, where: msg('Queensland open licence holders: the general alcohol limit (over it at 0.05 or more)') },
      { level: 0, where: msg('Queensland "no alcohol" limit: learner, P1 and P2 provisional, probationary and restricted licences, and drivers of trucks over 4.5 t, buses, taxis and dangerous-goods vehicles') },
    ],
    note: msg('Each state and territory sets its own limits and licence classes; check your state transport authority. Being under 0.05 does not mean you are unimpaired.'),
  },
  ie: {
    label: msg('Ireland'),
    rows: [
      { level: 0.05, where: msg('Most drivers: 50 mg per 100 ml of blood (22 µg per 100 ml of breath, 67 mg per 100 ml of urine)') },
      { level: 0.02, where: msg('Learner permit holders, the first 2 years of a first licence, truck and bus licence holders (categories C and D and related) driving those vehicles, taxi and hackney drivers at work, and drivers without a licence for the vehicle: 20 mg per 100 ml of blood (9 µg per 100 ml of breath)') },
    ],
    note: msg('Gardaí screen breath at the roadside; the evidential test is a breath test at the station, or a blood or urine sample, each with its own limit. The HSE says one standard drink can put some people over the 20 mg limit. Being under a limit does not mean you are unimpaired.'),
  },
  nz: {
    label: msg('New Zealand'),
    rows: [
      { level: 0.05, where: msg('Drivers aged 20 and over: 50 mg per 100 ml of blood (250 micrograms per litre of breath)') },
      { level: 0, where: msg('Drivers under 20: zero limit') },
    ],
    note: msg('Police test breath first; over 250 micrograms per litre leads to an evidential breath test. Being under a limit does not mean you are unimpaired.'),
  },
};
export const bacLimitSet = (id: string) => BAC_LIMIT_SETS[(id in BAC_LIMIT_SETS ? id : 'intl') as BacLimitSetId];

/** Widmark body-water distribution factors (Widmark 1932). */
export const WIDMARK_R: Record<Sex, number> = { male: 0.68, female: 0.55 };

/** Typical average elimination rate, g/dL (percent BAC) per hour. */
export const DEFAULT_ELIMINATION = 0.015;

export const alcoholGrams = (volumeMl: number, abvPct: number) =>
  finitePositive(volumeMl, abvPct) ? volumeMl * (abvPct / 100) * ETHANOL_DENSITY_G_PER_ML : 0;

/**
 * Widmark estimate. BAC (%, i.e. g per 100 mL) = grams / (body weight g x r) x 100 - beta x hours.
 * Never below zero. `peak` ignores elimination (all alcohol absorbed at once).
 */
export function widmarkBac(input: { grams: number; weightKg: number; sex: Sex; hours: number; r?: number; beta?: number }) {
  const { grams, weightKg, sex, hours } = input;
  const r = input.r ?? WIDMARK_R[sex];
  const beta = input.beta ?? DEFAULT_ELIMINATION;
  if (!finitePositive(weightKg, r, beta) || !(grams >= 0) || !(hours >= 0)) return null;
  const peak = (grams / (weightKg * 1000 * r)) * 100;
  const current = Math.max(0, peak - beta * hours);
  const hoursUntil = (level: number) => (current <= level ? 0 : (current - level) / beta);
  return { peak, current, hoursToZero: hoursUntil(0), hoursUntil, beta, r };
}
