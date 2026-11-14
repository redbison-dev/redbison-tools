/**
 * Parallel key selection and length for a keyed shaft-hub joint.
 *
 * Key size by shaft diameter:
 *   inch:   ASME B17.1-1967 (S2023, stabilized) "Key size versus shaft diameter", square and
 *           rectangular keys for shafts over 5/16 in up to 6 1/2 in
 *           (square keys are the preferred choice in that range).
 *   metric: DIN 6885-1 parallel keys, deep pattern (same b × h as ISO 773), shafts
 *           over 6 mm up to 500 mm, with keyseat depths t1 (shaft) and t2 (hub)
 *           and the standard length range of each size.
 *
 * Strength (Budynas and Nisbett, Shigley's Mechanical Engineering Design,
 * 11th ed., sec. 7-7 and Example 7-6):
 *   F = 2 T / d                    force at the shaft surface
 *   shear:    L = F n / (0.577 Sy,key · w)      (distortion-energy Ssy = 0.577 Sy)
 *   crushing: L = F n / (Sy · hb)               on the bearing height hb, using the
 *                                                weakest of key, shaft and hub
 *   hb = h/2 for ASME B17.1 (keyseat cut half the key height into shaft and hub);
 *   hb = h − t1 for DIN 6885-1, the part of the key that projects into the hub
 *   (the keyseat is deeper in the shaft; this is the hub-side bearing height
 *   used by DIN 6892).
 *
 * A DIN 6885 form A key has round ends and bears only on l − b; with
 * roundEnds the length l is chosen so that l − b meets the requirement.
 *
 * Units: 'si' = N·m, mm, MPa; 'us' = lbf·in, in, kpsi.
 */
import { msg, built } from '../../msg';

export type KeyUnits = 'si' | 'us';

export type InchKeyRow = { over: number; to: number; range: string; w: number; wLabel: string; hSquare: number; hRect: number | null; hRectLabel: string | null };

const f = (s: string): number => {
  // "1-3/4" or "3/8" or "1"
  const [whole, frac] = s.includes('-') ? s.split('-') : s.includes('/') ? ['0', s] : [s, '0/1'];
  const [a, b] = frac.split('/').map(Number);
  return Number(whole) + a / b;
};

const inchRow = (over: string, to: string, w: string, hRect: string | null): InchKeyRow => ({
  over: f(over),
  to: f(to),
  range: built(msg('over {from} to {to} {unit}'), { from: over, to, unit: 'in' }),
  w: f(w),
  wLabel: w,
  hSquare: f(w),
  hRect: hRect ? f(hRect) : null,
  hRectLabel: hRect,
});

/** ASME B17.1 key size versus shaft diameter, inches. */
export const ASME_B17_1_KEYS: InchKeyRow[] = [
  inchRow('5/16', '7/16', '3/32', null),
  inchRow('7/16', '9/16', '1/8', '3/32'),
  inchRow('9/16', '7/8', '3/16', '1/8'),
  inchRow('7/8', '1-1/4', '1/4', '3/16'),
  inchRow('1-1/4', '1-3/8', '5/16', '1/4'),
  inchRow('1-3/8', '1-3/4', '3/8', '1/4'),
  inchRow('1-3/4', '2-1/4', '1/2', '3/8'),
  inchRow('2-1/4', '2-3/4', '5/8', '7/16'),
  inchRow('2-3/4', '3-1/4', '3/4', '1/2'),
  inchRow('3-1/4', '3-3/4', '7/8', '5/8'),
  inchRow('3-3/4', '4-1/2', '1', '3/4'),
  inchRow('4-1/2', '5-1/2', '1-1/4', '7/8'),
  inchRow('5-1/2', '6-1/2', '1-1/2', '1'),
];

export type MetricKeyRow = { over: number; to: number; b: number; h: number; t1: number; t2: number; lMin: number; lMax: number };

/** DIN 6885-1 parallel keys, mm: shaft range, b × h, shaft depth t1, hub depth t2, length range. */
export const DIN_6885_KEYS: MetricKeyRow[] = [
  { over: 6, to: 8, b: 2, h: 2, t1: 1.2, t2: 1.0, lMin: 6, lMax: 20 },
  { over: 8, to: 10, b: 3, h: 3, t1: 1.8, t2: 1.4, lMin: 6, lMax: 36 },
  { over: 10, to: 12, b: 4, h: 4, t1: 2.5, t2: 1.8, lMin: 8, lMax: 45 },
  { over: 12, to: 17, b: 5, h: 5, t1: 3.0, t2: 2.3, lMin: 10, lMax: 56 },
  { over: 17, to: 22, b: 6, h: 6, t1: 3.5, t2: 2.8, lMin: 14, lMax: 70 },
  { over: 22, to: 30, b: 8, h: 7, t1: 4.0, t2: 3.3, lMin: 18, lMax: 90 },
  { over: 30, to: 38, b: 10, h: 8, t1: 5.0, t2: 3.3, lMin: 22, lMax: 110 },
  { over: 38, to: 44, b: 12, h: 8, t1: 5.0, t2: 3.3, lMin: 28, lMax: 140 },
  { over: 44, to: 50, b: 14, h: 9, t1: 5.5, t2: 3.8, lMin: 36, lMax: 160 },
  { over: 50, to: 58, b: 16, h: 10, t1: 6.0, t2: 4.3, lMin: 45, lMax: 180 },
  { over: 58, to: 65, b: 18, h: 11, t1: 7.0, t2: 4.4, lMin: 50, lMax: 200 },
  { over: 65, to: 75, b: 20, h: 12, t1: 7.5, t2: 4.9, lMin: 56, lMax: 220 },
  { over: 75, to: 85, b: 22, h: 14, t1: 9.0, t2: 5.4, lMin: 63, lMax: 250 },
  { over: 85, to: 95, b: 25, h: 14, t1: 9.0, t2: 5.4, lMin: 70, lMax: 280 },
  { over: 95, to: 110, b: 28, h: 16, t1: 10.0, t2: 6.4, lMin: 80, lMax: 320 },
  { over: 110, to: 130, b: 32, h: 18, t1: 11.0, t2: 7.4, lMin: 90, lMax: 360 },
  { over: 130, to: 150, b: 36, h: 20, t1: 12.0, t2: 8.4, lMin: 100, lMax: 400 },
  { over: 150, to: 170, b: 40, h: 22, t1: 13.0, t2: 9.4, lMin: 100, lMax: 400 },
  { over: 170, to: 200, b: 45, h: 25, t1: 15.0, t2: 10.4, lMin: 110, lMax: 450 },
  { over: 200, to: 230, b: 50, h: 28, t1: 17.0, t2: 11.4, lMin: 125, lMax: 500 },
  { over: 230, to: 260, b: 56, h: 32, t1: 20.0, t2: 12.4, lMin: 140, lMax: 500 },
  { over: 260, to: 290, b: 63, h: 32, t1: 20.0, t2: 12.4, lMin: 160, lMax: 500 },
  { over: 290, to: 330, b: 70, h: 36, t1: 22.0, t2: 14.4, lMin: 180, lMax: 500 },
  { over: 330, to: 380, b: 80, h: 40, t1: 25.0, t2: 15.4, lMin: 200, lMax: 500 },
  { over: 380, to: 440, b: 90, h: 45, t1: 28.0, t2: 17.4, lMin: 220, lMax: 500 },
  { over: 440, to: 500, b: 100, h: 50, t1: 31.0, t2: 19.5, lMin: 250, lMax: 500 },
];

/** DIN 6885 standard key lengths, mm. */
export const DIN_6885_LENGTHS = [6, 8, 10, 12, 14, 16, 18, 20, 22, 25, 28, 32, 36, 40, 45, 50, 56, 63, 70, 80, 90, 100, 110, 125, 140, 160, 180, 200, 220, 250, 280, 320, 360, 400, 450, 500];

export type KeyForm = 'square' | 'rectangular';

export type SelectedKey = {
  units: KeyUnits;
  /** Shaft range, as printed. */
  range: string;
  /** Key width w (b). */
  w: number;
  /** Key height h. */
  h: number;
  /** Labels for the inch fractions ("3/8"), or mm values as text. */
  label: string;
  /** Keyseat depth in the shaft and in the hub. Inch: H/2 each (B17.1, at the side wall). Metric: t1 and t2. */
  shaftDepth: number;
  hubDepth: number;
  /** Height of the key face bearing on the hub: h/2 (B17.1) or h − t1 (DIN 6885-1). */
  bearingHeight: number;
  /** DIN 6885 length range (metric only). */
  lMin: number | null;
  lMax: number | null;
  standard: 'ASME B17.1' | 'DIN 6885-1';
  form: KeyForm;
};

export function selectKey(d: number, units: KeyUnits, form: KeyForm = 'square'): SelectedKey {
  if (!(d > 0)) throw new Error(msg('Shaft diameter must be greater than zero.'));
  if (units === 'us') {
    const row = ASME_B17_1_KEYS.find((r) => d > r.over && d <= r.to + 1e-9);
    if (!row) throw new Error(msg('ASME B17.1 sizes here cover shafts over 5/16 in up to 6 1/2 in. For larger shafts use the standard directly.'));
    if (form === 'rectangular' && row.hRect === null) throw new Error(msg('ASME B17.1 lists only a square key for shafts up to 7/16 in.'));
    const h = form === 'square' ? row.hSquare : (row.hRect as number);
    const hLabel = form === 'square' ? row.wLabel : (row.hRectLabel as string);
    return { units, range: row.range, w: row.w, h, label: `${row.wLabel} × ${hLabel} in`, shaftDepth: h / 2, hubDepth: h / 2, bearingHeight: h / 2, lMin: null, lMax: null, standard: 'ASME B17.1', form };
  }
  const row = DIN_6885_KEYS.find((r) => d > r.over && d <= r.to + 1e-9);
  if (!row) throw new Error(msg('DIN 6885-1 covers shafts over 6 mm up to 500 mm.'));
  return { units, range: built(msg('over {from} to {to} {unit}'), { from: row.over, to: row.to, unit: 'mm' }), w: row.b, h: row.h, label: `${row.b} × ${row.h} mm`, shaftDepth: row.t1, hubDepth: row.t2, bearingHeight: Number((row.h - row.t1).toFixed(3)), lMin: row.lMin, lMax: row.lMax, standard: 'DIN 6885-1', form: row.b === row.h ? 'square' : 'rectangular' };
}

export type KeyLengthInput = {
  /** Torque (N·m or lbf·in). */
  torque: number;
  /** Shaft diameter (mm or in). */
  d: number;
  /** Key width and height (mm or in). */
  w: number;
  h: number;
  /** Bearing height on the hub side (mm or in); defaults to h/2. */
  bearingHeight?: number;
  /** Key material yield strength (MPa or kpsi). */
  SyKey: number;
  /** Yield strength of the weaker of shaft and hub (MPa or kpsi); defaults to the key's. */
  SyHub?: number;
  /** Design factor. */
  n: number;
  units: KeyUnits;
};

export type KeyLengthResult = {
  /** Force at the shaft surface (N or lbf). */
  force: number;
  /** Length for shear of the key. */
  lShear: number;
  /** Length for crushing (bearing) on the weakest face. */
  lCrush: number;
  lRequired: number;
  governedBy: 'shear' | 'crushing';
  /** Yield strength used for crushing (MPa or kpsi). */
  SyCrush: number;
  /** Bearing height used for crushing. */
  bearingHeight: number;
};

export function keyLength(i: KeyLengthInput): KeyLengthResult {
  if (!(i.torque > 0)) throw new Error(msg('Torque must be greater than zero.'));
  if (!(i.d > 0) || !(i.w > 0) || !(i.h > 0)) throw new Error(msg('Shaft diameter and key size must be greater than zero.'));
  if (!(i.SyKey > 0)) throw new Error(msg('Key yield strength must be greater than zero.'));
  if (i.SyHub !== undefined && !(i.SyHub > 0)) throw new Error(msg('Hub yield strength must be greater than zero.'));
  if (!(i.n > 0)) throw new Error(msg('Design factor must be greater than zero.'));
  const hb = i.bearingHeight ?? i.h / 2;
  if (!(hb > 0) || hb > i.h) throw new Error(msg('Bearing height must be greater than zero and no more than the key height.'));
  // si: N·m → N·mm with d in mm gives N; MPa = N/mm². us: lbf·in with in gives lbf; kpsi → psi.
  const T = i.units === 'si' ? i.torque * 1000 : i.torque;
  const s = i.units === 'si' ? 1 : 1000;
  const force = (2 * T) / i.d;
  const SyCrush = Math.min(i.SyKey, i.SyHub ?? i.SyKey);
  const lShear = (force * i.n) / (0.577 * i.SyKey * s * i.w);
  const lCrush = (force * i.n) / (SyCrush * s * hb);
  return { force, lShear, lCrush, lRequired: Math.max(lShear, lCrush), governedBy: lCrush >= lShear ? 'crushing' : 'shear', SyCrush, bearingHeight: hb };
}

/** Next standard length: DIN 6885 series within the size's range (metric), or the next 1/8 in (inch). */
export function standardLength(lRequired: number, key: SelectedKey): { length: number | null; note: string | null } {
  if (key.units === 'us') {
    const L = Math.ceil(lRequired * 8 - 1e-9) / 8;
    return { length: Math.max(L, 0.125), note: null };
  }
  const min = key.lMin ?? 0;
  const max = key.lMax ?? Infinity;
  const L = DIN_6885_LENGTHS.find((x) => x >= lRequired - 1e-9 && x >= min && x <= max);
  if (L === undefined) return { length: null, note: built(msg('No standard length up to {max} mm is long enough for a {key} key. Use two keys at 180°, a larger shaft or a spline.'), { max, key: key.label }) };
  return { length: L, note: lRequired < min ? built(msg('The strength calculation needs less than the shortest standard length for this size, so {min} mm is used.'), { min }) : null };
}

export type KeyDesignInput = Omit<KeyLengthInput, 'w' | 'h' | 'bearingHeight'> & {
  form?: KeyForm;
  hubLength?: number;
  /** Round-ended key (DIN 6885 form A): only l − w bears. */
  roundEnds?: boolean;
};

export type KeyAtLength = {
  /** Overall key length. */
  length: number;
  /** Length that carries load: l − w for round ends, else l. */
  bearingLength: number;
  shearStress: number;
  bearingStress: number;
  nShear: number;
  nCrush: number;
};

export type KeyDesignResult = KeyLengthResult & {
  key: SelectedKey;
  standardLength: number | null;
  /** Shear and bearing stress in the key at the standard length (MPa or kpsi). */
  shearStress: number | null;
  bearingStress: number | null;
  /** Factors of safety at the standard length. */
  nShear: number | null;
  nCrush: number | null;
  /** Bearing length of the standard key (l − w for round ends). */
  bearingLength: number | null;
  /** The longest standard length that fits in the hub, when a hub length is given and it meets the requirement. */
  hubFit: KeyAtLength | null;
  warnings: string[];
};

/** Stresses and factors of safety for a key of overall length L. */
export function keyAtLength(force: number, key: SelectedKey, L: number, SyKey: number, SyCrush: number, roundEnds: boolean): KeyAtLength {
  const s = key.units === 'si' ? 1 : 1000;
  const bearingLength = roundEnds ? L - key.w : L;
  if (!(bearingLength > 0)) throw new Error(msg('Key length must be longer than its width for a round-ended key.'));
  const shearStress = force / (key.w * bearingLength) / s;
  const bearingStress = force / (key.bearingHeight * bearingLength) / s;
  return { length: L, bearingLength, shearStress, bearingStress, nShear: (0.577 * SyKey) / shearStress, nCrush: SyCrush / bearingStress };
}

/** Longest standard length not longer than the hub: DIN series within the size range, or whole 1/8 in. */
export function longestFittingLength(hubLength: number, key: SelectedKey): number | null {
  if (key.units === 'us') {
    const L = Math.floor(hubLength * 8 + 1e-9) / 8;
    return L > 0 ? L : null;
  }
  const fits = DIN_6885_LENGTHS.filter((x) => x <= hubLength + 1e-9 && x >= (key.lMin ?? 0) && x <= (key.lMax ?? Infinity));
  return fits.length ? fits[fits.length - 1] : null;
}

/** Select the standard key for d, then size its length. */
export function designKey(i: KeyDesignInput): KeyDesignResult {
  const key = selectKey(i.d, i.units, i.form ?? 'square');
  const roundEnds = !!i.roundEnds;
  const r = keyLength({ ...i, w: key.w, h: key.h, bearingHeight: key.bearingHeight });
  const extra = roundEnds ? key.w : 0;
  const std = standardLength(r.lRequired + extra, key);
  const warnings: string[] = [];
  if (std.note) warnings.push(std.note);
  let at: KeyAtLength | null = null;
  if (std.length) {
    at = keyAtLength(r.force, key, std.length, i.SyKey, r.SyCrush, roundEnds);
    if (std.length > 1.5 * i.d) warnings.push(msg('The key is longer than about 1.5 times the shaft diameter. Shaft twist then loads the key unevenly; consider two keys, a bigger shaft or a spline.'));
    if (i.hubLength && i.hubLength > 0 && std.length > i.hubLength) warnings.push(msg('The key is longer than the hub. Lengthen the hub or use a stronger key material.'));
  }
  let hubFit: KeyAtLength | null = null;
  if (i.hubLength && i.hubLength > 0 && std.length && std.length <= i.hubLength) {
    const L = longestFittingLength(i.hubLength, key);
    if (L && L >= std.length && L - extra > 0) hubFit = keyAtLength(r.force, key, L, i.SyKey, r.SyCrush, roundEnds);
  }
  return {
    ...r,
    key,
    standardLength: std.length,
    shearStress: at ? at.shearStress : null,
    bearingStress: at ? at.bearingStress : null,
    nShear: at ? at.nShear : null,
    nCrush: at ? at.nCrush : null,
    bearingLength: at ? at.bearingLength : null,
    hubFit,
    warnings,
  };
}
