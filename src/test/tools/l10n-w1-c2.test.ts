/**
 * Market methods added for the home-improvement market versions (localization
 * wave 1, batch c2): Australian (15, 10, 4, 1 L) and Indian (20, 10, 4, 1 L)
 * paint tins, feet with litre tins for Indian sq ft per litre coverage, a 30 kg
 * Canadian concrete bag for fence posts and a 0.52 m UK wallpaper roll. The US
 * and existing metric behaviour is unchanged.
 */
import { describe, expect, it } from 'vitest';
import {
  FENCE_CONCRETE_BAGS,
  METRIC_PAINT_SIZES,
  PAINT_TIN_SETS,
  WALLPAPER_ROLLS,
  concreteBags,
  fenceMaterials,
  paintEstimate,
  paintPurchase,
  wallpaperRolls,
  M_PER_FT,
  M_PER_IN,
} from '@/lib/tools/w500/home';
import { paintSteps } from '@/lib/tools/steps/s10';

const counts = (b: ReturnType<typeof paintPurchase>) => Object.fromEntries(b.counts.filter((c) => c.count > 0).map((c) => [c.size, c.count]));
const room = { rooms: 1, otherArea: 0, primerCoats: 0, wastePct: 0, includeWalls: true, includeCeiling: false, wallCoats: 2, ceilingCoats: 2 };

describe('paint tins by market', () => {
  it('keeps the UK and European range as the default', () => {
    expect(PAINT_TIN_SETS.eu).toBe(METRIC_PAINT_SIZES);
    expect(counts(paintPurchase(7.3, true))).toEqual({ 5: 1, 2.5: 1 });
    expect(counts(paintPurchase(7.3, true, PAINT_TIN_SETS.eu))).toEqual({ 5: 1, 2.5: 1 });
    expect(counts(paintPurchase(1.67, false))).toEqual({ 1: 2 });
  });

  it('buys an Australian bedroom in 4 L and 1 L tins at the 16 m²/L Dulux spread rate', () => {
    const e = paintEstimate({ ...room, length: 4, width: 3.6, height: 2.4, doors: 1, doorArea: 1.7, windows: 1, windowArea: 2.16, coverage: 16 });
    expect(e.wallNet).toBeCloseTo(32.62, 2);
    expect(e.paint).toBeCloseTo(4.08, 2);
    expect(counts(paintPurchase(e.paint, true, PAINT_TIN_SETS.au))).toEqual({ 4: 1, 1: 1 });
    expect(counts(paintPurchase(e.paint, true))).toEqual({ 2.5: 1, 1: 2 });
    expect(counts(paintPurchase(16.31, true, PAINT_TIN_SETS.au))).toEqual({ 15: 1, 1: 2 });
  });

  it('sizes an Indian room in feet with litre packs (250 to 270 sq ft per litre per coat)', () => {
    const e = paintEstimate({ ...room, includeCeiling: true, length: 12, width: 10, height: 10, doors: 1, doorArea: 21, windows: 1, windowArea: 16, coverage: 260 });
    expect(e.wallNet).toBe(403);
    expect(e.ceiling).toBe(120);
    expect(e.paint).toBeCloseTo(4.02, 2);
    expect(counts(paintPurchase(e.paint, true, PAINT_TIN_SETS.in))).toEqual({ 4: 1, 1: 1 });
    expect(counts(paintPurchase(16.09, true, PAINT_TIN_SETS.in))).toEqual({ 10: 1, 4: 2 });
  });

  it('labels steps in feet with litres and names the market tin range', () => {
    const steps = paintSteps({ ...room, length: 12, width: 10, height: 10, doors: 1, doorArea: 21, windows: 1, windowArea: 16, coverage: 260, metric: true, lengthUnit: 'ft', tins: PAINT_TIN_SETS.in });
    expect(steps[0].result).toBe('440 ft²');
    expect(steps.at(-1)!.formula).toBe('least total volume from 20, 10, 4 and 1 L tins');
    expect(steps.at(-1)!.result).toBe('1 x 4 L tin');
    const metric = paintSteps({ ...room, length: 5, width: 4, height: 2.5, doors: 1, doorArea: 1.9, windows: 2, windowArea: 1.44, coverage: 10, metric: true });
    expect(metric.at(-1)!.formula).toBe('least total volume from 10, 5, 2.5 and 1 L tins');
    expect(metric[0].result).toBe('45 m²');
  });
});

describe('fence concrete in 30 kg bags', () => {
  it('scales a 30 kg bag by weight from the 80 lb yield and leaves the other bags alone', () => {
    const y = Object.fromEntries(FENCE_CONCRETE_BAGS.map((b) => [b.id, b.ft3]));
    expect(y['30kg'] / y['25kg']).toBeCloseTo(1.2, 10);
    expect(y['80lb']).toBe(0.6);
    expect(FENCE_CONCRETE_BAGS[3].id).toBe('80lb');
  });

  it('sets 4x4 posts 48 in deep for a Canadian frost line: about 52 L and 4 bags a post', () => {
    const o = fenceMaterials({
      runs: [{ length: 60 * M_PER_FT }, { length: 40 * M_PER_FT, gates: 1 }, { length: 60 * M_PER_FT }],
      closed: false,
      gateWidth: 4 * M_PER_FT,
      spacing: 8 * M_PER_FT,
      style: 'picket',
      railsPerSection: 3,
      picketWidth: 5.5 * M_PER_IN,
      picketGap: 0,
      wastePct: 5,
      postWidth: 3.5 * M_PER_IN,
      holeDiameter: 10 * M_PER_IN,
      holeDepth: 48 * M_PER_IN,
      height: 6 * M_PER_FT,
    });
    const bag = FENCE_CONCRETE_BAGS.find((b) => b.id === '30kg')!;
    expect(o.posts).toBe(24);
    expect(o.concretePerPostM3 * 1000).toBeCloseTo(52.14, 1);
    expect(concreteBags(o.concretePerPostM3, bag.ft3)).toBe(4);
    expect(concreteBags(o.concreteM3, bag.ft3)).toBe(90);
  });
});

describe('UK 0.52 m wallpaper roll', () => {
  it('is 10.05 m long and can need one more strip than a 0.53 m roll', () => {
    const r52 = WALLPAPER_ROLLS.find((r) => r.id === 'euro-52')!;
    const r53 = WALLPAPER_ROLLS.find((r) => r.id === 'euro')!;
    expect(WALLPAPER_ROLLS[0].id).toBe('euro');
    expect([r52.width, r52.length]).toEqual([0.52, 10.05]);
    const wall = { wallWidth: 14, height: 2.4, openingsWidth: 0.8, repeat: 0, match: 'free' as const, trim: 0.1 };
    expect(wallpaperRolls({ ...wall, rollWidth: r52.width, rollLength: r52.length }).strips).toBe(26);
    expect(wallpaperRolls({ ...wall, rollWidth: r53.width, rollLength: r53.length }).strips).toBe(25);
  });
});
