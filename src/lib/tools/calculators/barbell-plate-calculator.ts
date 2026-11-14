/**
 * Barbell plate calculator: which plates go on each side for a target
 * load, in kg or lb, with an optional plate inventory and collars. The
 * search itself is platesPerSide() in ./fitness (shared with the one-rep
 * max calculator); this file holds the presets and the reverse sum.
 *
 * Plate sizes and collars follow the IPF Technical Rules (2026 edition,
 * section 2.3 and 2.4): discs of 1.25 to 25 kg, lighter discs of 0.25 to
 * 1 kg for record attempts, 2.5 kg collars, bar plus collars 25 kg.
 */
import { KG_PER_LB, platesPerSide, type PlateLoadResult } from './fitness';
import { msg } from '../../msg';

export type WeightUnit = 'kg' | 'lb';

/** Standard plate sizes, heaviest first. Fractional plates are off by default. */
export const PLATE_SIZES: Record<WeightUnit, number[]> = {
  kg: [25, 20, 15, 10, 5, 2.5, 1.25, 1, 0.5, 0.25],
  lb: [55, 45, 35, 25, 10, 5, 2.5, 1.25],
};

/** Plates a typical gym has in unlimited supply; the rest start at 0 pairs. */
export const DEFAULT_PLATES: Record<WeightUnit, number[]> = {
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
  lb: [45, 35, 25, 10, 5, 2.5],
};

export const BAR_PRESETS: Record<WeightUnit, { value: number; label: string }[]> = {
  kg: [
    { value: 20, label: msg('20 kg (standard men\'s and powerlifting bar)') },
    { value: 15, label: msg('15 kg (women\'s weightlifting bar)') },
    { value: 10, label: msg('10 kg (technique bar)') },
  ],
  lb: [
    { value: 45, label: msg('45 lb (standard Olympic bar)') },
    { value: 35, label: msg('35 lb (women\'s bar)') },
    { value: 15, label: msg('15 lb (technique bar)') },
  ],
};

/** IPF competition collars weigh 2.5 kg each (Technical Rules 2.4). Spring clips are light enough to ignore. */
export const IPF_COLLAR_KG = 2.5;

/**
 * IPF colour code (Technical Rules 2.3(b)6): 25 kg red, 20 kg blue, 15 kg
 * yellow; 10 kg and under may be any colour. Smaller plates use neutral
 * shades in the drawing.
 */
export function plateColour(size: number, unit: WeightUnit): string {
  const kg = unit === 'kg' ? size : size * KG_PER_LB;
  if (Math.abs(kg - 25) < 0.6) return '#dc2626';
  if (Math.abs(kg - 20) < 0.6) return '#2563eb';
  if (Math.abs(kg - 15) < 0.6) return '#eab308';
  if (Math.abs(kg - 10) < 0.6) return '#16a34a';
  if (kg >= 4) return '#e5e7eb';
  return '#6b7280';
}

export type PlateRow = { size: number; pairs: number | null };

export type BarbellInput = {
  unit: WeightUnit;
  target: number;
  bar: number;
  collarEach: number;
  /** Plate sizes with pairs available (null = unlimited, 0 = none). */
  plates: PlateRow[];
};

export type BarbellResult = PlateLoadResult & { unit: WeightUnit; otherUnitTotal: number };

/** Plates per side for a target load; null when the target is lighter than the empty bar or inputs are invalid. */
export function calculateBarbellLoad(input: BarbellInput): BarbellResult | null {
  const { unit, target, bar, collarEach, plates } = input;
  if (!(target > 0) || !(bar >= 0) || !(collarEach >= 0)) return null;
  const res = platesPerSide(target, bar, plates.map((p) => p.size), {
    pairs: plates.map((p) => p.pairs),
    collarEach,
  });
  if (!res) return null;
  return { ...res, unit, otherUnitTotal: unit === 'kg' ? target / KG_PER_LB : target * KG_PER_LB };
}

/** Reverse: the total on the bar from the plates on one side. */
export function totalFromPlates(bar: number, collarEach: number, perSide: number[]): number {
  return bar + 2 * collarEach + 2 * perSide.reduce((s, p) => s + p, 0);
}

/** "25 + 25 + 10 + 1.25", or "bar only". */
export function describePlates(plates: number[]): string {
  return plates.length ? plates.map((p) => String(p)).join(' + ') : msg('bar only');
}

/**
 * Plate inventory as typed on the page, one token per PLATE_SIZES[unit]
 * entry ('' = box left blank). In a shared link it is the tokens joined by
 * '-' ("1--2" = 1 pair of the first size, blank, 2 pairs of the third), which
 * stays under the 40-character limit for links even with every box filled.
 */
export const encodeInventory = (tokens: string[]) => (tokens.every((t) => t.trim() === '') ? '' : tokens.map((t) => t.trim()).join('-').replace(/-+$/, ''));

export function decodeInventory(encoded: string, unit: WeightUnit): string[] {
  const n = PLATE_SIZES[unit].length;
  const parts = encoded ? encoded.split('-') : [];
  return Array.from({ length: n }, (_, i) => (/^\d{1,2}$/.test(parts[i] ?? '') ? parts[i] : ''));
}

/**
 * Pairs used for each size. A typed number wins. A blank box means
 * unlimited for the standard sizes, unless `onlyListed` is on (then blank
 * means none); the extra sizes (55 lb, 1.25 lb, 1, 0.5 and 0.25 kg) are
 * none unless typed. Invalid tokens come back as NaN for the page to flag.
 */
export function inventoryRows(unit: WeightUnit, tokens: string[], onlyListed: boolean): PlateRow[] {
  return PLATE_SIZES[unit].map((size, i) => {
    const raw = (tokens[i] ?? '').trim();
    if (raw !== '') return { size, pairs: /^\d+$/.test(raw) ? Number(raw) : NaN };
    return { size, pairs: !onlyListed && DEFAULT_PLATES[unit].includes(size) ? null : 0 };
  });
}
