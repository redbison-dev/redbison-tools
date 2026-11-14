/**
 * Pure logic for the everyday calculators group B: fuel cost, tire size,
 * shoe size, cooking measurements, heat index and wind chill.
 * No React here so the vitest suite exercises the same code as the UI.
 */
import { msg, fillMsg, type MsgText } from '../../msg';

/** A failure's error is English; errorMsg, when the text carries values, is its template for t(text, vars). */
export type Result<T> = { ok: true; value: T; error?: undefined; errorMsg?: undefined } | { ok: false; error: string; errorMsg?: MsgText; value?: undefined };
const ok = <T,>(value: T): Result<T> => ({ ok: true, value });
const fail = <T,>(error: string, vars?: MsgText['vars']): Result<T> => (vars ? { ok: false, error: fillMsg({ text: error, vars }), errorMsg: { text: error, vars } } : { ok: false, error });
const finite = (n: number) => typeof n === 'number' && Number.isFinite(n);

export const roundTo = (v: number, dp = 2): number => {
  if (!Number.isFinite(v)) return v;
  const f = 10 ** dp;
  return Math.round((v + Math.sign(v) * Number.EPSILON) * f) / f;
};
/** Round to the nearest half (shoe sizes, Japanese cm sizes). */
export const roundHalf = (v: number): number => Math.round(v * 2) / 2;

/* ------------------------------------------------------------------ */
/* Exact unit constants (NIST Handbook 44 / SP 811 definitions)        */
/* ------------------------------------------------------------------ */

export const KM_PER_MILE = 1.609344;
export const LITRES_PER_US_GALLON = 3.785411784;
export const LITRES_PER_IMPERIAL_GALLON = 4.54609;
export const MM_PER_INCH = 25.4;
/** EPA energy equivalence used for MPGe: 33.705 kWh per US gallon of gasoline. */
export const KWH_PER_GALLON_GASOLINE_EQUIVALENT = 33.705;

/* ------------------------------------------------------------------ */
/* Fuel cost                                                           */
/* ------------------------------------------------------------------ */

export type DistanceUnit = 'km' | 'mi';
export type EconomyUnit = 'mpg-us' | 'mpg-uk' | 'l100km' | 'kml';
export type FuelPriceUnit = 'per-l' | 'per-us-gal' | 'per-imp-gal';
export type FuelVolumeUnit = 'l' | 'us-gal' | 'imp-gal';

export const ECONOMY_UNIT_LABELS: Record<EconomyUnit, string> = {
  'mpg-us': msg('MPG (US gallon)'),
  'mpg-uk': msg('MPG (UK imperial gallon)'),
  l100km: 'L/100 km',
  kml: 'km/L',
};

export const toKm = (d: number, unit: DistanceUnit) => (unit === 'mi' ? d * KM_PER_MILE : d);

/** Convert any fuel economy figure to litres per 100 km. */
export function toL100km(value: number, unit: EconomyUnit): number {
  switch (unit) {
    case 'l100km': return value;
    case 'kml': return 100 / value;
    case 'mpg-us': return (100 * LITRES_PER_US_GALLON) / (value * KM_PER_MILE);
    case 'mpg-uk': return (100 * LITRES_PER_IMPERIAL_GALLON) / (value * KM_PER_MILE);
  }
}

/** Convert litres per 100 km to any fuel economy unit. */
export function fromL100km(l100: number, unit: EconomyUnit): number {
  switch (unit) {
    case 'l100km': return l100;
    case 'kml': return 100 / l100;
    case 'mpg-us': return (100 * LITRES_PER_US_GALLON) / (l100 * KM_PER_MILE);
    case 'mpg-uk': return (100 * LITRES_PER_IMPERIAL_GALLON) / (l100 * KM_PER_MILE);
  }
}

export function convertEconomy(value: number, from: EconomyUnit): Record<EconomyUnit, number> {
  const l = toL100km(value, from);
  return { 'mpg-us': fromL100km(l, 'mpg-us'), 'mpg-uk': fromL100km(l, 'mpg-uk'), l100km: l, kml: fromL100km(l, 'kml') };
}

export const litresFrom = (v: number, unit: FuelVolumeUnit) =>
  unit === 'us-gal' ? v * LITRES_PER_US_GALLON : unit === 'imp-gal' ? v * LITRES_PER_IMPERIAL_GALLON : v;

export const pricePerLitre = (price: number, unit: FuelPriceUnit) =>
  unit === 'per-us-gal' ? price / LITRES_PER_US_GALLON : unit === 'per-imp-gal' ? price / LITRES_PER_IMPERIAL_GALLON : price;

export type TripInput = {
  distance: number;
  distanceUnit: DistanceUnit;
  roundTrip?: boolean;
  passengers?: number;
};

export type FuelTripInput = TripInput & {
  economy: number;
  economyUnit: EconomyUnit;
  price: number;
  priceUnit: FuelPriceUnit;
};

export type FuelTripResult = {
  distanceKm: number;
  distanceMi: number;
  litres: number;
  usGallons: number;
  impGallons: number;
  cost: number;
  costPerPerson: number;
  costPerKm: number;
  costPerMile: number;
  l100km: number;
};

function checkTrip(t: TripInput): string | null {
  if (!finite(t.distance) || t.distance <= 0) return msg('Enter a trip distance greater than zero.');
  const p = t.passengers ?? 1;
  if (!finite(p) || p < 1 || Math.floor(p) !== p) return msg('Passengers sharing the cost must be a whole number of at least 1.');
  return null;
}

export function fuelTripCost(input: FuelTripInput): Result<FuelTripResult> {
  const e = checkTrip(input);
  if (e) return fail(e);
  if (!finite(input.economy) || input.economy <= 0) return fail(msg('Enter a fuel economy greater than zero.'));
  if (!finite(input.price) || input.price < 0) return fail(msg('Fuel price cannot be negative.'));
  const distanceKm = toKm(input.distance, input.distanceUnit) * (input.roundTrip ? 2 : 1);
  const l100km = toL100km(input.economy, input.economyUnit);
  const litres = (distanceKm * l100km) / 100;
  const cost = litres * pricePerLitre(input.price, input.priceUnit);
  const passengers = input.passengers ?? 1;
  return ok({
    distanceKm,
    distanceMi: distanceKm / KM_PER_MILE,
    litres,
    usGallons: litres / LITRES_PER_US_GALLON,
    impGallons: litres / LITRES_PER_IMPERIAL_GALLON,
    cost,
    costPerPerson: cost / passengers,
    costPerKm: cost / distanceKm,
    costPerMile: (cost / distanceKm) * KM_PER_MILE,
    l100km,
  });
}

/** Work out fuel economy from a fill-up: distance driven and fuel used. */
export function economyFromUsage(distance: number, distanceUnit: DistanceUnit, fuel: number, fuelUnit: FuelVolumeUnit): Result<Record<EconomyUnit, number>> {
  if (!finite(distance) || distance <= 0) return fail(msg('Enter the distance driven since the last fill-up.'));
  if (!finite(fuel) || fuel <= 0) return fail(msg('Enter the amount of fuel used, greater than zero.'));
  const l100 = (litresFrom(fuel, fuelUnit) / toKm(distance, distanceUnit)) * 100;
  return ok(convertEconomy(l100, 'l100km'));
}

export type EvEfficiencyUnit = 'kwh100km' | 'kwh100mi' | 'mikwh' | 'kmkwh';
export const EV_UNIT_LABELS: Record<EvEfficiencyUnit, string> = {
  kwh100km: 'kWh/100 km',
  kwh100mi: 'kWh/100 mi',
  mikwh: 'mi/kWh',
  kmkwh: 'km/kWh',
};

/** kWh used per km for any EV efficiency unit. */
export function evKwhPerKm(value: number, unit: EvEfficiencyUnit): number {
  switch (unit) {
    case 'kwh100km': return value / 100;
    case 'kwh100mi': return value / 100 / KM_PER_MILE;
    case 'mikwh': return 1 / (value * KM_PER_MILE);
    case 'kmkwh': return 1 / value;
  }
}

export type EvTripInput = TripInput & { efficiency: number; efficiencyUnit: EvEfficiencyUnit; pricePerKwh: number; chargingLossPct?: number };
export type EvTripResult = { distanceKm: number; distanceMi: number; kwh: number; cost: number; costPerPerson: number; costPerKm: number; costPerMile: number; mpge: number; kwh100km: number; miPerKwh: number };

export function evTripCost(input: EvTripInput): Result<EvTripResult> {
  const e = checkTrip(input);
  if (e) return fail(e);
  if (!finite(input.efficiency) || input.efficiency <= 0) return fail(msg('Enter an energy efficiency greater than zero.'));
  if (!finite(input.pricePerKwh) || input.pricePerKwh < 0) return fail(msg('Electricity price cannot be negative.'));
  const loss = input.chargingLossPct ?? 0;
  if (!finite(loss) || loss < 0 || loss >= 50) return fail(msg('Charging loss should be between 0% and 50%.'));
  const distanceKm = toKm(input.distance, input.distanceUnit) * (input.roundTrip ? 2 : 1);
  const perKm = evKwhPerKm(input.efficiency, input.efficiencyUnit);
  const kwh = (distanceKm * perKm) / (1 - loss / 100);
  const cost = kwh * input.pricePerKwh;
  const kwhPerMile = perKm * KM_PER_MILE;
  return ok({
    distanceKm,
    distanceMi: distanceKm / KM_PER_MILE,
    kwh,
    cost,
    costPerPerson: cost / (input.passengers ?? 1),
    costPerKm: cost / distanceKm,
    costPerMile: (cost / distanceKm) * KM_PER_MILE,
    mpge: KWH_PER_GALLON_GASOLINE_EQUIVALENT / kwhPerMile,
    kwh100km: perKm * 100,
    miPerKwh: 1 / kwhPerMile,
  });
}

/* ------------------------------------------------------------------ */
/* Tire size                                                           */
/* ------------------------------------------------------------------ */

export type TireSpec = {
  /** Normalised text, e.g. "225/45R17" or "33x12.50R15". */
  label: string;
  format: 'metric' | 'flotation';
  prefix: '' | 'P' | 'LT' | 'ST' | 'T';
  widthMm: number;
  /** Sidewall height as a percentage of width (metric sizes). For flotation sizes it is derived. */
  aspectRatio: number;
  rimIn: number;
  construction: 'R' | 'D' | 'B' | 'ZR' | '';
};

export type TireDimensions = {
  diameterMm: number;
  diameterIn: number;
  sidewallMm: number;
  sidewallIn: number;
  widthMm: number;
  widthIn: number;
  rimIn: number;
  circumferenceMm: number;
  circumferenceIn: number;
  revsPerMile: number;
  revsPerKm: number;
};

const METRIC_RE = /^(P|LT|ST|T)?\s*(\d{3})\s*\/\s*(\d{2,3})\s*(ZR|R|D|B|-)?\s*(\d{2}(?:\.\d)?)\b/i;
const FLOTATION_RE = /^(\d{2}(?:\.\d{1,2})?)\s*[xX×*]\s*(\d{1,2}(?:\.\d{1,2})?)\s*(R|D|B|-)?\s*(\d{2}(?:\.\d)?)\s*(LT)?\b/i;

/** Parse a sidewall size string. Load index and speed rating after the rim size are ignored. */
export function parseTireSize(raw: string): Result<TireSpec> {
  const s = raw.trim().replace(/\s+/g, ' ');
  if (!s) return fail(msg('Enter a tire size such as 225/45R17 or 33x12.50R15.'));
  const m = s.match(METRIC_RE);
  if (m) {
    const prefix = (m[1]?.toUpperCase() ?? '') as TireSpec['prefix'];
    const widthMm = Number(m[2]);
    const aspectRatio = Number(m[3]);
    const construction = (m[4] && m[4] !== '-' ? m[4].toUpperCase() : m[4] === '-' ? 'D' : '') as TireSpec['construction'];
    const rimIn = Number(m[5]);
    if (widthMm < 100 || widthMm > 455) return fail(msg('A section width of {width} mm is outside the range of road tires (about 115 to 455 mm).'), { width: widthMm });
    if (aspectRatio < 20 || aspectRatio > 110) return fail(msg('An aspect ratio of {ratio} looks wrong. It is the sidewall height as a percentage of width, usually 25 to 85.'), { ratio: aspectRatio });
    if (rimIn < 10 || rimIn > 30) return fail(msg('A {rim} inch wheel is outside the usual 10 to 30 inch range.'), { rim: rimIn });
    return ok({ label: `${prefix}${widthMm}/${aspectRatio}${construction || 'R'}${rimIn}`, format: 'metric', prefix, widthMm, aspectRatio, rimIn, construction });
  }
  const f = s.match(FLOTATION_RE);
  if (f) {
    const diameterIn = Number(f[1]);
    const widthIn = Number(f[2]);
    const rimIn = Number(f[4]);
    if (diameterIn <= rimIn) return fail(msg('The overall diameter must be larger than the wheel size.'));
    if (rimIn < 10 || rimIn > 30) return fail(msg('A {rim} inch wheel is outside the usual 10 to 30 inch range.'), { rim: rimIn });
    if (widthIn < 6 || widthIn > 25) return fail(msg('A width of {width} inches is outside the usual range for flotation tires.'), { width: widthIn });
    const sidewallIn = (diameterIn - rimIn) / 2;
    const construction = (f[3] && f[3] !== '-' ? f[3].toUpperCase() : f[3] === '-' ? 'D' : 'R') as TireSpec['construction'];
    return ok({
      label: `${f[1]}x${f[2]}${construction}${rimIn}${f[5] ? 'LT' : ''}`,
      format: 'flotation',
      prefix: f[5] ? 'LT' : '',
      widthMm: widthIn * MM_PER_INCH,
      aspectRatio: (sidewallIn / widthIn) * 100,
      rimIn,
      construction,
    });
  }
  return fail(msg('Could not read that size. Use the metric form 225/45R17 (also P215/65R15, LT265/70R17) or the flotation form 33x12.50R15.'));
}

/** Unloaded (design) dimensions from the size code. Real rolling diameter under load is slightly smaller. */
export function tireDimensions(spec: TireSpec): TireDimensions {
  const sidewallMm = (spec.widthMm * spec.aspectRatio) / 100;
  const diameterMm = spec.rimIn * MM_PER_INCH + 2 * sidewallMm;
  const circumferenceMm = Math.PI * diameterMm;
  return {
    diameterMm,
    diameterIn: diameterMm / MM_PER_INCH,
    sidewallMm,
    sidewallIn: sidewallMm / MM_PER_INCH,
    widthMm: spec.widthMm,
    widthIn: spec.widthMm / MM_PER_INCH,
    rimIn: spec.rimIn,
    circumferenceMm,
    circumferenceIn: circumferenceMm / MM_PER_INCH,
    revsPerMile: (KM_PER_MILE * 1e6) / circumferenceMm,
    revsPerKm: 1e6 / circumferenceMm,
  };
}

/** The common tire-industry rule of thumb: keep a replacement within 3% of the original diameter. */
export const DIAMETER_GUIDELINE_PCT = 3;

export type TireComparison = {
  a: TireDimensions;
  b: TireDimensions;
  diameterDiffMm: number;
  diameterDiffPct: number;
  widthDiffMm: number;
  sidewallDiffMm: number;
  revsPerMileDiff: number;
  /** Positive when the new tire reads high (you are going faster than the speedometer shows). */
  speedometerErrorPct: number;
  withinGuideline: boolean;
  /** Ground clearance change in mm (half the diameter change). */
  clearanceChangeMm: number;
};

export function compareTires(a: TireSpec, b: TireSpec): TireComparison {
  const da = tireDimensions(a);
  const db = tireDimensions(b);
  const diameterDiffPct = ((db.diameterMm - da.diameterMm) / da.diameterMm) * 100;
  return {
    a: da,
    b: db,
    diameterDiffMm: db.diameterMm - da.diameterMm,
    diameterDiffPct,
    widthDiffMm: db.widthMm - da.widthMm,
    sidewallDiffMm: db.sidewallMm - da.sidewallMm,
    revsPerMileDiff: db.revsPerMile - da.revsPerMile,
    speedometerErrorPct: diameterDiffPct,
    withinGuideline: Math.abs(diameterDiffPct) <= DIAMETER_GUIDELINE_PCT,
    clearanceChangeMm: (db.diameterMm - da.diameterMm) / 2,
  };
}

/** True road speed when the speedometer, calibrated for tire A, shows `indicated` while tire B is fitted. */
export const actualSpeed = (indicated: number, cmp: TireComparison) => indicated * (cmp.b.diameterMm / cmp.a.diameterMm);

/* ------------------------------------------------------------------ */
/* Shoe size                                                           */
/* ------------------------------------------------------------------ */
/*
 * Formulas from ISO/TS 19407 (adult EU and UK from foot length) and the
 * traditional barleycorn systems (Brannock-style US scales), which add a
 * two-size allowance between foot and last. See the write-up for sources.
 *   EU          = 1.5 x foot(cm) + 2           (Paris points, 6.67 mm)
 *   UK adult    = 3 x foot(in) - 23            (barleycorn, 8.47 mm)
 *   US men      = 3 x foot(in) - 22
 *   US women    = 3 x foot(in) - 21
 *   UK child    = 3 x foot(in) - 10
 *   US child    = 3 x foot(in) - 9.75
 *   Mondopoint  = foot length in mm; Japan = foot length in cm
 */

export type ShoeGroup = 'men' | 'women' | 'kids';
export type ShoeSystem = 'us' | 'uk' | 'eu' | 'jp' | 'mondopoint' | 'cm' | 'in';

export const SHOE_SYSTEM_LABELS: Record<ShoeSystem, string> = {
  us: 'US', uk: 'UK', eu: 'EU', jp: msg('Japan (cm)'), mondopoint: msg('Mondopoint (mm)'), cm: msg('Foot length (cm)'), in: msg('Foot length (in)'),
};

const US_OFFSET: Record<ShoeGroup, number> = { men: 22, women: 21, kids: 9.75 };
const UK_OFFSET: Record<ShoeGroup, number> = { men: 23, women: 23, kids: 10 };

export type ShoeSizes = {
  footMm: number;
  footIn: number;
  /** Exact (unrounded) values. */
  exact: { us: number; uk: number; eu: number };
  us: number;
  uk: number;
  eu: number;
  jp: number;
  mondopoint: number;
  /** For kids above size 13.5, the size has moved onto the adult/youth scale. */
  usLabel: string;
  ukLabel: string;
  /** usLabel and ukLabel as messages for t() when they carry words (kids sizes). */
  usLabelMsg?: MsgText;
  ukLabelMsg?: MsgText;
};

const fmtHalf = (v: number) => (Number.isInteger(v) ? String(v) : `${Math.floor(v)}.5`);

export function shoeSizesFromFoot(footMm: number, group: ShoeGroup): Result<ShoeSizes> {
  if (!finite(footMm) || footMm <= 0) return fail(msg('Enter a foot length or size greater than zero.'));
  const footIn = footMm / MM_PER_INCH;
  const eu = (3 * footMm) / 20 + 2;
  let us = 3 * footIn - US_OFFSET[group];
  let uk = 3 * footIn - UK_OFFSET[group];
  let usLabel: string;
  let ukLabel: string;
  let usLabelMsg: MsgText | undefined;
  let ukLabelMsg: MsgText | undefined;
  if (group === 'kids') {
    const usKids = roundHalf(us);
    const ukKids = roundHalf(uk);
    if (usKids > 13.5) {
      us = 3 * footIn - US_OFFSET.men;
      usLabelMsg = { text: msg('{size} youth (big kids)'), vars: { size: fmtHalf(Math.max(1, roundHalf(us))) } };
    } else usLabelMsg = { text: msg('{size} kids'), vars: { size: fmtHalf(usKids) } };
    usLabel = fillMsg(usLabelMsg);
    if (ukKids > 13.5) {
      uk = 3 * footIn - UK_OFFSET.men;
      ukLabelMsg = { text: msg('{size} (adult scale)'), vars: { size: fmtHalf(Math.max(1, roundHalf(uk))) } };
    } else ukLabelMsg = { text: msg('{size} kids'), vars: { size: fmtHalf(ukKids) } };
    ukLabel = fillMsg(ukLabelMsg);
  } else {
    usLabel = fmtHalf(roundHalf(us));
    ukLabel = fmtHalf(roundHalf(uk));
  }
  if (roundHalf(us) < 0 || roundHalf(uk) < 0) return fail(msg('That foot length is below the start of the size scale for this group.'));
  return ok({
    footMm,
    footIn,
    exact: { us, uk, eu },
    us: roundHalf(us),
    uk: roundHalf(uk),
    eu: Math.round(eu * 2) / 2,
    jp: roundHalf(footMm / 10),
    mondopoint: Math.round(footMm / 5) * 5,
    usLabel,
    ukLabel,
    ...(usLabelMsg ? { usLabelMsg } : {}),
    ...(ukLabelMsg ? { ukLabelMsg } : {}),
  });
}

/** Foot length in mm implied by a size in a given system. */
export function footFromShoeSize(system: ShoeSystem, size: number, group: ShoeGroup): Result<number> {
  if (!finite(size) || size <= 0) return fail(msg('Enter a size greater than zero.'));
  switch (system) {
    case 'us': return ok(((size + US_OFFSET[group]) / 3) * MM_PER_INCH);
    case 'uk': return ok(((size + UK_OFFSET[group]) / 3) * MM_PER_INCH);
    case 'eu': return ok(((size - 2) * 20) / 3);
    case 'jp':
    case 'cm': return ok(size * 10);
    case 'mondopoint': return ok(size);
    case 'in': return ok(size * MM_PER_INCH);
  }
}

/** Chart rows every 5 mm of foot length (the Mondopoint step) across the usual range for a group. */
export function shoeChart(group: ShoeGroup): ShoeSizes[] {
  const [lo, hi] = group === 'kids' ? [100, 230] : group === 'women' ? [210, 290] : [230, 320];
  const rows: ShoeSizes[] = [];
  for (let mm = lo; mm <= hi; mm += 5) {
    const r = shoeSizesFromFoot(mm, group);
    if (r.ok) rows.push(r.value);
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/* Cooking measurements                                                */
/* ------------------------------------------------------------------ */

export const ML_PER_US_CUP = 236.5882365;

export type VolumeUnitId =
  | 'ml' | 'l' | 'us-cup' | 'metric-cup' | 'imp-cup' | 'us-tbsp' | 'metric-tbsp' | 'au-tbsp'
  | 'us-tsp' | 'metric-tsp' | 'us-floz' | 'imp-floz' | 'us-pint' | 'imp-pint' | 'us-quart' | 'us-stick';
export type WeightUnitId = 'g' | 'kg' | 'oz' | 'lb';
export type CookingUnitId = VolumeUnitId | WeightUnitId;

/** Millilitres per unit. US units from the exact US gallon (231 in3); imperial from 4.54609 L. */
export const VOLUME_UNITS: Record<VolumeUnitId, { label: string; ml: number }> = {
  ml: { label: msg('millilitres (ml)'), ml: 1 },
  l: { label: msg('litres (L)'), ml: 1000 },
  'us-cup': { label: msg('US cup (236.6 ml)'), ml: ML_PER_US_CUP },
  'metric-cup': { label: msg('metric cup (250 ml)'), ml: 250 },
  'imp-cup': { label: msg('UK imperial cup (284 ml)'), ml: 284.130625 },
  'us-tbsp': { label: msg('US tablespoon (14.8 ml)'), ml: ML_PER_US_CUP / 16 },
  'metric-tbsp': { label: msg('metric tablespoon (15 ml)'), ml: 15 },
  'au-tbsp': { label: msg('Australian tablespoon (20 ml)'), ml: 20 },
  'us-tsp': { label: msg('US teaspoon (4.93 ml)'), ml: ML_PER_US_CUP / 48 },
  'metric-tsp': { label: msg('metric teaspoon (5 ml)'), ml: 5 },
  'us-floz': { label: msg('US fluid ounce (29.6 ml)'), ml: ML_PER_US_CUP / 8 },
  'imp-floz': { label: msg('UK fluid ounce (28.4 ml)'), ml: 28.4130625 },
  'us-pint': { label: msg('US pint (473 ml)'), ml: ML_PER_US_CUP * 2 },
  'imp-pint': { label: msg('UK pint (568 ml)'), ml: 568.26125 },
  'us-quart': { label: msg('US quart (946 ml)'), ml: ML_PER_US_CUP * 4 },
  'us-stick': { label: msg('US butter stick (1/2 cup)'), ml: ML_PER_US_CUP / 2 },
};

/** Grams per unit (avoirdupois ounce and pound, exact). */
export const WEIGHT_UNITS: Record<WeightUnitId, { label: string; g: number }> = {
  g: { label: msg('grams (g)'), g: 1 },
  kg: { label: msg('kilograms (kg)'), g: 1000 },
  oz: { label: msg('ounces (oz)'), g: 28.349523125 },
  lb: { label: msg('pounds (lb)'), g: 453.59237 },
};

export const isVolumeUnit = (u: CookingUnitId): u is VolumeUnitId => u in VOLUME_UNITS;

export type Ingredient = { id: string; name: string; gPerUsCup: number; source: 'King Arthur' | 'USDA' | 'Water'; note?: string };

/**
 * Grams per US cup. "King Arthur" values come from the King Arthur Baking
 * ingredient weight chart (flour spooned and levelled, brown sugar packed);
 * "USDA" values from USDA FoodData Central household measures; water is
 * 1 g per ml.
 */
export const INGREDIENTS: Ingredient[] = [
  { id: 'water', name: msg('Water'), gPerUsCup: ML_PER_US_CUP, source: msg('Water'), note: msg('1 ml weighs 1 g') },
  { id: 'ap-flour', name: msg('All-purpose flour'), gPerUsCup: 120, source: 'King Arthur', note: msg('spooned into the cup and levelled') },
  { id: 'bread-flour', name: msg('Bread flour'), gPerUsCup: 120, source: 'King Arthur' },
  { id: 'cake-flour', name: msg('Cake flour'), gPerUsCup: 120, source: 'King Arthur' },
  { id: 'ww-flour', name: msg('Whole wheat flour'), gPerUsCup: 113, source: 'King Arthur' },
  { id: 'almond-flour', name: msg('Almond flour'), gPerUsCup: 96, source: 'King Arthur' },
  { id: 'sugar', name: msg('Granulated sugar'), gPerUsCup: 198, source: 'King Arthur' },
  { id: 'brown-sugar', name: msg('Brown sugar (packed)'), gPerUsCup: 213, source: 'King Arthur' },
  { id: 'icing-sugar', name: msg("Confectioners' (icing) sugar"), gPerUsCup: 113, source: 'King Arthur', note: msg('unsifted') },
  { id: 'butter', name: msg('Butter'), gPerUsCup: 227, source: 'King Arthur', note: msg('1 stick = 8 tbsp = 113 g') },
  { id: 'milk', name: msg('Milk (whole)'), gPerUsCup: 244, source: 'USDA' },
  { id: 'heavy-cream', name: msg('Heavy cream'), gPerUsCup: 238, source: 'USDA' },
  { id: 'oil', name: msg('Vegetable oil'), gPerUsCup: 218, source: 'USDA' },
  { id: 'honey', name: msg('Honey'), gPerUsCup: 336, source: 'King Arthur', note: msg('21 g per tablespoon') },
  { id: 'maple-syrup', name: msg('Maple syrup'), gPerUsCup: 312, source: 'King Arthur' },
  { id: 'cocoa', name: msg('Cocoa powder (unsweetened)'), gPerUsCup: 84, source: 'King Arthur' },
  { id: 'oats', name: msg('Rolled oats (old-fashioned)'), gPerUsCup: 89, source: 'King Arthur' },
  { id: 'rice', name: msg('White rice (long grain, dry)'), gPerUsCup: 198, source: 'King Arthur' },
  { id: 'cornstarch', name: msg('Cornstarch'), gPerUsCup: 112, source: 'King Arthur' },
  { id: 'salt', name: msg('Table salt'), gPerUsCup: 288, source: 'King Arthur', note: msg('18 g per tablespoon; kosher salt is much lighter') },
  { id: 'baking-soda', name: msg('Baking soda'), gPerUsCup: 288, source: 'King Arthur', note: msg('6 g per teaspoon') },
  { id: 'baking-powder', name: msg('Baking powder'), gPerUsCup: 192, source: 'King Arthur', note: msg('4 g per teaspoon') },
  { id: 'choc-chips', name: msg('Chocolate chips'), gPerUsCup: 170, source: 'King Arthur' },
  { id: 'peanut-butter', name: msg('Peanut butter'), gPerUsCup: 270, source: 'King Arthur' },
  { id: 'sour-cream', name: msg('Sour cream'), gPerUsCup: 227, source: 'King Arthur' },
  { id: 'yogurt', name: msg('Yogurt'), gPerUsCup: 227, source: 'King Arthur' },
  { id: 'walnuts', name: msg('Walnuts (chopped)'), gPerUsCup: 113, source: 'King Arthur' },
];

export const findIngredient = (id: string) => INGREDIENTS.find((i) => i.id === id);
/** Density in grams per millilitre. */
export const ingredientDensity = (ing: Ingredient) => ing.gPerUsCup / ML_PER_US_CUP;

/** Convert between any two cooking units; volume and weight cross over via the ingredient's density. */
export function convertCooking(amount: number, from: CookingUnitId, to: CookingUnitId, ingredientId = 'water'): Result<number> {
  if (!finite(amount) || amount < 0) return fail(msg('Enter an amount of zero or more.'));
  const ing = findIngredient(ingredientId);
  if (!ing) return fail(msg('Unknown ingredient.'));
  const density = ingredientDensity(ing);
  const grams = isVolumeUnit(from) ? amount * VOLUME_UNITS[from].ml * density : amount * WEIGHT_UNITS[from].g;
  const ml = isVolumeUnit(from) ? amount * VOLUME_UNITS[from].ml : grams / density;
  return ok(isVolumeUnit(to) ? ml / VOLUME_UNITS[to].ml : grams / WEIGHT_UNITS[to].g);
}

/* Oven temperatures */
export const fToC = (f: number) => ((f - 32) * 5) / 9;
export const cToF = (c: number) => (c * 9) / 5 + 32;

/** Gas mark to °F: mark 1 = 275°F and each mark adds 25°F; 1/2 = 250°F and 1/4 = 225°F. */
export function gasMarkToF(mark: number): Result<number> {
  if (mark === 0.25) return ok(225);
  if (mark === 0.5) return ok(250);
  if (Number.isInteger(mark) && mark >= 1 && mark <= 10) return ok(250 + 25 * mark);
  return fail(msg('Gas marks run 1/4, 1/2 and 1 to 10.'));
}

/** Nearest gas mark for a Fahrenheit temperature, or null when outside the scale. */
export function fToGasMark(f: number): number | null {
  if (!finite(f) || f < 213 || f > 512) return null;
  const marks = [0.25, 0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  let best = marks[0];
  for (const m of marks) if (Math.abs(gasMarkToF(m).value! - f) < Math.abs(gasMarkToF(best).value! - f)) best = m;
  return best;
}

/** The rounded Celsius values printed on UK recipes and oven dials, per gas mark. */
export const OVEN_TABLE: { gas: string; mark: number; f: number; c: number; fanC: number; description: string }[] = [
  { gas: '1/4', mark: 0.25, f: 225, c: 110, fanC: 90, description: msg('Very cool') },
  { gas: '1/2', mark: 0.5, f: 250, c: 120, fanC: 100, description: msg('Very cool') },
  { gas: '1', mark: 1, f: 275, c: 140, fanC: 120, description: msg('Cool') },
  { gas: '2', mark: 2, f: 300, c: 150, fanC: 130, description: msg('Cool') },
  { gas: '3', mark: 3, f: 325, c: 160, fanC: 140, description: msg('Moderate') },
  { gas: '4', mark: 4, f: 350, c: 180, fanC: 160, description: msg('Moderate') },
  { gas: '5', mark: 5, f: 375, c: 190, fanC: 170, description: msg('Moderately hot') },
  { gas: '6', mark: 6, f: 400, c: 200, fanC: 180, description: msg('Hot') },
  { gas: '7', mark: 7, f: 425, c: 220, fanC: 200, description: msg('Hot') },
  { gas: '8', mark: 8, f: 450, c: 230, fanC: 210, description: msg('Very hot') },
  { gas: '9', mark: 9, f: 475, c: 240, fanC: 220, description: msg('Very hot') },
];

/* Recipe scaling */
const UNICODE_FRACTIONS: Record<string, number> = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875 };

/** Parse "2", "1.5", "3/4", "1 1/2", "1½". Returns NaN when there is no leading quantity. */
export function parseQuantity(text: string): { value: number; rest: string } {
  const t = text.trimStart();
  let m = t.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)/);
  if (m && Number(m[3]) > 0) return { value: Number(m[1]) + Number(m[2]) / Number(m[3]), rest: t.slice(m[0].length) };
  m = t.match(/^(\d+)\s*\/\s*(\d+)/);
  if (m && Number(m[2]) > 0) return { value: Number(m[1]) / Number(m[2]), rest: t.slice(m[0].length) };
  m = t.match(/^(\d+)?\s*([¼½¾⅓⅔⅛⅜⅝⅞])/);
  if (m) return { value: (m[1] ? Number(m[1]) : 0) + UNICODE_FRACTIONS[m[2]], rest: t.slice(m[0].length) };
  m = t.match(/^\d*\.?\d+/);
  if (m) return { value: Number(m[0]), rest: t.slice(m[0].length) };
  return { value: NaN, rest: t };
}

/** Format a quantity using kitchen fractions where they are close (1/8 steps, plus thirds). */
export function formatQuantity(v: number): string {
  if (!finite(v)) return '';
  const whole = Math.floor(v + 1e-9);
  const frac = v - whole;
  const options: [number, string][] = [[0, ''], [1 / 8, '1/8'], [1 / 4, '1/4'], [1 / 3, '1/3'], [3 / 8, '3/8'], [1 / 2, '1/2'], [5 / 8, '5/8'], [2 / 3, '2/3'], [3 / 4, '3/4'], [7 / 8, '7/8'], [1, '']];
  let best = options[0];
  for (const o of options) if (Math.abs(o[0] - frac) < Math.abs(best[0] - frac)) best = o;
  if (Math.abs(best[0] - frac) > 0.02) return String(roundTo(v, 2));
  const w = best[0] === 1 ? whole + 1 : whole;
  if (!best[1]) return String(w);
  return w ? `${w} ${best[1]}` : best[1];
}

export function scaleFactor(fromServings: number, toServings: number): Result<number> {
  if (!finite(fromServings) || fromServings <= 0) return fail(msg('The original recipe must serve at least some people (greater than 0).'));
  if (!finite(toServings) || toServings <= 0) return fail(msg('Enter how many servings you want, greater than 0.'));
  return ok(toServings / fromServings);
}

/** Scale the leading quantity of each recipe line; lines without a number are kept as they are. */
export function scaleRecipeLines(text: string, factor: number): string[] {
  return text.split(/\r?\n/).map((line) => {
    if (!line.trim()) return line;
    const { value, rest } = parseQuantity(line);
    if (!finite(value)) return line;
    return `${formatQuantity(value * factor)}${rest.startsWith(' ') ? '' : ' '}${rest}`.trimEnd();
  });
}

/* ------------------------------------------------------------------ */
/* Heat index and dew point                                            */
/* ------------------------------------------------------------------ */

/**
 * NWS heat index (Weather Prediction Center algorithm):
 * 1. Simple Steadman formula HI = 0.5 * (T + 61 + (T - 68) * 1.2 + RH * 0.094).
 * 2. If the average of that and T is 80°F or more, use the Rothfusz regression
 *    with the low-humidity and high-humidity adjustments.
 */
export function heatIndexF(tF: number, rh: number): { value: number; method: 'simple' | 'rothfusz'; adjustment: number } {
  const simple = 0.5 * (tF + 61 + (tF - 68) * 1.2 + rh * 0.094);
  if ((simple + tF) / 2 < 80) return { value: simple, method: 'simple', adjustment: 0 };
  let hi = -42.379 + 2.04901523 * tF + 10.14333127 * rh - 0.22475541 * tF * rh - 0.00683783 * tF * tF
    - 0.05481717 * rh * rh + 0.00122874 * tF * tF * rh + 0.00085282 * tF * rh * rh - 0.00000199 * tF * tF * rh * rh;
  let adjustment = 0;
  if (rh < 13 && tF >= 80 && tF <= 112) adjustment = -((13 - rh) / 4) * Math.sqrt((17 - Math.abs(tF - 95)) / 17);
  else if (rh > 85 && tF >= 80 && tF <= 87) adjustment = ((rh - 85) / 10) * ((87 - tF) / 5);
  hi += adjustment;
  return { value: hi, method: 'rothfusz', adjustment };
}

/** Magnus formula constants (Alduchov and Eskridge 1996), valid about -40°C to 50°C. */
export const MAGNUS_A = 17.625;
export const MAGNUS_B = 243.04;

export function dewPointC(tC: number, rh: number): number {
  const g = Math.log(rh / 100) + (MAGNUS_A * tC) / (MAGNUS_B + tC);
  return (MAGNUS_B * g) / (MAGNUS_A - g);
}

export function rhFromDewPoint(tC: number, tdC: number): number {
  return 100 * Math.exp((MAGNUS_A * tdC) / (MAGNUS_B + tdC) - (MAGNUS_A * tC) / (MAGNUS_B + tC));
}

export type HeatBand = 'none' | 'caution' | 'extreme-caution' | 'danger' | 'extreme-danger';
export const HEAT_BANDS: { id: HeatBand; label: string; range: string; effect: string }[] = [
  { id: 'none', label: msg('Below caution'), range: msg('under 80°F (27°C)'), effect: msg('No heat category. Normal precautions apply.') },
  { id: 'caution', label: msg('Caution'), range: msg('80 to 90°F (27 to 32°C)'), effect: msg('Fatigue possible with prolonged exposure or physical activity.') },
  { id: 'extreme-caution', label: msg('Extreme caution'), range: msg('90 to 103°F (32 to 39°C)'), effect: msg('Heat stroke, heat cramps or heat exhaustion possible with prolonged exposure or activity.') },
  { id: 'danger', label: msg('Danger'), range: msg('103 to 124°F (39 to 51°C)'), effect: msg('Heat cramps or heat exhaustion likely; heat stroke possible with prolonged exposure or activity.') },
  { id: 'extreme-danger', label: msg('Extreme danger'), range: msg('125°F (52°C) or higher'), effect: msg('Heat stroke highly likely.') },
];

export function heatBand(hiF: number): HeatBand {
  if (hiF >= 125) return 'extreme-danger';
  if (hiF >= 103) return 'danger';
  if (hiF >= 90) return 'extreme-caution';
  if (hiF >= 80) return 'caution';
  return 'none';
}

export type HeatIndexInput = { temp: number; tempUnit: 'F' | 'C'; humidityMode: 'rh' | 'dewpoint'; rh?: number; dewPoint?: number };
export type HeatIndexResult = { tF: number; tC: number; rh: number; dewPointC: number; dewPointF: number; hiF: number; hiC: number; method: 'simple' | 'rothfusz'; adjustment: number; band: HeatBand; outsideRange: boolean };

export function calculateHeatIndex(input: HeatIndexInput): Result<HeatIndexResult> {
  if (!finite(input.temp)) return fail(msg('Enter the air temperature.'));
  const tF = input.tempUnit === 'F' ? input.temp : cToF(input.temp);
  const tC = fToC(tF);
  let rh: number;
  if (input.humidityMode === 'rh') {
    rh = input.rh ?? NaN;
    if (!finite(rh) || rh <= 0 || rh > 100) return fail(msg('Relative humidity must be above 0% and no more than 100%.'));
  } else {
    const dp = input.dewPoint ?? NaN;
    if (!finite(dp)) return fail(msg('Enter the dew point.'));
    const dpC = input.tempUnit === 'F' ? fToC(dp) : dp;
    if (dpC > tC + 1e-9) return fail(msg('The dew point cannot be higher than the air temperature.'));
    rh = Math.min(100, rhFromDewPoint(tC, dpC));
  }
  if (tF < -40 || tF > 140) return fail(msg('Enter an air temperature between -40 and 140°F (-40 and 60°C).'));
  const dpC = dewPointC(tC, rh);
  const hi = heatIndexF(tF, rh);
  return ok({
    tF, tC, rh,
    dewPointC: dpC,
    dewPointF: cToF(dpC),
    hiF: hi.value,
    hiC: fToC(hi.value),
    method: hi.method,
    adjustment: hi.adjustment,
    band: heatBand(hi.value),
    // Steadman's tables cover roughly 80-110°F; outside them the regression extrapolates.
    outsideRange: hi.method === 'rothfusz' && (tF > 110 || hi.value > 137),
  });
}

/**
 * India Meteorological Department experimental heat index (launched 2023; PIB release 20 July 2023):
 * the same temperature-humidity heat index as the US NWS, read against IMD's colour bands in °C:
 * green below 35, yellow 36 to 45, orange 46 to 55, red above 55. IMD leaves 35 to 36 and 45 to 46 unassigned;
 * this tool rounds to the nearest degree, so 35 is green and 45 is yellow (MoES/PIB release PIB1941012).
 */
export type ImdHeatBand = 'green' | 'yellow' | 'orange' | 'red';
export const IMD_HEAT_BANDS: { id: ImdHeatBand; label: string; range: string }[] = [
  { id: 'green', label: msg('Green'), range: msg('below 35°C (35°C rounds to green)') },
  { id: 'yellow', label: msg('Yellow'), range: msg('36 to 45°C') },
  { id: 'orange', label: msg('Orange'), range: msg('46 to 55°C') },
  { id: 'red', label: msg('Red'), range: msg('above 55°C') },
];
export function imdHeatBand(hiC: number): ImdHeatBand {
  const r = Math.round(hiC);
  if (r > 55) return 'red';
  if (r >= 46) return 'orange';
  if (r >= 36) return 'yellow';
  return 'green';
}

/**
 * PAGASA (Philippines) heat index categories in °C, from the DOST-PAGASA heat index chart and iHeatMAP legend:
 * Caution 27 to 32, Extreme Caution 33 to 41, Danger 42 to 51, Extreme Danger 52 and above. PAGASA's chart
 * adapts its values from Steadman (1979) and its thresholds from the US NWS, and reports whole degrees, so this
 * rounds the heat index to the nearest degree before reading the band. Effects are translated from the Filipino
 * text of PAGASA's "Heat days survival" infographic (2022).
 */
export type PagasaHeatBand = 'none' | 'caution' | 'extreme-caution' | 'danger' | 'extreme-danger';
export const PAGASA_HEAT_BANDS: { id: PagasaHeatBand; label: string; range: string; effect: string }[] = [
  { id: 'none', label: msg('Below Caution'), range: msg('below 27°C'), effect: msg('No PAGASA heat category.') },
  { id: 'caution', label: msg('Caution'), range: msg('27 to 32°C'), effect: msg('Fatigue is possible with prolonged exposure and activity; continuing activity could lead to heat cramps.') },
  { id: 'extreme-caution', label: msg('Extreme Caution'), range: msg('33 to 41°C'), effect: msg('Heat cramps and heat exhaustion are possible; continuing activity could lead to heat stroke.') },
  { id: 'danger', label: msg('Danger'), range: msg('42 to 51°C'), effect: msg('Heat cramps and heat exhaustion are possible; continued exposure to the heat could lead to heat stroke.') },
  { id: 'extreme-danger', label: msg('Extreme Danger'), range: msg('52°C and above'), effect: msg('Heat stroke is possible.') },
];
export function pagasaHeatBand(hiC: number): PagasaHeatBand {
  const r = Math.round(hiC);
  if (r >= 52) return 'extreme-danger';
  if (r >= 42) return 'danger';
  if (r >= 33) return 'extreme-caution';
  if (r >= 27) return 'caution';
  return 'none';
}

/**
 * Australian Bureau of Meteorology apparent temperature (Steadman 1994, the non-radiation
 * form BoM publishes for observations in the shade):
 *   AT = Ta + 0.33 e - 0.70 ws - 4.00, with e = rh/100 x 6.105 x exp(17.27 Ta / (237.7 + Ta)) in hPa
 * and ws the 10 m wind speed in m/s.
 */
export function vapourPressureHpa(tC: number, rh: number): number {
  return (rh / 100) * 6.105 * Math.exp((17.27 * tC) / (237.7 + tC));
}
export function apparentTemperatureBoM(tC: number, rh: number, windMs: number): { at: number; e: number } {
  const e = vapourPressureHpa(tC, rh);
  return { at: tC + 0.33 * e - 0.7 * Math.max(0, windMs) - 4.0, e };
}

/* ------------------------------------------------------------------ */
/* Wind chill                                                          */
/* ------------------------------------------------------------------ */

export type WindUnit = 'mph' | 'kmh' | 'ms' | 'kn';
export const WIND_TO_KMH: Record<WindUnit, number> = { mph: KM_PER_MILE, kmh: 1, ms: 3.6, kn: 1.852 };
export const WIND_UNIT_LABELS: Record<WindUnit, string> = { mph: 'mph', kmh: 'km/h', ms: 'm/s', kn: msg('knots') };

/** NWS (2001) wind chill in °F, T in °F and V in mph at 10 m (33 ft). */
export const windChillF = (tF: number, vMph: number) => {
  const v = vMph ** 0.16;
  return 35.74 + 0.6215 * tF - 35.75 * v + 0.4275 * tF * v;
};

/** Environment Canada (MSC) wind chill index, T in °C and V in km/h at 10 m. Same JAG/TI 2001 model. */
export const windChillC = (tC: number, vKmh: number) => {
  const v = vKmh ** 0.16;
  return 13.12 + 0.6215 * tC - 11.37 * v + 0.3965 * tC * v;
};

export type FrostbiteRisk = { id: 'low' | 'moderate' | 'high' | 'very-high' | 'severe' | 'extreme'; label: string; range: string; time: string };

/** Environment Canada wind chill risk categories (wind chill in °C). */
export const FROSTBITE_RISKS: FrostbiteRisk[] = [
  { id: 'low', label: msg('Low risk'), range: msg('0 to -9'), time: msg('Frostbite unlikely for most people') },
  { id: 'moderate', label: msg('Moderate risk'), range: msg('-10 to -27'), time: msg('Frostbite possible with long exposure; cover up') },
  { id: 'high', label: msg('High risk'), range: msg('-28 to -39'), time: msg('Exposed skin can freeze in 10 to 30 minutes') },
  { id: 'very-high', label: msg('Very high risk'), range: msg('-40 to -47'), time: msg('Exposed skin can freeze in 5 to 10 minutes') },
  { id: 'severe', label: msg('Severe risk'), range: msg('-48 to -54'), time: msg('Exposed skin can freeze in 2 to 5 minutes') },
  { id: 'extreme', label: msg('Extreme risk'), range: msg('-55 and colder'), time: msg('Exposed skin can freeze in under 2 minutes') },
];

export function frostbiteRisk(wcC: number): FrostbiteRisk {
  const r = Math.round(wcC);
  if (r <= -55) return FROSTBITE_RISKS[5];
  if (r <= -48) return FROSTBITE_RISKS[4];
  if (r <= -40) return FROSTBITE_RISKS[3];
  if (r <= -28) return FROSTBITE_RISKS[2];
  if (r <= -10) return FROSTBITE_RISKS[1];
  return FROSTBITE_RISKS[0];
}

export type WindChillInput = { temp: number; tempUnit: 'F' | 'C'; wind: number; windUnit: WindUnit };
export type WindChillResult = {
  tF: number; tC: number; windMph: number; windKmh: number;
  valid: boolean; reason?: string;
  wcF: number; wcC: number; formula: 'NWS' | 'MSC';
  risk: FrostbiteRisk;
};

export function calculateWindChill(input: WindChillInput): Result<WindChillResult> {
  if (!finite(input.temp)) return fail(msg('Enter the air temperature.'));
  if (!finite(input.wind) || input.wind < 0) return fail(msg('Wind speed cannot be negative.'));
  const tF = input.tempUnit === 'F' ? input.temp : cToF(input.temp);
  const tC = input.tempUnit === 'C' ? input.temp : fToC(input.temp);
  const windKmh = input.wind * WIND_TO_KMH[input.windUnit];
  const windMph = windKmh / KM_PER_MILE;
  if (tF < -80) return fail(msg('Enter a temperature of -80°F (-62°C) or warmer.'));
  let reason: string | undefined;
  if (tF > 50 + 1e-9) reason = msg('Wind chill is only defined at 50°F (10°C) or colder. Above that, wind cooling is not a frostbite concern and the formula does not apply.');
  else if (windMph <= 3) reason = msg('Wind chill is only defined for wind above 3 mph (4.8 km/h). In calmer air the feels-like temperature is the air temperature.');
  // Use the formula native to the input unit so results match the published chart for that unit.
  const formula = input.tempUnit === 'F' ? 'NWS' : 'MSC';
  let wcF = formula === 'NWS' ? windChillF(tF, windMph) : cToF(windChillC(tC, windKmh));
  let wcC = formula === 'MSC' ? windChillC(tC, windKmh) : fToC(wcF);
  if (reason) { wcF = tF; wcC = tC; }
  return ok({ tF, tC, windMph, windKmh, valid: !reason, reason, wcF, wcC, formula, risk: frostbiteRisk(wcC) });
}
