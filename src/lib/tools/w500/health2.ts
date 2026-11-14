/**
 * Health wave 2: body surface area, waist-to-hip ratio, VO2 max estimates,
 * blood pressure categories, steps to distance and intermittent fasting
 * window maths. Pure functions shared by the pages and the MCP calculators.
 * Relative imports only (this file is bundled into the MCP edge function).
 */
import { msg } from '../../msg';

export type Sex = 'male' | 'female';

export const CM_PER_IN = 2.54;
export const KG_PER_LB = 0.45359237;
export const M_PER_MILE = 1609.344;

const finitePos = (...xs: number[]) => xs.every((x) => Number.isFinite(x) && x > 0);

/* ------------------------------------------------------------------ */
/* Body surface area                                                   */
/* ------------------------------------------------------------------ */

export type BsaFormula =
  | 'mosteller'
  | 'dubois'
  | 'haycock'
  | 'gehan-george'
  | 'boyd'
  | 'fujimoto'
  | 'takahira'
  | 'shuter-aslani'
  | 'schlich';

export type BsaFormulaInfo = {
  name: string;
  year: number;
  /** Formula in m², weight W in kg and height H in cm unless stated. */
  expr: string;
  note: string;
  fn: (weightKg: number, heightCm: number, sex: Sex) => number;
};

export const BSA_FORMULAS: Record<BsaFormula, BsaFormulaInfo> = {
  mosteller: {
    name: 'Mosteller',
    year: 1987,
    expr: '√(H × W / 3600)',
    note: msg('A one-line square root; widely used for chemotherapy dosing and by clinical software.'),
    fn: (w, h) => Math.sqrt((h * w) / 3600),
  },
  dubois: {
    name: msg('Du Bois and Du Bois'),
    year: 1916,
    expr: '0.007184 × W^0.425 × H^0.725',
    note: msg('The original, fitted to only 9 people; still used for cardiac index and many lab reports.'),
    fn: (w, h) => 0.007184 * Math.pow(w, 0.425) * Math.pow(h, 0.725),
  },
  haycock: {
    name: 'Haycock',
    year: 1978,
    expr: '0.024265 × W^0.5378 × H^0.3964',
    note: msg('Validated from newborns to adults; common in paediatrics.'),
    fn: (w, h) => 0.024265 * Math.pow(w, 0.5378) * Math.pow(h, 0.3964),
  },
  'gehan-george': {
    name: msg('Gehan and George'),
    year: 1970,
    expr: '0.0235 × W^0.51456 × H^0.42246',
    note: msg('Refit to 401 direct measurements; Mosteller simplified it to a square root.'),
    fn: (w, h) => 0.0235 * Math.pow(w, 0.51456) * Math.pow(h, 0.42246),
  },
  boyd: {
    name: 'Boyd',
    year: 1935,
    expr: msg('0.0003207 × H^0.3 × Wg^(0.7285 − 0.0188 × log10 Wg), Wg = weight in grams'),
    note: msg('Weight exponent shrinks as weight rises, so it behaves better at the extremes of size.'),
    fn: (w, h) => {
      const g = w * 1000;
      return 0.0003207 * Math.pow(h, 0.3) * Math.pow(g, 0.7285 - 0.0188 * Math.log10(g));
    },
  },
  fujimoto: {
    name: 'Fujimoto',
    year: 1968,
    expr: '0.008883 × W^0.444 × H^0.663',
    note: msg('Derived from Japanese adults.'),
    fn: (w, h) => 0.008883 * Math.pow(w, 0.444) * Math.pow(h, 0.663),
  },
  takahira: {
    name: 'Takahira',
    year: 1925,
    expr: '0.007241 × W^0.425 × H^0.725',
    note: msg('Du Bois exponents with a Japanese-population constant.'),
    fn: (w, h) => 0.007241 * Math.pow(w, 0.425) * Math.pow(h, 0.725),
  },
  'shuter-aslani': {
    name: msg('Shuter and Aslani'),
    year: 2000,
    expr: '0.00949 × W^0.441 × H^0.655',
    note: msg('Refit of the Du Bois equation form to a newer set of measured adults.'),
    fn: (w, h) => 0.00949 * Math.pow(w, 0.441) * Math.pow(h, 0.655),
  },
  schlich: {
    name: 'Schlich',
    year: 2010,
    expr: msg('Women 0.000975482 × W^0.46 × H^1.08; men 0.000579479 × W^0.38 × H^1.24'),
    note: msg('Separate equations for women and men.'),
    fn: (w, h, sex) =>
      sex === 'female'
        ? 0.000975482 * Math.pow(w, 0.46) * Math.pow(h, 1.08)
        : 0.000579479 * Math.pow(w, 0.38) * Math.pow(h, 1.24),
  },
};

export const BSA_ORDER: BsaFormula[] = ['mosteller', 'dubois', 'haycock', 'gehan-george', 'boyd', 'fujimoto', 'takahira', 'shuter-aslani', 'schlich'];

/** BSA in m², or null when inputs are not positive numbers. */
export function bodySurfaceArea(formula: BsaFormula, weightKg: number, heightCm: number, sex: Sex = 'male'): number | null {
  if (!finitePos(weightKg, heightCm)) return null;
  const info = BSA_FORMULAS[formula];
  if (!info) return null;
  const v = info.fn(weightKg, heightCm, sex);
  return Number.isFinite(v) ? v : null;
}

export function allBodySurfaceAreas(weightKg: number, heightCm: number, sex: Sex = 'male') {
  return BSA_ORDER.map((id) => ({ id, ...BSA_FORMULAS[id], bsa: bodySurfaceArea(id, weightKg, heightCm, sex) }));
}

/** Total dose for a per-m² dose (e.g. mg/m²). */
export function doseFromBsa(bsaM2: number, dosePerM2: number): number | null {
  if (!finitePos(bsaM2) || !(Number.isFinite(dosePerM2) && dosePerM2 >= 0)) return null;
  return bsaM2 * dosePerM2;
}

/** Cardiac index (L/min/m²) from cardiac output. */
export function cardiacIndex(cardiacOutputLMin: number, bsaM2: number): number | null {
  if (!finitePos(cardiacOutputLMin, bsaM2)) return null;
  return cardiacOutputLMin / bsaM2;
}

export const bmi = (weightKg: number, heightCm: number) => (finitePos(weightKg, heightCm) ? weightKg / Math.pow(heightCm / 100, 2) : NaN);

/* ------------------------------------------------------------------ */
/* Waist-to-hip and waist-to-height ratio                              */
/* ------------------------------------------------------------------ */

/** WHO (2008) expert consultation cut-offs. */
export const WHO_WHR_CUTOFF: Record<Sex, number> = { male: 0.9, female: 0.85 };
export const WHO_WAIST_CUTOFFS_CM: Record<Sex, { increased: number; substantial: number }> = {
  male: { increased: 94, substantial: 102 },
  female: { increased: 80, substantial: 88 },
};
/** IDF 2006 waist cut-offs for South Asian, Chinese and Japanese adults ("increased" level). */
export const ASIAN_WAIST_CUTOFF_CM: Record<Sex, number> = { male: 90, female: 80 };

export type RiskLevel = 'low' | 'increased' | 'substantially increased';

export function waistHipRatio(waist: number, hip: number): number | null {
  if (!finitePos(waist, hip)) return null;
  return waist / hip;
}

export function waistHeightRatio(waist: number, height: number): number | null {
  if (!finitePos(waist, height)) return null;
  return waist / height;
}

/** WHO 2008: WHR at or above 0.90 (men) or 0.85 (women) means substantially increased metabolic risk. */
export function whrRisk(sex: Sex, whr: number): RiskLevel {
  return whr >= WHO_WHR_CUTOFF[sex] - 1e-12 ? 'substantially increased' : 'low';
}

/** WHO 2008 waist bands: men > 94 / > 102 cm, women > 80 / > 88 cm. Optional Asian (IDF) threshold for "increased". */
export function waistRisk(sex: Sex, waistCm: number, asian = false): RiskLevel {
  const c = WHO_WAIST_CUTOFFS_CM[sex];
  if (waistCm > c.substantial) return 'substantially increased';
  if (asian ? waistCm >= ASIAN_WAIST_CUTOFF_CM[sex] : waistCm > c.increased) return 'increased';
  return 'low';
}

export type WhtrBand = 'below 0.4' | 'healthy' | 'increased' | 'high';

/** NICE (2022) adult bands: 0.4 to 0.49 no increased risk, 0.5 to 0.59 increased, 0.6 or more high. */
export function whtrBand(ratio: number): WhtrBand {
  // Band words are msg()-marked so a step that shows them can translate them.
  if (ratio < 0.4) return msg('below 0.4');
  if (ratio < 0.5) return msg('healthy');
  if (ratio < 0.6) return msg('increased');
  return msg('high');
}

/** Largest waist that keeps waist-to-height under 0.5 (same unit as height). */
export const waistForHalfHeight = (height: number) => height / 2;

/** Waist circumference for a target WHR at the given hip. */
export const waistForWhr = (hip: number, whr: number) => hip * whr;

export function bodyShape(sex: Sex, whr: number): 'apple' | 'pear' {
  return whr >= WHO_WHR_CUTOFF[sex] ? 'apple' : 'pear';
}

/* ------------------------------------------------------------------ */
/* VO2 max                                                             */
/* ------------------------------------------------------------------ */

/** Cooper (1968) 12-minute run: VO2max = (metres − 504.9) / 44.73. */
export function cooperVo2(distanceM: number): number | null {
  if (!finitePos(distanceM)) return null;
  const v = (distanceM - 504.9) / 44.73;
  return v > 0 ? v : null;
}

/** Distance needed in 12 minutes for a target VO2 max. */
export const cooperDistanceFor = (vo2: number) => vo2 * 44.73 + 504.9;

/**
 * Rockport one-mile walk (Kline et al. 1987):
 * 132.853 − 0.0769 × weight(lb) − 0.3877 × age + 6.315 × sex(1 male) − 3.2649 × time(min) − 0.1565 × HR.
 */
export function rockportVo2(input: { sex: Sex; age: number; weightLb: number; minutes: number; heartRate: number }): number | null {
  const { sex, age, weightLb, minutes, heartRate } = input;
  if (!finitePos(age, weightLb, minutes, heartRate)) return null;
  const v = 132.853 - 0.0769 * weightLb - 0.3877 * age + 6.315 * (sex === 'male' ? 1 : 0) - 3.2649 * minutes - 0.1565 * heartRate;
  return v > 0 ? v : null;
}

/** Uth et al. (2004): VO2max ≈ 15.3 × HRmax / HRrest. */
export function heartRateRatioVo2(hrMax: number, hrRest: number): number | null {
  if (!finitePos(hrMax, hrRest) || hrMax <= hrRest) return null;
  return 15.3 * (hrMax / hrRest);
}

/** Tanaka, Monahan and Seals (2001): HRmax = 208 − 0.7 × age. */
export const tanakaHrMax = (age: number) => 208 - 0.7 * age;

/** 1.5-mile run regression: VO2max = 483 / minutes + 3.5. */
export function onePointFiveMileVo2(minutes: number): number | null {
  if (!finitePos(minutes)) return null;
  return 483 / minutes + 3.5;
}

/**
 * Daniels and Gilbert (1979) VDOT from a race: oxygen cost of the race speed
 * divided by the fraction of VO2max sustainable for that duration.
 */
export function danielsVdot(distanceM: number, seconds: number): number | null {
  if (!finitePos(distanceM, seconds)) return null;
  const t = seconds / 60;
  const v = distanceM / t; // m/min
  const vo2 = -4.6 + 0.182258 * v + 0.000104 * v * v;
  const pct = 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);
  const vdot = vo2 / pct;
  return vdot > 0 ? vdot : null;
}

/** Metabolic equivalents: 1 MET = 3.5 mL/kg/min. */
export const vo2ToMets = (vo2: number) => vo2 / 3.5;

/**
 * FRIEND registry 2022 treadmill reference standards (Kaminsky et al., Mayo
 * Clin Proc 2022;97:285-293), as coded in the registry team's FRIENDanalysis
 * package. Values are mL/kg/min at each percentile, ages 20-89.
 */
export const FRIEND_PERCENTILES = [99.8, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50, 45, 40, 35, 30, 25, 20, 15, 10, 5, 0.2];
export const FRIEND_2022_TREADMILL: Record<Sex, Record<number, number[]>> = {
  male: {
    20: [74.7, 62.1, 57.8, 56.0, 54.2, 52.6, 50.9, 49.4, 48.2, 46.9, 45.4, 44.2, 42.8, 41.0, 39.2, 37.3, 34.8, 32.0, 28.8, 24.8, 11.6],
    30: [68.4, 57.9, 54.3, 51.2, 48.7, 46.5, 45.1, 43.5, 41.9, 40.1, 38.6, 37.4, 35.9, 34.3, 32.8, 31.3, 29.4, 27.2, 25.0, 20.6, 7.9],
    40: [64.0, 53.2, 49.5, 46.1, 44.0, 41.8, 40.0, 38.5, 37.2, 36.0, 34.8, 33.4, 32.1, 31.1, 29.7, 28.4, 26.9, 25.4, 22.9, 19.7, 11.2],
    50: [61.5, 46.8, 42.7, 40.1, 37.5, 35.5, 34.1, 32.9, 31.8, 30.7, 29.4, 28.2, 27.2, 26.2, 25.3, 23.9, 22.7, 21.4, 19.2, 16.5, 8.6],
    60: [52.0, 40.2, 36.4, 33.6, 31.6, 29.9, 28.7, 27.6, 26.5, 25.3, 24.4, 23.6, 22.8, 21.8, 20.8, 19.7, 18.6, 17.5, 16.1, 13.8, 7.2],
    70: [44.0, 35.2, 29.6, 27.6, 26.3, 25.0, 23.9, 22.9, 22.3, 21.5, 20.6, 19.9, 19.3, 18.5, 17.6, 16.8, 16.0, 15.0, 13.6, 11.6, 6.5],
    80: [29.7, 25.6, 23.6, 22.3, 21.8, 20.9, 20.4, 19.5, 18.8, 18.3, 17.7, 17.0, 16.7, 16.3, 16.1, 15.9, 15.3, 13.9, 13.2, 12.2, 10.2],
  },
  female: {
    20: [61.7, 50.1, 47.3, 45.4, 44.1, 42.2, 41.2, 39.6, 38.0, 36.8, 35.6, 34.2, 32.7, 31.3, 29.9, 28.6, 26.6, 24.5, 22.2, 19.3, 12.4],
    30: [56.1, 45.5, 41.1, 38.4, 36.2, 34.5, 33.3, 31.9, 30.7, 29.4, 28.3, 27.3, 26.4, 25.4, 24.3, 23.1, 22.1, 20.7, 19.2, 16.6, 11.4],
    40: [54.6, 40.7, 37.5, 34.7, 32.8, 30.9, 29.8, 28.6, 27.7, 26.6, 25.9, 24.9, 24.2, 23.2, 22.2, 21.3, 20.0, 19.0, 17.4, 15.3, 10.7],
    50: [47.1, 35.3, 31.8, 30.0, 28.4, 27.3, 26.4, 25.5, 24.7, 23.7, 23.1, 22.3, 21.7, 21.0, 20.3, 19.5, 18.7, 17.6, 16.6, 14.5, 7.9],
    60: [40.1, 29.7, 27.3, 25.5, 24.1, 23.1, 22.2, 21.6, 20.8, 20.1, 19.4, 18.8, 18.3, 17.7, 17.0, 16.4, 15.5, 14.7, 13.5, 12.0, 8.2],
    70: [32.0, 24.2, 22.8, 21.4, 20.6, 20.0, 19.2, 18.8, 18.2, 17.7, 17.1, 16.7, 16.1, 15.7, 15.3, 14.8, 14.1, 13.7, 12.3, 11.3, 7.4],
    80: [45.1, 20.7, 19.9, 18.5, 18.0, 17.2, 16.6, 15.8, 15.5, 15.3, 15.1, 14.6, 14.3, 13.8, 13.4, 12.8, 12.4, 11.9, 11.4, 10.7, 9.0],
  },
};

export const ageDecade = (age: number) => Math.min(80, Math.max(20, Math.floor(age / 10) * 10));

/** Approximate FRIEND percentile (linear between table rows), or null outside ages 20-89. */
export function friendPercentile(vo2: number, age: number, sex: Sex): number | null {
  if (!Number.isFinite(vo2) || !(age >= 20 && age < 90)) return null;
  const row = FRIEND_2022_TREADMILL[sex][ageDecade(age)];
  // row is descending in VO2 with descending percentile
  if (vo2 >= row[0]) return 99.8;
  if (vo2 <= row[row.length - 1]) return 0.2;
  for (let i = 0; i < row.length - 1; i++) {
    const hi = row[i];
    const lo = row[i + 1];
    if (vo2 <= hi && vo2 >= lo) {
      const f = hi === lo ? 0 : (vo2 - lo) / (hi - lo);
      return FRIEND_PERCENTILES[i + 1] + f * (FRIEND_PERCENTILES[i] - FRIEND_PERCENTILES[i + 1]);
    }
  }
  return null;
}

/** VO2 at a given FRIEND percentile row (one of FRIEND_PERCENTILES) for an age and sex. */
export function friendValueAt(percentile: number, age: number, sex: Sex): number | null {
  const i = FRIEND_PERCENTILES.indexOf(percentile);
  if (i < 0 || !(age >= 20 && age < 90)) return null;
  return FRIEND_2022_TREADMILL[sex][ageDecade(age)][i];
}

export type FitnessBand = 'Low' | 'Below average' | 'Average' | 'Above average' | 'High';

/** Plain-language band from a percentile (our labels, by quintile). */
export function fitnessBand(percentile: number): FitnessBand {
  if (percentile < 20) return msg('Low');
  if (percentile < 40) return msg('Below average');
  if (percentile < 60) return msg('Average');
  if (percentile < 80) return msg('Above average');
  return msg('High');
}

/* ------------------------------------------------------------------ */
/* Blood pressure                                                      */
/* ------------------------------------------------------------------ */

export type BpReading = { sys: number; dia: number; pulse?: number };

export type AccAhaCategory = 'normal' | 'elevated' | 'stage1' | 'stage2' | 'severe';
export const ACC_AHA_LABELS: Record<AccAhaCategory, string> = {
  normal: 'Normal',
  elevated: msg('Elevated'),
  stage1: msg('Stage 1 hypertension'),
  stage2: msg('Stage 2 hypertension'),
  severe: msg('Severe (hypertensive crisis range)'),
};
export const ACC_AHA_RANGES: { id: AccAhaCategory; sys: string; join: 'and' | 'or'; dia: string }[] = [
  { id: 'normal', sys: msg('below 120'), join: msg('and'), dia: msg('below 80') },
  { id: 'elevated', sys: msg('120 to 129'), join: msg('and'), dia: msg('below 80') },
  { id: 'stage1', sys: msg('130 to 139'), join: msg('or'), dia: msg('80 to 89') },
  { id: 'stage2', sys: msg('140 or higher'), join: msg('or'), dia: msg('90 or higher') },
  { id: 'severe', sys: msg('higher than 180'), join: msg('or'), dia: msg('higher than 120') },
];

/** 2017 ACC/AHA categories (kept in the 2025 AHA/ACC guideline). The higher category wins. */
export function classifyAccAha(sys: number, dia: number): AccAhaCategory {
  if (sys > 180 || dia > 120) return 'severe';
  if (sys >= 140 || dia >= 90) return 'stage2';
  if (sys >= 130 || dia >= 80) return 'stage1';
  if (sys >= 120) return 'elevated';
  return 'normal';
}

export type EshCategory = 'optimal' | 'normal' | 'high-normal' | 'grade1' | 'grade2' | 'grade3' | 'isolated-systolic' | 'isolated-diastolic';
export const ESH_LABELS: Record<EshCategory, string> = {
  optimal: msg('Optimal'),
  normal: 'Normal',
  'high-normal': msg('High normal'),
  grade1: msg('Grade 1 hypertension'),
  grade2: msg('Grade 2 hypertension'),
  grade3: msg('Grade 3 hypertension'),
  'isolated-systolic': msg('Isolated systolic hypertension'),
  'isolated-diastolic': msg('Isolated diastolic hypertension'),
};
export const ESH_RANGES: { id: EshCategory; sys: string; join: 'and' | 'and/or'; dia: string }[] = [
  { id: 'optimal', sys: msg('below 120'), join: msg('and'), dia: msg('below 80') },
  { id: 'normal', sys: msg('120 to 129'), join: msg('and/or'), dia: msg('80 to 84') },
  { id: 'high-normal', sys: msg('130 to 139'), join: msg('and/or'), dia: msg('85 to 89') },
  { id: 'grade1', sys: msg('140 to 159'), join: msg('and/or'), dia: msg('90 to 99') },
  { id: 'grade2', sys: msg('160 to 179'), join: msg('and/or'), dia: msg('100 to 109') },
  { id: 'grade3', sys: msg('180 or higher'), join: msg('and/or'), dia: msg('110 or higher') },
  { id: 'isolated-systolic', sys: msg('140 or higher'), join: msg('and'), dia: msg('below 90') },
  { id: 'isolated-diastolic', sys: msg('below 140'), join: msg('and'), dia: msg('90 or higher') },
];

/**
 * 2023 ESH (and 2018 ESC/ESH) office categories. Returns the grade from the
 * higher of the two pressures, plus an isolated systolic or diastolic flag.
 */
export function classifyEsh(sys: number, dia: number): { grade: EshCategory; isolated: EshCategory | null } {
  const sysLevel = sys >= 180 ? 5 : sys >= 160 ? 4 : sys >= 140 ? 3 : sys >= 130 ? 2 : sys >= 120 ? 1 : 0;
  const diaLevel = dia >= 110 ? 5 : dia >= 100 ? 4 : dia >= 90 ? 3 : dia >= 85 ? 2 : dia >= 80 ? 1 : 0;
  const order: EshCategory[] = ['optimal', 'normal', 'high-normal', 'grade1', 'grade2', 'grade3'];
  const grade = order[Math.max(sysLevel, diaLevel)];
  const isolated: EshCategory | null = sys >= 140 && dia < 90 ? 'isolated-systolic' : sys < 140 && dia >= 90 ? 'isolated-diastolic' : null;
  return { grade, isolated };
}

/**
 * The guideline a reading is classified by, and whether it was taken in a
 * clinic (office) or at home. ACC/AHA (US) is the default; NICE NG136 (UK)
 * has separate home thresholds; Hypertension Canada 2025 uses 130/80 for
 * standardised office and out-of-office readings alike; ESH 2023 grades are
 * office grades.
 */
export type BpGuideline = 'acc-aha' | 'nice' | 'hc' | 'esh';
export type BpSetting = 'clinic' | 'home';
/** 0 = below the guideline's threshold ... 4 = severe. Drives the colour. */
export type BpTone = 0 | 1 | 2 | 3 | 4;
export type BpBand = { id: string; label: string; tone: BpTone; sys: string; join: string; dia: string; advice?: string };

export const BP_GUIDELINES: Record<BpGuideline, { name: string; short: string; homeAware: boolean; note: string }> = {
  'acc-aha': { name: msg('ACC/AHA (US)'), short: 'ACC/AHA', homeAware: false, note: msg('ACC/AHA adult categories (2017, kept in the 2025 guideline). If the two numbers fall in different rows, the higher row applies.') },
  nice: { name: msg('NICE NG136 (UK)'), short: 'NICE', homeAware: true, note: msg('NICE NG136 stages. Clinic and home (or ambulatory daytime) averages have different thresholds. If the two numbers fall in different rows, the higher row applies.') },
  hc: { name: msg('Hypertension Canada 2025'), short: 'Hypertension Canada', homeAware: false, note: msg('Hypertension Canada 2025: 130/80 or higher on standardised office readings or home or ambulatory averages. If the two numbers fall in different rows, the higher row applies.') },
  esh: { name: msg('ESH 2023 (Europe)'), short: 'ESH 2023', homeAware: false, note: msg('ESH 2023 office grades. If the two numbers fall in different rows, the higher row applies.') },
};

const TONE_OF: Record<AccAhaCategory, BpTone> = { normal: 0, elevated: 1, stage1: 2, stage2: 3, severe: 4 };
const ESH_TONE: Partial<Record<EshCategory, BpTone>> = { optimal: 0, normal: 0, 'high-normal': 1, grade1: 2, grade2: 3, grade3: 4 };

const NICE_CLINIC: BpBand[] = [
  { id: 'below', label: msg('Below the NICE threshold'), tone: 0, sys: msg('below 140'), join: msg('and'), dia: msg('below 90'), advice: msg('Below the clinic level at which NICE looks for hypertension. NICE suggests a clinic check at least every 5 years, or more often if your reading is close to 140/90.') },
  { id: 'stage1', label: msg('Stage 1 hypertension range'), tone: 2, sys: msg('140 to 159'), join: msg('or'), dia: msg('90 to 99'), advice: msg('NICE confirms a clinic reading of 140/90 or more with home or ambulatory monitoring before diagnosing. Ask your GP practice or pharmacy about home monitoring.') },
  { id: 'stage2', label: msg('Stage 2 hypertension range'), tone: 3, sys: msg('160 to 179'), join: msg('or'), dia: msg('100 to 119'), advice: msg('NICE confirms this with home or ambulatory monitoring and, if confirmed, offers medication alongside lifestyle advice. Book an appointment with your GP.') },
  { id: 'severe', label: msg('Stage 3 or severe hypertension'), tone: 4, sys: msg('180 or higher'), join: msg('or'), dia: msg('120 or higher') },
];
const NICE_HOME: BpBand[] = [
  { id: 'below', label: msg('Below the NICE home threshold'), tone: 0, sys: msg('below 135'), join: msg('and'), dia: msg('below 85'), advice: msg('A home average below 135/85 does not confirm hypertension under NICE. Share the readings with your GP if your clinic reading was high.') },
  { id: 'stage1', label: msg('Stage 1 hypertension range (home)'), tone: 2, sys: msg('135 to 149'), join: msg('or'), dia: msg('85 to 94'), advice: msg('With a clinic reading of 140/90 or more, a home average in this range confirms stage 1 hypertension under NICE. Your GP will discuss lifestyle changes and, depending on your risk, medication.') },
  { id: 'stage2', label: msg('Stage 2 hypertension range (home)'), tone: 3, sys: msg('150 or higher'), join: msg('or'), dia: msg('95 or higher'), advice: msg('With a clinic reading of 160/100 or more, a home average in this range confirms stage 2 hypertension under NICE. Arrange to see your GP.') },
];
const HC_BANDS: BpBand[] = [
  { id: 'below', label: msg('Below the hypertension threshold'), tone: 0, sys: msg('below 130'), join: msg('and'), dia: msg('below 80'), advice: msg('Below 130/80, the Hypertension Canada threshold. Keep checking at least yearly, or when you visit a clinic or pharmacy.') },
  { id: 'htn', label: msg('Hypertension range (130/80 or higher)'), tone: 2, sys: msg('130 to 139'), join: msg('or'), dia: msg('80 to 89'), advice: msg('Hypertension Canada defines hypertension from 130/80 once confirmed out of the office. Medication is recommended when the systolic is 130 to 139 and cardiovascular risk is high (for example diabetes, kidney disease, heart disease or age 75 or over); lifestyle changes help everyone.') },
  { id: 'treat', label: msg('Hypertension, medication threshold (140/90 or higher)'), tone: 3, sys: msg('140 or higher'), join: msg('or'), dia: msg('90 or higher'), advice: msg('Once confirmed, Hypertension Canada recommends starting medication at 140/90 or higher, with a target systolic below 130. Book an appointment with your doctor or nurse practitioner.') },
];

/** The rows of a guideline's table for this setting. */
export function bpBands(g: BpGuideline, setting: BpSetting = 'clinic'): BpBand[] {
  if (g === 'nice') return setting === 'home' ? NICE_HOME : NICE_CLINIC;
  if (g === 'hc') return HC_BANDS;
  if (g === 'esh') return ESH_RANGES.filter((r) => ESH_TONE[r.id] !== undefined).map((r) => ({ id: r.id, label: ESH_LABELS[r.id], tone: ESH_TONE[r.id]!, sys: r.sys, join: r.join, dia: r.dia }));
  return ACC_AHA_RANGES.map((r) => ({ id: r.id, label: ACC_AHA_LABELS[r.id], tone: TONE_OF[r.id], sys: r.sys, join: r.join, dia: r.dia }));
}

/** Classify a (rounded) reading by a guideline; the higher of the systolic and diastolic rows applies. */
export function classifyBpGuideline(g: BpGuideline, setting: BpSetting, sys: number, dia: number): BpBand {
  const bands = bpBands(g, setting);
  const pick = (id: string) => bands.find((b) => b.id === id)!;
  if (g === 'acc-aha') return pick(classifyAccAha(sys, dia));
  if (g === 'esh') return pick(classifyEsh(sys, dia).grade);
  if (g === 'hc') return pick(sys >= 140 || dia >= 90 ? 'treat' : sys >= 130 || dia >= 80 ? 'htn' : 'below');
  if (setting === 'home') return pick(sys >= 150 || dia >= 95 ? 'stage2' : sys >= 135 || dia >= 85 ? 'stage1' : 'below');
  return pick(sys >= 180 || dia >= 120 ? 'severe' : sys >= 160 || dia >= 100 ? 'stage2' : sys >= 140 || dia >= 90 ? 'stage1' : 'below');
}

export const asBpGuideline = (v: string): BpGuideline => (v in BP_GUIDELINES ? (v as BpGuideline) : 'acc-aha');

/** Mean arterial pressure, the usual one-third formula. */
export const meanArterialPressure = (sys: number, dia: number) => dia + (sys - dia) / 3;
export const pulsePressure = (sys: number, dia: number) => sys - dia;
/** Below 90/60 is the usual description of low blood pressure. */
export const isLowBp = (sys: number, dia: number) => sys < 90 || dia < 60;

export function validateReading(r: BpReading): string | null {
  if (!Number.isFinite(r.sys) || !Number.isFinite(r.dia)) return msg('Enter both numbers.');
  if (r.sys < 60 || r.sys > 300) return msg('Systolic should be between 60 and 300 mmHg.');
  if (r.dia < 30 || r.dia > 200) return msg('Diastolic should be between 30 and 200 mmHg.');
  if (r.sys <= r.dia) return msg('Systolic (top number) must be higher than diastolic.');
  if (r.pulse !== undefined && (!Number.isFinite(r.pulse) || r.pulse < 25 || r.pulse > 250)) return msg('Pulse should be between 25 and 250 bpm.');
  return null;
}

/**
 * Parse one reading per line: "128/82", "128/82 71", "128 82", "128/82/71",
 * with optional text after a # or a comma. Blank lines are ignored.
 */
export function parseReadings(text: string): { readings: BpReading[]; errors: { line: number; text: string; error: string }[] } {
  const readings: BpReading[] = [];
  const errors: { line: number; text: string; error: string }[] = [];
  text.split(/\r?\n/).forEach((raw, idx) => {
    const line = raw.split('#')[0].trim();
    if (!line) return;
    const nums = (line.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
    if (nums.length < 2) {
      errors.push({ line: idx + 1, text: raw, error: msg('Expected systolic/diastolic, e.g. 128/82.') });
      return;
    }
    const r: BpReading = { sys: nums[0], dia: nums[1] };
    if (nums.length >= 3) r.pulse = nums[2];
    const err = validateReading(r);
    if (err) errors.push({ line: idx + 1, text: raw, error: err });
    else readings.push(r);
  });
  return { readings, errors };
}

export type BpSummary = {
  count: number;
  used: number;
  sys: number;
  dia: number;
  pulse: number | null;
  map: number;
  pulsePressure: number;
  accAha: AccAhaCategory;
  esh: { grade: EshCategory; isolated: EshCategory | null };
  low: boolean;
  minSys: number;
  maxSys: number;
  minDia: number;
  maxDia: number;
};

/** Average readings (optionally discarding the first, as ESH advises) and classify the average. */
export function summariseReadings(readings: BpReading[], dropFirst = false): BpSummary | null {
  const list = dropFirst && readings.length > 1 ? readings.slice(1) : readings;
  if (list.length === 0) return null;
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const sys = avg(list.map((r) => r.sys));
  const dia = avg(list.map((r) => r.dia));
  const pulses = list.map((r) => r.pulse).filter((p): p is number => typeof p === 'number');
  return {
    count: readings.length,
    used: list.length,
    sys,
    dia,
    pulse: pulses.length ? avg(pulses) : null,
    map: meanArterialPressure(sys, dia),
    pulsePressure: pulsePressure(sys, dia),
    // Guidelines classify the rounded average.
    accAha: classifyAccAha(Math.round(sys), Math.round(dia)),
    esh: classifyEsh(Math.round(sys), Math.round(dia)),
    low: isLowBp(sys, dia),
    minSys: Math.min(...list.map((r) => r.sys)),
    maxSys: Math.max(...list.map((r) => r.sys)),
    minDia: Math.min(...list.map((r) => r.dia)),
    maxDia: Math.max(...list.map((r) => r.dia)),
  };
}

/* ------------------------------------------------------------------ */
/* Steps                                                               */
/* ------------------------------------------------------------------ */

/** Walking step length rule of thumb: height × 0.415 (men) or 0.413 (women). */
export const WALK_STEP_FACTOR: Record<Sex, number> = { male: 0.415, female: 0.413 };

export function stepLengthFromHeight(heightCm: number, sex: Sex): number | null {
  if (!finitePos(heightCm)) return null;
  return heightCm * WALK_STEP_FACTOR[sex];
}

/** Step length (cm) from speed (km/h) and cadence (steps per minute). */
export function stepLengthFromCadence(speedKmh: number, cadenceSpm: number): number | null {
  if (!finitePos(speedKmh, cadenceSpm)) return null;
  return ((speedKmh * 1000) / 60 / cadenceSpm) * 100;
}

/** Step length (cm) measured by counting steps over a known distance (metres). */
export function stepLengthFromCount(distanceM: number, steps: number): number | null {
  if (!finitePos(distanceM, steps)) return null;
  return (distanceM / steps) * 100;
}

export const stepsToKm = (steps: number, stepCm: number) => (steps * stepCm) / 100000;
export const kmToSteps = (km: number, stepCm: number) => (km * 100000) / stepCm;
export const stepsPerKm = (stepCm: number) => 100000 / stepCm;
export const stepsPerMile = (stepCm: number) => (M_PER_MILE * 100) / stepCm;

export type Gait = 'walk' | 'run';

/**
 * ACSM metabolic equations, VO2 in mL/kg/min with speed S in m/min and grade G as a fraction:
 * walking 3.5 + 0.1 S + 1.8 S G, running 3.5 + 0.2 S + 0.9 S G.
 */
export function acsmVo2(gait: Gait, speedMPerMin: number, gradePct = 0): number {
  const g = gradePct / 100;
  return gait === 'walk' ? 3.5 + 0.1 * speedMPerMin + 1.8 * speedMPerMin * g : 3.5 + 0.2 * speedMPerMin + 0.9 * speedMPerMin * g;
}

/**
 * Energy for covering a distance at a steady speed, using 5 kcal per litre of oxygen.
 * Gross includes resting metabolism (3.5 mL/kg/min); net is the extra cost of moving.
 */
export function stepCalories(input: { gait: Gait; km: number; speedKmh: number; weightKg: number; gradePct?: number }) {
  const { gait, km, speedKmh, weightKg, gradePct = 0 } = input;
  if (!finitePos(km, speedKmh, weightKg)) return null;
  const s = (speedKmh * 1000) / 60;
  const minutes = (km / speedKmh) * 60;
  const vo2 = acsmVo2(gait, s, gradePct);
  const gross = (vo2 * weightKg * minutes) / 1000 * 5;
  const net = ((vo2 - 3.5) * weightKg * minutes) / 1000 * 5;
  return { minutes, vo2, mets: vo2 / 3.5, grossKcal: gross, netKcal: Math.max(0, net) };
}

/** ACSM equation validity: walking 50-100 m/min (3 to 6 km/h), running above 134 m/min (8 km/h). */
export function acsmSpeedWarning(gait: Gait, speedKmh: number): string | null {
  const s = (speedKmh * 1000) / 60;
  if (gait === 'walk' && (s < 50 || s > 100)) return msg('The ACSM walking equation is validated for about 3 to 6 km/h (1.9 to 3.7 mph).');
  if (gait === 'run' && s < 134) return msg('The ACSM running equation is meant for speeds above about 8 km/h (5 mph); below that, treat it as a rough figure.');
  return null;
}

/* ------------------------------------------------------------------ */
/* Intermittent fasting                                                */
/* ------------------------------------------------------------------ */

export type FastingProtocol = { id: string; label: string; fastHours: number; note: string };

export const FASTING_PROTOCOLS: FastingProtocol[] = [
  { id: '12:12', label: '12:12', fastHours: 12, note: msg('Overnight fast; a gentle starting point.') },
  { id: '14:10', label: '14:10', fastHours: 14, note: msg('A common step up from 12:12.') },
  { id: '16:8', label: '16:8', fastHours: 16, note: msg('The most studied time-restricted eating pattern.') },
  { id: '18:6', label: '18:6', fastHours: 18, note: msg('Six-hour eating window.') },
  { id: '20:4', label: '20:4', fastHours: 20, note: msg('Four-hour window, sometimes called the Warrior pattern.') },
  { id: 'omad', label: msg('OMAD (23:1)'), fastHours: 23, note: msg('One meal a day inside about an hour.') },
];

export function protocolById(id: string): FastingProtocol | undefined {
  return FASTING_PROTOCOLS.find((p) => p.id === id);
}

const HOUR = 3600 * 1000;

export type FastingStatus = {
  phase: 'fasting' | 'eating' | 'past-window';
  fastEndMs: number;
  windowEndMs: number;
  elapsedMs: number;
  /** Time left in the current phase (fast or eating window); 0 once past the window. */
  remainingMs: number;
  /** Fraction of the fast completed, 0 to 1. */
  fastProgress: number;
};

/**
 * Where a fast stands. The fast starts at startMs (end of the last meal),
 * lasts fastHours, then the eating window lasts 24 − fastHours.
 */
export function fastingStatus(startMs: number, fastHours: number, nowMs: number): FastingStatus | null {
  if (!Number.isFinite(startMs) || !Number.isFinite(nowMs) || !(fastHours > 0 && fastHours <= 72)) return null;
  const eatHours = Math.max(0, 24 - fastHours);
  const fastEndMs = startMs + fastHours * HOUR;
  const windowEndMs = fastEndMs + eatHours * HOUR;
  const elapsedMs = Math.max(0, nowMs - startMs);
  const fastProgress = Math.min(1, elapsedMs / (fastHours * HOUR));
  if (nowMs < fastEndMs) return { phase: 'fasting', fastEndMs, windowEndMs, elapsedMs, remainingMs: fastEndMs - Math.max(nowMs, startMs), fastProgress };
  if (nowMs < windowEndMs) return { phase: 'eating', fastEndMs, windowEndMs, elapsedMs, remainingMs: windowEndMs - nowMs, fastProgress };
  return { phase: 'past-window', fastEndMs, windowEndMs, elapsedMs, remainingMs: 0, fastProgress };
}

/** "HH:MM" (24 h) to minutes after midnight, or null. */
export function parseClock(text: string): number | null {
  const m = /^\s*(\d{1,2})[:.h](\d{2})\s*$/.exec(text);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Minutes after midnight (may exceed a day) to "HH:MM" plus a day offset. */
export function formatClock(minutes: number): { time: string; dayOffset: number } {
  const total = Math.round(minutes);
  const dayOffset = Math.floor(total / 1440);
  const m = ((total % 1440) + 1440) % 1440;
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return { time: `${hh}:${mm}`, dayOffset };
}

/** Duration in ms to "h:mm:ss" (hours may exceed 24). */
export function formatDurationMs(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/**
 * Daily plan from the time the eating window opens: when to stop eating,
 * when the fast ends, as clock times (minutes after midnight, can pass 24 h).
 */
export function dailyFastingPlan(windowStartMin: number, fastHours: number) {
  if (!Number.isFinite(windowStartMin) || !(fastHours > 0 && fastHours < 24)) return null;
  const eatMinutes = (24 - fastHours) * 60;
  const windowEnd = windowStartMin + eatMinutes;
  const fastEnd = windowEnd + fastHours * 60; // next day's window start
  return { windowStart: windowStartMin, windowEnd, fastStart: windowEnd, fastEnd, eatHours: 24 - fastHours };
}

/** From the time of the last meal (minutes after midnight): when the fast ends and the window closes. */
export function fastFromLastMeal(lastMealMin: number, fastHours: number) {
  if (!Number.isFinite(lastMealMin) || !(fastHours > 0 && fastHours <= 72)) return null;
  const fastEnd = lastMealMin + fastHours * 60;
  const windowEnd = fastEnd + Math.max(0, 24 - fastHours) * 60;
  return { fastEnd, windowEnd };
}

/** "h:mm:ss", "mm:ss" or plain minutes ("12.5") to seconds, or null. */
export function parseTime(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  if (/^\d+(\.\d+)?$/.test(t)) {
    const v = Number(t) * 60;
    return v > 0 ? v : null;
  }
  const parts = t.split(':');
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
  const nums = parts.map(Number);
  if (nums.slice(1).some((n) => n >= 60)) return null;
  const s = nums.length === 3 ? nums[0] * 3600 + nums[1] * 60 + nums[2] : nums[0] * 60 + nums[1];
  return s > 0 ? s : null;
}
