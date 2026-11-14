import { describe, it, expect } from 'vitest';
import {
  toL100km, fromL100km, convertEconomy, fuelTripCost, economyFromUsage, evTripCost,
  parseTireSize, tireDimensions, compareTires, actualSpeed,
  shoeSizesFromFoot, footFromShoeSize, shoeChart,
  convertCooking, gasMarkToF, fToGasMark, fToC, cToF, parseQuantity, formatQuantity, scaleRecipeLines, scaleFactor, OVEN_TABLE,
  heatIndexF, dewPointC, rhFromDewPoint, heatBand, calculateHeatIndex,
  windChillF, windChillC, frostbiteRisk, calculateWindChill,
  type Result,
} from '@/lib/tools/calculators/everyday-b';

function ok<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

describe('fuel economy conversions', () => {
  it('uses the exact gallon and mile definitions (235.215 / MPG US)', () => {
    expect(toL100km(30, 'mpg-us')).toBeCloseTo(7.8405, 4);
    expect(toL100km(1, 'mpg-us')).toBeCloseTo(235.2146, 3);
    expect(toL100km(1, 'mpg-uk')).toBeCloseTo(282.4809, 3);
    expect(fromL100km(5, 'mpg-uk')).toBeCloseTo(56.4962, 3);
    expect(fromL100km(8, 'kml')).toBe(12.5);
  });
  it('US and UK MPG differ by the gallon ratio 1.20095', () => {
    const c = convertEconomy(30, 'mpg-us');
    expect(c['mpg-uk'] / c['mpg-us']).toBeCloseTo(4.54609 / 3.785411784, 6);
    expect(c['mpg-uk']).toBeCloseTo(36.03, 2);
  });
  it('round-trips every unit', () => {
    for (const u of ['mpg-us', 'mpg-uk', 'l100km', 'kml'] as const) expect(fromL100km(toL100km(42, u), u)).toBeCloseTo(42, 9);
  });
});

describe('fuel trip cost', () => {
  it('300 miles at 30 MPG and $3.50/gal is exactly 10 gallons, $35', () => {
    const r = ok(fuelTripCost({ distance: 300, distanceUnit: 'mi', economy: 30, economyUnit: 'mpg-us', price: 3.5, priceUnit: 'per-us-gal' }));
    expect(r.usGallons).toBeCloseTo(10, 9);
    expect(r.cost).toBeCloseTo(35, 9);
    expect(r.costPerMile).toBeCloseTo(0.1167, 4);
  });
  it('500 km at 6.5 L/100 km and 1.80/L, round trip split 3 ways', () => {
    const r = ok(fuelTripCost({ distance: 500, distanceUnit: 'km', economy: 6.5, economyUnit: 'l100km', price: 1.8, priceUnit: 'per-l', roundTrip: true, passengers: 3 }));
    expect(r.litres).toBeCloseTo(65, 9);
    expect(r.cost).toBeCloseTo(117, 9);
    expect(r.costPerPerson).toBeCloseTo(39, 9);
  });
  it('UK: price per litre with imperial MPG', () => {
    const r = ok(fuelTripCost({ distance: 100, distanceUnit: 'mi', economy: 45, economyUnit: 'mpg-uk', price: 1.45, priceUnit: 'per-l' }));
    expect(r.impGallons).toBeCloseTo(100 / 45, 9);
    expect(r.cost).toBeCloseTo((100 / 45) * 4.54609 * 1.45, 9);
  });
  it('validates inputs', () => {
    expect(fuelTripCost({ distance: 0, distanceUnit: 'km', economy: 6, economyUnit: 'l100km', price: 2, priceUnit: 'per-l' }).ok).toBe(false);
    expect(fuelTripCost({ distance: 10, distanceUnit: 'km', economy: 0, economyUnit: 'l100km', price: 2, priceUnit: 'per-l' }).ok).toBe(false);
    expect(fuelTripCost({ distance: 10, distanceUnit: 'km', economy: 6, economyUnit: 'l100km', price: -1, priceUnit: 'per-l' }).ok).toBe(false);
    expect(fuelTripCost({ distance: 10, distanceUnit: 'km', economy: 6, economyUnit: 'l100km', price: 2, priceUnit: 'per-l', passengers: 1.5 }).ok).toBe(false);
    expect(ok(fuelTripCost({ distance: 10, distanceUnit: 'km', economy: 6, economyUnit: 'l100km', price: 0, priceUnit: 'per-l' })).cost).toBe(0);
  });
  it('economy from a fill-up', () => {
    const e = ok(economyFromUsage(350, 'mi', 11.2, 'us-gal'));
    expect(e['mpg-us']).toBeCloseTo(31.25, 9);
    const m = ok(economyFromUsage(600, 'km', 42, 'l'));
    expect(m.l100km).toBeCloseTo(7, 9);
    expect(m.kml).toBeCloseTo(14.2857, 4);
    expect(economyFromUsage(600, 'km', 0, 'l').ok).toBe(false);
  });
  it('EV: 100 km at 18 kWh/100 km and 0.30/kWh', () => {
    const r = ok(evTripCost({ distance: 100, distanceUnit: 'km', efficiency: 18, efficiencyUnit: 'kwh100km', pricePerKwh: 0.3 }));
    expect(r.kwh).toBeCloseTo(18, 9);
    expect(r.cost).toBeCloseTo(5.4, 9);
  });
  it('EV: 4 mi/kWh is 0.25 kWh/mile and 134.8 MPGe (EPA 33.705 kWh/gal)', () => {
    const r = ok(evTripCost({ distance: 100, distanceUnit: 'mi', efficiency: 4, efficiencyUnit: 'mikwh', pricePerKwh: 0.16 }));
    expect(r.kwh).toBeCloseTo(25, 9);
    expect(r.cost).toBeCloseTo(4, 9);
    expect(r.mpge).toBeCloseTo(134.82, 2);
    const loss = ok(evTripCost({ distance: 100, distanceUnit: 'mi', efficiency: 4, efficiencyUnit: 'mikwh', pricePerKwh: 0.16, chargingLossPct: 10 }));
    expect(loss.kwh).toBeCloseTo(25 / 0.9, 9);
  });
});

describe('tire size', () => {
  it('225/45R17: 101.25 mm sidewall, 634.3 mm (24.97 in) diameter', () => {
    const d = tireDimensions(ok(parseTireSize('225/45R17 91V')));
    expect(d.sidewallMm).toBeCloseTo(101.25, 9);
    expect(d.diameterMm).toBeCloseTo(634.3, 9);
    expect(d.diameterIn).toBeCloseTo(24.972, 3);
    expect(d.circumferenceIn).toBeCloseTo(78.45, 2);
    expect(d.revsPerMile).toBeCloseTo(807.6, 1);
  });
  it('parses P, LT, ZR, flotation and dash forms', () => {
    expect(ok(parseTireSize('P215/65R15')).prefix).toBe('P');
    const lt = ok(parseTireSize('LT265/70R17'));
    expect(lt.prefix).toBe('LT');
    expect(tireDimensions(lt).diameterIn).toBeCloseTo(31.61, 2);
    expect(ok(parseTireSize('255/35ZR19')).construction).toBe('ZR');
    expect(ok(parseTireSize('205/55-16')).rimIn).toBe(16);
    const fl = ok(parseTireSize('33x12.50R15LT'));
    expect(fl.format).toBe('flotation');
    const fd = tireDimensions(fl);
    expect(fd.diameterIn).toBeCloseTo(33, 9);
    expect(fd.sidewallIn).toBeCloseTo(9, 9);
    expect(fd.widthIn).toBeCloseTo(12.5, 9);
  });
  it('rejects junk', () => {
    expect(parseTireSize('').ok).toBe(false);
    expect(parseTireSize('hello').ok).toBe(false);
    expect(parseTireSize('225/45R5').ok).toBe(false);
    expect(parseTireSize('20x12.5R22').ok).toBe(false);
  });
  it('compares 225/45R17 with 245/40R18 (+2.98%, inside the 3% guideline)', () => {
    const c = compareTires(ok(parseTireSize('225/45R17')), ok(parseTireSize('245/40R18')));
    expect(c.b.diameterMm).toBeCloseTo(653.2, 9);
    expect(c.diameterDiffPct).toBeCloseTo(2.98, 2);
    expect(c.withinGuideline).toBe(true);
    expect(actualSpeed(60, c)).toBeCloseTo(61.79, 2);
    const big = compareTires(ok(parseTireSize('265/70R17')), ok(parseTireSize('285/75R17')));
    expect(big.diameterDiffPct).toBeCloseTo(7.04, 2);
    expect(big.withinGuideline).toBe(false);
    expect(big.clearanceChangeMm).toBeCloseTo(28.25, 2);
  });
});

describe('shoe size', () => {
  it('matches the ISO/TS 19407 adult rows (EU from foot length)', () => {
    // 260 mm -> EU 41, 280 mm -> EU 44, 300 mm -> EU 47
    expect(ok(shoeSizesFromFoot(260, 'men')).exact.eu).toBeCloseTo(41, 9);
    expect(ok(shoeSizesFromFoot(280, 'men')).exact.eu).toBeCloseTo(44, 9);
    expect(ok(shoeSizesFromFoot(300, 'men')).eu).toBe(47);
    // UK = 3 x foot(in) - 23: 280 mm -> 10, 300 mm -> 12.5
    expect(ok(shoeSizesFromFoot(280, 'men')).uk).toBe(10);
    expect(ok(shoeSizesFromFoot(300, 'men')).uk).toBe(12.5);
    expect(ok(shoeSizesFromFoot(300, 'men')).us).toBe(13.5);
  });
  it('US men 10 is a 10 2/3 inch foot (270.9 mm), UK 9; women are one size above men', () => {
    const foot = ok(footFromShoeSize('us', 10, 'men'));
    expect(foot).toBeCloseTo(270.93, 2);
    const s = ok(shoeSizesFromFoot(foot, 'men'));
    expect(s.uk).toBe(9);
    expect(s.eu).toBe(42.5);
    const w = ok(shoeSizesFromFoot(foot, 'women'));
    expect(w.us).toBe(11);
    expect(w.uk).toBe(9);
  });
  it('round-trips through every system', () => {
    for (const sys of ['us', 'uk', 'eu', 'jp', 'mondopoint', 'cm', 'in'] as const) {
      const mm = ok(footFromShoeSize(sys, sys === 'mondopoint' ? 255 : sys === 'eu' ? 40 : sys === 'in' ? 10 : sys === 'cm' || sys === 'jp' ? 25.5 : 8, 'women'));
      expect(mm).toBeGreaterThan(200);
      expect(mm).toBeLessThan(300);
    }
    expect(ok(footFromShoeSize('jp', 26.5, 'men'))).toBe(265);
  });
  it('kids sizes switch to the youth/adult scale above 13.5', () => {
    const small = ok(shoeSizesFromFoot(150, 'kids'));
    expect(small.usLabel).toMatch(/kids/);
    expect(small.us).toBe(8);
    const big = ok(shoeSizesFromFoot(220, 'kids'));
    expect(big.usLabel).toMatch(/youth/);
    expect(big.ukLabel).toMatch(/adult/);
  });
  it('builds a chart and rejects bad input', () => {
    expect(shoeChart('men').length).toBe(19);
    expect(shoeSizesFromFoot(0, 'men').ok).toBe(false);
    expect(shoeSizesFromFoot(100, 'men').ok).toBe(false);
  });
});

describe('cooking converter', () => {
  it('cup and spoon definitions', () => {
    expect(ok(convertCooking(1, 'us-cup', 'ml'))).toBeCloseTo(236.588, 3);
    expect(ok(convertCooking(1, 'us-cup', 'us-tbsp'))).toBeCloseTo(16, 9);
    expect(ok(convertCooking(1, 'us-tbsp', 'us-tsp'))).toBeCloseTo(3, 9);
    expect(ok(convertCooking(1, 'metric-cup', 'us-cup'))).toBeCloseTo(1.0567, 4);
    expect(ok(convertCooking(1, 'imp-pint', 'ml'))).toBeCloseTo(568.261, 3);
    expect(ok(convertCooking(1, 'lb', 'g'))).toBeCloseTo(453.592, 3);
  });
  it('King Arthur weights: 1 cup flour 120 g, 1 cup sugar 198 g, 1 stick butter 113 g', () => {
    expect(ok(convertCooking(1, 'us-cup', 'g', 'ap-flour'))).toBeCloseTo(120, 9);
    expect(ok(convertCooking(1, 'us-cup', 'g', 'sugar'))).toBeCloseTo(198, 9);
    expect(ok(convertCooking(1, 'us-stick', 'g', 'butter'))).toBeCloseTo(113.5, 9);
    expect(ok(convertCooking(1, 'us-tbsp', 'g', 'honey'))).toBeCloseTo(21, 9);
    expect(ok(convertCooking(500, 'g', 'us-cup', 'ap-flour'))).toBeCloseTo(4.1667, 4);
    expect(ok(convertCooking(1, 'metric-cup', 'g', 'ap-flour'))).toBeCloseTo(126.8, 1);
  });
  it('water is 1 g per ml', () => {
    expect(ok(convertCooking(250, 'ml', 'g', 'water'))).toBeCloseTo(250, 9);
    expect(ok(convertCooking(0, 'ml', 'g', 'water'))).toBe(0);
    expect(convertCooking(-1, 'ml', 'g').ok).toBe(false);
    expect(convertCooking(1, 'ml', 'g', 'nope').ok).toBe(false);
  });
  it('oven temperatures and gas marks', () => {
    expect(fToC(350)).toBeCloseTo(176.67, 2);
    expect(cToF(180)).toBe(356);
    expect(fToC(-40)).toBe(-40);
    expect(ok(gasMarkToF(4))).toBe(350);
    expect(ok(gasMarkToF(1))).toBe(275);
    expect(ok(gasMarkToF(0.5))).toBe(250);
    expect(gasMarkToF(11).ok).toBe(false);
    expect(fToGasMark(356)).toBe(4);
    expect(fToGasMark(425)).toBe(7);
    expect(fToGasMark(100)).toBeNull();
    for (const row of OVEN_TABLE) expect(ok(gasMarkToF(row.mark))).toBe(row.f);
  });
  it('parses and formats recipe quantities', () => {
    expect(parseQuantity('2 1/4 cups flour').value).toBeCloseTo(2.25, 9);
    expect(parseQuantity('3/4 cup sugar').value).toBeCloseTo(0.75, 9);
    expect(parseQuantity('1½ tsp salt').value).toBeCloseTo(1.5, 9);
    expect(parseQuantity('0.5 cup milk').value).toBe(0.5);
    expect(Number.isNaN(parseQuantity('salt to taste').value)).toBe(true);
    expect(formatQuantity(1.5)).toBe('1 1/2');
    expect(formatQuantity(0.3333)).toBe('1/3');
    expect(formatQuantity(3)).toBe('3');
    expect(formatQuantity(1.4)).toBe('1.4');
  });
  it('scales a recipe from 4 to 6 servings', () => {
    const f = ok(scaleFactor(4, 6));
    expect(f).toBe(1.5);
    expect(scaleRecipeLines('2 cups flour\n3/4 cup sugar\nsalt to taste\n1 1/2 tsp vanilla', f))
      .toEqual(['3 cups flour', '1 1/8 cup sugar', 'salt to taste', '2 1/4 tsp vanilla']);
    expect(scaleFactor(0, 6).ok).toBe(false);
  });
});

describe('heat index (NWS)', () => {
  // Reference values from the NWS heat index chart (rounded to whole °F).
  it.each([
    [90, 50, 95], [100, 40, 109], [96, 65, 121], [86, 90, 105], [80, 40, 80], [104, 55, 137], [92, 70, 112],
  ])('%i°F at %i%% RH reads %i°F', (t, rh, expected) => {
    expect(Math.round(heatIndexF(t, rh).value)).toBe(expected);
  });
  it('uses the simple formula below 80°F', () => {
    const r = heatIndexF(70, 50);
    expect(r.method).toBe('simple');
    expect(r.value).toBeCloseTo(0.5 * (70 + 61 + 2 * 1.2 + 50 * 0.094), 9);
  });
  it('applies the low-humidity adjustment (RH < 13%, 80-112°F)', () => {
    const r = heatIndexF(100, 10);
    expect(r.adjustment).toBeCloseTo(-((13 - 10) / 4) * Math.sqrt((17 - 5) / 17), 9);
  });
  it('applies the high-humidity adjustment (RH > 85%, 80-87°F)', () => {
    const r = heatIndexF(82, 95);
    expect(r.adjustment).toBeCloseTo(((95 - 85) / 10) * ((87 - 82) / 5), 9);
  });
  it('NWS bands', () => {
    expect(heatBand(79.9)).toBe('none');
    expect(heatBand(80)).toBe('caution');
    expect(heatBand(95)).toBe('extreme-caution');
    expect(heatBand(103)).toBe('danger');
    expect(heatBand(125)).toBe('extreme-danger');
  });
  it('Magnus dew point: 25°C at 60% is 16.7°C, and inverts', () => {
    expect(dewPointC(25, 60)).toBeCloseTo(16.70, 2);
    expect(dewPointC(30, 100)).toBeCloseTo(30, 9);
    expect(rhFromDewPoint(25, dewPointC(25, 60))).toBeCloseTo(60, 9);
  });
  it('calculates from dew point and Celsius input', () => {
    const r = ok(calculateHeatIndex({ temp: 35, tempUnit: 'C', humidityMode: 'dewpoint', dewPoint: 25 }));
    expect(r.rh).toBeCloseTo(56.0, 0);
    expect(Math.round(r.hiF)).toBe(110);
    expect(r.band).toBe('danger');
    expect(calculateHeatIndex({ temp: 30, tempUnit: 'C', humidityMode: 'dewpoint', dewPoint: 31 }).ok).toBe(false);
    expect(calculateHeatIndex({ temp: 90, tempUnit: 'F', humidityMode: 'rh', rh: 120 }).ok).toBe(false);
    expect(calculateHeatIndex({ temp: 90, tempUnit: 'F', humidityMode: 'rh', rh: 0 }).ok).toBe(false);
  });
});

describe('wind chill (NWS 2001 / MSC)', () => {
  // NWS wind chill chart values.
  it.each([
    [0, 15, -19], [-10, 20, -35], [30, 10, 21], [5, 5, -5], [-20, 30, -53], [40, 60, 25],
  ])('%i°F with %i mph wind reads %i°F', (t, v, expected) => {
    expect(Math.round(windChillF(t, v))).toBe(expected);
  });
  // Environment Canada chart values (°C, km/h at 10 m).
  it.each([
    [-10, 20, -18], [-20, 30, -33], [-30, 50, -49], [0, 5, -2], [-40, 10, -51], [-25, 40, -41],
  ])('%i°C with %i km/h wind reads %i°C', (t, v, expected) => {
    expect(Math.round(windChillC(t, v))).toBe(expected);
  });
  it('enforces the valid range', () => {
    const warm = ok(calculateWindChill({ temp: 55, tempUnit: 'F', wind: 20, windUnit: 'mph' }));
    expect(warm.valid).toBe(false);
    expect(warm.wcF).toBe(55);
    const calm = ok(calculateWindChill({ temp: 20, tempUnit: 'F', wind: 3, windUnit: 'mph' }));
    expect(calm.valid).toBe(false);
    const edge = ok(calculateWindChill({ temp: 50, tempUnit: 'F', wind: 4, windUnit: 'mph' }));
    expect(edge.valid).toBe(true);
    expect(calculateWindChill({ temp: 20, tempUnit: 'F', wind: -1, windUnit: 'mph' }).ok).toBe(false);
  });
  it('converts wind units (10 m/s = 36 km/h, 20 knots = 37.04 km/h)', () => {
    const r = ok(calculateWindChill({ temp: -10, tempUnit: 'C', wind: 10, windUnit: 'ms' }));
    expect(r.windKmh).toBeCloseTo(36, 9);
    expect(r.wcC).toBeCloseTo(windChillC(-10, 36), 9);
    const k = ok(calculateWindChill({ temp: -10, tempUnit: 'C', wind: 20, windUnit: 'kn' }));
    expect(k.windKmh).toBeCloseTo(37.04, 9);
  });
  it('NWS and MSC formulas agree within half a degree', () => {
    for (const [t, v] of [[-20, 10], [0, 25], [-35, 40]]) {
      expect(fToC(windChillF(cToF(t), v / 1.609344))).toBeCloseTo(windChillC(t, v), 0);
    }
  });
  it('frostbite categories follow Environment Canada', () => {
    expect(frostbiteRisk(-5).id).toBe('low');
    expect(frostbiteRisk(-27).id).toBe('moderate');
    expect(frostbiteRisk(-28).id).toBe('high');
    expect(frostbiteRisk(-40).id).toBe('very-high');
    expect(frostbiteRisk(-50).id).toBe('severe');
    expect(frostbiteRisk(-60).id).toBe('extreme');
    // NWS: -19°F (-28°C) wind chill can freeze skin in 30 minutes.
    expect(frostbiteRisk(fToC(-19)).id).toBe('high');
  });
});
