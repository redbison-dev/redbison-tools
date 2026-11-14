/**
 * Home and DIY estimating maths for the paint, fence, wallpaper, pool volume,
 * grass seed and sod, insulation and ramp calculators. Pure functions, no React,
 * shared by the tool pages and the MCP calculator specs.
 *
 * Internal units are SI (metres, square metres, litres, kilograms) unless a
 * function says otherwise; the pages convert imperial inputs at the edge.
 */
import { msg, built, fillMsg, type MsgText } from '../../msg';

export const M_PER_FT = 0.3048;
export const M_PER_IN = 0.0254;
export const M2_PER_FT2 = M_PER_FT * M_PER_FT; // 0.09290304
export const L_PER_US_GAL = 3.785411784;
export const L_PER_IMP_GAL = 4.54609;
export const L_PER_FT3 = 28.316846592;
export const KG_PER_LB = 0.45359237;
export const ML_PER_US_FLOZ = 29.5735295625;
export const G_PER_OZ = 28.349523125;
/** 1 lb per 1,000 ft² expressed in g/m². */
export const GM2_PER_LB1000FT2 = (KG_PER_LB * 1000) / (1000 * M2_PER_FT2); // 4.8824
/** RSI (m²·K/W) per US R-value unit (ft²·°F·h/BTU). */
export const RSI_PER_R = 0.1761101838;

/** Ceiling that ignores floating-point dust (2.0000000001 -> 2) and never returns -0. */
export function ceilSafe(x: number): number {
  const c = Math.ceil(x - 1e-9);
  return c === 0 ? 0 : c;
}

const finitePos = (x: number) => Number.isFinite(x) && x > 0;

// ============================================================ containers

export type ContainerMix = { counts: { size: number; count: number }[]; total: number; containers: number };

/**
 * Cheapest-looking way to buy at least `needed` from container sizes: least
 * total volume, then fewest containers. `maxSmallest` caps how many of the
 * smallest size are allowed (three quarts usually cost more than one gallon).
 */
export function containerMix(needed: number, sizes: number[], maxSmallest = Infinity): ContainerMix {
  const s = [...sizes].filter(finitePos).sort((a, b) => b - a);
  if (!s.length) throw new Error(msg('No container sizes.'));
  if (!(needed > 1e-12)) return { counts: s.map((size) => ({ size, count: 0 })), total: 0, containers: 0 };
  if (!Number.isFinite(needed)) throw new Error(msg('Amount needed is too large to count in containers.'));
  if (needed / s[0] > 1e12) {
    // Past a trillion containers the mix is meaningless and counts stop being exact integers.
    const n = Math.ceil(needed / s[0]);
    return { counts: s.map((size, k) => ({ size, count: k === 0 ? n : 0 })), total: n * s[0], containers: n };
  }
  let best = null as { counts: number[]; total: number; n: number } | null;
  const counts = new Array(s.length).fill(0);
  // Most that sizes i.. can still add given their per-size caps; counts that leave
  // more than this uncovered can never finish, so the walk skips them (a 1e10 gal
  // order would otherwise try every count of 5 gal buckets from 2e9 down to 0).
  const cover = new Array(s.length + 1).fill(0);
  for (let k = s.length - 1; k >= 1; k--) {
    const cap = k === s.length - 1 ? maxSmallest : Math.ceil(s[k - 1] / s[k] - 1e-9);
    cover[k] = cover[k + 1] + cap * s[k];
  }
  const walk = (i: number, remaining: number, total: number, n: number) => {
    if (remaining <= 1e-9) {
      if (!best || total < best.total - 1e-9 || (Math.abs(total - best.total) <= 1e-9 && n < best.n)) best = { counts: [...counts], total, n };
      return;
    }
    if (i >= s.length) return;
    const size = s[i];
    const last = i === s.length - 1;
    const maxHere = last ? Math.min(ceilSafe(remaining / size), maxSmallest) : i === 0 ? ceilSafe(remaining / size) : Math.min(ceilSafe(remaining / size), ceilSafe(s[i - 1] / size));
    const minHere = Number.isFinite(cover[i + 1]) ? Math.max(0, Math.floor((remaining - cover[i + 1]) / size)) : 0;
    for (let c = maxHere; c >= minHere; c--) {
      counts[i] = c;
      walk(i + 1, remaining - c * size, total + c * size, n + c);
    }
    counts[i] = 0;
  };
  walk(0, needed, 0, 0);
  if (!best) {
    // smallest-size cap made it impossible below the largest size: round up in the largest size
    const n = ceilSafe(needed / s[0]);
    return { counts: s.map((size, k) => ({ size, count: k === 0 ? n : 0 })), total: n * s[0], containers: n };
  }
  const b = best as { counts: number[]; total: number; n: number };
  return { counts: s.map((size, k) => ({ size, count: b.counts[k] })), total: b.total, containers: b.n };
}

// ============================================================ paint

export type PaintInput = {
  /** Room length and width (any length unit L). */
  length: number;
  width: number;
  /** Wall height (L). */
  height: number;
  /** Number of identical rooms. */
  rooms?: number;
  includeWalls: boolean;
  includeCeiling: boolean;
  doors: number;
  /** Area of one door (L²). */
  doorArea: number;
  windows: number;
  /** Area of one window (L²). */
  windowArea: number;
  /** Any other unpainted area, per room (L²). */
  otherArea?: number;
  wallCoats: number;
  ceilingCoats: number;
  /** Coverage of one volume unit V per coat (L² per V), from the can. */
  coverage: number;
  /** Primer coats (0 for none) and primer coverage (L² per V). */
  primerCoats?: number;
  primerCoverage?: number;
  /** Extra for touch-ups and spillage, percent. */
  wastePct?: number;
};

export function paintEstimate(i: PaintInput) {
  const rooms = Math.max(1, Math.floor(i.rooms ?? 1));
  if (!finitePos(i.coverage)) throw new Error(msg('Coverage must be greater than zero.'));
  const wallGross = i.includeWalls ? 2 * (i.length + i.width) * i.height : 0;
  const openings = i.includeWalls ? i.doors * i.doorArea + i.windows * i.windowArea + (i.otherArea ?? 0) : 0;
  const wallNet = Math.max(0, wallGross - openings);
  const ceiling = i.includeCeiling ? i.length * i.width : 0;
  const waste = 1 + (i.wastePct ?? 0) / 100;
  const wallPaint = ((wallNet * i.wallCoats) / i.coverage) * waste * rooms;
  const ceilingPaint = ((ceiling * i.ceilingCoats) / i.coverage) * waste * rooms;
  const primerCoats = i.primerCoats ?? 0;
  const primerCoverage = i.primerCoverage && i.primerCoverage > 0 ? i.primerCoverage : i.coverage;
  const primer = primerCoats > 0 ? (((wallNet + ceiling) * primerCoats) / primerCoverage) * waste * rooms : 0;
  return {
    wallGross: wallGross * rooms,
    openings: Math.min(openings, wallGross) * rooms,
    wallNet: wallNet * rooms,
    ceiling: ceiling * rooms,
    paintedArea: (wallNet + ceiling) * rooms,
    wallPaint,
    ceilingPaint,
    paint: wallPaint + ceilingPaint,
    primer,
    openingsExceedWalls: i.includeWalls && openings > wallGross,
  };
}

/** US retail sizes in gallons (5 gal bucket, 1 gal, 1 qt); at most two quarts before a gallon is cheaper. */
export const US_PAINT_SIZES = [5, 1, 0.25];
/** Common metric tin sizes in litres. */
export const METRIC_PAINT_SIZES = [10, 5, 2.5, 1];

/**
 * Metric tin ranges by market, largest first. UK and European paint comes in
 * 10, 5, 2.5 and 1 L tins; Australian trade and retail paint in 15, 10, 4 and
 * 1 L; Indian emulsions in 20, 10, 4 and 1 L packs.
 */
export const PAINT_TIN_SETS = {
  eu: METRIC_PAINT_SIZES,
  au: [15, 10, 4, 1],
  in: [20, 10, 4, 1],
} as const satisfies Record<string, readonly number[]>;
export type PaintTinSet = keyof typeof PAINT_TIN_SETS;

/** Containers to buy. Metric uses `tins` (default the 10/5/2.5/1 L range); at most two of the smallest size. */
export function paintPurchase(volume: number, metric: boolean, tins: readonly number[] = METRIC_PAINT_SIZES): ContainerMix {
  return metric ? containerMix(volume, [...tins], 2) : containerMix(volume, US_PAINT_SIZES, 2);
}

// ============================================================ fence

export type FenceRun = { length: number; gates?: number };
export type FenceInput = {
  /** Straight runs (sides) of the fence in metres, each with the number of gates in it. */
  runs: FenceRun[];
  /** true if the last run returns to the first post (a fully enclosed yard). */
  closed?: boolean;
  /** Gate opening width (m), post face to post face. */
  gateWidth: number;
  /** Maximum post spacing, centre to centre (m). For panels this is the panel width. */
  spacing: number;
  style: 'picket' | 'panel';
  railsPerSection: number;
  /** Picket width and gap (m). Gap 0 for a privacy fence. */
  picketWidth: number;
  picketGap: number;
  /** Extra pickets and rails for splits and bad boards, percent. */
  wastePct: number;
  /** Post size (square, m), hole diameter and depth (m). */
  postWidth: number;
  holeDiameter: number;
  holeDepth: number;
  /** Fence height above ground (m), for the post length. */
  height: number;
};

export function fenceMaterials(i: FenceInput) {
  if (!finitePos(i.spacing)) throw new Error(msg('Post spacing must be greater than zero.'));
  if (!i.runs.length) throw new Error(msg('Add at least one run.'));
  let sections = 0;
  let gates = 0;
  let fenced = 0;
  let total = 0;
  let pickets = 0;
  const pitch = i.picketWidth + i.picketGap;
  const perRun = i.runs.map((r, k) => {
    const g = Math.max(0, Math.floor(r.gates ?? 0));
    const fenceLen = r.length - g * i.gateWidth;
    if (!(r.length > 0)) throw new Error(built(msg('Run {n} needs a length.'), { n: k + 1 }));
    if (fenceLen < -1e-9) throw new Error(built(msg('Run {n} is shorter than its gates.'), { n: k + 1 }));
    // gates split the run into g + 1 pieces; assume they are spaced evenly
    const piece = Math.max(0, fenceLen) / (g + 1);
    const perPiece = piece > 1e-9 ? ceilSafe(piece / i.spacing) : 0;
    const s = perPiece * (g + 1);
    sections += s;
    gates += g;
    fenced += Math.max(0, fenceLen);
    total += r.length;
    if (i.style === 'picket' && perPiece > 0 && pitch > 0) {
      const sectionLen = piece / perPiece;
      pickets += s * ceilSafe(sectionLen / pitch);
    }
    return { length: r.length, gates: g, fenceLength: Math.max(0, fenceLen), sections: s, sectionLength: perPiece ? piece / perPiece : 0, posts: s + g };
  });
  const posts = perRun.reduce((a, r) => a + r.posts, 0) + (i.closed ? 0 : 1);
  const waste = 1 + i.wastePct / 100;
  const rails = i.style === 'picket' ? ceilSafe(sections * i.railsPerSection * waste) : 0;
  const picketsToBuy = i.style === 'picket' ? ceilSafe(pickets * waste) : 0;
  const panels = i.style === 'panel' ? sections : 0;
  const holeVol = Math.PI * (i.holeDiameter / 2) ** 2 * i.holeDepth;
  const postVol = i.postWidth ** 2 * i.holeDepth;
  const concretePerPost = Math.max(0, holeVol - postVol);
  return {
    perRun,
    totalLength: total,
    fencedLength: fenced,
    sections,
    gates,
    posts,
    rails,
    pickets: picketsToBuy,
    picketsExact: pickets,
    panels,
    postLength: i.height + i.holeDepth,
    concretePerPostM3: concretePerPost,
    concreteM3: concretePerPost * posts,
  };
}

/** Bag yields in cubic feet of placed concrete (QUIKRETE / Sakrete data sheets; kg bags scaled by weight). */
export const FENCE_CONCRETE_BAGS = [
  { id: '50lb-fast', label: msg('50 lb fast-setting'), ft3: 0.375 },
  { id: '40lb', label: msg('40 lb concrete mix'), ft3: 0.3 },
  { id: '60lb', label: msg('60 lb concrete mix'), ft3: 0.45 },
  { id: '80lb', label: msg('80 lb concrete mix'), ft3: 0.6 },
  { id: '20kg', label: msg('20 kg bag'), ft3: (0.6 / (80 * KG_PER_LB)) * 20 },
  { id: '25kg', label: msg('25 kg bag'), ft3: (0.6 / (80 * KG_PER_LB)) * 25 },
  { id: '30kg', label: msg('30 kg bag'), ft3: (0.6 / (80 * KG_PER_LB)) * 30 },
] as const;

export function concreteBags(volumeM3: number, bagFt3: number): number {
  if (!(volumeM3 > 0) || !(bagFt3 > 0)) return 0;
  return ceilSafe(volumeM3 / (bagFt3 * L_PER_FT3 / 1000));
}

// ============================================================ wallpaper

export type WallpaperInput = {
  /** Total width of wall to paper (m): the perimeter, or the sum of the walls. */
  wallWidth: number;
  /** Wall height to paper (m). */
  height: number;
  /** Width of doors and full-height openings you will not paper (m). */
  openingsWidth: number;
  rollWidth: number;
  rollLength: number;
  /** Pattern repeat (m); 0 for a random/free match. */
  repeat: number;
  match: 'free' | 'straight' | 'half-drop';
  /** Trim allowance per strip, top and bottom together (m). */
  trim: number;
};

/** Strip method: count full-height drops, then how many come out of each roll. */
export function wallpaperRolls(i: WallpaperInput) {
  if (!finitePos(i.rollWidth) || !finitePos(i.rollLength)) throw new Error(msg('Roll width and length must be greater than zero.'));
  if (!finitePos(i.height)) throw new Error(msg('Wall height must be greater than zero.'));
  const width = Math.max(0, i.wallWidth - i.openingsWidth);
  const strips = width > 0 ? ceilSafe(width / i.rollWidth) : 0;
  const cut = i.height + i.trim;
  const repeat = i.match === 'free' ? 0 : Math.max(0, i.repeat);
  // each strip must start at the same point of the pattern, so it uses whole repeats;
  // a half-drop match offsets alternate strips by half a repeat
  const stripLength = repeat > 0 ? ceilSafe(cut / repeat) * repeat + (i.match === 'half-drop' ? repeat / 2 : 0) : cut;
  const stripsPerRoll = Math.floor(i.rollLength / stripLength + 1e-9);
  if (stripsPerRoll < 1) return { width, strips, cut, stripLength, stripsPerRoll: 0, rolls: NaN, tooTall: true as const, wastePerStrip: stripLength - i.height, rollArea: i.rollWidth * i.rollLength, coveredArea: width * i.height };
  const rolls = ceilSafe(strips / stripsPerRoll);
  return {
    width,
    strips,
    cut,
    stripLength,
    stripsPerRoll,
    rolls,
    tooTall: false as const,
    wastePerStrip: stripLength - i.height,
    rollArea: i.rollWidth * i.rollLength,
    coveredArea: width * i.height,
  };
}

/** Roll presets in metres. US rolls are priced per single roll but sold as double rolls. */
export const WALLPAPER_ROLLS = [
  { id: 'euro', label: msg('Standard Euro roll, 0.53 x 10.05 m'), width: 0.53, length: 10.05 },
  { id: 'euro-52', label: msg('Standard roll, 0.52 x 10.05 m'), width: 0.52, length: 10.05 },
  { id: 'euro-wide', label: msg('Wide roll, 0.70 x 10.05 m'), width: 0.7, length: 10.05 },
  { id: 'us-double', label: msg('US double roll, 20.5 in x 33 ft'), width: 20.5 * M_PER_IN, length: 33 * M_PER_FT },
  { id: 'us-double-27', label: msg('US double roll, 27 in x 27 ft'), width: 27 * M_PER_IN, length: 27 * M_PER_FT },
  { id: 'custom', label: msg('Custom size'), width: 0.53, length: 10.05 },
] as const;

// ============================================================ pool

export type PoolShape = 'rectangle' | 'round' | 'oval' | 'obround' | 'kidney' | 'custom';
export type PoolInput = {
  shape: PoolShape;
  /** Length (m) for rectangle, oval, obround and kidney; diameter (m) for round. */
  length: number;
  /** Width (m); for kidney the width at one end. */
  width: number;
  /** Kidney: width at the other end (m). */
  width2?: number;
  /** Surface area (m²) for a free-form pool. */
  area?: number;
  /** Water depth at the shallow and deep ends (m). Equal for a flat floor. */
  shallow: number;
  deep: number;
};

/** Surface area in m². The kidney figure is the trade rule of thumb 0.45 x (A + B) x length. */
export function poolSurfaceArea(i: PoolInput): number {
  switch (i.shape) {
    case 'rectangle':
      return i.length * i.width;
    case 'round':
      return Math.PI * (i.length / 2) ** 2;
    case 'oval':
      return (Math.PI / 4) * i.length * i.width;
    case 'obround': {
      const w = Math.min(i.width, i.length);
      return (i.length - w) * w + Math.PI * (w / 2) ** 2;
    }
    case 'kidney':
      return 0.45 * (i.width + (i.width2 ?? i.width)) * i.length;
    case 'custom':
      return i.area ?? 0;
  }
}

export function poolVolume(i: PoolInput) {
  const area = poolSurfaceArea(i);
  const avgDepth = (i.shallow + i.deep) / 2;
  const m3 = area * avgDepth;
  const litres = m3 * 1000;
  return { area, avgDepth, m3, litres, usGallons: litres / L_PER_US_GAL, impGallons: litres / L_PER_IMP_GAL, ft3: litres / L_PER_FT3 };
}

/**
 * Chlorine products. `strength` is available chlorine: for liquids, grams of
 * available chlorine per 100 mL (trade percent, as printed on pool chlorine);
 * for solids, percent by weight. Side effects per 1 ppm of free chlorine
 * added come from the molar ratios: trichlor 0.6 ppm CYA, dichlor 0.9 ppm CYA,
 * cal-hypo 0.7 ppm calcium hardness.
 */
export const CHLORINE_PRODUCTS = [
  { id: 'liquid-12.5', label: msg('Liquid chlorine 12.5%'), form: 'liquid', strength: 12.5, cya: 0, ch: 0 },
  { id: 'liquid-10', label: msg('Liquid chlorine 10%'), form: 'liquid', strength: 10, cya: 0, ch: 0 },
  { id: 'bleach-6', label: msg('Household bleach, about 6%'), form: 'liquid', strength: 6, cya: 0, ch: 0 },
  { id: 'calhypo-65', label: msg('Cal-hypo 65%'), form: 'solid', strength: 65, cya: 0, ch: 0.7 },
  { id: 'calhypo-73', label: msg('Cal-hypo 73%'), form: 'solid', strength: 73, cya: 0, ch: 0.7 },
  { id: 'dichlor-56', label: msg('Dichlor 56%'), form: 'solid', strength: 56, cya: 0.9, ch: 0 },
  { id: 'trichlor-90', label: msg('Trichlor 90%'), form: 'solid', strength: 90, cya: 0.6, ch: 0 },
] as const;

export type ChlorineProductId = (typeof CHLORINE_PRODUCTS)[number]['id'];

/** Amount of product to raise free chlorine by `ppm` (mg/L) in `litres` of water. */
export function chlorineDose(litres: number, ppm: number, productId: ChlorineProductId, strengthOverride?: number) {
  const p = CHLORINE_PRODUCTS.find((x) => x.id === productId) ?? CHLORINE_PRODUCTS[0];
  const strength = strengthOverride && strengthOverride > 0 ? strengthOverride : p.strength;
  const mg = Math.max(0, ppm) * litres; // mg of available chlorine
  if (p.form === 'liquid') {
    const ml = mg / (strength * 10); // strength% = strength*10 g/L = strength*10 mg/mL
    return { product: p, form: 'liquid' as const, ml, litres: ml / 1000, usFlOz: ml / ML_PER_US_FLOZ, usGallons: ml / 1000 / L_PER_US_GAL, grams: 0, oz: 0, lb: 0, cyaAdded: 0, chAdded: 0 };
  }
  const grams = mg / (strength / 100) / 1000;
  return { product: p, form: 'solid' as const, ml: 0, litres: 0, usFlOz: 0, usGallons: 0, grams, oz: grams / G_PER_OZ, lb: grams / 1000 / KG_PER_LB, cyaAdded: p.cya * ppm, chAdded: p.ch * ppm };
}

/** Salt (kg) to take a salt-water pool from `currentPpm` to `targetPpm`. */
export function saltDose(litres: number, currentPpm: number, targetPpm: number) {
  const kg = (Math.max(0, targetPpm - currentPpm) * litres) / 1e6;
  return { kg, lb: kg / KG_PER_LB };
}

// ============================================================ grass seed and sod

/** New-lawn seeding rates in lb per 1,000 ft² (typical extension ranges; the bag label wins). */
export const GRASS_SEEDS = [
  { id: 'tall-fescue', label: msg('Tall fescue'), min: 7, max: 9, rate: 8, season: 'cool' },
  { id: 'kentucky-bluegrass', label: msg('Kentucky bluegrass'), min: 1, max: 3, rate: 2, season: 'cool' },
  { id: 'perennial-ryegrass', label: msg('Perennial ryegrass'), min: 7, max: 9, rate: 8, season: 'cool' },
  { id: 'fine-fescue', label: msg('Fine (red) fescue'), min: 4, max: 6, rate: 5, season: 'cool' },
  { id: 'sun-shade-mix', label: msg('Sun and shade mix'), min: 4, max: 6, rate: 5, season: 'cool' },
  { id: 'bermudagrass', label: msg('Bermudagrass (hulled)'), min: 1, max: 2, rate: 1.5, season: 'warm' },
  { id: 'zoysiagrass', label: msg('Zoysiagrass'), min: 1, max: 2, rate: 1.5, season: 'warm' },
  { id: 'centipedegrass', label: msg('Centipedegrass'), min: 0.25, max: 1, rate: 0.5, season: 'warm' },
  { id: 'bahiagrass', label: msg('Bahiagrass'), min: 5, max: 10, rate: 7, season: 'warm' },
  { id: 'buffalograss', label: msg('Buffalograss'), min: 1, max: 3, rate: 2, season: 'warm' },
] as const;

/** Seed needed (kg) for an area (m²) at a rate in g/m²; overseeding uses half the rate. */
export function seedNeeded(areaM2: number, rateGm2: number, overseed: boolean, bagKg?: number) {
  const kg = (areaM2 * rateGm2 * (overseed ? 0.5 : 1)) / 1000;
  const bags = bagKg && bagKg > 0 ? ceilSafe(kg / bagKg) : 0;
  return { kg, lb: kg / KG_PER_LB, bags, rateUsedGm2: rateGm2 * (overseed ? 0.5 : 1) };
}

export const SOD_PIECES = [
  { id: 'slab-16x24', label: msg('Slab 16 x 24 in (2.67 ft²)'), areaM2: (16 * 24 * M_PER_IN * M_PER_IN) },
  { id: 'slab-18x24', label: msg('Slab 18 x 24 in (3 ft²)'), areaM2: 3 * M2_PER_FT2 },
  { id: 'roll-2x5', label: msg('Roll 2 x 5 ft (10 ft²)'), areaM2: 10 * M2_PER_FT2 },
  { id: 'roll-1m2', label: msg('Turf roll 1 m²'), areaM2: 1 },
] as const;

/** Sod pieces and pallets for an area (m²), with a waste allowance. */
export function sodNeeded(areaM2: number, pieceM2: number, palletM2: number, wastePct: number) {
  if (!finitePos(pieceM2)) throw new Error(msg('Piece size must be greater than zero.'));
  const withWaste = areaM2 * (1 + wastePct / 100);
  const pieces = ceilSafe(withWaste / pieceM2);
  const pallets = palletM2 > 0 ? (pieces * pieceM2) / palletM2 : 0;
  return { areaWithWaste: withWaste, pieces, pallets, fullPallets: ceilSafe(pallets), piecesPerPallet: palletM2 > 0 ? Math.floor(palletM2 / pieceM2 + 1e-9) : 0 };
}

// ============================================================ insulation

export const CLIMATE_ZONES = [
  { id: '1', label: msg('Zone 1'), examples: msg('Hawaii, Miami, Puerto Rico') },
  { id: '2', label: msg('Zone 2'), examples: msg('Houston, Phoenix, New Orleans, Orlando') },
  { id: '3', label: msg('Zone 3'), examples: msg('Atlanta, Dallas, Las Vegas, Los Angeles') },
  { id: '4AB', label: msg('Zone 4A or 4B'), examples: msg('Washington DC, St. Louis, Nashville, Albuquerque') },
  { id: '4C', label: msg('Zone 4C (marine)'), examples: msg('Seattle, Portland OR') },
  { id: '5', label: msg('Zone 5'), examples: msg('Chicago, Denver, Boston, Pittsburgh') },
  { id: '6', label: msg('Zone 6'), examples: msg('Minneapolis, Milwaukee, Burlington VT') },
  { id: '7', label: msg('Zone 7'), examples: msg('Duluth, northern Wisconsin, Anchorage') },
  { id: '8', label: msg('Zone 8'), examples: msg('Fairbanks and interior Alaska') },
] as const;
export type ClimateZone = (typeof CLIMATE_ZONES)[number]['id'];

/**
 * ENERGY STAR "Recommended Home Insulation R-Values" (based on 2021 IECC
 * Table R402.1.3): attic total for an uninsulated attic, R to add over 3-4 in
 * of existing insulation, floor over unconditioned space, and basement or
 * crawlspace wall as continuous sheathing or a cavity batt.
 */
export const ENERGY_STAR_R: Record<ClimateZone, { attic: number; atticAdd: number; floor: number; basementSheathing: number; basementBatt: number; wallSheathing: string }> = {
  '1': { attic: 30, atticAdd: 25, floor: 13, basementSheathing: 0, basementBatt: 0, wallSheathing: msg('none') },
  '2': { attic: 49, atticAdd: 38, floor: 13, basementSheathing: 0, basementBatt: 0, wallSheathing: msg('none') },
  '3': { attic: 49, atticAdd: 38, floor: 19, basementSheathing: 5, basementBatt: 13, wallSheathing: 'R5' },
  '4AB': { attic: 60, atticAdd: 49, floor: 19, basementSheathing: 10, basementBatt: 13, wallSheathing: msg('R5 to R10') },
  '4C': { attic: 60, atticAdd: 49, floor: 30, basementSheathing: 15, basementBatt: 19, wallSheathing: msg('R5 to R10') },
  '5': { attic: 60, atticAdd: 49, floor: 30, basementSheathing: 15, basementBatt: 19, wallSheathing: msg('R5 to R10') },
  '6': { attic: 60, atticAdd: 49, floor: 30, basementSheathing: 15, basementBatt: 19, wallSheathing: msg('R5 to R10') },
  '7': { attic: 60, atticAdd: 49, floor: 38, basementSheathing: 15, basementBatt: 19, wallSheathing: msg('R5 to R10') },
  '8': { attic: 60, atticAdd: 49, floor: 38, basementSheathing: 15, basementBatt: 19, wallSheathing: msg('R5 to R10') },
};

export type InsulationLocation = 'attic' | 'floor' | 'basement-wall' | 'wall-2x4' | 'wall-2x6';

/** Target R for a location: ENERGY STAR for attic, floor and basement walls; full cavity fill for frame walls. */
export function targetR(zone: ClimateZone, loc: InsulationLocation): number {
  const z = ENERGY_STAR_R[zone];
  switch (loc) {
    case 'attic':
      return z.attic;
    case 'floor':
      return z.floor;
    case 'basement-wall':
      return z.basementBatt;
    case 'wall-2x4':
      return 15;
    case 'wall-2x6':
      return 21;
  }
}

/** Typical settled R per inch (DOE: loose-fill cellulose 3.2-3.8, fiberglass 2.2-2.7). */
export const EXISTING_TYPES = [
  { id: 'none', label: msg('None'), rPerInch: 0 },
  { id: 'fiberglass-batt', label: msg('Fiberglass batts'), rPerInch: 3.1 },
  { id: 'loose-fiberglass', label: msg('Loose-fill fiberglass'), rPerInch: 2.5 },
  { id: 'cellulose', label: msg('Loose-fill cellulose'), rPerInch: 3.5 },
  { id: 'rock-wool', label: msg('Rock wool'), rPerInch: 3.0 },
] as const;

export const BATT_PRODUCTS = [
  { r: 11, inches: 3.5 },
  { r: 13, inches: 3.5 },
  { r: 15, inches: 3.5 },
  { r: 19, inches: 6.25 },
  { r: 21, inches: 5.5 },
  { r: 30, inches: 9.5 },
  { r: 38, inches: 12 },
] as const;

export type InsulationMaterial = 'batt' | 'loose-fiberglass' | 'loose-cellulose' | 'spray-open' | 'spray-closed';
export const MATERIAL_R_PER_INCH: Record<Exclude<InsulationMaterial, 'batt'>, number> = {
  'loose-fiberglass': 2.5,
  'loose-cellulose': 3.5,
  'spray-open': 3.6,
  'spray-closed': 6.5,
};

export type InsulationInput = {
  /** Area to insulate, ft². */
  areaFt2: number;
  targetR: number;
  existingInches: number;
  existingRPerInch: number;
  material: InsulationMaterial;
  /** Batt product R per layer (material 'batt'). */
  battR?: number;
  battInches?: number;
  /** ft² one pack of batts covers (from the label). */
  packFt2?: number;
  /** Loose fill: R per inch, and either ft² one bag covers at the target R (bag chart) or settled density and bag weight. */
  rPerInch?: number;
  bagFt2?: number;
  densityLbFt3?: number;
  bagLb?: number;
  /** Spray foam kit size in board feet. */
  kitBoardFeet?: number;
  wastePct?: number;
};

export function insulationPlan(i: InsulationInput) {
  const existingR = Math.max(0, i.existingInches) * Math.max(0, i.existingRPerInch);
  const rToAdd = Math.max(0, i.targetR - existingR);
  const waste = 1 + (i.wastePct ?? 0) / 100;
  const base = { existingR, rToAdd, alreadyMeets: rToAdd <= 0 };
  if (i.material === 'batt') {
    const battR = i.battR ?? 30;
    const layers = rToAdd > 0 ? ceilSafe(rToAdd / battR) : 0;
    const packs = i.packFt2 && i.packFt2 > 0 ? ceilSafe((i.areaFt2 * layers * waste) / i.packFt2) : 0;
    return { ...base, layers, addedR: layers * battR, totalR: existingR + layers * battR, inches: layers * (i.battInches ?? 0), packs, bags: 0, weightLb: 0, boardFeet: 0, kits: 0 };
  }
  const rpi = i.rPerInch && i.rPerInch > 0 ? i.rPerInch : MATERIAL_R_PER_INCH[i.material];
  const inches = rToAdd / rpi;
  if (i.material === 'spray-open' || i.material === 'spray-closed') {
    const boardFeet = i.areaFt2 * inches * waste;
    const kits = i.kitBoardFeet && i.kitBoardFeet > 0 ? ceilSafe(boardFeet / i.kitBoardFeet) : 0;
    return { ...base, layers: 0, addedR: rToAdd, totalR: existingR + rToAdd, inches, packs: 0, bags: 0, weightLb: 0, boardFeet, kits };
  }
  const weightLb = (i.areaFt2 * waste * inches * (i.densityLbFt3 ?? 0)) / 12;
  const bags = rToAdd <= 0 ? 0 : i.bagFt2 && i.bagFt2 > 0 ? ceilSafe((i.areaFt2 * waste) / i.bagFt2) : i.bagLb && i.bagLb > 0 && weightLb > 0 ? ceilSafe(weightLb / i.bagLb) : 0;
  return { ...base, layers: 0, addedR: rToAdd, totalR: existingR + rToAdd, inches, packs: 0, bags, weightLb, boardFeet: 0, kits: 0 };
}

// ============================================================ ramp

/** Market ramp rules (UK Approved Document M, AS 1428.1, Canadian building codes, India's Harmonised Guidelines 2021). */
export type LocalRampStandard = 'uk-adm2' | 'uk-adm1' | 'au-1428' | 'ca-bf' | 'ca-house' | 'in-hg';
export type RampStandard = 'ada' | 'ada-existing' | 'irc' | 'custom' | LocalRampStandard;

export type RampInput = {
  /** Total vertical rise (inches). */
  rise: number;
  /** Horizontal units per 1 unit of rise (12 for 1:12). */
  ratio: number;
  /** Maximum rise per run before a landing is required (inches); Infinity for none. */
  maxRunRise: number;
  /** Landing length in the direction of travel (inches). */
  landing: number;
  /** Count a landing at the top and the bottom in the footprint. */
  endLandings: boolean;
  /** Length of the top and bottom landings (inches) where a code sets it apart from intermediate landings; defaults to `landing`. */
  endLanding?: number;
  /** Horizontal handrail extension beyond each end of a run (inches); defaults to the ADA 12 in. */
  handrailExtension?: number;
};

export const ADA = { maxSlopeRatio: 12, maxRunRise: 30, landing: 60, minWidth: 36, handrailRise: 6, crossSlopeRatio: 48, handrailExtension: 12, handrailMin: 34, handrailMax: 38 } as const;
export const IRC_RAMP = { maxSlopeRatio: 12, landing: 36, handrailSlopeRatio: 12 } as const;

/** ADA 2010 Table 405.2: steeper slopes allowed in existing sites when space is limited. */
export function adaExistingMaxRise(ratio: number): number {
  if (ratio >= 12 - 1e-9) return ADA.maxRunRise;
  if (ratio >= 10 - 1e-9) return 6;
  if (ratio >= 8 - 1e-9) return 3;
  return 0;
}

export const slopePercent = (ratio: number) => 100 / ratio;
export const slopeDegrees = (ratio: number) => (Math.atan(1 / ratio) * 180) / Math.PI;
export const ratioFromPercent = (pct: number) => 100 / pct;
export const ratioFromDegrees = (deg: number) => 1 / Math.tan((deg * Math.PI) / 180);

export function rampDesign(i: RampInput) {
  if (!finitePos(i.rise)) throw new Error(msg('Rise must be greater than zero.'));
  if (!finitePos(i.ratio)) throw new Error(msg('Slope must be greater than zero.'));
  const run = i.rise * i.ratio;
  const slopeLength = Math.hypot(run, i.rise);
  const runs = Number.isFinite(i.maxRunRise) && i.maxRunRise > 0 ? Math.max(1, ceilSafe(i.rise / i.maxRunRise)) : 1;
  const risePerRun = i.rise / runs;
  const runPerRun = run / runs;
  const intermediate = runs - 1;
  const ends = i.endLandings ? 2 : 0;
  const footprint = run + intermediate * i.landing + ends * (i.endLanding ?? i.landing);
  const runLengthEach = slopeLength / runs;
  return {
    run,
    slopeLength,
    percent: slopePercent(i.ratio),
    degrees: slopeDegrees(i.ratio),
    runs,
    risePerRun,
    runPerRun,
    slopeLengthPerRun: runLengthEach,
    intermediateLandings: intermediate,
    landings: intermediate + ends,
    footprint,
    // ADA 505.10: handrails extend 12 in horizontally beyond the top and bottom of each run
    handrailPerSide: runs * (runLengthEach + 2 * (i.handrailExtension ?? ADA.handrailExtension)),
  };
}

/** text is English; textMsg, when it carries values, is its template for t(text, vars). */
export type RampCheck = { ok: boolean; text: string; textMsg?: MsgText };
const check = (ok: boolean, text: string, vars: MsgText['vars']): RampCheck => ({ ok, text: fillMsg({ text, vars }), textMsg: { text, vars } });

/** Compliance notes for the chosen standard. Width and rise in inches; `metric` switches the wording to mm. */
export function rampChecks(standard: RampStandard, ratio: number, rise: number, width: number, risePerRun: number, metric = false): RampCheck[] {
  if (standard in LOCAL_RAMP_RULES) return localRampChecks(standard as LocalRampStandard, ratio, rise * 25.4, width * 25.4, risePerRun * 25.4, metric);
  const out: RampCheck[] = [];
  const L = (inches: number, mm?: number) => (metric ? `${mm ?? Math.round(inches * 25.4)} mm` : `${fmt1(inches)} in`);
  if (standard === 'ada' || standard === 'ada-existing') {
    if (standard === 'ada') out.push(check(ratio >= 12 - 1e-9, ratio >= 12 - 1e-9 ? msg('Running slope 1:{ratio} meets the 1:12 maximum (ADA 405.2)') : msg('Running slope 1:{ratio} is steeper than the 1:12 maximum (ADA 405.2)'), { ratio: fmt1(ratio) }));
    else {
      const max = adaExistingMaxRise(ratio);
      out.push(check(max > 0 && rise <= max + 1e-9, max === 0 ? msg('1:{ratio} is steeper than 1:8, which Table 405.2 never allows') : msg('At 1:{ratio} an existing-site ramp may rise {max} at most (ADA Table 405.2); this one rises {rise}'), { ratio: fmt1(ratio), max: L(max, max === 6 ? 150 : max === 3 ? 75 : 760), rise: L(rise) }));
    }
    out.push(check(risePerRun <= ADA.maxRunRise + 1e-9, msg('Rise per run {rise} ({max} maximum, ADA 405.6)'), { rise: L(risePerRun), max: L(30, 760) }));
    out.push(check(width >= ADA.minWidth - 1e-9, msg('Clear width {width} ({min} minimum between handrails, ADA 405.5)'), { width: L(width), min: L(36, 915) }));
    out.push(check(true, risePerRun > ADA.handrailRise ? msg('Handrails on both sides are required: rise per run is over {rise} (ADA 405.8), {height} high (505.4)') : msg('Handrails are not required: rise per run is {rise} or less (ADA 405.8)'), { rise: L(6, 150), height: metric ? msg('865 to 965 mm') : msg('34 to 38 in') }));
    out.push(check(true, msg('Landings at the top and bottom of every run, {length} long and at least as wide as the ramp; {turn} where the ramp turns (ADA 405.7)'), { length: L(60, 1525), turn: metric ? '1525 x 1525 mm' : '60 x 60 in' }));
    out.push({ ok: true, text: msg('Cross slope no steeper than 1:48 and edge protection on drop-offs (ADA 405.3, 405.9)') });
  } else if (standard === 'irc') {
    out.push(check(ratio >= 12 - 1e-9, ratio >= 12 - 1e-9 ? msg('1:{ratio} meets the IRC 1:12 maximum (R311.8.1)') : msg('1:{ratio} is steeper than 1:12; the IRC allows up to 1:8 only where 1:12 is technically infeasible'), { ratio: fmt1(ratio) }));
    out.push({ ok: true, text: ratio < 12 - 1e-9 ? msg('Handrail required on at least one side: slope exceeds 1:12 (R311.8.3)') : msg('IRC requires a handrail only on ramps steeper than 1:12 (R311.8.3); one is still wise') });
    out.push(check(true, msg('{size} landings at the top, the bottom, at doors and where the ramp turns (R311.8.2)'), { size: metric ? '914 x 914 mm' : '36 x 36 in' }));
  }
  return out;
}

const fmt1 = (x: number) => (Math.round(x * 10) / 10).toString();

export type LocalRampRule = {
  /** Steepest slope allowed, as n in 1:n. */
  steepest: number;
  /** Minimum clear width, mm. */
  minWidthMm: number;
  /** Top and bottom landing length and intermediate landing length, mm (0 = the rule sets none). */
  endLandingMm: number;
  landingMm: number;
  /** Handrail extension beyond each end of a run, mm. */
  handrailExtMm: number;
  /** Longest horizontal run of one flight at slope 1:n, mm (Infinity for no limit). */
  maxRunMm: (n: number) => number;
  /** Highest rise of one flight at slope 1:n, mm (Infinity for no limit). */
  maxRiseMm: (n: number) => number;
  /** Larger intermediate landings (passing places) once a ramp has at least `minFlights` flights, mm. */
  passingPlace?: { minFlights: number; mm: number };
};

const lerpTable = (pts: [number, number][], n: number) => {
  if (n <= pts[0][0]) return pts[0][1];
  for (let k = 1; k < pts.length; k++) {
    const [x0, y0] = pts[k - 1];
    const [x1, y1] = pts[k];
    if (n <= x1) return y0 + ((y1 - y0) * (n - x0)) / (x1 - x0);
  }
  return pts[pts.length - 1][1];
};

/** India, Harmonised Guidelines 2021 Table 1: maximum horizontal run (m) by gradient, interpolated between rows. */
export const IN_HG_RAMP_RUNS: [number, number][] = [
  [12, 6],
  [14, 9],
  [15, 11],
  [20, 15],
  [25, 18],
];

/**
 * Ramp rules by market. Lengths in mm.
 * - uk-adm2: Approved Document M Vol 2 (buildings other than dwellings) 1.26 and Table 1: going 2 m at 1:12,
 *   5 m at 1:15, 10 m at 1:20, interpolated (going = n - 10 m), no flight over 10 m going or 500 mm rise;
 *   1.5 m surface width; 1.2 m top and bottom landings, 1.5 m intermediate, or 1.8 x 1.8 m passing places when the
 *   ramp has three or more flights (1.26j); handrails extend 300 mm (1.37).
 * - uk-adm1: Approved Document M Vol 1, M4(1) visitable dwelling, 1.7 (approach to a dwelling): flights up to 1:15
 *   at most 10 m long, up to 1:12 at most 5 m; 900 mm clear width; landings 1200 mm. M4(2) and M4(3) dwellings use
 *   2.10 and Diagram 2.1 instead (a 1:12 flight at most 2 m), which this rule does not model.
 * - au-1428: AS 1428.1 as cited by NCC D4D12: 1:14 maximum for ramps over 1,900 mm, landings at most 9 m apart at
 *   1:14 and 15 m at 1:20, interpolated (n - 5 m); a step ramp up to 1:10 for at most 1,900 mm; 1,000 mm between
 *   handrails; 1,200 mm landings.
 * - ca-bf: barrier-free ramp under the Ontario Building Code (Div. B 3.8.3.4 in the 2012 edition; the 2024 edition,
 *   O. Reg. 163/24, has not been checked) and NBC-based
 *   provincial codes: 1 in 12 maximum, a level area at most every 9 m of length, 1,670 mm landings (Ontario),
 *   900 mm between handrails (Ontario; 1,000 mm in Manitoba), handrails extend 300 mm.
 * - ca-house: Part 9 ramp serving a single dwelling (Ontario 9.8.5): exterior slope at most 1 in 10, width 860 mm,
 *   and a 1,500 mm maximum rise between landings where the slope is steeper than 1 in 12.
 * - in-hg: Harmonised Guidelines and Standards for Universal Accessibility in India 2021, ramps section (as reproduced
 *   by PFRDA, whose clause numbers are its own): 1:12 maximum,
 *   Table 1 runs (6 m at 1:12 to 18 m at 1:25), landings at most every 9,000 mm of horizontal run and
 *   1,200 x 1,500 mm, 1,200 mm clear width, at most four runs, handrail extensions 300 mm.
 */
export const LOCAL_RAMP_RULES: Record<LocalRampStandard, LocalRampRule> = {
  'uk-adm2': { steepest: 12, minWidthMm: 1500, endLandingMm: 1200, landingMm: 1500, handrailExtMm: 300, maxRunMm: (n) => Math.min(10, Math.max(2, n - 10)) * 1000, maxRiseMm: () => 500, passingPlace: { minFlights: 3, mm: 1800 } },
  'uk-adm1': { steepest: 12, minWidthMm: 900, endLandingMm: 1200, landingMm: 1200, handrailExtMm: 300, maxRunMm: (n) => (n >= 15 - 1e-9 ? 10000 : 5000), maxRiseMm: () => Infinity },
  'au-1428': { steepest: 10, minWidthMm: 1000, endLandingMm: 1200, landingMm: 1200, handrailExtMm: 300, maxRunMm: (n) => (n < 14 - 1e-9 ? 1900 : Math.min(15, n - 5) * 1000), maxRiseMm: (n) => (n < 14 - 1e-9 ? 190 : Infinity) },
  'ca-bf': { steepest: 12, minWidthMm: 900, endLandingMm: 1670, landingMm: 1670, handrailExtMm: 300, maxRunMm: () => 9000, maxRiseMm: () => Infinity },
  'ca-house': { steepest: 10, minWidthMm: 860, endLandingMm: 0, landingMm: 0, handrailExtMm: 300, maxRunMm: () => Infinity, maxRiseMm: (n) => (n < 12 - 1e-9 ? 1500 : Infinity) },
  'in-hg': { steepest: 12, minWidthMm: 1200, endLandingMm: 1500, landingMm: 1500, handrailExtMm: 300, maxRunMm: (n) => Math.min(lerpTable(IN_HG_RAMP_RUNS, n), 9) * 1000, maxRiseMm: () => Infinity },
};

export const isLocalRamp = (s: string): s is LocalRampStandard => s in LOCAL_RAMP_RULES;

/** Highest rise one flight may have under a market rule at slope 1:n, mm: the smaller of the rise cap and the longest run / n. */
export function localMaxRunRiseMm(std: LocalRampStandard, n: number): number {
  const r = LOCAL_RAMP_RULES[std];
  return Math.min(r.maxRiseMm(n), r.maxRunMm(n) / n);
}

/** Flights a market rule splits a rise of riseMm at slope 1:n into (the same count rampDesign gives). */
export function localRampFlights(std: LocalRampStandard, riseMm: number, n: number): number {
  const max = localMaxRunRiseMm(std, n);
  return Number.isFinite(max) && max > 0 && riseMm > 0 ? Math.max(1, ceilSafe(riseMm / max)) : 1;
}

/** Intermediate landing length a market rule asks for, mm: passing places once the ramp has enough flights (ADM Vol 2 1.26j). */
export function localIntermediateLandingMm(std: LocalRampStandard, flights: number): number {
  const r = LOCAL_RAMP_RULES[std];
  return r.passingPlace && flights >= r.passingPlace.minFlights ? Math.max(r.landingMm, r.passingPlace.mm) : r.landingMm;
}

/** Compliance notes for a market rule. Lengths in mm; `metric` false shows inches. */
export function localRampChecks(std: LocalRampStandard, n: number, riseMm: number, widthMm: number, risePerRunMm: number, metric = true): RampCheck[] {
  const r = LOCAL_RAMP_RULES[std];
  const L = (mm: number) => (metric ? `${Math.round(mm)} mm` : `${fmt1(mm / 25.4)} in`);
  const M = (mm: number) => (metric ? `${fmt1(mm / 1000)} m` : `${fmt1(mm / 304.8)} ft`);
  const runs = risePerRunMm > 0 ? Math.max(1, Math.round(riseMm / risePerRunMm)) : 1;
  const runPerFlight = risePerRunMm * n;
  const out: RampCheck[] = [];
  const steepOk = n >= r.steepest - 1e-9;
  const maxRise = localMaxRunRiseMm(std, n);
  switch (std) {
    case 'uk-adm2':
      out.push(check(steepOk, steepOk ? msg('1:{n} is no steeper than 1:12, the limit in Approved Document M Vol 2, Table 1') : msg('1:{n} is steeper than 1:12, the steepest gradient Approved Document M allows'), { n: fmt1(n) }));
      out.push(check(risePerRunMm <= maxRise + 1e-6, msg('At 1:{n} a flight may have a going of {going} and a rise of {maxRise} at most (Table 1, interpolated; 500 mm cap); each flight here rises {rise} over {run}'), { n: fmt1(n), going: M(r.maxRunMm(n)), maxRise: L(maxRise), rise: L(risePerRunMm), run: M(runPerFlight) }));
      out.push(check(widthMm >= r.minWidthMm - 1e-6, msg('Surface width {width} ({min} minimum between walls, upstands or kerbs, 1.26e)'), { width: L(widthMm), min: L(1500) }));
      out.push(check(true, msg('Landings {end} long at the foot and head and {between} between flights, clear of door swings (1.26h, i); handrails on both sides, 900 to 1000 mm above the pitch line (1.26l, 1.37)'), { end: L(1200), between: L(1500) }));
      if (runs >= r.passingPlace!.minFlights) out.push(check(true, msg('With {runs} flights the intermediate landings must be passing places at least {size} x {size} (1.26j), so enter at least {size} as the landing length'), { runs, size: L(1800) }));
      out.push(check(true, riseMm > 300 + 1e-6 ? msg('Total rise is over {limit}, so clearly signposted steps are needed as well as the ramp (1.26n)') : msg('Total rise is {limit} or less, so steps alongside are not required (1.26n)'), { limit: L(300) }));
      if (riseMm > 2000 + 1e-6) out.push(check(false, msg('Total rise is over {limit}: provide an alternative such as a lift for wheelchair users (1.26d)'), { limit: M(2000) }));
      break;
    case 'uk-adm1':
      out.push(check(steepOk, steepOk ? msg('1:{n} is no steeper than 1:12 (Approved Document M Vol 1, M4(1), 1.7)') : msg('1:{n} is steeper than 1:12, which a ramped approach to a dwelling may not be'), { n: fmt1(n) }));
      out.push(check(steepOk && runPerFlight <= r.maxRunMm(n) + 1e-6, n >= 15 - 1e-9 ? msg('At 1:{n} a flight may be {max} long at most (up to 1:15); each flight here is {run}') : msg('At 1:{n} a flight may be {max} long at most (steeper than 1:15, up to 1:12); each flight here is {run}'), { n: fmt1(n), max: M(r.maxRunMm(n)), run: M(runPerFlight) }));
      out.push(check(widthMm >= r.minWidthMm - 1e-6, msg('Clear width {width} ({min} minimum for every flight, 1.7b)'), { width: L(widthMm), min: L(900) }));
      out.push(check(true, msg('Top and bottom landings and one between flights, each at least {length} long and clear of door or gate swings (1.7c to e)'), { length: L(1200) }));
      out.push(check(true, msg('These are the M4(1) visitable dwelling limits. If the planning permission requires M4(2) or M4(3), Diagram 2.1 applies instead: at 1:12 a flight may only be {length} long (2.10)'), { length: M(2000) }));
      break;
    case 'au-1428': {
      const stepRamp = n < 14 - 1e-9;
      if (stepRamp) out.push(check(steepOk && riseMm <= 190 + 1e-6 && runPerFlight <= 1900 + 1e-6, steepOk ? msg('Steeper than 1:14 is only a step ramp under AS 1428.1: no steeper than 1:10, at most {maxLength} long and {maxRise} high; this one rises {rise} over {run}') : msg('1:{n} is steeper than 1:10, beyond even a step ramp under AS 1428.1'), { n: fmt1(n), maxLength: L(1900), maxRise: L(190), rise: L(riseMm), run: L(runPerFlight * runs) }));
      else out.push(check(true, msg('1:{n} is within the 1:14 maximum for a ramp longer than {length} (AS 1428.1, via NCC D4D12)'), { n: fmt1(n), length: L(1900) }));
      if (!stepRamp) out.push(check(runPerFlight <= r.maxRunMm(n) + 1e-6, msg('At 1:{n} landings are needed at least every {every} (9 m at 1:14, 15 m at 1:20, interpolated); each run here is {run}'), { n: fmt1(n), every: M(r.maxRunMm(n)), run: M(runPerFlight) }));
      out.push(check(widthMm >= r.minWidthMm - 1e-6, msg('Clear width {width} ({min} minimum between handrails)'), { width: L(widthMm), min: L(1000) }));
      out.push(check(true, msg('Landings at least {length} long at the top, the bottom and between runs; handrails and kerbs or kerb rails as AS 1428.1 sets for the ramp type'), { length: L(1200) }));
      out.push(check(riseMm <= 3600 + 1e-6, msg('NCC D4D12: a ramp on an accessway may not connect levels more than {limit} apart; this rise is {rise}'), { limit: M(3600), rise: L(riseMm) }));
      break;
    }
    case 'ca-bf':
      out.push(check(steepOk, steepOk ? msg('1 in {n} meets the 1 in 12 maximum for a barrier-free ramp') : msg('1 in {n} is steeper than the 1 in 12 maximum for a barrier-free ramp'), { n: fmt1(n) }));
      out.push(check(runPerFlight <= 9000 + 1e-6, msg('A level landing at least every {every} along the ramp; each run here is {run}'), { every: M(9000), run: M(runPerFlight) }));
      out.push(check(widthMm >= r.minWidthMm - 1e-6, msg("Width {width} between handrails ({min} minimum under the Ontario Building Code 2012, check the 2024 edition; Manitoba's code asks for {manitoba})"), { width: L(widthMm), min: L(900), manitoba: L(1000) }));
      out.push(check(true, msg("Level areas of {size} x {size} at the top and bottom in Ontario (2012 code); handrails on both sides 865 to 965 mm high; a curb or rail at the edges. Curb heights, intermediate landing sizes and handrail extensions differ by province, so enter your province's landing size"), { size: L(1670) }));
      break;
    case 'ca-house':
      out.push(check(steepOk, steepOk ? msg('1 in {n} is within the 1 in 10 maximum for an exterior ramp to a house (Ontario Building Code 2012, 9.8.5.4; check the 2024 edition)') : msg('1 in {n} is steeper than the 1 in 10 maximum for an exterior ramp (Ontario Building Code 2012, 9.8.5.4)'), { n: fmt1(n) }));
      out.push(check(risePerRunMm <= maxRise + 1e-6, n < 12 - 1e-9 ? msg('Steeper than 1 in 12, so no more than {max} of rise between landings (9.8.5.5); each run rises {rise}') : msg('At 1 in 12 or gentler Part 9 sets no rise limit between landings; a barrier-free ramp would still need one every {every}'), { max: L(1500), rise: L(risePerRunMm), every: M(9000) }));
      out.push(check(widthMm >= r.minWidthMm - 1e-6, msg('Width {width} ({min} minimum for a ramp serving a single dwelling, 9.8.5.2)'), { width: L(widthMm), min: L(860) }));
      break;
    case 'in-hg':
      out.push(check(steepOk, steepOk ? msg('1:{n} is no steeper than 1:12 (Harmonised Guidelines 2021, Table 1)') : msg('1:{n} is steeper than 1:12, the steepest gradient in the Harmonised Guidelines'), { n: fmt1(n) }));
      out.push(check(steepOk && runPerFlight <= r.maxRunMm(n) + 1e-6, msg('Table 1 allows a horizontal run of {table} at 1:{n} and landings come at least every 9 m, so each run may be {max}; this one is {run}'), { table: M(lerpTable(IN_HG_RAMP_RUNS, n) * 1000), n: fmt1(n), max: M(r.maxRunMm(n)), run: M(runPerFlight) }));
      out.push(check(runs <= 4, msg.plural(runs, { one: '{runs} run (no more than 4, that is 3 intermediate landings)', other: '{runs} runs (no more than 4, that is 3 intermediate landings)' }), { runs }));
      out.push(check(widthMm >= r.minWidthMm - 1e-6, msg('Clear width {width} ({min} minimum)'), { width: L(widthMm), min: L(1200) }));
      out.push(check(true, risePerRunMm > 150 ? msg('Landings at least {width} x {length} at the top and bottom of each run; handrails on both sides, 750 to 900 mm high, extending 300 mm past each end; a 75 mm kerb at open edges (Harmonised Guidelines 2021, ramps section)') : msg('Landings at least {width} x {length} at the top and bottom of each run; handrails on both sides become mandatory once a run rises over 150 mm; a 75 mm kerb at open edges (Harmonised Guidelines 2021, ramps section)'), { width: L(1200), length: L(1500) }));
      break;
  }
  return out;
}
