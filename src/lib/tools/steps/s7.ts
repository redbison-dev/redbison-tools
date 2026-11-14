/**
 * "Show the working" for the everyday calculators of rollout batch s7
 * (docs/calculation-standard.md): the everyday calculators (cooking, fuel
 * cost, heat index, shoe size, time, wind chill), the interest, investment and
 * retirement calculators, the loan, startup, market and crypto tools, and the
 * unit, date, network and timestamp converters. Each `<tool>Steps()` returns ReportStep[] built from
 * the same functions the page uses for its answer, so the last step's result
 * equals what the page shows (src/test/tools/steps-s7.test.ts).
 *
 * `fmtB` copies fmtNum() in everydayBShared.tsx and `fmtA` copies fmtNum() in
 * everydayAShared.tsx, so a step reads exactly like the page's result tile.
 * Inputs inside the working are printed as entered (plain numbers).
 */
import { stepDate, stepMsg, stepMsgText, type ReportStep, type StepMsg } from '../../report/model';
import {
  convertCooking, findIngredient, INGREDIENTS, VOLUME_UNITS, WEIGHT_UNITS, ML_PER_US_CUP, isVolumeUnit, ingredientDensity,
  fToC, cToF, gasMarkToF, fToGasMark, formatQuantity, scaleFactor, scaleRecipeLines, parseQuantity,
  fuelTripCost, economyFromUsage, evTripCost, toL100km, litresFrom, pricePerLitre, evKwhPerKm,
  KM_PER_MILE, LITRES_PER_US_GALLON, LITRES_PER_IMPERIAL_GALLON,
  calculateHeatIndex, MAGNUS_A, MAGNUS_B, footFromShoeSize, shoeSizesFromFoot, calculateWindChill, WIND_TO_KMH, WIND_UNIT_LABELS,
  type CookingUnitId, type VolumeUnitId, type WeightUnitId, type DistanceUnit, type EconomyUnit, type FuelPriceUnit, type FuelVolumeUnit,
  type EvEfficiencyUnit, type ShoeGroup, type ShoeSystem, type WindUnit,
} from '../calculators/everyday-b';
import {
  sumDurations, formatHMS, formatDuration, formatClock, parseHMS, decimalHoursToSeconds, parseClock, clockDifference, addToClock,
  toSeconds, parseISODate, fromDayNumber, dayNumber, type DurationRow,
} from '../calculators/everyday-a';
import { fuelMoney } from '../calculators/fuel-money';
import { computeSimpleInterest } from '../simple-interest-calculator';
import { computeCompoundGrowth } from '../../finance/compoundGrowth';
import { periodsPerYear, toRatePerPeriod, contributionsPerYear } from '../compound-interest-calculator';
import { computeSip, computeLumpSum } from '../investment-calculator';
import { portfolioMetrics, type PortfolioTransaction } from './s7-investment-returns-calculator';
import { retirementPlan, EDUCATION_INFLATION_PCT, type RetirementPlanInput } from './s7-retirement-calculator';
import { emiTotals, emiMonthly, type EmiInput } from './s7-emi-calculator';
import { computeRentVsBuy, type RentVsBuyInput } from '../rent-vs-buy-calculator';
import { computeLtvCac, type LtvCacInputs, type LtvMethod } from '../ltv-cac-calculator';
import { computeTam, REVENUE_PROJECTION_FACTOR, type TamInputs } from '../tam-calculator';
import { calculateIntrinsicValue, discountedEarningsValue, DCF_ASSUMPTIONS, type IntrinsicValue, type StockData } from '../stock-analysis-calculator';
import { eip1559Fee, formatGasFiat, gweiToWei, legacyFee, parseGasUnits, weiToEthString, weiToFiat, weiToGweiString, type FeeBreakdown } from '../gas-fee-calculator';
import { convertCryptoUnits, CRYPTO_UNITS, groupThousands, parseDecimal, type CryptoChain } from '../cryptocurrency-unit-converter';
import { applyDateArithmetic, type DateOperation, type DateUnit } from '../date-arithmetic';
import { computeDateDifference } from '../date-diff';
import { calculateSubnet } from '../subnet-calculator';
import { ipv4ToBinary, parseIPv4 } from '../ip-converter';
import { epochToDate, type EpochUnit } from '../time-converter';
import { msg } from '../../msg';

type MsgVars = Record<string, string | number>;
/** Fills {name} placeholders: the US English text of a msg() template, as t() renders it on an English page. */
const fillMsg = (text: string, vars: MsgVars) => text.replace(/\{(\w+)\}/g, (all, k: string) => (vars[k] === undefined ? all : String(vars[k])));
/*
 * Step text built from a msg() template with values in it. Each spreads the
 * English text into its field plus the message for t() (labelMsg,
 * formulaMsg, workingMsg, resultMsg; same shape as ReportStep.resultMsg), so
 * the English output stays as it was.
 */
const msgLabel = (text: string, vars: Record<string, unknown>) => { const m = stepMsg(text, vars); return { label: stepMsgText(m), labelMsg: m }; };
const msgFormula = (text: string, vars: Record<string, unknown>) => { const m = stepMsg(text, vars); return { formula: stepMsgText(m), formulaMsg: m }; };
const msgWorking = (text: string, vars: Record<string, unknown>) => { const m = stepMsg(text, vars); return { working: stepMsgText(m), workingMsg: m }; };
const msgResult = (text: string, vars: Record<string, unknown>) => { const m = stepMsg(text, vars); return { result: stepMsgText(m), resultMsg: m }; };


// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

/** Same as fmtNum() in everydayBShared.tsx: fixed decimals with grouping. */
export const fmtB = (v: number, dp = 1) =>
  Number.isFinite(v) ? v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp }) : '-';
/** Same as fmtNum() in everydayAShared.tsx: up to `digits` decimals. */
export const fmtA = (v: number, digits = 2) =>
  Number.isFinite(v) ? v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: digits }) : '-';
/** A number as the visitor typed it: grouping, no padding zeros. */
const p = (v: number, digits = 6) => (Number.isFinite(v) ? v.toLocaleString('en-US', { maximumFractionDigits: digits }) : '-');
/** Same as num() in the everyday kits. */
const n = (v: string | number | undefined): number => {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').replace(/,/g, '').trim();
  return s === '' ? NaN : Number(s);
};

// ---------------------------------------------------------------------------
// Cooking converter
// ---------------------------------------------------------------------------

/** Short unit name, as on the page (label without the bracket). */
export const cookingUnitShort = (u: CookingUnitId) =>
  (isVolumeUnit(u) ? VOLUME_UNITS[u].label.replace(/ \(.*\)$/, '') : WEIGHT_UNITS[u].label.replace(/ \(.*\)$/, ''));
/** Rounds a converted amount the way the page shows it. */
export const cookingSmart = (v: number) => (v >= 100 ? fmtB(v, 0) : v >= 10 ? fmtB(v, 1) : fmtB(v, 2));

/** How each kitchen unit is defined. */
function unitDefinition(u: CookingUnitId): string {
  if (u === 'ml' || u === 'g') return '';
  if (u === 'l') return '1 L = 1,000 ml (SI)';
  if (u === 'kg') return '1 kg = 1,000 g (SI)';
  if (u === 'oz') return msg('1 oz = 28.349523125 g exactly (avoirdupois, NIST Handbook 44)');
  if (u === 'lb') return msg('1 lb = 453.59237 g exactly (NIST Handbook 44)');
  // ML_PER_US_CUP is 236.5882365.
  if (u.startsWith('us-')) return msg('1 US cup = 1/16 US gallon = 236.5882365 ml exactly (NIST Handbook 44)');
  if (u.startsWith('imp-')) return msg('1 UK gallon = 4.54609 L exactly (UK Weights and Measures Act 1985), 1 UK pint = 568.26125 ml');
  return msg('metric kitchen measure (cup 250 ml, tablespoon 15 ml, teaspoon 5 ml; Australian tablespoon 20 ml)');
}

export type CookingStepsInput = {
  tab: string; amount: string | number; from: CookingUnitId; to: CookingUnitId; ingredient: string;
  temp: string | number; tempUnit: string; serves: string | number; wanted: string | number; recipe: string;
};

/** Cups and spoons to grams by density, oven temperatures, and recipe scaling. Last step: the page's main result. */
export function cookingConverterSteps(i: CookingStepsInput): ReportStep[] {
  if (i.tab === 'oven') return ovenSteps(i);
  if (i.tab === 'scale') return scaleSteps(i);
  const amount = n(i.amount);
  const ing = findIngredient(i.ingredient) ?? INGREDIENTS[0];
  const conv = convertCooking(amount, i.from, i.to, ing.id);
  if (!conv.ok) return [];
  const steps: ReportStep[] = [];
  const crosses = isVolumeUnit(i.from) !== isVolumeUnit(i.to);
  const density = ingredientDensity(ing);
  const fromLabel = isVolumeUnit(i.from) ? VOLUME_UNITS[i.from].label : WEIGHT_UNITS[i.from].label;
  const def = unitDefinition(i.from);
  let ml: number;
  let grams: number;
  if (isVolumeUnit(i.from)) {
    const per = VOLUME_UNITS[i.from].ml;
    ml = amount * per;
    grams = ml * density;
    steps.push({ label: msg('Volume in millilitres'), ...(def ? msgFormula(msg('V = amount × 1 {unit}; {definition}'), { unit: fromLabel, definition: def }) : msgFormula(msg('V = amount × 1 {unit}'), { unit: fromLabel })), working: `${p(amount)} × ${p(per, 10)} ml`, result: `${fmtB(ml, 2)} ml` });
  } else {
    const per = WEIGHT_UNITS[i.from as WeightUnitId].g;
    grams = amount * per;
    ml = grams / density;
    steps.push({ label: msg('Mass in grams'), ...(def ? msgFormula(msg('m = amount × 1 {unit}; {definition}'), { unit: fromLabel, definition: def }) : msgFormula(msg('m = amount × 1 {unit}'), { unit: fromLabel })), working: `${p(amount)} × ${p(per, 10)} g`, result: `${fmtB(grams, 2)} g` });
  }
  if (crosses) {
    steps.push({
      ...msgLabel(msg('Density of {ingredient}'), { ingredient: ing.name.toLowerCase() }),
      ...(ing.source === 'Water'
        ? msgFormula(msg('ρ = grams per US cup / {cupMl} ml (water)'), { cupMl: ML_PER_US_CUP })
        : msgFormula(msg('ρ = grams per US cup / {cupMl} ml ({source} ingredient weight chart)'), { cupMl: ML_PER_US_CUP, source: ing.source })),
      working: `${p(ing.gPerUsCup)} g / ${ML_PER_US_CUP} ml`,
      result: `${fmtB(density, 4)} g/ml`,
    });
    steps.push(isVolumeUnit(i.from)
      ? { label: msg('Mass'), formula: 'm = V × ρ', working: `${fmtB(ml, 2)} ml × ${fmtB(density, 4)} g/ml`, result: `${fmtB(grams, 2)} g` }
      : { label: msg('Volume'), formula: 'V = m / ρ', working: `${fmtB(grams, 2)} g / ${fmtB(density, 4)} g/ml`, result: `${fmtB(ml, 2)} ml` });
  }
  const toDef = unitDefinition(i.to);
  const toLabel = cookingUnitShort(i.to);
  const result = msgResult('{n} {unit}', { n: cookingSmart(conv.value), unit: toLabel });
  if (isVolumeUnit(i.to)) {
    const per = VOLUME_UNITS[i.to as VolumeUnitId].ml;
    steps.push({ ...msgLabel(msg('In {unit}'), { unit: toLabel }), ...(toDef ? msgFormula(msg('amount = V / 1 {unit}; {definition}'), { unit: VOLUME_UNITS[i.to as VolumeUnitId].label, definition: toDef }) : msgFormula(msg('amount = V / 1 {unit}'), { unit: VOLUME_UNITS[i.to as VolumeUnitId].label })), working: `${fmtB(ml, 2)} ml / ${p(per, 10)} ml`, ...result });
  } else {
    const per = WEIGHT_UNITS[i.to as WeightUnitId].g;
    steps.push({ ...msgLabel(msg('In {unit}'), { unit: toLabel }), ...(toDef ? msgFormula(msg('amount = m / 1 {unit}; {definition}'), { unit: WEIGHT_UNITS[i.to as WeightUnitId].label, definition: toDef }) : msgFormula(msg('amount = m / 1 {unit}'), { unit: WEIGHT_UNITS[i.to as WeightUnitId].label })), working: `${fmtB(grams, 2)} g / ${p(per, 10)} g`, ...result });
  }
  return steps;
}

function ovenSteps(i: CookingStepsInput): ReportStep[] {
  const t = n(i.temp);
  if (!Number.isFinite(t)) return [];
  const steps: ReportStep[] = [];
  let f: number;
  if (i.tempUnit === 'gas') {
    const g = gasMarkToF(t);
    if (!g.ok) return [];
    f = g.value;
    steps.push({ label: msg('Gas mark to Fahrenheit'), formula: msg('°F = 250 + 25 × mark (mark 1 to 10); mark 1/2 = 250°F, 1/4 = 225°F'), ...(t >= 1 ? { working: `250 + 25 × ${p(t)}` } : msgWorking(msg('gas mark {t}'), { t: formatQuantity(t) })), result: `${fmtB(f, 0)}°F` });
  } else if (i.tempUnit === 'F') f = t;
  else f = cToF(t);
  if (f < 100 || f > 600) return [];
  const c = fToC(f);
  const gas = fToGasMark(f);
  if (i.tempUnit !== 'gas') {
    steps.push({ label: msg('Nearest gas mark'), formula: msg('mark n = 250 + 25 n °F, nearest mark'), working: `${fmtB(f, 0)}°F`, ...(gas ? { result: formatQuantity(gas) } : msgResult(msg('off scale'), {})) });
  }
  if (i.tempUnit === 'C') {
    steps.push({ label: msg('Celsius to Fahrenheit'), formula: '°F = °C × 9/5 + 32', working: `${p(t)} × 9/5 + 32`, result: `${fmtB(f, 0)}°F` });
  } else {
    steps.push({ label: msg('Fahrenheit to Celsius'), formula: '°C = (°F − 32) × 5/9', working: `(${p(f)} − 32) × 5/9 = ${fmtB(c, 1)}`, result: `${fmtB(c, 0)}°C` });
  }
  return steps;
}

function scaleSteps(i: CookingStepsInput): ReportStep[] {
  const s = scaleFactor(n(i.serves), n(i.wanted));
  if (!s.ok) return [];
  const steps: ReportStep[] = [
    { label: msg('Scale factor'), formula: msg('factor = servings wanted / recipe serves'), working: `${p(n(i.wanted))} / ${p(n(i.serves))} = ${fmtB(s.value, 4)}`, result: `x ${fmtB(s.value, 3)}` },
  ];
  const lines = i.recipe.split(/\r?\n/);
  const k = lines.findIndex((l) => l.trim() && Number.isFinite(parseQuantity(l).value));
  if (k >= 0) {
    const q = parseQuantity(lines[k]).value;
    const out = scaleRecipeLines(lines[k], s.value)[0];
    steps.push({ label: msg('First ingredient line'), formula: msg('quantity × factor, rounded to the nearest 1/8 or third when close'), working: `${formatQuantity(q)} × ${fmtB(s.value, 4)} = ${p(q * s.value, 4)}`, result: out });
  }
  return steps;
}

// ---------------------------------------------------------------------------
// Fuel cost
// ---------------------------------------------------------------------------

export type FuelStepsInput = {
  mode: string; distance: number; distanceUnit: DistanceUnit; economy: number; economyUnit: EconomyUnit; price: number; priceUnit: FuelPriceUnit;
  roundTrip: boolean; passengers: number; fuelUsed: number; fuelUnit: FuelVolumeUnit; efficiency: number; efficiencyUnit: EvEfficiencyUnit;
  kwhPrice: number; chargeLoss: number; currency: string;
};

function distanceStep(d: number, unit: DistanceUnit, roundTrip: boolean): ReportStep {
  const km = (unit === 'mi' ? d * KM_PER_MILE : d) * (roundTrip ? 2 : 1);
  return {
    label: msg('Distance in kilometres'),
    ...(unit === 'mi' ? (roundTrip ? msgFormula(msg('d(km) = d(mi) × 1.609344 (1 mile = 1.609344 km exactly) × 2 for the round trip'), {}) : msgFormula(msg('d(km) = d(mi) × 1.609344 (1 mile = 1.609344 km exactly)'), {})) : (roundTrip ? msgFormula(msg('d(km) = d × 2 for the round trip'), {}) : msgFormula(msg('d(km) = d'), {}))),
    working: `${p(d)}${unit === 'mi' ? ' × 1.609344' : ''}${roundTrip ? ' × 2' : ''}`,
    result: `${fmtB(km, 1)} km`,
  };
}

function economyStep(e: number, u: EconomyUnit): ReportStep {
  const l = toL100km(e, u);
  const gal = u === 'mpg-us' ? '3.785411784' : '4.54609';
  const w = u === 'l100km' ? `${p(e)}` : u === 'kml' ? `100 / ${p(e)}` : `100 × ${gal} / (${p(e)} × 1.609344)`;
  const f = u === 'l100km'
    ? msg('L/100 km as entered')
    : u === 'kml'
      ? 'L/100 km = 100 / (km/L)'
      : u === 'mpg-us'
        ? msg('L/100 km = 100 × litres per US gallon / (MPG × 1.609344); 1 US gallon = 3.785411784 L exactly')
        : msg('L/100 km = 100 × litres per UK gallon / (MPG × 1.609344); 1 UK gallon = 4.54609 L exactly');
  return { label: msg('Fuel economy in L/100 km'), formula: f, working: w, result: `${fmtB(l, 3)} L/100 km` };
}

/** Trip fuel cost, fuel economy from a fill-up, or EV charging cost. Last step: the page's headline. */
export function fuelCostSteps(i: FuelStepsInput): ReportStep[] {
  const money = (v: number, d?: number) => fuelMoney(v, i.currency, d);
  const people = i.passengers;
  if (i.mode === 'economy') {
    const r = economyFromUsage(i.distance, i.distanceUnit, i.fuelUsed, i.fuelUnit);
    if (!r.ok) return [];
    const L = litresFrom(i.fuelUsed, i.fuelUnit);
    const km = i.distanceUnit === 'mi' ? i.distance * KM_PER_MILE : i.distance;
    return [
      distanceStep(i.distance, i.distanceUnit, false),
      {
        label: msg('Fuel in litres'),
        ...(i.fuelUnit === 'l' ? { formula: msg('litres as entered') } : (i.fuelUnit === 'us-gal' ? msgFormula(msg('L = gallons × 3.785411784 (US gallon)'), {}) : msgFormula(msg('L = gallons × 4.54609 (UK gallon)'), {}))),
        working: i.fuelUnit === 'l' ? p(i.fuelUsed) : `${p(i.fuelUsed)} × ${i.fuelUnit === 'us-gal' ? LITRES_PER_US_GALLON : LITRES_PER_IMPERIAL_GALLON}`,
        result: `${fmtB(L, 3)} L`,
      },
      { label: msg('Litres per 100 km'), formula: msg('L/100 km = litres / km × 100'), working: `${fmtB(L, 3)} / ${fmtB(km, 1)} × 100`, result: fmtB(r.value.l100km, 2) },
      { label: 'MPG (UK)', formula: 'MPG (UK) = 100 × 4.54609 / (1.609344 × L/100 km)', working: `100 × 4.54609 / (1.609344 × ${fmtB(r.value.l100km, 3)})`, result: fmtB(r.value['mpg-uk'], 1) },
      { label: 'MPG (US)', formula: 'MPG (US) = 100 × 3.785411784 / (1.609344 × L/100 km)', working: `100 × 3.785411784 / (1.609344 × ${fmtB(r.value.l100km, 3)})`, result: fmtB(r.value['mpg-us'], 1) },
    ];
  }
  if (i.mode === 'ev') {
    const r = evTripCost({ distance: i.distance, distanceUnit: i.distanceUnit, efficiency: i.efficiency, efficiencyUnit: i.efficiencyUnit, pricePerKwh: i.kwhPrice, chargingLossPct: i.chargeLoss, roundTrip: i.roundTrip, passengers: people });
    if (!r.ok) return [];
    const perKm = evKwhPerKm(i.efficiency, i.efficiencyUnit);
    const battery = r.value.distanceKm * perKm;
    const e = i.efficiency;
    const effW = i.efficiencyUnit === 'kwh100km' ? `${p(e)} / 100` : i.efficiencyUnit === 'kwh100mi' ? `${p(e)} / 100 / 1.609344` : i.efficiencyUnit === 'mikwh' ? `1 / (${p(e)} × 1.609344)` : `1 / ${p(e)}`;
    const steps: ReportStep[] = [
      distanceStep(i.distance, i.distanceUnit, i.roundTrip),
      { label: msg('Energy per km'), formula: msg('kWh per km from the efficiency figure (1 mile = 1.609344 km)'), working: effW, result: `${fmtB(perKm, 4)} kWh/km` },
      { label: msg('Energy at the battery'), formula: msg('E = d × kWh per km'), working: `${fmtB(r.value.distanceKm, 1)} km × ${fmtB(perKm, 4)}`, result: `${fmtB(battery, 2)} kWh` },
      { label: msg('Energy from the grid'), formula: msg('E(grid) = E / (1 − charging loss)'), working: `${fmtB(battery, 2)} / (1 − ${p(i.chargeLoss)}%)`, result: `${fmtB(r.value.kwh, 2)} kWh` },
      { label: msg('Charging cost'), formula: msg('cost = E(grid) × price per kWh'), working: `${fmtB(r.value.kwh, 2)} kWh × ${money(i.kwhPrice)}`, result: money(r.value.cost) },
    ];
    if (people > 1) steps.push({ label: msg('Per person'), formula: msg('cost / people'), working: `${money(r.value.cost)} / ${people}`, result: money(r.value.costPerPerson) });
    return steps;
  }
  const r = fuelTripCost({ distance: i.distance, distanceUnit: i.distanceUnit, economy: i.economy, economyUnit: i.economyUnit, price: i.price, priceUnit: i.priceUnit, roundTrip: i.roundTrip, passengers: people });
  if (!r.ok) return [];
  const ppl = pricePerLitre(i.price, i.priceUnit);
  const steps: ReportStep[] = [
    distanceStep(i.distance, i.distanceUnit, i.roundTrip),
    economyStep(i.economy, i.economyUnit),
    { label: msg('Fuel needed'), formula: msg('fuel = d × (L/100 km) / 100'), working: `${fmtB(r.value.distanceKm, 1)} km × ${fmtB(r.value.l100km, 3)} / 100`, result: `${fmtB(r.value.litres, 2)} L (${fmtB(r.value.usGallons, 3)} US gal)` },
    {
      label: msg('Price per litre'),
      ...(i.priceUnit === 'per-l' ? { formula: msg('price as entered') } : msgFormula(msg('price per gallon / {value}'), { value: i.priceUnit === 'per-us-gal' ? '3.785411784' : '4.54609' })),
      working: i.priceUnit === 'per-l' ? money(i.price) : `${money(i.price)} / ${i.priceUnit === 'per-us-gal' ? '3.785411784' : '4.54609'}`,
      result: money(ppl, 4),
    },
    { label: msg('Trip fuel cost'), formula: msg('cost = fuel × price per litre'), working: `${fmtB(r.value.litres, 2)} L × ${money(ppl, 4)}`, result: money(r.value.cost) },
  ];
  if (people > 1) steps.push({ label: msg('Per person'), formula: msg('cost / people'), working: `${money(r.value.cost)} / ${people}`, result: money(r.value.costPerPerson) });
  return steps;
}

// ---------------------------------------------------------------------------
// Heat index
// ---------------------------------------------------------------------------

export type HeatIndexStepsInput = { temp: number; unit: 'F' | 'C'; mode: 'rh' | 'dewpoint'; rh: number; dew: number };

/** NWS heat index (WPC algorithm): Steadman simple formula, Rothfusz regression and adjustments. Last step: the heat index the page shows. */
export function heatIndexSteps(i: HeatIndexStepsInput): ReportStep[] {
  const res = calculateHeatIndex({ temp: i.temp, tempUnit: i.unit, humidityMode: i.mode, rh: i.rh, dewPoint: i.dew });
  if (!res.ok) return [];
  const r = res.value;
  const F = i.unit === 'F';
  const T = r.tF;
  const RH = r.rh;
  const t = fmtB(T, 1);
  const h = fmtB(RH, 1);
  const steps: ReportStep[] = [];
  if (!F) steps.push({ label: msg('Air temperature in °F'), formula: 'T(°F) = T(°C) × 9/5 + 32', working: `${p(i.temp)} × 9/5 + 32`, result: `${t}°F` });
  if (i.mode === 'dewpoint') {
    const tdC = F ? fToC(i.dew) : i.dew;
    steps.push({
      label: msg('Relative humidity from the dew point (Magnus)'),
      ...msgFormula(msg('RH = 100 × exp(a·Td / (b + Td) − a·T / (b + T)), a = {MAGNUS_A}, b = {MAGNUS_B}°C'), { MAGNUS_A, MAGNUS_B }),
      working: `100 × exp(${MAGNUS_A} × ${fmtB(tdC, 2)} / (${MAGNUS_B} + ${fmtB(tdC, 2)}) − ${MAGNUS_A} × ${fmtB(r.tC, 2)} / (${MAGNUS_B} + ${fmtB(r.tC, 2)}))${F ? `, Td = ${p(i.dew)}°F` : ''}`,
      result: `${fmtB(RH, 1)}%`,
    });
  } else {
    const g = Math.log(RH / 100) + (MAGNUS_A * r.tC) / (MAGNUS_B + r.tC);
    steps.push({
      label: msg('Dew point (Magnus)'),
      ...msgFormula(msg('Td = b·γ / (a − γ), γ = ln(RH/100) + a·T / (b + T), a = {MAGNUS_A}, b = {MAGNUS_B}°C'), { MAGNUS_A, MAGNUS_B }),
      working: `γ = ln(${p(RH)}/100) + ${MAGNUS_A} × ${fmtB(r.tC, 2)} / (${MAGNUS_B} + ${fmtB(r.tC, 2)}) = ${fmtB(g, 4)}`,
      result: F ? `${fmtB(r.dewPointF, 1)}°F` : `${fmtB(r.dewPointC, 1)}°C`,
    });
  }
  const simple = 0.5 * (T + 61 + (T - 68) * 1.2 + RH * 0.094);
  steps.push({
    label: msg('Simple (Steadman) heat index'),
    formula: msg('HI = 0.5 × (T + 61 + (T − 68) × 1.2 + RH × 0.094); use the regression if (HI + T) / 2 ≥ 80°F'),
    working: `0.5 × (${t} + 61 + (${t} − 68) × 1.2 + ${h} × 0.094); (${fmtB(simple, 1)} + ${t}) / 2 = ${fmtB((simple + T) / 2, 1)}°F`,
    result: `${fmtB(simple, 1)}°F`,
  });
  if (r.method === 'rothfusz') {
    steps.push({
      label: msg('Rothfusz regression'),
      formula: 'HI = −42.379 + 2.04901523T + 10.14333127RH − 0.22475541T·RH − 0.00683783T² − 0.05481717RH² + 0.00122874T²·RH + 0.00085282T·RH² − 0.00000199T²·RH²',
      working: `−42.379 + 2.04901523 × ${t} + 10.14333127 × ${h} − 0.22475541 × ${t} × ${h} − 0.00683783 × ${t}² − 0.05481717 × ${h}² + 0.00122874 × ${t}² × ${h} + 0.00085282 × ${t} × ${h}² − 0.00000199 × ${t}² × ${h}²`,
      result: `${fmtB(r.hiF - r.adjustment, 1)}°F`,
    });
    if (r.adjustment) {
      steps.push(r.adjustment < 0
        ? { label: msg('Low-humidity adjustment (RH < 13%, 80 to 112°F)'), formula: 'ADJ = −((13 − RH) / 4) × √((17 − |T − 95|) / 17)', working: `−((13 − ${h}) / 4) × √((17 − |${t} − 95|) / 17)`, result: `${fmtB(r.adjustment, 2)}°F` }
        : { label: msg('High-humidity adjustment (RH > 85%, 80 to 87°F)'), formula: 'ADJ = ((RH − 85) / 10) × ((87 − T) / 5)', working: `((${h} − 85) / 10) × ((87 − ${t}) / 5)`, result: `+${fmtB(r.adjustment, 2)}°F` });
    }
  }
  steps.push(F
    ? { label: msg('Heat index (feels like)'), formula: r.method === 'rothfusz' ? msg('HI = regression + adjustment, to the nearest degree') : msg('HI = simple formula, to the nearest degree'), working: `${fmtB(r.hiF, 2)}°F`, result: `${fmtB(r.hiF, 0)}°F` }
    : { label: msg('Heat index (feels like) in °C'), formula: 'HI(°C) = (HI(°F) − 32) × 5/9', working: `(${fmtB(r.hiF, 2)} − 32) × 5/9`, result: `${fmtB(fToC(r.hiF), 0)}°C` });
  return steps;
}

// ---------------------------------------------------------------------------
// Shoe size
// ---------------------------------------------------------------------------

const shoeHalf = (v: number) => (Number.isInteger(v) ? String(v) : `${Math.floor(v)}½`);

/** Foot length from the size, then each system's formula (ISO/TS 19407 for EU and Mondopoint). Last step: the US size. */
export function shoeSizeSteps(i: { group: ShoeGroup; system: ShoeSystem; size: number }): ReportStep[] {
  const foot = footFromShoeSize(i.system, i.size, i.group);
  if (!foot.ok) return [];
  const res = shoeSizesFromFoot(foot.value, i.group);
  if (!res.ok) return [];
  const r = res.value;
  const usOff = i.group === 'men' || /youth/.test(r.usLabel) ? 22 : i.group === 'women' ? 21 : 9.75;
  const ukOff = i.group === 'kids' && !/adult/.test(r.ukLabel) ? 10 : 23;
  const inOff = i.system === 'us' ? (i.group === 'men' ? 22 : i.group === 'women' ? 21 : 9.75) : i.group === 'kids' ? 10 : 23;
  const s = p(i.size);
  const footStep: ReportStep =
    i.system === 'us' || i.system === 'uk'
      ? { ...(i.system === 'us' ? msgLabel(msg('Foot length from US size {s}'), { s }) : msgLabel(msg('Foot length from UK size {s}'), { s })), ...msgFormula(msg('foot (in) = (size + {inOff}) / 3; 1 in = 25.4 mm exactly (one size = one barleycorn, 1/3 in)'), { inOff }), working: `(${s} + ${inOff}) / 3 = ${fmtB(r.footIn, 3)} in × 25.4`, result: `${fmtB(r.footMm, 1)} mm` }
      : i.system === 'eu'
        ? { ...msgLabel(msg('Foot length from EU size {s}'), { s }), formula: msg('foot (mm) = (EU − 2) × 20 / 3 (Paris point = 2/3 cm)'), working: `(${s} − 2) × 20 / 3`, result: `${fmtB(r.footMm, 1)} mm` }
        : i.system === 'in'
          ? { label: msg('Foot length in millimetres'), formula: msg('mm = in × 25.4 (exact)'), working: `${s} × 25.4`, result: `${fmtB(r.footMm, 1)} mm` }
          : i.system === 'mondopoint'
            ? { label: msg('Foot length (Mondopoint, ISO 9407)'), formula: msg('Mondopoint = foot length in mm'), working: `${s} mm`, result: `${fmtB(r.footMm, 1)} mm` }
            : { label: msg('Foot length in millimetres'), formula: 'mm = cm × 10', working: `${s} × 10`, result: `${fmtB(r.footMm, 1)} mm` };
  return [
    footStep,
    { label: msg('EU (Paris points)'), formula: msg('EU = 1.5 × foot (cm) + 2, to the nearest half'), working: `1.5 × ${fmtB(r.footMm / 10, 2)} + 2 = ${fmtB(r.exact.eu, 2)}`, result: shoeHalf(r.eu) },
    { label: msg('Japan and Mondopoint'), formula: msg('Japan = foot (cm) to the nearest 0.5; Mondopoint = foot (mm) to the nearest 5'), working: `${fmtB(r.footMm / 10, 2)} cm, ${fmtB(r.footMm, 1)} mm`, result: `${fmtB(r.jp, 1)} cm, ${r.mondopoint}` },
    { label: msg('UK size'), ...msgFormula(msg('UK = 3 × foot (in) − {ukOff}, to the nearest half'), { ukOff }), working: `3 × ${fmtB(r.footIn, 3)} − ${ukOff} = ${fmtB(r.exact.uk, 2)}`, result: r.ukLabel },
    { label: msg('US size'), ...msgFormula(msg('US = 3 × foot (in) − {usOff}, to the nearest half'), { usOff }), working: `3 × ${fmtB(r.footIn, 3)} − ${usOff} = ${fmtB(r.exact.us, 2)}`, result: r.usLabel },
  ];
}

// ---------------------------------------------------------------------------
// Time calculator
// ---------------------------------------------------------------------------

/** The duration rows the page keeps in the URL ("+,d,h,m,s;..."), blanks as zero. */
export function parseDurationRows(s: string): DurationRow[] {
  const rows = s ? s.split(';').map((r) => r.split(',')) : [];
  return rows.map((r) => ({
    sign: r[0] === '-' ? -1 : 1,
    days: !r[1] ? 0 : n(r[1]), hours: !r[2] ? 0 : n(r[2]), minutes: !r[3] ? 0 : n(r[3]), seconds: !r[4] ? 0 : n(r[4]),
  }));
}

/** A duration added to (or taken from) a clock time, with the end date when a start date is given. */
export function clockAddResult(i: { cStart: string; cDate: string; cSign: string; cD: string; cH: string; cM: string; cS: string }) {
  const s = parseClock(i.cStart);
  if (s === null) return { ok: false as const, error: 'Enter a start time.' };
  const parts = [i.cD, i.cH, i.cM, i.cS].map((x) => (x === '' ? 0 : n(x)));
  if (parts.some((v) => !Number.isFinite(v) || v < 0)) return { ok: false as const, error: 'Duration fields must be zero or positive numbers.' };
  const delta = toSeconds({ days: parts[0], hours: parts[1], minutes: parts[2], seconds: parts[3] }) * (i.cSign === '-' ? -1 : 1);
  const r = addToClock(s, delta);
  const date = i.cDate ? parseISODate(i.cDate) : null;
  const endDate = date ? fromDayNumber(dayNumber(date) + r.dayOffset) : null;
  return { ok: true as const, ...r, start: s, parts, delta, endDate };
}

export type TimeCalcStepsInput = {
  mode: string; rows: string; hms: string; dec: string; convDir: string; start: string; end: string;
  cStart: string; cDate: string; cSign: string; cD: string; cH: string; cM: string; cS: string; clock: string;
};

const secs = (v: number) => `${fmtA(v, 3)} s`;

/** Durations to seconds and back, decimal hours, time between clock times, clock plus a duration. Last step: the page's main result. */
export function timeCalculatorSteps(i: TimeCalcStepsInput): ReportStep[] {
  const h12 = i.clock === '12';
  if (i.mode === 'convert') {
    if (i.convDir === 'toDec') {
      const sec = parseHMS(i.hms);
      if (sec === null) return [];
      const [h, m, s = '0'] = i.hms.trim().replace(/^-/, '').split(':');
      return [
        { label: msg('Time in seconds'), formula: msg('seconds = h × 3,600 + m × 60 + s'), working: `${h} × 3,600 + ${m} × 60 + ${s}`, result: secs(sec) },
        { label: msg('Decimal hours'), formula: msg('hours = seconds / 3,600'), working: `${fmtA(sec, 3)} / 3,600`, result: fmtA(sec / 3600, 4) },
      ];
    }
    const hrs = n(i.dec);
    if (!Number.isFinite(hrs)) return [];
    const sec = decimalHoursToSeconds(hrs);
    return [
      { label: msg('Time in seconds'), formula: msg('seconds = hours × 3,600'), working: `${p(hrs)} × 3,600`, result: secs(sec) },
      { label: msg('h:mm:ss'), formula: msg('h = ⌊s / 3,600⌋, m = ⌊(s mod 3,600) / 60⌋, s = what is left'), working: `${fmtA(sec, 3)} s`, result: formatHMS(sec) },
    ];
  }
  if (i.mode === 'between') {
    const s = parseClock(i.start), e = parseClock(i.end);
    if (s === null || e === null) return [];
    const d = clockDifference(s, e);
    return [
      { label: msg('Start and end in seconds after midnight'), formula: msg('seconds = h × 3,600 + m × 60'), working: `${i.start} → ${fmtA(s)} s, ${i.end} → ${fmtA(e)} s`, result: `${fmtA(s)} s, ${fmtA(e)} s` },
      { label: msg('Difference'), formula: d.overnight ? msg('end − start + 86,400 (the end is the next day)') : msg('end − start'), working: `${fmtA(e)} − ${fmtA(s)}${d.overnight ? ' + 86,400' : ''}`, result: secs(d.seconds) },
      { label: msg('Time between'), formula: msg('seconds split into hours and minutes'), working: `${fmtA(d.seconds)} s = ${formatHMS(d.seconds)}`, result: formatDuration(d.seconds) },
    ];
  }
  if (i.mode === 'clock') {
    const r = clockAddResult(i);
    if (!r.ok) return [];
    const [d, h, m, s] = r.parts;
    const sign = i.cSign === '-' ? '−' : '+';
    const tv = { start: fmtA(r.start), sign, delta: fmtA(Math.abs(r.delta)), end: fmtA(r.start + r.delta), offset: `${r.dayOffset > 0 ? '+' : ''}${r.dayOffset}` };
    const newTime =
      r.dayOffset === 0
        ? msgWorking(msg('{start} {sign} {delta} = {end} s (same day)'), tv)
        : Math.abs(r.dayOffset) === 1
          ? msgWorking(msg('{start} {sign} {delta} = {end} s ({offset} day)'), tv)
          : msgWorking(msg('{start} {sign} {delta} = {end} s ({offset} days)'), tv);
    return [
      { label: msg('Start in seconds after midnight'), formula: msg('seconds = h × 3,600 + m × 60 + s'), working: i.cStart, result: secs(r.start) },
      { label: msg('Duration in seconds'), formula: 'd × 86,400 + h × 3,600 + m × 60 + s', working: `${p(d)} × 86,400 + ${p(h)} × 3,600 + ${p(m)} × 60 + ${p(s)}`, result: secs(Math.abs(r.delta)) },
      { label: msg('New time'), formula: msg('start ± duration, wrapped at 86,400 s a day'), ...newTime, result: formatClock(r.seconds, h12, r.seconds % 60 !== 0) },
    ];
  }
  const rows = parseDurationRows(i.rows);
  const sum = sumDurations(rows);
  if (!sum.ok) return [];
  const each = rows.map(toSeconds);
  const shown = rows.slice(0, 6);
  const steps: ReportStep[] = shown.map((r, k) => ({
    ...msgLabel(msg('Row {value} in seconds'), { value: k + 1 }),
    formula: 'd × 86,400 + h × 3,600 + m × 60 + s',
    working: `${p(r.days)} × 86,400 + ${p(r.hours)} × 3,600 + ${p(r.minutes)} × 60 + ${p(r.seconds)}`,
    result: `${r.sign < 0 ? '−' : ''}${secs(each[k])}`,
  }));
  if (rows.length > shown.length) steps.push({ ...msgLabel(msg('Rows {value} to {length} in seconds'), { value: shown.length + 1, length: rows.length }), formula: 'd × 86,400 + h × 3,600 + m × 60 + s', result: rows.slice(shown.length).map((r, k) => `${r.sign < 0 ? '−' : ''}${fmtA(each[shown.length + k], 3)}`).join(', ') + ' s' });
  steps.push({ label: msg('Signed sum'), formula: msg('Σ ± row seconds'), working: rows.map((r, k) => `${k === 0 ? (r.sign < 0 ? '−' : '') : r.sign < 0 ? ' − ' : ' + '}${fmtA(each[k], 3)}`).join(''), result: secs(sum.value.totalSeconds) });
  steps.push({ label: msg('Total'), formula: msg('h = ⌊s / 3,600⌋, m = ⌊(s mod 3,600) / 60⌋, s = what is left'), working: `${fmtA(sum.value.totalSeconds, 3)} s = ${fmtA(sum.value.decimalHours, 4)} h`, result: formatHMS(sum.value.totalSeconds) });
  return steps;
}

// ---------------------------------------------------------------------------
// Wind chill
// ---------------------------------------------------------------------------

/** 2001 JAG/TI wind chill: NWS form for °F and mph, Environment Canada form for °C and km/h. Last step: the wind chill the page shows. */
export function windChillSteps(i: { temp: number; unit: 'F' | 'C'; wind: number; windUnit: WindUnit }): ReportStep[] {
  const res = calculateWindChill({ temp: i.temp, tempUnit: i.unit, wind: i.wind, windUnit: i.windUnit });
  if (!res.ok) return [];
  const r = res.value;
  const nws = r.formula === 'NWS';
  const target = nws ? 'mph' : 'kmh';
  const V = nws ? r.windMph : r.windKmh;
  const steps: ReportStep[] = [];
  const unitName = WIND_UNIT_LABELS[i.windUnit];
  if (i.windUnit !== target) {
    steps.push({
      ...(nws ? msgLabel(msg('Wind speed in mph'), {}) : msgLabel(msg('Wind speed in km/h'), {})),
      ...(nws ? msgFormula(msg('V(mph) = V × {WIND_TO_KMH} / 1.609344 (1 mile = 1.609344 km)'), { WIND_TO_KMH: WIND_TO_KMH[i.windUnit] }) : { formula: `V(km/h) = V × ${WIND_TO_KMH[i.windUnit]}${i.windUnit === 'mph' ? ' (1 mile = 1.609344 km)' : i.windUnit === 'kn' ? ' (1 knot = 1.852 km/h)' : ''}` }),
      working: nws ? `${p(i.wind)} ${unitName} × ${WIND_TO_KMH[i.windUnit]} / 1.609344` : `${p(i.wind)} ${unitName} × ${WIND_TO_KMH[i.windUnit]}`,
      ...(nws ? msgResult(msg('{V} mph'), { V: fmtB(V, 2) }) : msgResult(msg('{V} km/h'), { V: fmtB(V, 2) })),
    });
  }
  steps.push({
    label: msg('Validity check'),
    formula: nws ? msg('defined for T ≤ 50°F and V > 3 mph') : msg('defined for T ≤ 10°C and V > 4.8 km/h'),
    ...(nws ? msgWorking(msg('T = {temp}°F, V = {windMph} mph'), { temp: p(i.temp), windMph: fmtB(r.windMph, 2) }) : { working: `T = ${p(i.temp)}°C, V = ${fmtB(r.windKmh, 2)} km/h` }),
    ...(r.valid ? msgResult(msg('in range'), {}) : msgResult(msg('out of range'), {})),
  });
  if (!r.valid) {
    steps.push({ label: msg('Wind chill'), formula: msg('outside the valid range the feels-like temperature is the air temperature'), ...msgResult(msg('Not applicable'), {}) });
    return steps;
  }
  const v16 = V ** 0.16;
  steps.push({ label: msg('Wind factor'), formula: nws ? msg('V^0.16, V in mph at 10 m') : msg('V^0.16, V in km/h at 10 m'), working: `${fmtB(V, 2)}^0.16`, result: fmtB(v16, 4) });
  const t = p(i.temp);
  const v = fmtB(v16, 4);
  steps.push(nws
    ? { label: msg('Wind chill (NWS)'), formula: 'WC = 35.74 + 0.6215T − 35.75V^0.16 + 0.4275T·V^0.16', working: `35.74 + 0.6215 × ${t} − 35.75 × ${v} + 0.4275 × ${t} × ${v} = ${fmtB(r.wcF, 2)}`, result: `${fmtB(r.wcF, 0)}°F` }
    : { label: msg('Wind chill (Environment Canada)'), formula: 'WC = 13.12 + 0.6215T − 11.37V^0.16 + 0.3965T·V^0.16', working: `13.12 + 0.6215 × ${t} − 11.37 × ${v} + 0.3965 × ${t} × ${v} = ${fmtB(r.wcC, 2)}`, result: `${fmtB(r.wcC, 0)}°C` });
  return steps;
}

// ===========================================================================
// Interest, investment and retirement calculators
// ===========================================================================

// Money is formatted the way each page prints it: the interest and investment
// pages show `$` + value.toFixed(2), the retirement page whole dollars, the
// returns page value.toLocaleString().

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

/** A number as entered: thousands separators, no padding zeros. */
export const paPlain = (x: number, digits = 6) => (Number.isFinite(x) ? x.toLocaleString('en-US', { maximumFractionDigits: digits }) : '–');
/** `$` + toFixed(2), as the interest and investment pages print money. */
export const paFixed = (x: number) => `$${x.toFixed(2)}`;
/** `$` + toLocaleString(), as the pages print the principal and portfolio totals. */
export const paLocale = (x: number) => `$${x.toLocaleString()}`;
/** Whole dollars, as the retirement page's formatCurrency prints them. */
export const paWhole = (x: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(x);
/** Percent with 2 decimals or n/a, as the returns page prints rates. */
export const paPct = (v: number | null) => (v === null ? 'n/a' : `${v.toFixed(2)}%`);

const FREQ_WORD: Record<string, string> = {
  daily: 'day', weekly: 'week', monthly: 'month', quarterly: 'quarter', 'semi-annually': 'half-year', annually: 'year', yearly: 'year',
};
/** "{rate}% per <period>" and "r = {rate}% per <period>", one message per period word of FREQ_WORD. */
const RATE_PER: Record<string, [string, string]> = {
  day: [msg('{rate}% per day'), msg('r = {rate}% per day')],
  week: [msg('{rate}% per week'), msg('r = {rate}% per week')],
  month: [msg('{rate}% per month'), msg('r = {rate}% per month')],
  quarter: [msg('{rate}% per quarter'), msg('r = {rate}% per quarter')],
  'half-year': [msg('{rate}% per half-year'), msg('r = {rate}% per half-year')],
  year: [msg('{rate}% per year'), msg('r = {rate}% per year')],
  period: [msg('{rate}% per period'), msg('r = {rate}% per period')],
};
const ratePer = (freq: string) => RATE_PER[FREQ_WORD[freq] ?? 'period'];

// ---------------------------------------------------------------------------
// Simple interest
// ---------------------------------------------------------------------------

/** SI = P × R × T / 100 and A = P + SI. Last step: the final amount as the page shows it. */
export function simpleInterestSteps(principal: number, ratePercent: number, years: number): ReportStep[] {
  const r = computeSimpleInterest(principal, ratePercent, years);
  if (!r) return [];
  const P = paPlain(principal);
  return [
    { label: msg('Interest for one year'), formula: 'I₁ = P × R / 100', working: `$${P} × ${paPlain(ratePercent)} / 100`, result: paFixed((principal * ratePercent) / 100) },
    { label: msg('Simple interest'), formula: 'SI = P × R × T / 100', working: `$${P} × ${paPlain(ratePercent)} × ${paPlain(years)} / 100`, result: paFixed(r.interest) },
    { label: msg('Final amount'), formula: 'A = P + SI', working: `$${P} + ${paFixed(r.interest)}`, result: paFixed(r.finalAmount) },
  ];
}

// ---------------------------------------------------------------------------
// Compound interest
// ---------------------------------------------------------------------------

export type CompoundInput = {
  principal: number;
  rate: number;
  time: number;
  /** Period the rate is quoted for (daily … annually). */
  rateDuration: string;
  compoundFrequency: string;
  additionalPrincipal: number;
  /** weekly, monthly, quarterly or yearly */
  additionalFrequency: string;
  /** 'start' pays each period's contribution in before its interest (annuity due); default 'end'. */
  depositTiming?: string;
};

/** The same call the Compound Interest and Interest pages make. */
export function compoundResult(i: CompoundInput) {
  return computeCompoundGrowth({
    principal: i.principal,
    ratePerPeriod: toRatePerPeriod(i.rate, i.rateDuration, i.compoundFrequency),
    periodsPerYear: periodsPerYear(i.compoundFrequency),
    years: i.time,
    contributionsPerYear: contributionsPerYear(i.additionalPrincipal, i.additionalFrequency),
    contributionTiming: i.depositTiming === 'start' ? 'start' : 'end',
  });
}

/**
 * A = P(1 + r)^N + PMT × ((1 + r)^N − 1) / r with r the rate per compounding
 * period and N = n × t periods. Last step: the final amount as the page shows it.
 */
export function compoundInterestSteps(i: CompoundInput): ReportStep[] {
  const res = compoundResult(i);
  if (res.rows.length === 0) return [];
  const m = periodsPerYear(i.rateDuration);
  const n = periodsPerYear(i.compoundFrequency);
  const r = toRatePerPeriod(i.rate, i.rateDuration, i.compoundFrequency);
  const N = n * i.time;
  const whole = Math.abs(N - Math.round(N)) < 1e-9;
  const P = paPlain(i.principal);
  const rTxt = paPlain(r, 8);
  const growth = i.principal * Math.pow(1 + r, N);
  const steps: ReportStep[] = [
    m === n
      ? { label: msg('Rate per compounding period'), formula: msg('r = R (the rate is quoted for the compounding period)'), ...msgWorking(ratePer(i.rateDuration)[0], { rate: paPlain(i.rate) }), ...msgResult(ratePer(i.compoundFrequency)[1], { rate: paPlain(r * 100, 6) }) }
      : { label: msg('Rate per compounding period'), formula: msg('r = R × m / n (m = rate periods a year, n = compounding periods a year)'), working: `${paPlain(i.rate)}% × ${m} / ${n}`, ...msgResult(ratePer(i.compoundFrequency)[1], { rate: paPlain(r * 100, 6) }) },
    { label: msg('Number of compounding periods'), formula: 'N = n × t', ...msgWorking(msg('{n} × {time} years'), { n, time: paPlain(i.time) }), ...(whole ? msgResult(msg('N = {N}'), { N: paPlain(N, 4) }) : msgResult(msg('N = {N} (last period partial)'), { N: paPlain(N, 4) })) },
    { label: msg('Principal with compound interest'), formula: 'P × (1 + r)^N', working: `$${P} × (1 + ${rTxt})^${paPlain(N, 4)}`, result: paFixed(growth) },
  ];
  const perYear = contributionsPerYear(i.additionalPrincipal, i.additionalFrequency);
  if (perYear > 0) {
    const pmt = perYear / n;
    const due = i.depositTiming === 'start';
    const fv = whole ? (r === 0 ? pmt * N : ((pmt * (Math.pow(1 + r, N) - 1)) / r) * (due ? 1 + r : 1)) : res.finalAmount - growth;
    steps.push({
      label: msg('Contribution per compounding period'),
      formula: msg('PMT = contribution × contributions a year / n'),
      working: `$${paPlain(i.additionalPrincipal)} × ${paPlain(perYear / i.additionalPrincipal)} / ${n}`,
      result: `$${paPlain(pmt, 2)}`,
    });
    steps.push({
      label: msg('Contributions with interest'),
      formula: r === 0 ? 'PMT × N' : due ? msg('PMT × ((1 + r)^N − 1) / r × (1 + r) (paid at the start of each period)') : 'PMT × ((1 + r)^N − 1) / r',
      ...(whole ? { working: (r === 0 ? `$${paPlain(pmt, 2)} × ${paPlain(N, 4)}` : `$${paPlain(pmt, 2)} × ((1 + ${rTxt})^${paPlain(N, 4)} − 1) / ${rTxt}${due ? ` × (1 + ${rTxt})` : ''}`) } : (due ? msgWorking(msg('period by period, each payment at the start of its period, the last period pro-rated'), {}) : msgWorking(msg('period by period, each payment at the end of its period, the last period pro-rated'), {}))),
      result: paFixed(fv),
    });
    steps.push({ label: msg('Final amount'), formula: due ? 'A = P(1 + r)^N + PMT × ((1 + r)^N − 1) / r × (1 + r)' : 'A = P(1 + r)^N + PMT × ((1 + r)^N − 1) / r', working: `${paFixed(growth)} + ${paFixed(fv)}`, result: paFixed(res.finalAmount) });
  } else {
    steps.push({ label: msg('Interest earned'), formula: 'I = A − P', working: `${paFixed(res.finalAmount)} − $${P}`, result: paFixed(res.interestEarned) });
    steps.push({ label: msg('Final amount'), formula: 'A = P(1 + r)^N', working: `$${P} × ${paPlain(Math.pow(1 + r, N), 8)}`, result: paFixed(res.finalAmount) });
  }
  return steps;
}

// ---------------------------------------------------------------------------
// Interest calculator (simple or compound, rate per year)
// ---------------------------------------------------------------------------

export type InterestInput = {
  interestType: string;
  principal: number;
  rate: number;
  time: number;
  compoundFrequency: string;
  additionalPrincipal: number;
  additionalFrequency: string;
};

/** Simple interest, or compound interest with the rate quoted per year. Last step: the final amount. */
export function interestCalculatorSteps(i: InterestInput): ReportStep[] {
  if (i.interestType === 'simple') return simpleInterestSteps(i.principal, i.rate, i.time);
  return compoundInterestSteps({ ...i, rateDuration: 'annually' });
}

// ---------------------------------------------------------------------------
// Investment calculator (SIP or lump sum)
// ---------------------------------------------------------------------------

export type InvestmentInput = { investmentType: string; amount: number; returnRate: number; duration: number };

/** SIP as an annuity due at R/12 a month; lump sum compounded yearly. Last step: the maturity amount. */
export function investmentSteps(i: InvestmentInput): ReportStep[] {
  const sip = i.investmentType === 'sip';
  const res = sip ? computeSip(i.amount, i.returnRate, i.duration) : computeLumpSum(i.amount, i.returnRate, i.duration);
  if (!res) return [];
  const A = paPlain(i.amount);
  const n = paPlain(i.duration);
  if (sip) {
    const rate = i.returnRate / 12 / 100;
    const iTxt = paPlain(rate, 8);
    return [
      { label: msg('Monthly rate'), formula: 'i = R / 12 / 100', working: `${paPlain(i.returnRate)} / 12 / 100`, result: `i = ${iTxt}` },
      { label: msg('Total invested'), formula: 'P × n', ...msgWorking(msg('${A} × {n} months'), { A, n }), result: paFixed(res.invested) },
      {
        label: msg('Maturity amount (annuity due)'),
        formula: rate === 0 ? 'FV = P × n' : 'FV = P × ((1 + i)^n − 1) / i × (1 + i)',
        working: rate === 0 ? `$${A} × ${n}` : `$${A} × ((1 + ${iTxt})^${n} − 1) / ${iTxt} × (1 + ${iTxt})`,
        result: paFixed(res.maturity),
      },
    ];
  }
  const years = i.duration / 12;
  const r = i.returnRate / 100;
  return [
    { label: msg('Years invested'), formula: msg('t = months / 12'), working: `${n} / 12`, ...msgResult(msg('t = {years} years'), { years: paPlain(years, 4) }) },
    { label: msg('Growth factor'), formula: '(1 + R / 100)^t', working: `(1 + ${paPlain(r, 6)})^${paPlain(years, 4)}`, result: paPlain(Math.pow(1 + r, years), 6) },
    { label: msg('Maturity amount'), formula: 'A = P × (1 + R / 100)^t', working: `$${A} × ${paPlain(Math.pow(1 + r, years), 6)}`, result: paFixed(res.maturity) },
  ];
}

// ---------------------------------------------------------------------------
// Investment returns (net return, time-weighted return, XIRR)
// ---------------------------------------------------------------------------

/** Totals, net return, chained TWR and XIRR as of `today`. Last step: the money-weighted return (XIRR). */
export function investmentReturnsSteps(transactions: PortfolioTransaction[], currentValue: number, today: Date): ReportStep[] {
  const m = portfolioMetrics(transactions, currentValue, today);
  if (!m) return [];
  const s = m.summary;
  const buys = transactions.filter((t) => t.type === 'buy');
  const sells = transactions.filter((t) => t.type === 'sell');
  const steps: ReportStep[] = [
    { label: msg('Total invested'), formula: msg('Σ buys and deposits'), ...msgWorking(msg('{length} buys'), { length: buys.length }), result: paLocale(s.totalInvested) },
    { label: msg('Total withdrawn'), formula: msg('Σ sells and withdrawals'), ...msgWorking(msg('{length} sells'), { length: sells.length }), result: paLocale(s.totalWithdrawn) },
    { label: msg('Net investment'), formula: msg('invested − withdrawn'), working: `${paLocale(s.totalInvested)} − ${paLocale(s.totalWithdrawn)}`, result: paLocale(s.netInvestment) },
    { label: msg('Total return'), formula: msg('current value − net investment'), working: `${paLocale(currentValue)} − ${paLocale(s.netInvestment)}`, result: paLocale(s.totalReturns) },
  ];
  if (s.netInvestment > 0) {
    steps.push({ label: msg('Net return'), formula: msg('total return / net investment × 100'), working: `${paLocale(s.totalReturns)} / ${paLocale(s.netInvestment)} × 100`, result: `${s.returnsPercentage.toFixed(2)}%` });
  }
  steps.push({
    label: msg('Time-weighted return'),
    formula: msg('(1 + r₁)(1 + r₂)…(1 + rₙ) − 1, rₖ = price change between transactions'),
    ...(s.timeWeightedReturn === null ? msgWorking(msg('needs a share count on every transaction'), {}) : msgWorking(msg('chained over {length} sub-periods, final price = {currentValue} / shares held'), { length: transactions.length, currentValue: paLocale(currentValue) })),
    ...naResult(paPct(s.timeWeightedReturn)),
  });
  steps.push({
    label: msg('Money-weighted return (XIRR, annualized)'),
    formula: msg('find x so that Σ CFₖ / (1 + x)^(dₖ / 365) = 0 (buys negative, sells and today\'s value positive)'),
    ...msgWorking(msg('{length} dated flows plus {currentValue} on {asOf}, solved by Newton-Raphson with a bisection fallback'), { length: transactions.length, currentValue: paLocale(currentValue), asOf: m.asOf }),
    ...naResult(paPct(s.annualizedReturn)),
  });
  return steps;
}

// ---------------------------------------------------------------------------
// Retirement
// ---------------------------------------------------------------------------

/** Savings needed against savings projected. Last step: the shortfall or surplus as the page shows it. */
export function retirementSteps(i: RetirementPlanInput): ReportStep[] {
  const p = retirementPlan(i);
  if (!(p.yearsToRetirement >= 0)) return [];
  const infl = Math.pow(1 + i.inflationRate / 100, Math.max(0, p.yearsToRetirement));
  const inflTxt = `(1 + ${paPlain(i.inflationRate)}%)^${p.yearsToRetirement}`;
  const lumps = p.kidsCosts + p.healthCosts;
  return [
    {
      label: msg('Years to and in retirement'),
      formula: msg('retirement age − current age; life expectancy − retirement age'),
      working: `${i.retirementAge} − ${i.currentAge}; ${i.lifeExpectancy} − ${i.retirementAge}`,
      ...msgResult(msg('{yearsToRetirement} years to go, {yearsInRetirement} years in retirement'), { yearsToRetirement: p.yearsToRetirement, yearsInRetirement: p.yearsInRetirement }),
    },
    {
      label: msg('Monthly spending at retirement'),
      formula: msg('expenses × (1 + inflation)^years × income ratio + health insurance × (1 + inflation)^years'),
      working: `${paWhole(i.monthlyExpenses)} × ${inflTxt} × ${paPlain(i.retirementIncomeRatio)}% + ${paWhole(i.healthInsuranceCost)} × ${inflTxt}`,
      ...msgResult(msg('{monthlySpending} a month (inflation factor {infl})'), { monthlySpending: paWhole(p.need.monthlySpending), infl: paPlain(infl, 4) }),
    },
    ...(i.publicPensionIndexed
      ? [{
          label: msg('Public pension at retirement'),
          formula: msg('public pension in today\'s money × (1 + inflation)^years'),
          working: `${paWhole(i.socialSecurityBenefit + (i.householdType === 'married' ? i.spouseSocialSecurity : 0))} × ${inflTxt}`,
          ...msgResult(msg('{publicMonthlyIncome} a month'), { publicMonthlyIncome: paWhole(p.publicMonthlyIncome) }),
        }]
      : []),
    {
      label: msg('Monthly gap savings must cover'),
      formula: msg('spending − (Social Security + pension + spouse benefit)'),
      working: `${paWhole(p.need.monthlySpending)} − ${paWhole(p.guaranteedMonthlyIncome)}`,
      ...msgResult(msg('{monthlyGap} a month'), { monthlyGap: paWhole(p.need.monthlyGap) }),
    },
    ...(p.bridgeYears > 0
      ? [{
          label: msg('Gap before the public pension starts'),
          formula: msg('spending − private pension, for the years from retirement to the public pension age'),
          ...msgWorking(msg('{monthlySpending} − {pensionBenefit} for {bridgeYears} years'), { monthlySpending: paWhole(p.need.monthlySpending), pensionBenefit: paWhole(i.pensionBenefit), bridgeYears: p.bridgeYears }),
          ...msgResult(msg('{bridgeMonthlyGap} a month'), { bridgeMonthlyGap: paWhole(p.bridgeMonthlyGap) }),
        }]
      : []),
    p.bridgeYears > 0
      ? {
          label: msg('Savings needed at retirement'),
          ...(i.hasKids
            ? msgFormula(msg('bridge gap × 12 × bridge years + gap × 12 × remaining years + lump sums (care and emergency funds, children at {pct}% education inflation)'), { pct: EDUCATION_INFLATION_PCT })
            : msgFormula(msg('bridge gap × 12 × bridge years + gap × 12 × remaining years + lump sums (care and emergency funds)'), {})),
          working: `${paWhole(p.bridgeMonthlyGap)} × 12 × ${p.bridgeYears} + ${paWhole(p.need.monthlyGap)} × 12 × ${p.yearsInRetirement - p.bridgeYears} + ${paWhole(lumps)}`,
          result: paWhole(p.need.total),
        }
      : {
          label: msg('Savings needed at retirement'),
          ...(i.hasKids
            ? msgFormula(msg('gap × 12 × years in retirement + lump sums (care and emergency funds, children at {pct}% education inflation)'), { pct: EDUCATION_INFLATION_PCT })
            : msgFormula(msg('gap × 12 × years in retirement + lump sums (care and emergency funds)'), {})),
          working: `${paWhole(p.need.monthlyGap)} × 12 × ${p.yearsInRetirement} + ${paWhole(lumps)}`,
          result: paWhole(p.need.total),
        },
    {
      label: msg('Projected savings at retirement'),
      formula: msg('Bₖ = Bₖ₋₁ × (1 + r) + 12 × Cₖ × (1 + r / 2), Cₖ rising by the yearly increase'),
      ...msgWorking(msg('B₀ = {currentSavings}, C₁ = {monthlyContribution} + {employerMatch} match a month, r = {expectedReturn}%, +{annualIncrease}% a year, {yearsToRetirement} years'), { currentSavings: paWhole(i.currentSavings), monthlyContribution: paWhole(i.monthlyContribution), employerMatch: paWhole(i.employerMatch), expectedReturn: paPlain(i.expectedReturn), annualIncrease: paPlain(i.annualIncrease), yearsToRetirement: p.yearsToRetirement }),
      result: paWhole(p.finalSavings),
    },
    {
      label: msg('Shortfall'),
      formula: msg('shortfall = max(0, savings needed − projected savings)'),
      working: `max(0, ${paWhole(p.need.total)} − ${paWhole(p.finalSavings)})`,
      result: paWhole(Math.abs(p.shortfall)),
    },
  ];
}

// ===========================================================================
// Loan, startup, market and crypto tools
// ===========================================================================

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

/** A visitor's number as typed: grouped, no padding zeros. */
export const pbPlain = (x: number, digits = 6) => (Number.isFinite(x) ? x.toLocaleString('en-US', { maximumFractionDigits: digits }) : 'n/a');
/** `$1234.56` as the EMI page prints amounts (two decimals, no grouping). */
export const pbUsd2 = (x: number) => `$${x.toFixed(2)}`;
/** Whole dollars with grouping, as the rent vs buy page prints them. */
export const pbUsd0 = (x: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(x);

// ---------------------------------------------------------------------------
// EMI
// ---------------------------------------------------------------------------

/** EMI = P r (1 + r)^n / ((1 + r)^n − 1), then the monthly add-on costs. Last step: the total monthly payment. */
export function emiSteps(i: EmiInput): ReportStep[] {
  const t = emiTotals(i);
  if (!t) return [];
  const n = Math.round(i.tenure);
  const r = i.rate / 12 / 100;
  const P = t.principal;
  const amt = (amount: number, freq: string) => (freq === 'yearly' ? `${pbPlain(amount)} / 12` : pbPlain(amount));
  // "insurance 150 + tax 400 + maintenance 100", then each custom cost under its own name.
  const extras = msgWorking(msg('insurance {insurance} + tax {tax} + maintenance {maintenance}{others}'), {
    insurance: amt(i.insurance, i.insuranceFreq),
    tax: amt(i.tax, i.taxFreq),
    maintenance: amt(i.maintenance, i.maintenanceFreq),
    others: (i.customCosts ?? []).map((c) => ` + ${c.name || msg('custom cost')} ${amt(c.amount, c.frequency)}`).join(''),
  });
  const monthlyExtras = t.monthlyInsurance + t.monthlyTax + t.monthlyMaintenance + t.monthlyCustom;
  return [
    { label: msg('Principal borrowed'), formula: msg('P = amount − down payment'), working: `${pbPlain(i.loanAmount)} − ${pbPlain(i.downPayment)}`, result: `$${P.toLocaleString()}` },
    { label: msg('Monthly interest rate'), formula: msg('r = annual rate / 12 / 100'), working: `${pbPlain(i.rate)} / 12 / 100`, result: pbPlain(r, 8) },
    r === 0
      ? { label: msg('EMI (principal and interest)'), formula: msg('at 0% interest, EMI = P / n'), working: `${pbPlain(P)} / ${n}`, result: pbUsd2(t.loan.emi) }
      : {
          label: msg('EMI (principal and interest)'),
          formula: 'EMI = P × r × (1 + r)^n / ((1 + r)^n − 1)',
          working: `${pbPlain(P)} × ${pbPlain(r, 8)} × (1 + ${pbPlain(r, 8)})^${n} / ((1 + ${pbPlain(r, 8)})^${n} − 1)`,
          result: pbUsd2(t.loan.emi),
        },
    { label: msg('Total interest over the loan'), formula: msg('interest = EMI × n − P'), working: `${pbUsd2(t.loan.emi)} × ${n} − ${pbPlain(P)}`, result: pbUsd2(t.loan.totalInterest) },
    { label: msg('Monthly add-on costs'), formula: msg('insurance + tax + maintenance + other costs (yearly amounts / 12)'), ...extras, result: pbUsd2(monthlyExtras) },
    { label: msg('Total monthly payment'), formula: msg('EMI + add-on costs'), working: `${pbUsd2(t.loan.emi)} + ${pbUsd2(monthlyExtras)}`, result: pbUsd2(t.totalMonthlyPayment) },
  ];
}

// re-exported so the page and the steps share one helper
export { emiMonthly };

// ---------------------------------------------------------------------------
// Rent vs buy
// ---------------------------------------------------------------------------

/** Opportunity-cost rent vs buy model: year-1 costs, home value, both net worths. Last step: the buy-minus-rent net worth gap. */
export function rentVsBuySteps(i: RentVsBuyInput): ReportStep[] {
  const r = computeRentVsBuy(i);
  const first = r.years[0];
  const last = r.years[r.years.length - 1];
  if (!first || !last) return [];
  const N = last.year;
  const loan = Math.max(0, i.homePrice - i.downPayment);
  const n = Math.round(i.loanTerm * 12);
  const sell = (i.sellingCosts === undefined ? 6 : i.sellingCosts) / 100;
  const ownership1 = i.propertyTax + i.homeInsurance + i.maintenanceCost + i.hoaFees;
  const mortgagePaid1 = first.buyCost - ownership1 + first.taxDeduction;
  const c = i.compoundingPerYear && i.compoundingPerYear > 0 ? i.compoundingPerYear : 12;
  const rText = c === 12 ? `r = ${pbPlain(i.interestRate)}% / 12` : `r = (1 + ${pbPlain(i.interestRate)}% / ${pbPlain(c)})^(${pbPlain(c)} / 12) − 1`;
  return [
    { label: msg('Loan amount'), formula: msg('loan = home price − down payment'), working: `${pbPlain(i.homePrice)} − ${pbPlain(i.downPayment)}`, result: pbUsd0(loan) },
    {
      label: msg('Monthly mortgage payment'),
      ...(c === 12 ? { formula: msg('M = P × r × (1 + r)^n / ((1 + r)^n − 1), r = rate / 12') } : msgFormula(msg('M = P × r × (1 + r)^n / ((1 + r)^n − 1), r = (1 + rate / {c})^({c2} / 12) − 1'), { c: pbPlain(c), c2: pbPlain(c) })),
      working: `${pbPlain(loan)} × r × (1 + r)^${n} / ((1 + r)^${n} − 1), ${rText}`,
      ...msgResult(msg('{monthlyPayment} a month'), { monthlyPayment: pbUsd2(r.monthlyPayment) }),
    },
    {
      label: msg('Year 1 cost of renting'),
      formula: msg('rent × 12 + renter’s insurance'),
      working: `${pbPlain(i.monthlyRent)} × 12 + ${pbPlain(i.renterInsurance)}`,
      result: pbUsd0(first.rentCost),
    },
    {
      label: msg('Year 1 net cost of owning'),
      formula: msg('mortgage paid + property tax + insurance + maintenance + HOA − (interest + property tax) × marginal tax rate'),
      ...msgWorking(msg('{mortgagePaid1} + {propertyTax} + {homeInsurance} + {maintenanceCost} + {hoaFees} − {taxDeduction} ({marginalTaxRate}% deduction value)'), { mortgagePaid1: pbUsd0(mortgagePaid1), propertyTax: pbPlain(i.propertyTax), homeInsurance: pbPlain(i.homeInsurance), maintenanceCost: pbPlain(i.maintenanceCost), hoaFees: pbPlain(i.hoaFees), taxDeduction: pbUsd0(first.taxDeduction), marginalTaxRate: pbPlain(i.marginalTaxRate) }),
      result: pbUsd0(first.buyCost),
    },
    {
      ...msgLabel(msg('Home value after {N} years'), { N }),
      formula: msg('V = price × (1 + appreciation)^years'),
      working: `${pbPlain(i.homePrice)} × (1 + ${pbPlain(i.homeAppreciation)}%)^${N}`,
      result: pbUsd0(last.homeValue),
    },
    {
      label: msg('Buyer net worth'),
      formula: msg('V × (1 − selling costs) − loan balance + buyer’s invested savings'),
      working: `${pbUsd0(last.homeValue)} × (1 − ${pbPlain(sell * 100)}%) − ${pbUsd0(last.mortgage)} + ${pbUsd0(last.buyerNetWorth - last.homeValue * (1 - sell) + last.mortgage)}`,
      result: pbUsd0(last.buyerNetWorth),
    },
    {
      label: msg('Renter net worth'),
      formula: msg('(down payment + closing costs) invested at the return, plus each year’s cheaper-side savings'),
      ...msgWorking(msg('({downPayment} + {closingCosts}) at {investmentReturn}% a year for {N} years, plus yearly differences'), { downPayment: pbPlain(i.downPayment), closingCosts: pbPlain(i.closingCosts), investmentReturn: pbPlain(i.investmentReturn), N }),
      result: pbUsd0(last.renterNetWorth),
    },
    {
      ...msgLabel(msg('Net worth difference after {N} years (buy − rent)'), { N }),
      formula: msg('buyer net worth − renter net worth; positive means buying comes out ahead'),
      working: `${pbUsd0(last.buyerNetWorth)} − ${pbUsd0(last.renterNetWorth)}`,
      result: pbUsd0(r.netWorthDifference),
    },
  ];
}

// ---------------------------------------------------------------------------
// LTV:CAC
// ---------------------------------------------------------------------------

const PB_LTV_SYMBOLS: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', CNY: '¥', INR: '₹', CAD: 'C$', AUD: 'A$' };
/** Same as formatCurrency() in LtvCacCalculator.tsx. */
export const pbLtvMoney = (amount: number, currency = 'USD') =>
  `${PB_LTV_SYMBOLS[currency] ?? '$'}${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
/** Same as showRatio() in LtvCacCalculator.tsx. */
export const pbLtvRatio = (ratio: number | null) => (ratio === null ? 'n/a' : `${ratio.toFixed(2)}:1`);
/** Same as showMonths() in LtvCacCalculator.tsx. */
export const pbLtvMonths = (months: number | null) => (months === null ? 'n/a' : `${months.toFixed(1)} months`);
/** pbLtvMonths() as a message for t(). */
export const pbLtvMonthsMsg = (months: number | null): StepMsg => (months === null ? stepMsg(msg('n/a')) : stepMsg(msg('{months} months'), { months: months.toFixed(1) }));
/** A result that may be 'n/a', as a message when it is. */
const naResult = (text: string) => (text === 'n/a' ? msgResult(msg('n/a'), {}) : { result: text });

/** Gross-margin LTV, CAC, payback and the ratio. Last step: LTV:CAC as the page shows it. */
export function ltvCacSteps(i: LtvCacInputs, method: LtvMethod, currency = 'USD'): ReportStep[] {
  const m = computeLtvCac(i, method);
  const money = (v: number | null) => (v === null ? 'n/a' : pbLtvMoney(v, currency));
  const steps: ReportStep[] = [];
  if (method === 'traditional') {
    const annual = i.averageOrderValue * i.purchaseFrequency;
    steps.push(
      { label: msg('Annual revenue per customer'), formula: msg('AOV × purchases per year'), working: `${pbPlain(i.averageOrderValue)} × ${pbPlain(i.purchaseFrequency)}`, ...naResult(money(annual)) },
      { label: msg('Customer lifetime value (gross margin)'), formula: msg('LTV = annual revenue × lifespan (years) × gross margin'), working: `${money(annual)} × ${pbPlain(i.customerLifespan)} × ${pbPlain(i.grossMargin)}%`, ...naResult(money(m.ltv)) },
      { label: msg('Monthly gross profit per customer'), formula: msg('annual revenue × gross margin / 12'), working: `${money(annual)} × ${pbPlain(i.grossMargin)}% / 12`, ...naResult(money(m.monthlyGrossProfit)) },
    );
  } else {
    steps.push(
      { label: msg('Monthly gross profit per customer'), formula: msg('ARPA × gross margin'), working: `${pbPlain(i.monthlyRevenue)} × ${pbPlain(i.grossMargin)}%`, ...naResult(money(m.monthlyGrossProfit)) },
      m.zeroChurn
        ? { label: msg('Customer lifetime value (gross margin)'), formula: msg('LTV = monthly gross profit / monthly churn'), ...msgWorking(msg('churn is 0%, so the lifetime has no finite end'), {}), ...naResult(money(m.ltv)) }
        : { label: msg('Customer lifetime value (gross margin)'), formula: msg('LTV = monthly gross profit / monthly churn'), working: `${money(m.monthlyGrossProfit)} / ${pbPlain(i.churnRate)}%`, ...naResult(money(m.ltv)) },
    );
  }
  steps.push(
    {
      label: msg('Customer acquisition cost'),
      formula: msg('CAC = sales and marketing spend / new customers'),
      working: `${pbPlain(i.salesAndMarketingCosts)} / ${pbPlain(i.newCustomersAcquired)}`,
      ...naResult(money(m.cac)),
    },
    { label: msg('CAC payback'), formula: msg('payback = CAC / monthly gross profit'), working: `${money(m.cac)} / ${money(m.monthlyGrossProfit)}`, ...(m.paybackMonths === null ? msgResult(msg('n/a'), {}) : msgResult(msg('{months} months'), { months: m.paybackMonths.toFixed(1) })) },
    { label: msg('LTV:CAC ratio'), formula: msg('LTV / CAC (3:1 or more is the usual healthy target)'), working: `${money(m.ltv)} / ${money(m.cac)}`, ...naResult(pbLtvRatio(m.ltvCacRatio)) },
  );
  return steps;
}

// ---------------------------------------------------------------------------
// TAM / SAM / SOM
// ---------------------------------------------------------------------------

const PB_TAM_SYMBOLS: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', CAD: 'CA$', AUD: 'A$', INR: '₹', SGD: 'S$' };
/**
 * The TAM Calculator's money (TamCalculator.tsx shows the same strings):
 * K, M, B and T, or lakh (L) and crore (Cr) for rupees, as Indian market
 * sizes are quoted (₹4,500 Cr rather than ₹45.0B).
 */
export function pbTamMoney(value: number, currency = 'USD'): string {
  const s = PB_TAM_SYMBOLS[currency] ?? '$';
  if (currency === 'INR') {
    if (value >= 1e7) return `${s}${(value / 1e7).toLocaleString('en-IN', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} Cr`;
    if (value >= 1e5) return `${s}${(value / 1e5).toFixed(1)} L`;
    return `${s}${value.toLocaleString('en-IN')}`;
  }
  if (value >= 1e12) return `${s}${(value / 1e12).toFixed(1)}T`;
  if (value >= 1e9) return `${s}${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${s}${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${s}${(value / 1e3).toFixed(1)}K`;
  return `${s}${value.toLocaleString()}`;
}

/** TAM by the chosen approach, narrowed to SAM and SOM, then the tool's revenue haircut. Last step: the revenue projection. */
export function tamSteps(i: TamInputs, currency = 'USD'): ReportStep[] {
  const r = computeTam(i);
  const m = (v: number) => pbTamMoney(v, currency);
  const tam: ReportStep =
    i.approach === 'top-down'
      ? { label: msg('TAM (top-down)'), formula: msg('TAM = total market size × relevant segment %'), working: `${pbPlain(i.totalMarketSize)} × ${pbPlain(i.relevantSegmentPercentage)}%`, result: m(r.tam) }
      : i.approach === 'bottom-up'
        ? { label: msg('TAM (bottom-up)'), formula: msg('TAM = addressable customers × average revenue per customer'), working: `${pbPlain(i.targetCustomers)} × ${pbPlain(i.averageRevenuePerCustomer)}`, result: m(r.tam) }
        : { label: msg('TAM (value theory)'), formula: msg('TAM = total problem value × market penetration %'), working: `${pbPlain(i.problemValue)} × ${pbPlain(i.marketPenetration)}%`, result: m(r.tam) };
  return [
    tam,
    {
      label: 'SAM',
      formula: msg('SAM = TAM × SAM % × geographic reach % × business model fit %'),
      working: `${pbPlain(r.tam, 0)} × ${pbPlain(i.samPercentage)}% × ${pbPlain(i.geographicReach)}% × ${pbPlain(i.businessModelFit)}%`,
      result: m(r.sam),
    },
    {
      label: 'SOM',
      formula: msg('SOM = SAM × target share % × competitive factor % × resource availability %'),
      working: `${pbPlain(r.sam, 0)} × ${pbPlain(i.marketShare)}% × ${pbPlain(i.competitiveFactor)}% × ${pbPlain(i.resourceConstraints)}%`,
      result: m(r.som),
    },
    {
      label: msg('Revenue projection'),
      ...msgFormula(msg('revenue = SOM × {REVENUE_PROJECTION_FACTOR} (the tool’s fixed 15% haircut)'), { REVENUE_PROJECTION_FACTOR }),
      working: `${pbPlain(r.som, 0)} × ${REVENUE_PROJECTION_FACTOR}`,
      result: m(r.revenueProjection),
    },
  ];
}

// ---------------------------------------------------------------------------
// Stock fair value
// ---------------------------------------------------------------------------

export type StockFairValueInput = { price: number; eps: number; bookValue: number; growthPct: number };

/** The page's three fair values and upside for a price, EPS, book value per share and earnings growth. */
export function stockFairValue(i: StockFairValueInput): IntrinsicValue {
  const data: StockData = {
    symbol: '', companyName: '', currentPrice: i.price, marketCap: 0, peRatio: 0, pbRatio: 0, dividendYield: 0, eps: i.eps, bookValue: i.bookValue,
    roe: 0, debtToEquity: 0, revenueGrowth: 0, earningsGrowth: i.growthPct / 100, freeCashFlow: 0, beta: 0, volume: 0, avgVolume: 0, fiftyTwoWeekHigh: 0, fiftyTwoWeekLow: 0,
  };
  return calculateIntrinsicValue(data);
}

/** Upside as the page shows it, e.g. "+12.34%". */
export const pbUpside = (u: number) => `${u > 0 ? '+' : ''}${u.toFixed(2)}%`;

/** Discounted earnings, P/E and P/B fair values, their average and the upside. Last step: the upside. */
export function stockAnalysisSteps(i: StockFairValueInput): ReportStep[] {
  if (![i.price, i.eps, i.bookValue, i.growthPct].every(Number.isFinite) || !(i.price > 0)) return [];
  const v = stockFairValue(i);
  const o = DCF_ASSUMPTIONS;
  const g = Math.min(o.maxGrowth, Math.max(o.minGrowth, i.growthPct / 100));
  const dcfStep: ReportStep =
    i.eps > 0
      ? (() => {
          const e5 = i.eps * Math.pow(1 + g, o.years);
          const terminal = (e5 * (1 + o.terminalGrowth)) / (o.discountRate - o.terminalGrowth);
          const pvTerminal = terminal / Math.pow(1 + o.discountRate, o.years);
          const pvYears = discountedEarningsValue(i.eps, i.growthPct / 100) - pvTerminal;
          return {
            label: msg('Discounted earnings value'),
            formula: msg('Σ EPS × (1 + g)^t / 1.10^t for t = 1…5 + EPS₅ × 1.025 / (0.10 − 0.025) / 1.10^5, g clamped to −10%…20%'),
            ...msgWorking(msg('EPS {eps}, g = {pbPlain}%: years 1 to 5 {pvYears} + terminal {terminal} / 1.10^5 = {pvTerminal}'), { eps: pbPlain(i.eps), pbPlain: pbPlain(g * 100, 4), pvYears: pbUsd2(pvYears), terminal: pbUsd2(terminal), pvTerminal: pbUsd2(pvTerminal) }),
            result: pbUsd2(v.dcfValue),
          };
        })()
      : { label: msg('Discounted earnings value'), formula: msg('not meaningful when EPS is zero or negative'), working: `EPS ${pbPlain(i.eps)}`, result: pbUsd2(v.dcfValue) };
  return [
    dcfStep,
    { label: msg('P/E based value'), formula: msg('EPS × fair P/E of 20 (0 if negative)'), working: `${pbPlain(i.eps)} × 20`, result: pbUsd2(v.peBasedValue) },
    { label: msg('P/B based value'), formula: msg('book value per share × fair P/B of 2.5 (0 if negative)'), working: `${pbPlain(i.bookValue)} × 2.5`, result: pbUsd2(v.pbBasedValue) },
    { label: msg('Average fair value'), formula: msg('(DCF + P/E value + P/B value) / 3'), working: `(${pbUsd2(v.dcfValue)} + ${pbUsd2(v.peBasedValue)} + ${pbUsd2(v.pbBasedValue)}) / 3`, result: pbUsd2(v.averageValue) },
    { label: msg('Potential upside'), formula: msg('(fair value − price) / price × 100'), working: `(${pbUsd2(v.averageValue)} − ${pbPlain(i.price)}) / ${pbPlain(i.price)} × 100`, result: pbUpside(v.upside) },
  ];
}

// ---------------------------------------------------------------------------
// Ethereum gas fee
// ---------------------------------------------------------------------------

export type GasFeeInput = { mode: 'eip1559' | 'legacy'; gasPrice: string; baseFee: string; priorityFee: string; maxFee: string; gasLimit: string };

/** The fee breakdown the page shows; throws the library's message on bad input. */
export function gasFee(i: GasFeeInput): { gas: bigint; fee: FeeBreakdown } {
  const gas = parseGasUnits(i.gasLimit);
  const fee = i.mode === 'legacy' ? legacyFee(gas, gweiToWei(i.gasPrice)) : eip1559Fee(gas, gweiToWei(i.baseFee), gweiToWei(i.priorityFee), gweiToWei(i.maxFee));
  return { gas, fee };
}

/** Same as fiat() in GasFeeCalculator.tsx. */
export const pbGasFiat = (wei: bigint, ethPrice: number) =>
  Number.isFinite(ethPrice) && ethPrice >= 0
    ? weiToFiat(wei, ethPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })
    : '-';

/** Gas × effective price in exact wei, then ETH and fiat (USD unless a currency is given). Last step: the fiat cost. Invalid input gives []. */
export function gasFeeSteps(i: GasFeeInput, ethPrice: number, currency = 'USD'): ReportStep[] {
  let r: { gas: bigint; fee: FeeBreakdown };
  try {
    r = gasFee(i);
  } catch {
    return [];
  }
  const gas = r.gas.toLocaleString('en-US');
  const price = weiToGweiString(r.fee.effectiveGasPriceWei);
  const steps: ReportStep[] = [];
  if (i.mode === 'legacy') {
    steps.push({ label: msg('Gas price'), formula: msg('legacy transaction: the gas price you set'), ...msgWorking(msg('{trim} gwei'), { trim: i.gasPrice.trim() }), ...msgResult(msg('{price} gwei'), { price }) });
  } else {
    steps.push({
      label: msg('Effective gas price (EIP-1559)'),
      formula: msg('min(max fee, base fee + priority fee)'),
      ...msgWorking(msg('min({trim}, {trim2} + {trim3}) gwei'), { trim: i.maxFee.trim(), trim2: i.baseFee.trim(), trim3: i.priorityFee.trim() }),
      ...(r.fee.capped ? msgResult(msg('{price} gwei (capped by max fee)'), { price }) : msgResult(msg('{price} gwei'), { price })),
    });
  }
  steps.push({ label: msg('Total fee'), formula: msg('fee = gas × effective gas price'), ...msgWorking(msg('{gas} × {price} gwei'), { gas, price }), ...msgResult(msg('{feeWei} gwei'), { feeWei: weiToGweiString(r.fee.feeWei) }) });
  if (i.mode === 'eip1559') {
    steps.push({
      label: msg('Burned and tip'),
      formula: msg('burned = gas × base fee; tip = fee − burned'),
      ...msgWorking(msg('{gas} × {trim} gwei = {burnedWei} gwei burned'), { gas, trim: i.baseFee.trim(), burnedWei: weiToGweiString(r.fee.burnedWei) }),
      ...msgResult(msg('{tipWei} gwei tip'), { tipWei: weiToGweiString(r.fee.tipWei) }),
    });
  }
  steps.push(
    { label: msg('Fee in ETH'), formula: msg('1 ETH = 10^9 gwei = 10^18 wei'), ...msgWorking(msg('{feeWei} gwei / 10^9'), { feeWei: weiToGweiString(r.fee.feeWei) }), result: `${weiToEthString(r.fee.feeWei)} ETH` },
    currency === 'USD'
      ? { label: msg('Fee in USD'), formula: msg('ETH × ETH price'), working: `${weiToEthString(r.fee.feeWei)} × ${pbPlain(ethPrice)}`, result: `$${pbGasFiat(r.fee.feeWei, ethPrice)}` }
      : {
          ...msgLabel(msg('Fee in {currency}'), { currency }),
          formula: msg('ETH × ETH price'),
          working: `${weiToEthString(r.fee.feeWei)} × ${pbPlain(ethPrice)}`,
          result: Number.isFinite(ethPrice) && ethPrice >= 0 ? formatGasFiat(weiToFiat(r.fee.feeWei, ethPrice), currency) : '-',
        },
  );
  return steps;
}

// ===========================================================================
// Unit, date, network and timestamp converters
// ===========================================================================

const pcGroup = (n: number | bigint) => groupThousands(String(n));
const pcPad = (n: number, w = 2) => String(n).padStart(w, '0');

// ---------------------------------------------------------------------------
// Cryptocurrency units
// ---------------------------------------------------------------------------

export const PC_BASE_UNIT: Record<CryptoChain, string> = { ethereum: 'wei', bitcoin: 'satoshi' };

/** The converted amount as the page shows it: grouped digits and the unit. */
export const pcCryptoDisplay = (value: string, unit: string) => `${groupThousands(value)} ${unit}`;

/** Live conversion for the page: '' when the input is empty, invalid or crosses chains. */
export function pcCryptoConvert(amount: string, fromChain: CryptoChain, toChain: CryptoChain, fromUnit: string, toUnit: string): string {
  if (!amount.trim() || fromChain !== toChain) return '';
  try {
    return convertCryptoUnits(amount, fromChain, fromUnit, toUnit);
  } catch {
    return '';
  }
}

export type CryptoUnitStepsInput = { amount: string; chain: CryptoChain; fromUnit: string; toUnit: string };

/** Exact decimal shift through the chain's base unit (wei or satoshi). Last step: the converted amount. */
export function cryptocurrencyUnitConverterSteps(i: CryptoUnitStepsInput): ReportStep[] {
  const units = CRYPTO_UNITS[i.chain];
  const ef = units?.[i.fromUnit];
  const et = units?.[i.toUnit];
  if (ef === undefined || et === undefined || !i.amount.trim()) return [];
  let out: string;
  let base: bigint;
  try {
    out = convertCryptoUnits(i.amount, i.chain, i.fromUnit, i.toUnit);
    base = parseDecimal(i.amount, ef);
  } catch {
    return [];
  }
  const b = PC_BASE_UNIT[i.chain];
  const src = i.chain === 'ethereum' ? msg('Ethereum Foundation, Solidity units') : msg('satoshi is the smallest unit; BIP 176');
  return [
    {
      label: msg('Unit sizes'),
      ...msgFormula('1 {from} = 10^{ef} {b}, 1 {to} = 10^{et} {b} ({src})', { from: i.fromUnit, ef, b, to: i.toUnit, et, src }),
      ...msgWorking(msg('factor = 10^{ef} / 10^{et} = 10^{value}'), { ef, et, value: ef - et }),
      ...msgResult('1 {from} = {n} {to}', { from: i.fromUnit, n: ef >= et ? pcGroup(10n ** BigInt(ef - et)) : `0.${'0'.repeat(et - ef - 1)}1`, to: i.toUnit }),
    },
    {
      ...msgLabel(msg('Amount in {b} (exact integer)'), { b }),
      ...msgFormula(msg('n = amount × 10^{ef}'), { ef }),
      working: `${i.amount.trim()} × 10^${ef}`,
      ...msgResult('{n} {unit}', { n: pcGroup(base), unit: b }),
    },
    {
      ...msgLabel(msg('Amount in {toUnit}'), { toUnit: i.toUnit }),
      ...msgFormula(msg('result = n / 10^{et}, a decimal point shift with no rounding'), { et }),
      working: `${pcGroup(base)} / 10^${et}`,
      ...msgResult('{n} {unit}', { n: groupThousands(out), unit: i.toUnit }),
    },
  ];
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const PC_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Local wall time as "Sun 2026-12-06 09:00" (seconds only when not zero), as the date pages show it. */
export function pcLocalDateTime(d: Date): string {
  const s = d.getSeconds() ? `:${pcPad(d.getSeconds())}` : '';
  return `${PC_WEEKDAYS[d.getDay()]} ${d.getFullYear()}-${pcPad(d.getMonth() + 1)}-${pcPad(d.getDate())} ${pcPad(d.getHours())}:${pcPad(d.getMinutes())}${s}`;
}

/** pcLocalDateTime() as a step value: the weekday is a step date (Intl, "Fri" in US English), so it follows the page's language. */
export function pcLocalDateTimeMsg(d: Date): StepMsg {
  const s = d.getSeconds() ? `:${pcPad(d.getSeconds())}` : '';
  const day = `${d.getFullYear()}-${pcPad(d.getMonth() + 1)}-${pcPad(d.getDate())}`;
  return stepMsg('{weekday} {stamp}', { weekday: stepDate(day, { weekday: 'short' }), stamp: `${day} ${pcPad(d.getHours())}:${pcPad(d.getMinutes())}${s}` });
}

/** A datetime-local value N days from today at a given time, for the date tools' starting example. */
export function pcLocalInputValue(daysFromToday: number, hh: number, mm: number, now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysFromToday, hh, mm);
  return `${d.getFullYear()}-${pcPad(d.getMonth() + 1)}-${pcPad(d.getDate())}T${pcPad(hh)}:${pcPad(mm)}`;
}

const pcDaysInMonth = (y: number, m0: number) => new Date(y, m0 + 1, 0).getDate();

/** Unit words of the date arithmetic page, as message sources (they fill a {unit} placeholder). */
const DATE_UNIT_WORD: Record<DateUnit, string> = {
  minutes: msg('minutes'), hours: msg('hours'), days: msg('days'), weeks: msg('weeks'), months: msg('months'), years: msg('years'),
};

export type DateArithmeticStepsInput = { base: string; operation: DateOperation; value: number; unit: DateUnit };

/** Calendar arithmetic as date-fns does it (month ends clamp, days keep the wall clock). Last step: the result date. */
export function dateArithmeticSteps(i: DateArithmeticStepsInput): ReportStep[] {
  if (!i.base) return [];
  const base = new Date(i.base);
  const r = applyDateArithmetic(base, i.operation, i.value, i.unit);
  if (!r) return [];
  const n = Math.trunc(i.value) * (i.operation === 'add' ? 1 : -1);
  const sign = n < 0 ? '−' : '+';
  const abs = Math.abs(n);
  const unit = DATE_UNIT_WORD[i.unit] ?? i.unit;
  const steps: ReportStep[] = [
    { label: msg('Start (local time)'), formula: msg('start = the date and time entered'), working: i.base, ...msgResult('{date}', { date: { stepMsg: pcLocalDateTimeMsg(base) } }) },
    {
      label: msg('Signed amount'),
      formula: i.operation === 'add' ? msg('n = + value') : msg('n = − value'),
      ...(i.operation === 'add' ? msgWorking(msg('add {n} {unit}'), { n: Math.trunc(i.value), unit }) : msgWorking(msg('subtract {n} {unit}'), { n: Math.trunc(i.value), unit })),
      ...msgResult(msg('{n} {unit}'), { n, unit }),
    },
  ];
  if (i.unit === 'minutes' || i.unit === 'hours') {
    const per = i.unit === 'minutes' ? 60 : 3600;
    steps.push({
      label: msg('Elapsed time added'),
      ...msgFormula(msg('t = start {sign} n × {per} s (real elapsed time)'), { sign, per: pcGroup(per) }),
      working: `${i.base} ${sign} ${abs} × ${pcGroup(per)} s`,
      result: `${sign}${pcGroup(abs * per)} s`,
    });
  } else if (i.unit === 'days' || i.unit === 'weeks') {
    const days = i.unit === 'weeks' ? abs * 7 : abs;
    steps.push({
      label: msg('Calendar days added'),
      formula: i.unit === 'weeks' ? msg('days = n × 7, wall-clock time kept across a DST change') : msg('days = n, wall-clock time kept across a DST change'),
      working: i.unit === 'weeks' ? `${abs} × 7` : `${abs}`,
      ...msgResult(msg('{sign}{days} days'), { sign, days: pcGroup(days) }),
    });
  } else {
    const months = i.unit === 'years' ? abs * 12 : abs;
    const target = new Date(base.getFullYear(), base.getMonth() + (n < 0 ? -months : months), 1);
    const dim = pcDaysInMonth(target.getFullYear(), target.getMonth());
    steps.push({
      label: msg('Calendar months added'),
      ...msgFormula(msg('month = start month {sign} {value}; day = min(start day, days in that month)'), { sign, value: i.unit === 'years' ? 'n × 12' : 'n' }),
      ...msgWorking(msg('{fromYear}-{fromMonth} {sign} {months} months = {toYear}-{toMonth}; day = min({day}, {dim})'), { fromYear: base.getFullYear(), fromMonth: pcPad(base.getMonth() + 1), sign, months: pcGroup(months), toYear: target.getFullYear(), toMonth: pcPad(target.getMonth() + 1), day: base.getDate(), dim }),
      ...msgResult(msg('day {min}'), { min: Math.min(base.getDate(), dim) }),
    });
  }
  steps.push({ label: msg('Result date (local time)'), ...msgFormula(msg('result = start {sign} {abs} {unit}'), { sign, abs, unit }), ...msgWorking(msg('{start} {sign} {abs} {unit}'), { start: { stepMsg: pcLocalDateTimeMsg(base) }, sign, abs, unit }), ...msgResult('{date}', { date: { stepMsg: pcLocalDateTimeMsg(r) } }) });
  return steps;
}

/** The breakdown line the date difference page shows. */
export const PC_DIFF_BREAKDOWN = msg('{weeks} weeks, {days} days, {hours} hours, {minutes} minutes, {seconds} seconds');
export const pcDiffBreakdown = (b: { weeks: number; days: number; hours: number; minutes: number; seconds: number }) =>
  fillMsg(PC_DIFF_BREAKDOWN, { weeks: b.weeks, days: b.days, hours: b.hours, minutes: b.minutes, seconds: b.seconds });

/** Elapsed time, calendar days and business days between two local date-times. Last step: the weeks/days/time breakdown. */
export function dateDiffSteps(start: string, end: string): ReportStep[] {
  const d = computeDateDifference(start, end);
  if (!d) return [];
  const [from, to] = d.isNegative ? [end, start] : [start, end];
  const t = d.total;
  const b = d.breakdown;
  return [
    {
      label: msg('Elapsed time'),
      formula: d.isNegative ? msg('Δt = start − end (the end is earlier, so counted backwards)') : msg('Δt = end − start'),
      working: `${to} − ${from}`,
      ...msgResult(msg('{seconds} s = {minutes} minutes = {hours} hours'), { seconds: pcGroup(t.seconds), minutes: pcGroup(t.minutes), hours: pcGroup(t.hours) }),
    },
    {
      label: msg('Whole calendar days'),
      formula: msg('days = full days from the earlier to the later date (a 23 or 25 hour DST day counts as 1)'),
      ...msgWorking(msg('{from} to {to}'), { from, to }),
      ...msgResult(msg('{days} days ({months} months, {years} years)'), { days: pcGroup(t.days), months: t.months, years: t.years }),
    },
    {
      label: msg('Business days'),
      formula: msg('Monday to Friday days from the earlier date up to, not including, the later one; weekends = calendar days − business days'),
      ...msgWorking(msg('{from} to {to}'), { from, to }),
      ...msgResult(msg('{businessDays} business days, {weekends} weekend days'), { businessDays: d.business.businessDays, weekends: d.business.weekends }),
    },
    {
      label: msg('Weeks and days'),
      formula: msg('weeks = floor(days / 7), days left = days mod 7'),
      working: `${t.days} / 7`,
      ...msgResult(msg('{weeks} weeks {days} days'), { weeks: b.weeks, days: b.days }),
    },
    {
      label: msg('Time left after the whole days'),
      formula: msg('r = later − (earlier + days); hours = floor(r / 3,600), minutes = floor((r mod 3,600) / 60), seconds = r mod 60'),
      ...msgWorking(msg('{to} − ({from} + {days} days)'), { to, from, days: t.days }),
      result: `${b.hours} h ${b.minutes} min ${b.seconds} s`,
    },
    { label: msg('Total duration'), formula: msg('weeks, days, hours, minutes, seconds'), ...msgWorking(msg('{weeks} × 7 + {days} days + {hours}:{minutes}:{seconds}'), { weeks: b.weeks, days: b.days, hours: b.hours, minutes: pcPad(b.minutes), seconds: pcPad(b.seconds) }), ...msgResult(PC_DIFF_BREAKDOWN, { weeks: b.weeks, days: b.days, hours: b.hours, minutes: b.minutes, seconds: b.seconds }) },
  ];
}

// ---------------------------------------------------------------------------
// IPv4 subnet
// ---------------------------------------------------------------------------

/** RFC 950 / RFC 4632 subnet arithmetic with RFC 3021 for /31. Last step: usable hosts as the page shows them. */
export function subnetCalculatorSteps(ip: string, prefix: number): ReportStep[] {
  let s: ReturnType<typeof calculateSubnet>;
  let ipInt: number;
  try {
    s = calculateSubnet(ip, prefix);
    ipInt = parseIPv4(ip);
  } catch {
    return [];
  }
  const host = 32 - prefix;
  const total = s.totalHosts.toLocaleString();
  const steps: ReportStep[] = [
    { label: msg('Address in binary'), formula: msg('a.b.c.d = a × 2²⁴ + b × 2¹⁶ + c × 2⁸ + d (32 bits)'), working: ip.trim(), result: ipv4ToBinary(ipInt) },
    { label: msg('Subnet mask'), formula: msg('mask = p one bits followed by (32 − p) zero bits'), ...msgWorking(msg('/{prefix}: {prefix} ones, {host} zeros'), { prefix, host }), result: s.subnetMask },
    { label: msg('Network address'), formula: msg('network = address AND mask'), working: `${ip.trim()} AND ${s.subnetMask}`, result: s.networkAddress },
    {
      label: msg('Broadcast address'),
      formula: msg('broadcast = network OR wildcard, wildcard = NOT mask'),
      working: `${s.networkAddress} OR ${s.wildcardMask}`,
      ...(s.broadcastAddress !== null && s.broadcastAddress !== undefined
        ? { result: s.broadcastAddress }
        : prefix === 31
          ? msgResult(msg('none (/31 point-to-point, RFC 3021)'), {})
          : msgResult(msg('none (single host)'), {})),
    },
    { label: msg('Addresses in the block'), formula: 'N = 2^(32 − p)', working: `2^(32 − ${prefix}) = 2^${host}`, result: total },
    { label: msg('Usable host range'), formula: msg('first = network + 1, last = broadcast − 1 (both addresses for /31, the address itself for /32)'), ...msgWorking(msg('{networkAddress} + 1 to {value}{value2}'), { networkAddress: s.networkAddress, value: s.broadcastAddress ?? s.lastUsableIP, value2: s.broadcastAddress ? ' − 1' : '' }), ...msgResult(msg('{firstUsableIP} to {lastUsableIP}'), { firstUsableIP: s.firstUsableIP, lastUsableIP: s.lastUsableIP }) },
    {
      label: msg('Usable hosts'),
      formula: prefix === 32 ? msg('a /32 is a single host: 1') : prefix === 31 ? msg('a /31 has 2 usable addresses (RFC 3021)') : msg('hosts = 2^(32 − p) − 2 (network and broadcast reserved, RFC 950)'),
      working: prefix >= 31 ? `/${prefix}` : `${total} − 2`,
      result: s.usableHosts.toLocaleString(),
    },
  ];
  return steps;
}

// ---------------------------------------------------------------------------
// Unix time
// ---------------------------------------------------------------------------

/** UTC time as the page shows it, e.g. "2022-01-01 00:00:00.000 UTC". */
export const pcUtcDisplay = (d: Date) => d.toISOString().replace('T', ' ').replace('Z', ' UTC');

/** POSIX seconds since the epoch to a UTC calendar date (no leap seconds). Last step: the UTC time. */
export function timeConverterSteps(epoch: string, unit: EpochUnit): ReportStep[] {
  const d = epochToDate(epoch, unit);
  if (!d) return [];
  const ms = d.getTime();
  const e = epoch.trim();
  const toMs =
    unit === 'seconds' ? { formula: 'ms = seconds × 1,000', working: `${e} × 1,000` }
      : unit === 'milliseconds' ? { formula: 'ms = the timestamp itself', working: e }
        : { formula: 'ms = floor(nanoseconds / 1,000,000)', working: `floor(${e} / 1,000,000)` };
  const days = Math.floor(ms / 86_400_000);
  const rest = ms - days * 86_400_000;
  const hh = Math.floor(rest / 3_600_000);
  const mi = Math.floor((rest % 3_600_000) / 60_000);
  const ss = Math.floor((rest % 60_000) / 1000);
  const mss = rest % 1000;
  const date = new Date(days * 86_400_000).toISOString().slice(0, 10);
  return [
    { label: msg('Timestamp in milliseconds'), ...toMs, result: `${pcGroup(ms)} ms` },
    { label: msg('Whole days since 1970-01-01 00:00 UTC'), formula: msg('days = floor(ms / 86,400,000), every day is 86,400 s (POSIX, no leap seconds)'), working: `floor(${pcGroup(ms)} / 86,400,000)`, ...msgResult(msg('{days} days'), { days: pcGroup(days) }) },
    { label: msg('Time of day'), formula: msg('r = ms − days × 86,400,000, split into hours, minutes, seconds'), working: `${pcGroup(ms)} − ${pcGroup(days)} × 86,400,000 = ${pcGroup(rest)} ms`, result: `${pcPad(hh)}:${pcPad(mi)}:${pcPad(ss)}.${pcPad(mss, 3)}` },
    { label: msg('Calendar date'), formula: msg('date = 1970-01-01 + days (Gregorian calendar)'), ...msgWorking(msg('1970-01-01 + {days} days'), { days: pcGroup(days) }), result: date },
    { label: msg('UTC time'), formula: msg('date + time of day'), working: `${date} ${pcPad(hh)}:${pcPad(mi)}:${pcPad(ss)}.${pcPad(mss, 3)}`, result: pcUtcDisplay(d) },
  ];
}
