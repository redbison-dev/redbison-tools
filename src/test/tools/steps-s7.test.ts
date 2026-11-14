/**
 * Working steps for rollout batch s7 (docs/calculation-standard.md): each
 * steps function's last result equals the calculator's own answer, formatted
 * the way the page shows it, for the page defaults and another case; plus a
 * hand-checked figure and an edge case per tool.
 */
import { describe, expect, it } from 'vitest';
import {
  cookingConverterSteps, cookingSmart, cookingUnitShort, fuelCostSteps, heatIndexSteps, shoeSizeSteps, timeCalculatorSteps,
  windChillSteps, parseDurationRows, clockAddResult, fmtB, fmtA, type CookingStepsInput, type FuelStepsInput, type TimeCalcStepsInput,
} from '@/lib/tools/steps/s7';
import {
  convertCooking, fToC, cToF, scaleFactor, fuelTripCost, economyFromUsage, evTripCost, calculateHeatIndex, footFromShoeSize, shoeSizesFromFoot,
  calculateWindChill,
} from '@/lib/tools/calculators/everyday-b';
import { sumDurations, formatHMS, formatDuration, formatClock, parseClock, clockDifference } from '@/lib/tools/calculators/everyday-a';
import { formatMoney } from '@/lib/tools/calculators/pay';
import type { ReportStep } from '@/lib/report/model';
import {
  simpleInterestSteps, compoundInterestSteps, compoundResult, interestCalculatorSteps, investmentSteps, investmentReturnsSteps,
  retirementSteps, paFixed, paWhole, paPct, type CompoundInput,
} from '@/lib/tools/steps/s7';
import { computeSimpleInterest } from '@/lib/tools/simple-interest-calculator';
import { computeCompoundGrowth } from '@/lib/finance/compoundGrowth';
import { computeSip, computeLumpSum } from '@/lib/tools/investment-calculator';
import { xirr, toCashFlows } from '@/lib/tools/investment-returns-calculator';
import { portfolioMetrics, type PortfolioTransaction } from '@/lib/tools/steps/s7-investment-returns-calculator';
import { retirementPlan, type RetirementPlanInput } from '@/lib/tools/steps/s7-retirement-calculator';
import { computeRetirementNeed, projectRetirementSavings } from '@/lib/tools/retirement-calculator';
import {
  emiSteps, rentVsBuySteps, ltvCacSteps, tamSteps, stockAnalysisSteps, gasFeeSteps, stockFairValue, gasFee,
  pbUsd2, pbUsd0, pbLtvRatio, pbTamMoney, pbUpside, pbGasFiat,
} from '@/lib/tools/steps/s7';
import { emiTotals, type EmiInput } from '@/lib/tools/steps/s7-emi-calculator';
import { computeRentVsBuy, type RentVsBuyInput } from '@/lib/tools/rent-vs-buy-calculator';
import { computeLtvCac, type LtvCacInputs } from '@/lib/tools/ltv-cac-calculator';
import { computeTam, type TamInputs } from '@/lib/tools/tam-calculator';
import {
  cryptocurrencyUnitConverterSteps, pcCryptoConvert, pcCryptoDisplay, dateArithmeticSteps, pcLocalDateTime, pcLocalInputValue,
  dateDiffSteps, pcDiffBreakdown, subnetCalculatorSteps, timeConverterSteps, pcUtcDisplay,
} from '@/lib/tools/steps/s7';
import { convertCryptoUnits } from '@/lib/tools/cryptocurrency-unit-converter';
import { applyDateArithmetic } from '@/lib/tools/date-arithmetic';
import { computeDateDifference } from '@/lib/tools/date-diff';
import { calculateSubnet } from '@/lib/tools/subnet-calculator';
import { epochToDate } from '@/lib/tools/time-converter';

const last = (s: ReportStep[]) => s[s.length - 1].result;
const noNaN = (s: ReportStep[]) => expect(s.map((x) => [x.working ?? '', x.result].join(' ')).join(' ')).not.toMatch(/NaN|undefined|Infinity/);
const noNaNInvalid = (s: ReportStep[]) => expect(s.map((x) => [x.working ?? '', x.result].join(' ')).join(' ')).not.toMatch(/NaN|undefined|Invalid/);

describe('cookingConverterSteps', () => {
  const def: CookingStepsInput = { tab: 'convert', amount: '2', from: 'us-cup', to: 'g', ingredient: 'ap-flour', temp: '350', tempUnit: 'F', serves: '4', wanted: '6', recipe: '2 1/4 cups all-purpose flour\n1 cup butter' };
  it.each([[def], [{ ...def, from: 'g' as const, to: 'us-tbsp' as const, amount: '100' }], [{ ...def, from: 'us-tsp' as const, to: 'ml' as const, amount: '3' }]])('ends with the converted amount the page shows', (i) => {
    const s = cookingConverterSteps(i);
    const v = convertCooking(Number(i.amount), i.from, i.to, i.ingredient);
    expect(last(s)).toBe(`${cookingSmart(v.value!)} ${cookingUnitShort(i.to)}`);
    expect(s.length).toBeGreaterThanOrEqual(2);
    noNaN(s);
  });
  it('hand check: 2 US cups is 473.18 ml; the US cup is defined exactly', () => {
    const s = cookingConverterSteps(def);
    expect(s[0].result).toBe('473.18 ml');
    expect(s[0].formula).toContain('236.5882365 ml exactly');
    expect(s[0].formula).toContain('US cup (236.6 ml)');
  });
  it('oven: 350°F is 177°C and gas mark 4; 180°C is 356°F; gas mark 4 is 350°F', () => {
    const f = cookingConverterSteps({ ...def, tab: 'oven' });
    expect(f[0].result).toBe('4');
    expect(last(f)).toBe(`${fmtB(fToC(350), 0)}°C`);
    expect(last(f)).toBe('177°C');
    expect(last(cookingConverterSteps({ ...def, tab: 'oven', temp: '180', tempUnit: 'C' }))).toBe(`${fmtB(cToF(180), 0)}°F`);
    const g = cookingConverterSteps({ ...def, tab: 'oven', temp: '4', tempUnit: 'gas' });
    expect(g[0].result).toBe('350°F');
    expect(last(g)).toBe('177°C');
  });
  it('scale: 4 to 6 servings is x 1.500 and 2 1/4 cups becomes 3 3/8', () => {
    const s = cookingConverterSteps({ ...def, tab: 'scale' });
    expect(s[0].result).toBe(`x ${fmtB(scaleFactor(4, 6).value!, 3)}`);
    expect(last(s)).toBe('3 3/8 cups all-purpose flour');
  });
  it('a negative amount, an off-scale oven or zero servings give no steps', () => {
    expect(cookingConverterSteps({ ...def, amount: '-1' })).toEqual([]);
    expect(cookingConverterSteps({ ...def, tab: 'oven', temp: '50' })).toEqual([]);
    expect(cookingConverterSteps({ ...def, tab: 'scale', serves: '0' })).toEqual([]);
  });
});

describe('fuelCostSteps', () => {
  const def: FuelStepsInput = {
    mode: 'trip', distance: 250, distanceUnit: 'mi', economy: 30, economyUnit: 'mpg-us', price: 3.4, priceUnit: 'per-us-gal', roundTrip: false, passengers: 1,
    fuelUsed: 11.2, fuelUnit: 'us-gal', efficiency: 3.5, efficiencyUnit: 'mikwh', kwhPrice: 0.17, chargeLoss: 10, currency: 'USD',
  };
  const trip = (i: FuelStepsInput) => fuelTripCost({ distance: i.distance, distanceUnit: i.distanceUnit, economy: i.economy, economyUnit: i.economyUnit, price: i.price, priceUnit: i.priceUnit, roundTrip: i.roundTrip, passengers: i.passengers }).value!;
  it.each([[def], [{ ...def, distanceUnit: 'km' as const, economy: 6.5, economyUnit: 'l100km' as const, price: 1.8, priceUnit: 'per-l' as const, roundTrip: true }]])('trip ends with the trip fuel cost', (i) => {
    const s = fuelCostSteps(i);
    expect(last(s)).toBe(formatMoney(trip(i).cost, 'USD'));
    noNaN(s);
  });
  it('hand check: 250 miles at 30 MPG and $3.40 a gallon is 8.333 gallons, $28.33', () => {
    const s = fuelCostSteps(def);
    expect(s[0].working).toContain('250');
    expect(s[2].result).toContain('8.333 US gal');
    expect(last(s)).toBe('$28.33');
  });
  it('shared between 3 people ends with the per-person cost', () => {
    const i = { ...def, passengers: 3 };
    expect(last(fuelCostSteps(i))).toBe(formatMoney(trip(i).costPerPerson, 'USD'));
  });
  it('economy mode ends with MPG (US); EV mode ends with the charging cost', () => {
    const u = economyFromUsage(250, 'mi', 11.2, 'us-gal').value!;
    expect(last(fuelCostSteps({ ...def, mode: 'economy' }))).toBe(fmtB(u['mpg-us'], 1));
    expect(last(fuelCostSteps({ ...def, mode: 'economy' }))).toBe('22.3');
    const ev = evTripCost({ distance: 250, distanceUnit: 'mi', efficiency: 3.5, efficiencyUnit: 'mikwh', pricePerKwh: 0.17, chargingLossPct: 10, roundTrip: false, passengers: 1 }).value!;
    expect(last(fuelCostSteps({ ...def, mode: 'ev' }))).toBe(formatMoney(ev.cost, 'USD'));
  });
  it('a zero distance gives no steps', () => {
    expect(fuelCostSteps({ ...def, distance: 0 })).toEqual([]);
    expect(fuelCostSteps({ ...def, mode: 'ev', distance: NaN })).toEqual([]);
  });
});

describe('heatIndexSteps', () => {
  const def = { temp: 92, unit: 'F' as const, mode: 'rh' as const, rh: 60, dew: 75 };
  it.each([[def], [{ ...def, temp: 33, unit: 'C' as const }], [{ ...def, mode: 'dewpoint' as const }], [{ ...def, temp: 70, rh: 40 }], [{ ...def, temp: 100, rh: 8 }], [{ ...def, temp: 84, rh: 90 }]])('ends with the heat index the page shows', (i) => {
    const r = calculateHeatIndex({ temp: i.temp, tempUnit: i.unit, humidityMode: i.mode, rh: i.rh, dewPoint: i.dew }).value!;
    const s = heatIndexSteps(i);
    expect(last(s)).toBe(i.unit === 'F' ? `${fmtB(r.hiF, 0)}°F` : `${fmtB(fToC(r.hiF), 0)}°C`);
    expect(s.length).toBeLessThanOrEqual(8);
    noNaN(s);
  });
  it('hand check: 92°F at 60% RH is 105°F on the NWS chart (Rothfusz regression)', () => {
    const s = heatIndexSteps(def);
    expect(s.some((x) => x.label === 'Rothfusz regression')).toBe(true);
    expect(last(s)).toBe('105°F');
  });
  it('mild conditions use the simple formula only; low humidity adds the adjustment', () => {
    expect(heatIndexSteps({ ...def, temp: 70, rh: 40 }).some((x) => x.label === 'Rothfusz regression')).toBe(false);
    expect(heatIndexSteps({ ...def, temp: 100, rh: 8 }).some((x) => x.label.startsWith('Low-humidity'))).toBe(true);
  });
  it('humidity above 100% gives no steps', () => {
    expect(heatIndexSteps({ ...def, rh: 120 })).toEqual([]);
  });
});

describe('shoeSizeSteps', () => {
  it.each([
    [{ group: 'men' as const, system: 'us' as const, size: 10 }],
    [{ group: 'women' as const, system: 'eu' as const, size: 39 }],
    [{ group: 'kids' as const, system: 'uk' as const, size: 11 }],
    [{ group: 'kids' as const, system: 'cm' as const, size: 22 }],
  ])('ends with the US size the page shows', (i) => {
    const r = shoeSizesFromFoot(footFromShoeSize(i.system, i.size, i.group).value!, i.group).value!;
    const s = shoeSizeSteps(i);
    expect(last(s)).toBe(r.usLabel);
    expect(s[s.length - 2].result).toBe(r.ukLabel);
    noNaN(s);
  });
  it('hand check: US men 10 is a 10.667 in (270.9 mm) foot, UK 9, EU 42.5 to the half', () => {
    const s = shoeSizeSteps({ group: 'men', system: 'us', size: 10 });
    expect(s[0].working).toContain('(10 + 22) / 3 = 10.667 in');
    expect(s[0].result).toBe('270.9 mm');
    expect(s[3].result).toBe('9');
    expect(last(s)).toBe('10');
  });
  it('a size of zero gives no steps', () => {
    expect(shoeSizeSteps({ group: 'men', system: 'us', size: 0 })).toEqual([]);
  });
});

describe('timeCalculatorSteps', () => {
  const def: TimeCalcStepsInput = {
    mode: 'add', rows: '+,0,2,45,50;+,0,1,30,20;-,0,0,16,10', hms: '7:45:00', dec: '7.75', convDir: 'toDec', start: '22:15', end: '06:40',
    cStart: '09:30', cDate: '', cSign: '+', cD: '0', cH: '10', cM: '45', cS: '0', clock: '24',
  };
  it.each([[def], [{ ...def, rows: '+,1,0,90,0;+,0,3,0,30' }]])('add: ends with the h:mm:ss total', (i) => {
    const s = timeCalculatorSteps(i);
    expect(last(s)).toBe(formatHMS(sumDurations(parseDurationRows(i.rows)).value!.totalSeconds));
    noNaN(s);
  });
  it('hand check: 2:45:50 + 1:30:20 − 0:16:10 = 4:00:00 (14,400 s)', () => {
    const s = timeCalculatorSteps(def);
    expect(s[0].working).toBe('0 × 86,400 + 2 × 3,600 + 45 × 60 + 50');
    expect(s[0].result).toBe('9,950 s');
    expect(s[3].result).toBe('14,400 s');
    expect(last(s)).toBe('4:00:00');
  });
  it('convert: 7:45:00 is 7.75 hours; 7.75 hours is 7:45:00', () => {
    expect(last(timeCalculatorSteps({ ...def, mode: 'convert' }))).toBe(fmtA(27900 / 3600, 4));
    expect(last(timeCalculatorSteps({ ...def, mode: 'convert', convDir: 'toHms' }))).toBe('7:45:00');
  });
  it('between: 22:15 to 06:40 crosses midnight, 8h 25m', () => {
    const s = timeCalculatorSteps({ ...def, mode: 'between' });
    expect(s[1].working).toContain('+ 86,400');
    expect(last(s)).toBe(formatDuration(clockDifference(parseClock('22:15')!, parseClock('06:40')!).seconds));
    expect(last(s)).toBe('8h 25m');
  });
  it('clock: 09:30 + 10h 45m is 20:15; subtracting goes to the previous day', () => {
    const c = clockAddResult(def);
    expect(last(timeCalculatorSteps({ ...def, mode: 'clock' }))).toBe(formatClock(c.ok ? c.seconds : 0, false, false));
    expect(last(timeCalculatorSteps({ ...def, mode: 'clock' }))).toBe('20:15');
    expect(last(timeCalculatorSteps({ ...def, mode: 'clock', cSign: '-', clock: '12' }))).toBe('10:45 PM');
  });
  it('a negative field or a bad time gives no steps', () => {
    expect(timeCalculatorSteps({ ...def, rows: '+,0,-1,0,0' })).toEqual([]);
    expect(timeCalculatorSteps({ ...def, mode: 'convert', hms: 'abc' })).toEqual([]);
  });
});

describe('windChillSteps', () => {
  const def = { temp: 10, unit: 'F' as const, wind: 20, windUnit: 'mph' as const };
  it.each([[def], [{ temp: -15, unit: 'C' as const, wind: 30, windUnit: 'kmh' as const }], [{ temp: 5, unit: 'F' as const, wind: 10, windUnit: 'ms' as const }], [{ temp: -10, unit: 'C' as const, wind: 15, windUnit: 'mph' as const }]])('ends with the wind chill the page shows', (i) => {
    const r = calculateWindChill({ temp: i.temp, tempUnit: i.unit, wind: i.wind, windUnit: i.windUnit }).value!;
    const s = windChillSteps(i);
    expect(last(s)).toBe(i.unit === 'F' ? `${fmtB(r.wcF, 0)}°F` : `${fmtB(r.wcC, 0)}°C`);
    noNaN(s);
  });
  it('hand check: 10°F with a 20 mph wind is -9°F on the NWS chart', () => {
    const s = windChillSteps(def);
    expect(s[s.length - 2].result).toBe('1.6150');
    expect(last(s)).toBe('-9°F');
  });
  it('above 50°F or in calm air the wind chill is not applicable', () => {
    expect(last(windChillSteps({ ...def, temp: 60 }))).toBe('Not applicable');
    expect(last(windChillSteps({ ...def, wind: 2 }))).toBe('Not applicable');
    expect(windChillSteps({ ...def, wind: -1 })).toEqual([]);
  });
});

describe('simpleInterestSteps', () => {
  it.each([[10000, 5, 1], [2500, 7.5, 3.5], [10000, 0, 2]])('ends with the final amount (%s, %s%%, %s y)', (p, r, t) => {
    const s = simpleInterestSteps(p, r, t);
    expect(last(s)).toBe(paFixed(computeSimpleInterest(p, r, t)!.finalAmount));
    noNaN(s);
  });
  it('hand check: 10,000 at 5% for 1 year earns 500', () => {
    const s = simpleInterestSteps(10000, 5, 1);
    expect(s[1].result).toBe('$500.00');
    expect(last(s)).toBe('$10500.00');
    expect(s[1].working).toContain('10,000');
  });
  it('invalid input gives no steps', () => {
    expect(simpleInterestSteps(0, 5, 1)).toEqual([]);
    expect(simpleInterestSteps(1000, 5, 0)).toEqual([]);
  });
});

describe('compoundInterestSteps', () => {
  const def: CompoundInput = { principal: 10000, rate: 10, time: 1, rateDuration: 'annually', compoundFrequency: 'annually', additionalPrincipal: 0, additionalFrequency: 'monthly' };
  it.each([
    [def],
    [{ ...def, compoundFrequency: 'monthly' }],
    [{ ...def, additionalPrincipal: 200, compoundFrequency: 'monthly', time: 5 }],
    [{ ...def, additionalPrincipal: 200, compoundFrequency: 'quarterly', time: 2.5 }],
    [{ ...def, rate: 1, rateDuration: 'monthly', compoundFrequency: 'monthly', time: 3 }],
  ])('ends with the final amount the page shows', (i) => {
    const s = compoundInterestSteps(i);
    expect(last(s)).toBe(paFixed(compoundResult(i).finalAmount));
    noNaN(s);
  });
  it('hand check: 10% a year compounded monthly on 10,000 for a year is 11,047.13', () => {
    const s = compoundInterestSteps({ ...def, compoundFrequency: 'monthly' });
    expect(last(s)).toBe('$11047.13');
    expect(s[0].working).toBe('10% × 1 / 12');
  });
  it('hand check: 100 a month at 12% a year compounded monthly grows to 1,268.25', () => {
    const s = compoundInterestSteps({ ...def, principal: 0, rate: 12, compoundFrequency: 'monthly', additionalPrincipal: 100 });
    expect(last(s)).toBe('$1268.25');
    // closed form agrees with the period-by-period simulation for whole periods
    expect(s[s.length - 2].result).toBe('$1268.25');
  });
  it('matches the page call to computeCompoundGrowth', () => {
    const r = computeCompoundGrowth({ principal: 10000, ratePerPeriod: 0.1, periodsPerYear: 1, years: 1 });
    expect(last(compoundInterestSteps(def))).toBe(paFixed(r.finalAmount));
  });
  it('nothing to grow gives no steps; 0% rate is fine', () => {
    expect(compoundInterestSteps({ ...def, principal: 0 })).toEqual([]);
    expect(last(compoundInterestSteps({ ...def, rate: 0, additionalPrincipal: 50 }))).toBe('$10600.00');
  });
});

describe('interestCalculatorSteps', () => {
  const def = { interestType: 'simple', principal: 10000, rate: 10, time: 1, compoundFrequency: 'annually', additionalPrincipal: 0, additionalFrequency: 'monthly' };
  it('simple mode ends with P + SI', () => {
    expect(last(interestCalculatorSteps(def))).toBe(paFixed(computeSimpleInterest(10000, 10, 1)!.finalAmount));
    expect(last(interestCalculatorSteps(def))).toBe('$11000.00');
  });
  it.each([['annually'], ['quarterly'], ['monthly']])('compound mode (%s) ends with the compound final amount', (f) => {
    const i = { ...def, interestType: 'compound', compoundFrequency: f, additionalPrincipal: 100, time: 3 };
    const n = f === 'monthly' ? 12 : f === 'quarterly' ? 4 : 1;
    const r = computeCompoundGrowth({ principal: 10000, ratePerPeriod: 0.1 / n, periodsPerYear: n, years: 3, contributionsPerYear: 1200 });
    expect(last(interestCalculatorSteps(i))).toBe(paFixed(r.finalAmount));
  });
  it('negative principal gives no steps', () => {
    expect(interestCalculatorSteps({ ...def, principal: -5 })).toEqual([]);
  });
});

describe('investmentSteps', () => {
  const def = { investmentType: 'sip', amount: 5000, returnRate: 12, duration: 60 };
  it.each([[def], [{ ...def, returnRate: 0 }], [{ ...def, investmentType: 'lumpsum', amount: 100000, duration: 30 }]])('ends with the maturity amount', (i) => {
    const r = i.investmentType === 'sip' ? computeSip(i.amount, i.returnRate, i.duration) : computeLumpSum(i.amount, i.returnRate, i.duration);
    expect(last(investmentSteps(i))).toBe(paFixed(r!.maturity));
    noNaN(investmentSteps(i));
  });
  it('hand check: SIP of 5,000 for 60 months at 12% (annuity due)', () => {
    const i = 0.01;
    const fv = 5000 * ((Math.pow(1 + i, 60) - 1) / i) * (1 + i);
    const s = investmentSteps(def);
    expect(s[1].result).toBe('$300000.00');
    expect(last(s)).toBe(paFixed(fv));
    expect(s[2].working).toContain('5,000');
  });
  it('hand check: lump sum 10,000 at 10% for 24 months is 12,100', () => {
    expect(last(investmentSteps({ investmentType: 'lumpsum', amount: 10000, returnRate: 10, duration: 24 }))).toBe('$12100.00');
  });
  it('zero amount gives no steps', () => {
    expect(investmentSteps({ ...def, amount: 0 })).toEqual([]);
  });
});

describe('investmentReturnsSteps', () => {
  const tx: PortfolioTransaction[] = [
    { type: 'buy', date: '2022-01-15', amount: 5000 }, { type: 'buy', date: '2022-04-15', amount: 2000 }, { type: 'buy', date: '2022-07-15', amount: 2000 },
    { type: 'buy', date: '2022-10-15', amount: 2000 }, { type: 'buy', date: '2023-01-15', amount: 3000 }, { type: 'buy', date: '2023-04-15', amount: 3000 },
    { type: 'buy', date: '2023-07-15', amount: 3000 }, { type: 'buy', date: '2023-10-15', amount: 3000 }, { type: 'buy', date: '2024-01-15', amount: 4000 },
    { type: 'buy', date: '2024-04-15', amount: 4000 }, { type: 'buy', date: '2024-07-15', amount: 4000 }, { type: 'sell', date: '2024-09-01', amount: 5000 },
  ];
  const today = new Date('2026-11-06T12:00:00Z');
  it('ends with the money-weighted return the page shows', () => {
    const s = investmentReturnsSteps(tx, 55000, today);
    const x = xirr(toCashFlows(tx, 55000, '2026-11-06'));
    expect(last(s)).toBe(paPct(x! * 100));
    expect(last(s)).toBe(paPct(portfolioMetrics(tx, 55000, today)!.summary.annualizedReturn));
    noNaN(s);
  });
  it('hand check: 35,000 in, 5,000 out, net 30,000, return 25,000 (83.33%)', () => {
    const s = investmentReturnsSteps(tx, 55000, today);
    expect(s[0].result).toBe('$35,000');
    expect(s[2].result).toBe('$30,000');
    expect(s[3].result).toBe('$25,000');
    expect(s[4].result).toBe('83.33%');
    expect(s[3].working).toContain('55,000');
  });
  it('with share counts the time-weighted return chains the price changes', () => {
    const units: PortfolioTransaction[] = [{ type: 'buy', date: '2024-01-01', amount: 1000, shares: 10 }, { type: 'buy', date: '2025-01-01', amount: 1200, shares: 10 }];
    const s = investmentReturnsSteps(units, 2600, today);
    // prices 100 -> 120 -> 130: (1.2)(1.0833) − 1 = 30%
    expect(s.find((x) => x.label === 'Time-weighted return')!.result).toBe('30.00%');
  });
  it('no transactions gives no steps; no current value gives n/a', () => {
    expect(investmentReturnsSteps([], 1000, today)).toEqual([]);
    expect(last(investmentReturnsSteps(tx, 0, today))).toBe('n/a');
  });
});

describe('retirementSteps', () => {
  const def: RetirementPlanInput = {
    householdType: 'single', spouseSocialSecurity: 1800, currentAge: 30, retirementAge: 65, lifeExpectancy: 85, monthlyExpenses: 5000, inflationRate: 3,
    retirementIncomeRatio: 80, currentSavings: 50000, monthlyContribution: 1000, annualIncrease: 3, expectedReturn: 7, socialSecurityBenefit: 2000,
    employerMatch: 500, pensionBenefit: 0, hasKids: false, numberOfKids: 1, educationCostPerChild: 100000, marriageFundPerChild: 25000, kidsCurrentAge: 5,
    healthInsuranceCost: 800, longTermCareFund: 150000, healthEmergencyFund: 50000,
  };
  it.each([[def], [{ ...def, hasKids: true, householdType: 'married', numberOfKids: 2 }], [{ ...def, monthlyContribution: 6000, expectedReturn: 9 }]])('ends with the shortfall the page shows', (i) => {
    const s = retirementSteps(i);
    expect(last(s)).toBe(paWhole(retirementPlan(i).shortfall));
    noNaN(s);
  });
  it('hand check: 35 years to go, 20 in retirement; need = gap × 240 + 200,000', () => {
    const s = retirementSteps(def);
    expect(s[0].result).toBe('35 years to go, 20 years in retirement');
    const need = computeRetirementNeed({ yearsToRetirement: 35, yearsInRetirement: 20, monthlyExpenses: 5000, healthInsuranceCost: 800, inflationRate: 3, retirementIncomeRatio: 80, guaranteedMonthlyIncome: 2000, lumpSumGoals: 200000 });
    expect(need.monthlySpending).toBeCloseTo(4800 * Math.pow(1.03, 35), 6);
    expect(s[3].result).toBe(paWhole(need.total));
    const rows = projectRetirementSavings({ currentAge: 30, retirementAge: 65, currentSavings: 50000, monthlyContribution: 1000, employerMatch: 500, annualIncrease: 3, expectedReturn: 7, inflationRate: 3 });
    expect(s[4].result).toBe(paWhole(rows[rows.length - 1].totalSavings));
  });
  it('on track: the shortfall is $0', () => {
    expect(last(retirementSteps({ ...def, monthlyContribution: 20000 }))).toBe('$0');
  });
});

describe('emiSteps', () => {
  const def: EmiInput = { loanAmount: 200000, downPayment: 40000, rate: 6.5, tenure: 360, insurance: 150, tax: 400, maintenance: 100, insuranceFreq: 'monthly', taxFreq: 'monthly', maintenanceFreq: 'monthly', customCosts: [] };
  it.each([[def], [{ ...def, rate: 9, tenure: 120, taxFreq: 'yearly', tax: 4800, customCosts: [{ name: 'HOA', amount: 50, frequency: 'monthly' }] }], [{ ...def, rate: 0 }]])('ends with the total monthly payment', (i) => {
    const s = emiSteps(i);
    expect(last(s)).toBe(pbUsd2(emiTotals(i)!.totalMonthlyPayment));
    noNaN(s);
  });
  it('hand check: 160,000 at 6.5% for 360 months is 1,011.31 a month; 650 of add-ons', () => {
    const s = emiSteps(def);
    expect(s[0].result).toBe('$160,000');
    expect(s[2].result).toBe('$1011.31');
    expect(last(s)).toBe('$1661.31');
    expect(s[0].working).toContain('200,000');
  });
  it('yearly costs are divided by 12; a down payment covering the price gives no steps', () => {
    expect(emiSteps({ ...def, tax: 4800, taxFreq: 'yearly' })[4].result).toBe('$650.00');
    expect(emiSteps({ ...def, downPayment: 200000 })).toEqual([]);
  });
});

describe('rentVsBuySteps', () => {
  const def: RentVsBuyInput = {
    homePrice: 400000, downPayment: 80000, interestRate: 6.5, loanTerm: 30, closingCosts: 8000, sellingCosts: 6, propertyTax: 6000, homeInsurance: 1200,
    maintenanceCost: 4000, hoaFees: 0, monthlyRent: 2500, renterInsurance: 200, rentIncrease: 3, homeAppreciation: 3, investmentReturn: 7, inflationRate: 2.5,
    marginalTaxRate: 24, analysisYears: 10,
  };
  it.each([[def], [{ ...def, analysisYears: 25, monthlyRent: 1800, homeAppreciation: 4 }]])('ends with the net worth difference', (i) => {
    const s = rentVsBuySteps(i);
    expect(last(s)).toBe(pbUsd0(computeRentVsBuy(i).netWorthDifference));
    noNaN(s);
  });
  it('hand check: loan 320,000; year-1 rent 2,500 × 12 + 200 = 30,200; value 400,000 × 1.03^10 = 537,567', () => {
    const s = rentVsBuySteps(def);
    expect(s[0].result).toBe('$320,000');
    expect(s[2].result).toBe('$30,200');
    expect(s[4].result).toBe('$537,567');
  });
  it('the year-1 owning step adds back up to the year-1 net cost', () => {
    const r = computeRentVsBuy(def).years[0];
    expect(rentVsBuySteps(def)[3].result).toBe(pbUsd0(r.buyCost));
    expect(rentVsBuySteps({ ...def, analysisYears: 0 })).toHaveLength(8);
  });
});

describe('ltvCacSteps', () => {
  const def: LtvCacInputs = { averageOrderValue: 75, purchaseFrequency: 4, customerLifespan: 2, grossMargin: 40, salesAndMarketingCosts: 25000, newCustomersAcquired: 500, monthlyRevenue: 100, churnRate: 5 };
  it.each([[def, 'traditional' as const], [def, 'saas' as const], [{ ...def, grossMargin: 80, salesAndMarketingCosts: 50000, newCustomersAcquired: 100 }, 'saas' as const]])('ends with the LTV:CAC ratio', (i, method) => {
    const s = ltvCacSteps(i, method);
    expect(last(s)).toBe(pbLtvRatio(computeLtvCac(i, method).ltvCacRatio));
    noNaN(s);
  });
  it('hand check: 75 × 4 × 2 × 40% = 240 LTV; 25,000 / 500 = 50 CAC; 4.80:1; payback 5.0 months', () => {
    const s = ltvCacSteps(def, 'traditional');
    expect(s[1].result).toBe('$240');
    expect(s[3].result).toBe('$50');
    expect(s[4].result).toBe('5.0 months');
    expect(last(s)).toBe('4.80:1');
  });
  it('no new customers or 0% churn give n/a, never NaN', () => {
    expect(last(ltvCacSteps({ ...def, newCustomersAcquired: 0 }, 'traditional'))).toBe('n/a');
    const s = ltvCacSteps({ ...def, churnRate: 0 }, 'saas');
    expect(last(s)).toBe('n/a');
    noNaN(s);
  });
});

describe('tamSteps', () => {
  const def: TamInputs = {
    approach: 'top-down', totalMarketSize: 65e9, relevantSegmentPercentage: 12, targetCustomers: 0, averageRevenuePerCustomer: 0, problemValue: 0, marketPenetration: 0,
    samPercentage: 35, geographicReach: 85, businessModelFit: 90, marketShare: 8, competitiveFactor: 75, resourceConstraints: 70,
  };
  it.each([[def], [{ ...def, approach: 'bottom-up' as const, targetCustomers: 15e6, averageRevenuePerCustomer: 300 }], [{ ...def, approach: 'value-theory' as const, problemValue: 45e9, marketPenetration: 15 }]])('ends with the revenue projection', (i) => {
    const s = tamSteps(i);
    expect(last(s)).toBe(pbTamMoney(computeTam(i).revenueProjection));
    noNaN(s);
  });
  it('hand check: 65B × 12% = 7.8B TAM; SAM 2.1B; SOM 87.7M; revenue 74.6M', () => {
    const s = tamSteps(def);
    expect(s.map((x) => x.result)).toEqual(['$7.8B', '$2.1B', '$87.7M', '$74.6M']);
    expect(s[0].working).toContain('65,000,000,000');
  });
  it('all zeros give $0, not NaN', () => {
    const s = tamSteps({ ...def, totalMarketSize: 0 });
    expect(last(s)).toBe('$0');
    noNaN(s);
  });
});

describe('stockAnalysisSteps', () => {
  const def = { price: 185.25, eps: 6.5, bookValue: 14.47, growthPct: 11 };
  it.each([[def], [{ price: 50, eps: 2, bookValue: 30, growthPct: 40 }], [{ price: 20, eps: -1, bookValue: 8, growthPct: -30 }]])('ends with the upside', (i) => {
    const s = stockAnalysisSteps(i);
    expect(last(s)).toBe(pbUpside(stockFairValue(i).upside));
    noNaN(s);
  });
  it('hand check: P/E value 6.5 × 20 = 130; the DCF parts add up to the DCF value', () => {
    const s = stockAnalysisSteps(def);
    expect(s[1].result).toBe('$130.00');
    expect(s[0].result).toBe(pbUsd2(stockFairValue(def).dcfValue));
    expect(s[3].result).toBe(pbUsd2(stockFairValue(def).averageValue));
  });
  it('a zero or blank price gives no steps', () => {
    expect(stockAnalysisSteps({ ...def, price: 0 })).toEqual([]);
    expect(stockAnalysisSteps({ ...def, eps: NaN })).toEqual([]);
  });
});

describe('gasFeeSteps', () => {
  const def = { mode: 'eip1559' as const, gasPrice: '20', baseFee: '20', priorityFee: '1', maxFee: '45', gasLimit: '21000' };
  it.each([[def, 2000], [{ ...def, mode: 'legacy' as const, gasPrice: '0.05', gasLimit: '150000' }, 3100], [{ ...def, maxFee: '20.5' }, 2500]])('ends with the USD cost', (i, eth) => {
    const s = gasFeeSteps(i, eth);
    expect(last(s)).toBe(`$${pbGasFiat(gasFee(i).fee.feeWei, eth)}`);
    noNaN(s);
  });
  it('hand check: 21,000 gas × (20 + 1) gwei = 441,000 gwei = 0.000441 ETH = $0.882 at $2,000', () => {
    const s = gasFeeSteps(def, 2000);
    expect(s[0].result).toBe('21 gwei');
    expect(s[1].result).toBe('441000 gwei');
    expect(s[3].result).toBe('0.000441 ETH');
    expect(last(s)).toBe(`$${(0.882).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`);
  });
  it('invalid gas or a max fee under the base fee gives no steps', () => {
    expect(gasFeeSteps({ ...def, gasLimit: '0' }, 2000)).toEqual([]);
    expect(gasFeeSteps({ ...def, maxFee: '10' }, 2000)).toEqual([]);
  });
});

describe('cryptocurrencyUnitConverterSteps', () => {
  it.each([
    [{ amount: '1.5', chain: 'ethereum' as const, fromUnit: 'ether', toUnit: 'wei' }],
    [{ amount: '21000', chain: 'ethereum' as const, fromUnit: 'gwei', toUnit: 'ether' }],
    [{ amount: '0.00012345', chain: 'bitcoin' as const, fromUnit: 'bitcoin', toUnit: 'satoshi' }],
  ])('ends with the converted amount the page shows', (i) => {
    const s = cryptocurrencyUnitConverterSteps(i);
    expect(last(s)).toBe(pcCryptoDisplay(convertCryptoUnits(i.amount, i.chain, i.fromUnit, i.toUnit), i.toUnit));
    expect(s[1].working).toContain(i.amount);
    noNaNInvalid(s);
  });
  it('hand check: 1.5 ether = 1.5 × 10^18 wei; 21,000 gwei = 0.000021 ether', () => {
    expect(last(cryptocurrencyUnitConverterSteps({ amount: '1.5', chain: 'ethereum', fromUnit: 'ether', toUnit: 'wei' }))).toBe('1,500,000,000,000,000,000 wei');
    const s = cryptocurrencyUnitConverterSteps({ amount: '21000', chain: 'ethereum', fromUnit: 'gwei', toUnit: 'ether' });
    expect(s[0].result).toBe('1 gwei = 0.000000001 ether');
    expect(last(s)).toBe('0.000021 ether');
  });
  it('invalid or cross-chain input gives no steps and no live result', () => {
    expect(cryptocurrencyUnitConverterSteps({ amount: 'abc', chain: 'ethereum', fromUnit: 'ether', toUnit: 'wei' })).toEqual([]);
    expect(cryptocurrencyUnitConverterSteps({ amount: '', chain: 'bitcoin', fromUnit: 'bitcoin', toUnit: 'satoshi' })).toEqual([]);
    expect(pcCryptoConvert('1', 'ethereum', 'bitcoin', 'ether', 'satoshi')).toBe('');
    expect(pcCryptoConvert('0.1', 'ethereum', 'ethereum', 'ether', 'gwei')).toBe('100000000');
  });
});

describe('dateArithmeticSteps', () => {
  const page = (base: string, op: 'add' | 'subtract', v: number, u: Parameters<typeof applyDateArithmetic>[3]) => pcLocalDateTime(applyDateArithmetic(new Date(base), op, v, u)!);
  it.each([
    ['2026-11-06T09:00', 'add', 30, 'days'],
    ['2024-01-31T12:30', 'add', 1, 'months'],
    ['2026-03-01T00:15', 'subtract', 90, 'minutes'],
    ['2024-02-29T08:00', 'add', 1, 'years'],
    ['2026-11-06T09:00', 'subtract', 3, 'weeks'],
  ] as const)('%s %s %s %s ends with the page result', (base, op, v, u) => {
    const s = dateArithmeticSteps({ base, operation: op, value: v, unit: u });
    expect(last(s)).toBe(page(base, op, v, u));
    expect(s[0].working).toBe(base);
    noNaNInvalid(s);
  });
  it('hand check: Jan 31 2024 + 1 month clamps to Feb 29; Nov 6 2026 + 30 days is Sun Dec 6', () => {
    const s = dateArithmeticSteps({ base: '2024-01-31T12:30', operation: 'add', value: 1, unit: 'months' });
    expect(s[2].working).toContain('min(31, 29)');
    expect(last(s)).toBe('Thu 2024-02-29 12:30');
    expect(last(dateArithmeticSteps({ base: '2026-11-06T09:00', operation: 'add', value: 30, unit: 'days' }))).toBe('Sun 2026-12-06 09:00');
  });
  it('empty or invalid input gives no steps', () => {
    expect(dateArithmeticSteps({ base: '', operation: 'add', value: 1, unit: 'days' })).toEqual([]);
    expect(dateArithmeticSteps({ base: '2026-11-06T09:00', operation: 'add', value: NaN, unit: 'days' })).toEqual([]);
  });
  it('the example start is today at the given time', () => {
    expect(pcLocalInputValue(0, 9, 0, new Date(2026, 10, 6, 15, 0))).toBe('2026-11-06T09:00');
    expect(pcLocalInputValue(30, 17, 30, new Date(2026, 10, 6, 15, 0))).toBe('2026-12-06T17:30');
  });
});

describe('dateDiffSteps', () => {
  it.each([
    ['2026-11-06T09:00', '2026-12-06T17:30'],
    ['2026-01-01T00:00', '2027-03-15T06:45'],
    ['2026-12-25T18:00', '2026-11-06T09:00'],
  ])('%s to %s ends with the breakdown the page shows', (a, b) => {
    const s = dateDiffSteps(a, b);
    expect(last(s)).toBe(pcDiffBreakdown(computeDateDifference(a, b)!.breakdown));
    expect(s[0].working).toContain(a);
    noNaNInvalid(s);
  });
  it('hand check: 2026-11-06 09:00 to 2026-12-06 17:30 is 30 days 8.5 h, 21 business days', () => {
    const s = dateDiffSteps('2026-11-06T09:00', '2026-12-06T17:30');
    expect(s[1].result).toMatch(/^30 days/);
    expect(s[2].result).toBe('21 business days, 9 weekend days');
    expect(last(s)).toBe('4 weeks, 2 days, 8 hours, 30 minutes, 0 seconds');
  });
  it('missing dates give no steps; reversed dates say so', () => {
    expect(dateDiffSteps('', '2026-01-01T00:00')).toEqual([]);
    expect(dateDiffSteps('2026-12-25T18:00', '2026-11-06T09:00')[0].formula).toContain('counted backwards');
  });
});

describe('subnetCalculatorSteps', () => {
  it.each([['192.168.1.1', 24], ['10.20.30.40', 13], ['172.16.5.4', 31], ['8.8.8.8', 32], ['0.0.0.0', 0]] as const)('%s/%s ends with the usable hosts', (ip, p) => {
    const s = subnetCalculatorSteps(ip, p);
    expect(last(s)).toBe(calculateSubnet(ip, p).usableHosts.toLocaleString());
    expect(s[0].working).toBe(ip);
    noNaNInvalid(s);
  });
  it('hand check: 192.168.1.1/24 is network 192.168.1.0, broadcast .255, 254 hosts; 10.20.30.40/13 is 10.16.0.0', () => {
    const s = subnetCalculatorSteps('192.168.1.1', 24);
    expect(s[0].result).toBe('11000000.10101000.00000001.00000001');
    expect(s[2].result).toBe('192.168.1.0');
    expect(s[3].result).toBe('192.168.1.255');
    expect(last(s)).toBe('254');
    expect(subnetCalculatorSteps('10.20.30.40', 13)[2].result).toBe('10.16.0.0');
    expect(subnetCalculatorSteps('172.16.5.4', 31)[3].result).toContain('RFC 3021');
  });
  it('an invalid address gives no steps', () => {
    expect(subnetCalculatorSteps('192.168.1', 24)).toEqual([]);
    expect(subnetCalculatorSteps('192.168.1.1', 33)).toEqual([]);
  });
});

describe('timeConverterSteps', () => {
  it.each([['1640995200', 'seconds'], ['1700000000123', 'milliseconds'], ['1640995200123456789', 'nanoseconds'], ['-86401', 'seconds']] as const)('%s %s ends with the UTC time', (e, u) => {
    const s = timeConverterSteps(e, u);
    expect(last(s)).toBe(pcUtcDisplay(epochToDate(e, u)!));
    expect(s[0].working).toContain(e);
    noNaNInvalid(s);
  });
  it('hand check: 1640995200 s is 18,993 days, 2022-01-01 00:00:00 UTC', () => {
    const s = timeConverterSteps('1640995200', 'seconds');
    expect(s[0].result).toBe('1,640,995,200,000 ms');
    expect(s[1].result).toBe('18,993 days');
    expect(s[3].result).toBe('2022-01-01');
    expect(last(s)).toBe('2022-01-01 00:00:00.000 UTC');
    expect(timeConverterSteps('-86401', 'seconds')[3].result).toBe('1969-12-30');
  });
  it('a non-numeric timestamp gives no steps', () => {
    expect(timeConverterSteps('abc', 'seconds')).toEqual([]);
    expect(timeConverterSteps('', 'milliseconds')).toEqual([]);
  });
});

const RETIREMENT_DEFAULTS: RetirementPlanInput = {
  householdType: 'single', spouseSocialSecurity: 1800, currentAge: 30, retirementAge: 65, lifeExpectancy: 85, monthlyExpenses: 5000, inflationRate: 3,
  retirementIncomeRatio: 80, currentSavings: 50000, monthlyContribution: 1000, annualIncrease: 3, expectedReturn: 7, socialSecurityBenefit: 2000,
  employerMatch: 500, pensionBenefit: 0, hasKids: false, numberOfKids: 1, educationCostPerChild: 100000, marriageFundPerChild: 25000, kidsCurrentAge: 5,
  healthInsuranceCost: 800, longTermCareFund: 150000, healthEmergencyFund: 50000,
};

describe('retirementPlan surplus', () => {
  it('reports the real surplus when savings exceed the need, and the shortfall otherwise', async () => {
    const { retirementPlan } = await import('@/lib/tools/steps/s7-retirement-calculator');
    for (const monthly of [100, 20000]) {
      const p = retirementPlan({ ...RETIREMENT_DEFAULTS, monthlyContribution: monthly });
      expect(p.surplus - p.shortfall).toBeCloseTo(p.finalSavings - p.need.total, 6);
      expect(Math.min(p.surplus, p.shortfall)).toBe(0);
    }
    expect(retirementPlan({ ...RETIREMENT_DEFAULTS, monthlyContribution: 20000 }).surplus).toBeGreaterThan(0);
  });
});
