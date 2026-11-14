/**
 * Energy and emissions maths for the carbon footprint, EV vs gas, EV charging,
 * heat pump and solar payback calculators.
 *
 * Sources for the built-in factors (all editable in the UI):
 * - US EPA, GHG Emission Factors Hub 2025 (January 2025): stationary and mobile
 *   combustion CO2/CH4/N2O, eGRID2023 electricity output rates, AR5 100-year
 *   GWPs (CH4 = 28, N2O = 265).
 * - UK DESNZ, Greenhouse gas reporting: conversion factors 2025: flight
 *   factors per passenger-km (8% great-circle uplift already included) and UK
 *   grid electricity.
 * - US EIA heat contents ("Units and calculators explained"): heating oil
 *   138,500 Btu/gal, propane 91,452 Btu/gal, natural gas 1,036 Btu/ft³,
 *   1 kWh = 3,412 Btu.
 * - Scarborough et al. (2014), Climatic Change 125:179-192: dietary GHG per
 *   2,000 kcal per day.
 *
 * Pure functions, no React, relative imports only (bundled for MCP).
 */
import { msg, type MsgText } from '../../msg';

export const GWP_CH4 = 28;
export const GWP_N2O = 265;

export const LB_PER_KG = 2.20462262185;
export const L_PER_GAL = 3.785411784;
export const KM_PER_MI = 1.609344;
export const KWH_BTU = 3412;
export const THERM_KWH = 100000 / KWH_BTU; // 29.31 kWh

// ================================================================ grid electricity

/** labelMsg: for the Canadian and Australian regions, "Canada: {region}" with the msg()-marked region name, so a page can translate both parts. */
export type GridRegion = { id: string; label: string; labelMsg?: MsgText; kgPerKwh: number; source: string };

/** eGRID2023 subregion total output rates (lb/MWh): CO2, CH4, N2O. From EPA Emission Factors Hub 2025, Table 6. */
const EGRID: [string, string, number, number, number][] = [
  ['US', msg('US average'), 771.5, 0.057, 0.008],
  ['AKGD', msg('Alaska grid (AKGD)'), 899.0, 0.086, 0.012],
  ['AKMS', msg('Alaska miscellaneous (AKMS)'), 519.4, 0.026, 0.004],
  ['AZNM', msg('Southwest: AZ, NM (AZNM)'), 740.8, 0.041, 0.006],
  ['CAMX', msg('California (CAMX)'), 436.7, 0.025, 0.003],
  ['ERCT', msg('Texas ERCOT (ERCT)'), 738.0, 0.043, 0.006],
  ['FRCC', msg('Florida (FRCC)'), 801.9, 0.042, 0.005],
  ['HIMS', msg('Hawaii miscellaneous (HIMS)'), 1122.1, 0.146, 0.022],
  ['HIOA', msg('Hawaii Oahu (HIOA)'), 1489.4, 0.134, 0.021],
  ['MROE', msg('MRO East: eastern WI (MROE)'), 1402.0, 0.116, 0.017],
  ['MROW', msg('MRO West: MN, IA, Dakotas (MROW)'), 920.0, 0.097, 0.014],
  ['NEWE', msg('New England (NEWE)'), 537.2, 0.063, 0.008],
  ['NWPP', msg('Northwest (NWPP)'), 631.7, 0.054, 0.008],
  ['NYCW', msg('NYC and Westchester (NYCW)'), 974.7, 0.025, 0.003],
  ['NYLI', msg('Long Island (NYLI)'), 1180.7, 0.14, 0.018],
  ['NYUP', msg('Upstate New York (NYUP)'), 241.0, 0.011, 0.001],
  ['PRMS', msg('Puerto Rico (PRMS)'), 1543.0, 0.077, 0.012],
  ['RFCE', msg('RFC East: PA, NJ, MD, DE (RFCE)'), 594.7, 0.036, 0.005],
  ['RFCM', msg('Michigan (RFCM)'), 962.1, 0.082, 0.011],
  ['RFCW', msg('RFC West: OH, IN, WV (RFCW)'), 911.3, 0.071, 0.01],
  ['RMPA', msg('Rockies: CO, WY (RMPA)'), 1036.0, 0.09, 0.013],
  ['SPNO', msg('SPP North: KS, NE (SPNO)'), 861.9, 0.087, 0.012],
  ['SPSO', msg('SPP South: OK, north TX (SPSO)'), 891.1, 0.055, 0.008],
  ['SRMV', msg('Mississippi Valley: LA, AR (SRMV)'), 739.4, 0.032, 0.004],
  ['SRMW', msg('SERC Midwest: MO, IL (SRMW)'), 1238.3, 0.132, 0.019],
  ['SRSO', msg('SERC South: GA, AL (SRSO)'), 840.9, 0.055, 0.008],
  ['SRTV', msg('Tennessee Valley (SRTV)'), 895.7, 0.079, 0.011],
  ['SRVC', msg('Virginia and Carolinas (SRVC)'), 590.2, 0.045, 0.006],
];

const egridKg = (co2: number, ch4: number, n2o: number) => (co2 + ch4 * GWP_CH4 + n2o * GWP_N2O) / LB_PER_KG / 1000;

/**
 * Grid factors outside the US, each from the country's own official set:
 * - UK: DESNZ "Greenhouse gas reporting: conversion factors 2026" (published 11 June 2026),
 *   "Electricity: UK", electricity generated, 0.13096 kg CO2e/kWh (transmission and distribution losses excluded).
 * - India: CEA "CO2 Baseline Database for the Indian Power Sector", version 22.0 (August 2026),
 *   weighted average emission factor for FY 2025-26, 0.675 t CO2/MWh (including renewables and captive injection).
 * - Canada: ECCC "Emission factors and reference values", version 4.0 (9 September 2026), electricity
 *   consumption intensity table based on the National Inventory Report 1990-2024 (g CO2e per kWh consumed).
 * - Australia: National Greenhouse Accounts Factors 2025 location-based scope 2 factors (NGER 2025-26),
 *   as listed by the Clean Energy Regulator; NSW and ACT share one factor.
 */
const MARKET_GRIDS: GridRegion[] = [
  { id: 'UK-2026', label: msg('United Kingdom (DESNZ 2026)'), kgPerKwh: 0.13096, source: 'DESNZ conversion factors 2026' },
  { id: 'IN', label: msg('India (CEA, FY 2025-26)'), kgPerKwh: 0.675, source: 'CEA CO2 Baseline Database v22.0' },
  ...([
    ['CA-NL', msg('Newfoundland and Labrador'), 17],
    ['CA-PE', msg('Prince Edward Island'), 265],
    ['CA-NS', msg('Nova Scotia'), 628],
    ['CA-NB', msg('New Brunswick'), 375],
    ['CA-QC', msg('Quebec'), 2.6],
    ['CA-ON', msg('Ontario'), 73],
    ['CA-MB', msg('Manitoba'), 3.0],
    ['CA-SK', msg('Saskatchewan'), 581],
    ['CA-AB', msg('Alberta'), 346],
    ['CA-BC', msg('British Columbia'), 18],
    ['CA-YT', msg('Yukon'), 134],
    ['CA-NT', msg('Northwest Territories'), 490],
    ['CA-NU', msg('Nunavut'), 760],
  ] as [string, string, number][]).map(([id, name, g]) => ({ id, label: `Canada: ${name}`, labelMsg: { text: msg('Canada: {region}'), vars: { region: name } }, kgPerKwh: g / 1000, source: 'ECCC emission factors v4.0 (NIR 1990-2024)' })),
  ...([
    ['AU-NSW', msg('NSW and ACT'), 0.64],
    ['AU-VIC', msg('Victoria'), 0.78],
    ['AU-QLD', msg('Queensland'), 0.67],
    ['AU-SA', msg('South Australia'), 0.22],
    ['AU-WA', msg('Western Australia (SWIS)'), 0.5],
    ['AU-TAS', msg('Tasmania'), 0.2],
    ['AU-NT', msg('Northern Territory'), 0.56],
  ] as [string, string, number][]).map(([id, name, kg]) => ({ id, label: `Australia: ${name}`, labelMsg: { text: msg('Australia: {region}'), vars: { region: name } }, kgPerKwh: kg, source: 'NGA Factors 2025 (NGER 2025-26)' })),
];

export const GRID_REGIONS: GridRegion[] = [
  ...EGRID.map(([id, label, co2, ch4, n2o]) => ({ id, label, kgPerKwh: egridKg(co2, ch4, n2o), source: msg('EPA eGRID2023 via Emission Factors Hub 2025') })),
  { id: 'UK', label: msg('United Kingdom (DESNZ 2025)'), kgPerKwh: 0.177, source: 'DESNZ conversion factors 2025' },
  ...MARKET_GRIDS,
];

export const gridRegion = (id: string) => GRID_REGIONS.find((g) => g.id === id);
export const US_GRID_KG_PER_KWH = egridKg(771.5, 0.057, 0.008); // ≈ 0.3516

// ================================================================ fuels

/** kg CO2e per mmBtu from EPA Table 1 (CO2 + CH4 + N2O with AR5 GWPs). */
const perMmbtu = (co2: number, ch4g: number, n2og: number) => co2 + (ch4g * GWP_CH4 + n2og * GWP_N2O) / 1000;
const NG_KG_PER_MMBTU = perMmbtu(53.06, 1.0, 0.1); // 53.1145

export type FuelUnit = { id: string; label: string; kgCo2e: number; kwh: number };

/** Home heating fuels: CO2e and energy content per unit. */
export const HEATING_FUEL_UNITS: Record<'gas' | 'oil' | 'propane' | 'electric', FuelUnit[]> = {
  gas: [
    { id: 'therm', label: msg('therms'), kgCo2e: NG_KG_PER_MMBTU * 0.1, kwh: THERM_KWH },
    { id: 'ccf', label: msg('ccf (100 ft³)'), kgCo2e: NG_KG_PER_MMBTU * 0.1036, kwh: (103600 / KWH_BTU) },
    { id: 'mcf', label: msg('Mcf (1,000 ft³)'), kgCo2e: NG_KG_PER_MMBTU * 1.036, kwh: (1036000 / KWH_BTU) },
    { id: 'm3', label: 'm³', kgCo2e: NG_KG_PER_MMBTU * (1036 * 35.3146667) / 1e6, kwh: (1036 * 35.3146667) / KWH_BTU },
    { id: 'kwh', label: msg('kWh of gas'), kgCo2e: NG_KG_PER_MMBTU * KWH_BTU / 1e6, kwh: 1 },
    // Australian gas bills are in megajoules: 1 MJ = 1/3.6 kWh.
    { id: 'mj', label: msg('MJ (megajoules)'), kgCo2e: (NG_KG_PER_MMBTU * KWH_BTU) / 1e6 / 3.6, kwh: 1 / 3.6 },
    // Alberta and BC gas bills are in gigajoules: 1 GJ = 1,000 MJ = 277.8 kWh.
    { id: 'gj', label: msg('GJ (gigajoules)'), kgCo2e: (NG_KG_PER_MMBTU * KWH_BTU) / 1e6 / 0.0036, kwh: 1 / 0.0036 },
  ],
  oil: [
    { id: 'gal', label: msg('US gallons'), kgCo2e: 10.21 + (0.41 * GWP_CH4 + 0.08 * GWP_N2O) / 1000, kwh: 138500 / KWH_BTU },
    { id: 'l', label: msg('litres'), kgCo2e: (10.21 + (0.41 * GWP_CH4 + 0.08 * GWP_N2O) / 1000) / L_PER_GAL, kwh: 138500 / KWH_BTU / L_PER_GAL },
  ],
  propane: [
    { id: 'gal', label: msg('US gallons'), kgCo2e: 5.72 + (0.27 * GWP_CH4 + 0.05 * GWP_N2O) / 1000, kwh: 91452 / KWH_BTU },
    { id: 'l', label: msg('litres'), kgCo2e: (5.72 + (0.27 * GWP_CH4 + 0.05 * GWP_N2O) / 1000) / L_PER_GAL, kwh: 91452 / KWH_BTU / L_PER_GAL },
    // LPG sold by weight (India's 14.2 kg cylinders): DESNZ 2026 LPG 2,939.36 kg CO2e per tonne and 0.2145 kg CO2e per kWh (gross CV).
    { id: 'kg', label: msg('kg (LPG cylinders)'), kgCo2e: 2.93936095, kwh: 2.93936095 / 0.2145 },
  ],
  electric: [{ id: 'kwh', label: 'kWh', kgCo2e: 0, kwh: 1 }], // CO2e comes from the grid factor
};

export function fuelUnit(fuel: keyof typeof HEATING_FUEL_UNITS, unit: string): FuelUnit {
  const u = HEATING_FUEL_UNITS[fuel]?.find((x) => x.id === unit);
  if (!u) throw new Error(`Unknown unit "${unit}" for ${fuel}.`);
  return u;
}

/** Vehicle fuels: kg CO2 per US gallon (EPA Hub 2025, Table 2, combustion CO2 only). */
export const VEHICLE_FUEL_KG_PER_GAL = { gasoline: 8.78, diesel: 10.21 } as const;

// ================================================================ flights (DESNZ 2025)

export type FlightHaul = 'domestic' | 'short' | 'long';
export type FlightClass = 'economy' | 'premium' | 'business' | 'first';

/** kg CO2e per passenger-km [without RF, with RF]. DESNZ 2025 "Business travel - air". */
export const FLIGHT_FACTORS: Record<FlightHaul, Partial<Record<FlightClass, [number, number]>>> = {
  domestic: { economy: [0.13552, 0.22928] },
  short: { economy: [0.07435, 0.12576], business: [0.11152, 0.18863] },
  long: { economy: [0.06926, 0.11704], premium: [0.11081, 0.18726], business: [0.20083, 0.3394], first: [0.27701, 0.46814] },
};

export function flightFactor(haul: FlightHaul, cls: FlightClass, withRF: boolean): number {
  const row = FLIGHT_FACTORS[haul];
  const pair = row[cls] ?? row.business ?? row.economy!;
  return withRF ? pair[1] : pair[0];
}

/** Classes DESNZ publishes for a haul (others fall back to the nearest published class). */
export const flightClasses = (haul: FlightHaul) => Object.keys(FLIGHT_FACTORS[haul]) as FlightClass[];

// ================================================================ diet (Scarborough et al. 2014)

export type DietId = 'heavyMeat' | 'mediumMeat' | 'lowMeat' | 'pescatarian' | 'vegetarian' | 'vegan';
export const DIETS: { id: DietId; label: string; kgPerDay: number }[] = [
  { id: 'heavyMeat', label: msg('High meat (100 g or more a day)'), kgPerDay: 7.19 },
  { id: 'mediumMeat', label: msg('Medium meat (50 to 99 g a day)'), kgPerDay: 5.63 },
  { id: 'lowMeat', label: msg('Low meat (under 50 g a day)'), kgPerDay: 4.67 },
  { id: 'pescatarian', label: msg('Fish but no meat'), kgPerDay: 3.91 },
  { id: 'vegetarian', label: msg('Vegetarian'), kgPerDay: 3.81 },
  { id: 'vegan', label: msg('Vegan'), kgPerDay: 2.89 },
];

// ================================================================ carbon footprint

/** Litres in an imperial (UK) gallon, exact. UK mpg is miles per imperial gallon. */
export const L_PER_IMP_GAL = 4.54609;

export type VehicleInput = { distance: number; distanceUnit: 'mi' | 'km'; fuel: 'gasoline' | 'diesel' | 'electric'; economy: number; /** US mpg, UK mpg (imperial gallon), L/100 km, km per litre (India), or kWh/100 mi | kWh/100 km for electric */ economyUnit: 'mpg' | 'mpgimp' | 'l100km' | 'kmpl' | 'kwh100mi' | 'kwh100km' };

/** Litres of fuel for a distance at a fuel economy in any supported unit. */
export function fuelLitres(km: number, economy: number, unit: 'mpg' | 'mpgimp' | 'l100km' | 'kmpl'): number {
  if (!(economy > 0)) throw new Error(msg('Fuel economy must be above zero.'));
  const miles = km / KM_PER_MI;
  if (unit === 'l100km') return (km * economy) / 100;
  if (unit === 'kmpl') return km / economy;
  if (unit === 'mpgimp') return (miles / economy) * L_PER_IMP_GAL;
  return (miles / economy) * L_PER_GAL;
}
export type FlightInput = { haul: FlightHaul; cls: FlightClass; roundTrips: number; oneWayKm: number };

export type FootprintInput = {
  people: number;
  electricityKwhPerYear: number;
  gridKgPerKwh: number;
  /** Share of electricity covered by your own solar or a certified renewable plan, 0-100. */
  renewablePct?: number;
  gasAmount?: number;
  gasUnit?: string;
  oilAmount?: number;
  oilUnit?: string;
  propaneAmount?: number;
  propaneUnit?: string;
  vehicles?: VehicleInput[];
  flights?: FlightInput[];
  withRF?: boolean;
  diet?: DietId;
  /** People the diet applies to; defaults to `people`. */
  dietPeople?: number;
};

export type FootprintResult = {
  kg: { electricity: number; heating: number; driving: number; flights: number; diet: number; total: number };
  tonnesTotal: number;
  tonnesPerPerson: number;
  details: { vehicleKg: number[]; flightKg: number[]; flightKm: number };
};

/** Litres of fuel or kWh used per year by one vehicle. */
/** 0-100 percent; a missing or non-numeric value counts as 0 so it can never turn a total into NaN. */
const clampPct = (p: number | undefined) => (Number.isFinite(p) ? Math.min(100, Math.max(0, p as number)) : 0);

export function vehicleKg(v: VehicleInput, gridKgPerKwh: number): number {
  if (!(v.distance >= 0) || !(v.economy > 0)) throw new Error(msg('Vehicle distance and fuel economy must be positive.'));
  const miles = v.distanceUnit === 'km' ? v.distance / KM_PER_MI : v.distance;
  const km = miles * KM_PER_MI;
  if (v.fuel === 'electric') {
    const kwh = v.economyUnit === 'kwh100km' ? (km * v.economy) / 100 : (miles * v.economy) / 100;
    return kwh * gridKgPerKwh;
  }
  const gallons = fuelLitres(km, v.economy, v.economyUnit as 'mpg' | 'mpgimp' | 'l100km' | 'kmpl') / L_PER_GAL;
  return gallons * VEHICLE_FUEL_KG_PER_GAL[v.fuel];
}

export function carbonFootprint(i: FootprintInput): FootprintResult {
  if (!(i.people >= 1)) throw new Error(msg('Household size must be at least 1.'));
  if (!(i.electricityKwhPerYear >= 0) || !(i.gridKgPerKwh >= 0)) throw new Error(msg('Electricity use and grid factor cannot be negative.'));
  const ren = clampPct(i.renewablePct) / 100;
  const electricity = i.electricityKwhPerYear * i.gridKgPerKwh * (1 - ren);
  const fuel = (amount: number | undefined, f: 'gas' | 'oil' | 'propane', unit: string | undefined) => {
    if (!amount) return 0;
    if (amount < 0) throw new Error(msg('Fuel amounts cannot be negative.'));
    return amount * fuelUnit(f, unit ?? HEATING_FUEL_UNITS[f][0].id).kgCo2e;
  };
  const heating = fuel(i.gasAmount, 'gas', i.gasUnit) + fuel(i.oilAmount, 'oil', i.oilUnit) + fuel(i.propaneAmount, 'propane', i.propaneUnit);
  const vehicleKgs = (i.vehicles ?? []).map((v) => vehicleKg(v, i.gridKgPerKwh));
  const flightKgs = (i.flights ?? []).map((f) => {
    if (!(f.roundTrips >= 0) || !(f.oneWayKm >= 0)) throw new Error(msg('Flight counts and distances cannot be negative.'));
    return f.roundTrips * 2 * f.oneWayKm * flightFactor(f.haul, f.cls, i.withRF ?? true);
  });
  const flightKm = (i.flights ?? []).reduce((s, f) => s + f.roundTrips * 2 * f.oneWayKm, 0);
  const dietDef = DIETS.find((d) => d.id === (i.diet ?? 'mediumMeat'));
  if (!dietDef) throw new Error(`Unknown diet "${i.diet}".`);
  const diet = dietDef.kgPerDay * 365 * (i.dietPeople ?? i.people);
  const driving = vehicleKgs.reduce((s, x) => s + x, 0);
  const flights = flightKgs.reduce((s, x) => s + x, 0);
  const total = electricity + heating + driving + flights + diet;
  return {
    kg: { electricity, heating, driving, flights, diet, total },
    tonnesTotal: total / 1000,
    tonnesPerPerson: total / 1000 / i.people,
    details: { vehicleKg: vehicleKgs, flightKg: flightKgs, flightKm },
  };
}

// ================================================================ EV vs gas

export type EvVsGasInput = {
  /**
   * us: miles, US mpg, price per US gallon. metric: km, L/100 km, price per litre.
   * uk: miles, UK mpg (imperial gallon), price per litre (as UK pumps price it).
   * kmpl: km, km per litre (India's "mileage"), price per litre.
   */
  units: 'us' | 'metric' | 'uk' | 'kmpl';
  /** miles (us, uk) or km per year */
  annualDistance: number;
  years: number;
  /** US mpg, L/100 km, UK mpg or km/l, by `units` */
  gasEconomy: number;
  /** per US gallon (us) or per litre (metric, uk, kmpl) */
  fuelPrice: number;
  /** kWh per 100 mi (us, uk) or per 100 km (metric, kmpl), measured from the wall like the EPA label */
  evEfficiency: number;
  homeSharePct: number;
  homePrice: number;
  publicPrice: number;
  /** per mile or per km */
  gasMaintenance: number;
  evMaintenance: number;
  gasCarPrice: number;
  evCarPrice: number;
  evIncentive: number;
  gridKgPerKwh: number;
  /** kg CO2 per US gallon (us) or per litre (metric, uk, kmpl) */
  fuelKgPerUnit: number;
};

export type EvVsGasYear = { year: number; gasCumulative: number; evCumulative: number; difference: number };

export type EvVsGasResult = {
  gas: { fuelUnits: number; energyCost: number; maintenance: number; perDistance: number; kgCo2: number };
  ev: { kwh: number; energyCost: number; maintenance: number; perDistance: number; kgCo2: number; blendedPrice: number };
  annualSavings: number;
  upfrontGap: number;
  breakEvenYears: number | null;
  totalSavings: number;
  co2SavedKgPerYear: number;
  timeline: EvVsGasYear[];
};

export function evVsGas(i: EvVsGasInput): EvVsGasResult {
  const pos = [i.annualDistance, i.gasEconomy, i.evEfficiency];
  if (pos.some((x) => !(x > 0))) throw new Error(msg('Distance, fuel economy and EV efficiency must be above zero.'));
  if (!(i.years >= 1 && i.years <= 30)) throw new Error(msg('Years must be between 1 and 30.'));
  const nonneg = [i.fuelPrice, i.homePrice, i.publicPrice, i.gasMaintenance, i.evMaintenance, i.gasCarPrice, i.evCarPrice, i.evIncentive, i.gridKgPerKwh, i.fuelKgPerUnit];
  if (nonneg.some((x) => !(x >= 0))) throw new Error(msg('Prices, costs and factors cannot be negative.'));
  const share = clampPct(i.homeSharePct) / 100;
  const fuelUnits =
    i.units === 'us' ? i.annualDistance / i.gasEconomy
      : i.units === 'uk' ? (i.annualDistance / i.gasEconomy) * L_PER_IMP_GAL
        : i.units === 'kmpl' ? i.annualDistance / i.gasEconomy
          : (i.annualDistance * i.gasEconomy) / 100;
  const gasEnergy = fuelUnits * i.fuelPrice;
  const gasMaint = i.annualDistance * i.gasMaintenance;
  const kwh = (i.annualDistance * i.evEfficiency) / 100;
  const blended = share * i.homePrice + (1 - share) * i.publicPrice;
  const evEnergy = kwh * blended;
  const evMaint = i.annualDistance * i.evMaintenance;
  const annualSavings = gasEnergy + gasMaint - (evEnergy + evMaint);
  const upfrontGap = i.evCarPrice - i.evIncentive - i.gasCarPrice;
  let breakEvenYears: number | null;
  if (upfrontGap <= 0) breakEvenYears = 0;
  else breakEvenYears = annualSavings > 0 ? upfrontGap / annualSavings : null;
  const timeline: EvVsGasYear[] = [];
  for (let y = 0; y <= i.years; y++) {
    const g = i.gasCarPrice + y * (gasEnergy + gasMaint);
    const e = i.evCarPrice - i.evIncentive + y * (evEnergy + evMaint);
    timeline.push({ year: y, gasCumulative: g, evCumulative: e, difference: g - e });
  }
  const gasKg = fuelUnits * i.fuelKgPerUnit;
  const evKg = kwh * i.gridKgPerKwh;
  return {
    gas: { fuelUnits, energyCost: gasEnergy, maintenance: gasMaint, perDistance: (gasEnergy + gasMaint) / i.annualDistance, kgCo2: gasKg },
    ev: { kwh, energyCost: evEnergy, maintenance: evMaint, perDistance: (evEnergy + evMaint) / i.annualDistance, kgCo2: evKg, blendedPrice: blended },
    annualSavings,
    upfrontGap,
    breakEvenYears,
    totalSavings: timeline[timeline.length - 1].difference,
    co2SavedKgPerYear: gasKg - evKg,
    timeline,
  };
}

// ================================================================ EV charging

export type ChargerPreset = { id: string; label: string; kw: number; type: 'ac' | 'dc'; efficiencyPct: number };

const acKw = (volts: number, amps: number) => Math.round(((volts * amps) / 1000) * 100) / 100;

export const CHARGER_PRESETS: ChargerPreset[] = [
  { id: 'l1-12', label: msg('Level 1, 120 V 12 A outlet'), kw: acKw(120, 12), type: 'ac', efficiencyPct: 85 },
  { id: 'l1-16', label: msg('Level 1, 120 V 16 A (20 A circuit)'), kw: acKw(120, 16), type: 'ac', efficiencyPct: 85 },
  { id: 'l2-16', label: msg('Level 2, 240 V 16 A'), kw: acKw(240, 16), type: 'ac', efficiencyPct: 90 },
  { id: 'l2-32', label: msg('Level 2, 240 V 32 A (40 A circuit)'), kw: acKw(240, 32), type: 'ac', efficiencyPct: 90 },
  { id: 'l2-40', label: msg('Level 2, 240 V 40 A (50 A circuit)'), kw: acKw(240, 40), type: 'ac', efficiencyPct: 90 },
  { id: 'l2-48', label: msg('Level 2, 240 V 48 A (60 A circuit)'), kw: acKw(240, 48), type: 'ac', efficiencyPct: 90 },
  { id: 'l2-208', label: msg('Public Level 2, 208 V 30 A'), kw: acKw(208, 30), type: 'ac', efficiencyPct: 90 },
  { id: 'eu-1p10', label: msg('230 V 10 A socket (portable charger)'), kw: acKw(230, 10), type: 'ac', efficiencyPct: 85 },
  { id: 'eu-1p16', label: msg('Wallbox 230 V 16 A single-phase'), kw: acKw(230, 16), type: 'ac', efficiencyPct: 90 },
  { id: 'eu-1p32', label: msg('Wallbox 230 V 32 A single-phase'), kw: acKw(230, 32), type: 'ac', efficiencyPct: 90 },
  { id: 'eu-3p16', label: msg('Wallbox 400 V 16 A three-phase'), kw: 11, type: 'ac', efficiencyPct: 90 },
  { id: 'eu-3p32', label: msg('Wallbox 400 V 32 A three-phase'), kw: 22, type: 'ac', efficiencyPct: 90 },
  { id: 'dc-50', label: msg('DC fast 50 kW'), kw: 50, type: 'dc', efficiencyPct: 93 },
  { id: 'dc-150', label: msg('DC fast 150 kW'), kw: 150, type: 'dc', efficiencyPct: 93 },
  { id: 'dc-250', label: msg('DC fast 250 kW'), kw: 250, type: 'dc', efficiencyPct: 93 },
  { id: 'dc-350', label: msg('DC fast 350 kW'), kw: 350, type: 'dc', efficiencyPct: 93 },
];

export type ChargingInput = {
  batteryKwh: number;
  startPct: number;
  endPct: number;
  chargerKw: number;
  type: 'ac' | 'dc';
  /** Car's onboard AC charger limit, kW */
  carAcKw: number;
  /** Car's peak DC charging rate, kW */
  carDcKw: number;
  efficiencyPct: number;
  pricePerKwh: number;
  sessionFee?: number;
  perMinuteFee?: number;
  /** DC only: state of charge where power starts to fall, % (default 50) */
  taperStartPct?: number;
  /** Wall-to-wheels consumption, kWh per 100 mi or km (EPA label style), for range added */
  consumptionPer100?: number;
};

export type ChargingResult = {
  energyToBatteryKwh: number;
  energyFromGridKwh: number;
  lossKwh: number;
  peakKw: number;
  averageKw: number;
  hours: number;
  minutes: number;
  cost: number;
  costPerKwhAdded: number;
  rangeAdded: number | null;
  rangePerHour: number | null;
  limitedBy: 'charger' | 'car';
};

/** Time and cost of one charging session. For DC, the car's curve holds its peak to taperStartPct (default 50%) and falls linearly to 15% of peak at 100%; the charger caps it. */
export function chargingSession(i: ChargingInput): ChargingResult {
  if (!(i.batteryKwh > 0)) throw new Error(msg('Battery capacity must be above zero.'));
  if (!(i.startPct >= 0 && i.endPct <= 100 && i.endPct > i.startPct)) throw new Error(msg('Target charge must be above the starting charge and at most 100%.'));
  if (!(i.chargerKw > 0) || !(i.efficiencyPct > 0 && i.efficiencyPct <= 100)) throw new Error(msg('Charger power and efficiency must be positive (efficiency up to 100%).'));
  if (!(i.pricePerKwh >= 0)) throw new Error(msg('Price cannot be negative.'));
  const eff = i.efficiencyPct / 100;
  const carLimit = i.type === 'ac' ? i.carAcKw : i.carDcKw;
  if (!(carLimit > 0)) throw new Error(msg('The car charging limit must be above zero.'));
  const peakKw = Math.min(i.chargerKw, carLimit);
  const limitedBy: 'charger' | 'car' = i.chargerKw <= carLimit ? 'charger' : 'car';
  const toBattery = (i.batteryKwh * (i.endPct - i.startPct)) / 100;
  let hours: number;
  if (i.type === 'ac') {
    hours = toBattery / (peakKw * eff);
  } else {
    const taper = Math.min(100, Math.max(0, i.taperStartPct ?? 50));
    const floor = 0.15;
    // The car's charging curve tapers; the charger caps whatever the car could accept.
    const carAt = (soc: number) => (soc <= taper ? i.carDcKw : i.carDcKw * (1 - ((1 - floor) * (soc - taper)) / (100 - taper || 1)));
    const powerAt = (soc: number) => Math.min(i.chargerKw, carAt(soc));
    const steps = Math.max(200, Math.ceil((i.endPct - i.startPct) * 20));
    const dSoc = (i.endPct - i.startPct) / steps;
    hours = 0;
    for (let k = 0; k < steps; k++) {
      const soc = i.startPct + (k + 0.5) * dSoc;
      hours += ((i.batteryKwh * dSoc) / 100) / (powerAt(soc) * eff);
    }
  }
  const fromGrid = toBattery / eff;
  const minutes = hours * 60;
  const cost = fromGrid * i.pricePerKwh + (i.sessionFee ?? 0) + minutes * (i.perMinuteFee ?? 0);
  const range = i.consumptionPer100 && i.consumptionPer100 > 0 ? (fromGrid / i.consumptionPer100) * 100 : null;
  return {
    energyToBatteryKwh: toBattery,
    energyFromGridKwh: fromGrid,
    lossKwh: fromGrid - toBattery,
    peakKw,
    averageKw: fromGrid / hours,
    hours,
    minutes,
    cost,
    costPerKwhAdded: cost / toBattery,
    rangeAdded: range,
    rangePerHour: range === null ? null : range / hours,
    limitedBy,
  };
}

/** "3 h 25 min" style duration. */
export function formatHours(h: number): string {
  if (!Number.isFinite(h)) return 'n/a';
  const totalMin = Math.round(h * 60);
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  if (hh === 0) return `${mm} min`;
  return mm === 0 ? `${hh} h` : `${hh} h ${mm} min`;
}

// ================================================================ heat pump

export type HeatingFuel = 'gas' | 'oil' | 'propane' | 'electric';

export type HeatPumpInput = {
  /** 'fuel': derive heat demand from current fuel use; 'demand': heatDemandKwh given directly */
  basis: 'fuel' | 'demand';
  currentFuel: HeatingFuel;
  fuelAmount?: number;
  fuelUnit?: string;
  /** AFUE or seasonal efficiency of the current system, % */
  currentEfficiencyPct: number;
  heatDemandKwh?: number;
  /** Price per fuel unit (per kWh for electric) */
  fuelPrice: number;
  /** Seasonal COP of the heat pump */
  scop: number;
  /** Share of the heat supplied by electric backup strips, % */
  backupPct?: number;
  electricityPrice: number;
  installCost?: number;
  incentives?: number;
  gridKgPerKwh: number;
};

export type HeatPumpResult = {
  heatDemandKwh: number;
  currentFuelUnits: number;
  currentCost: number;
  currentKg: number;
  heatPumpKwh: number;
  heatPumpCost: number;
  heatPumpKg: number;
  annualSavings: number;
  co2SavedKg: number;
  /** Fuel price at which both cost the same per year */
  breakEvenFuelPrice: number;
  /** Electricity price at which both cost the same */
  breakEvenElectricityPrice: number;
  /** Cost of one kWh of delivered heat */
  costPerKwhHeat: { current: number; heatPump: number };
  netInstallCost: number;
  paybackYears: number | null;
};

/** HSPF or HSPF2 (Btu/Wh) to an average seasonal COP. */
export const hspfToCop = (hspf: number) => hspf / 3.412;

export function heatPumpSavings(i: HeatPumpInput): HeatPumpResult {
  if (!(i.currentEfficiencyPct > 0 && i.currentEfficiencyPct <= 100)) throw new Error(msg('Current system efficiency must be between 1% and 100%.'));
  if (!(i.scop > 0 && i.scop <= 8)) throw new Error(msg('Heat pump seasonal COP must be above 0 and at most 8.'));
  if (!(i.fuelPrice >= 0) || !(i.electricityPrice >= 0) || !(i.gridKgPerKwh >= 0)) throw new Error(msg('Prices and factors cannot be negative.'));
  const unit = i.currentFuel === 'electric' ? HEATING_FUEL_UNITS.electric[0] : fuelUnit(i.currentFuel, i.fuelUnit ?? HEATING_FUEL_UNITS[i.currentFuel][0].id);
  const eff = i.currentEfficiencyPct / 100;
  let demand: number;
  let units: number;
  if (i.basis === 'fuel') {
    if (!(i.fuelAmount! > 0)) throw new Error(msg('Enter how much fuel you use a year.'));
    units = i.fuelAmount!;
    demand = units * unit.kwh * eff;
  } else {
    if (!(i.heatDemandKwh! > 0)) throw new Error(msg('Enter the yearly heat demand in kWh.'));
    demand = i.heatDemandKwh!;
    units = demand / eff / unit.kwh;
  }
  const currentCost = units * i.fuelPrice;
  const currentKg = i.currentFuel === 'electric' ? units * i.gridKgPerKwh : units * unit.kgCo2e;
  const backup = clampPct(i.backupPct) / 100;
  const hpKwh = (demand * (1 - backup)) / i.scop + demand * backup;
  const hpCost = hpKwh * i.electricityPrice;
  const hpKg = hpKwh * i.gridKgPerKwh;
  const annualSavings = currentCost - hpCost;
  const net = Math.max(0, (i.installCost ?? 0) - (i.incentives ?? 0));
  return {
    heatDemandKwh: demand,
    currentFuelUnits: units,
    currentCost,
    currentKg,
    heatPumpKwh: hpKwh,
    heatPumpCost: hpCost,
    heatPumpKg: hpKg,
    annualSavings,
    co2SavedKg: currentKg - hpKg,
    breakEvenFuelPrice: hpCost / units,
    breakEvenElectricityPrice: currentCost / hpKwh,
    costPerKwhHeat: { current: currentCost / demand, heatPump: hpCost / demand },
    netInstallCost: net,
    paybackYears: net === 0 ? 0 : annualSavings > 0 ? net / annualSavings : null,
  };
}

// ================================================================ solar payback

export type SolarInput = {
  systemKw: number;
  /** Installed cost per watt DC; ignored when totalCost is given */
  costPerWatt?: number;
  totalCost?: number;
  /** Tax credit as % of cost */
  taxCreditPct: number;
  /** Fixed rebates and grants */
  rebates: number;
  /** First-year kWh per kW DC */
  specificYield: number;
  electricityPrice: number;
  /** Share of production used at home, % (the rest is exported) */
  selfUsePct: number;
  /** Credit per exported kWh */
  exportRate: number;
  priceEscalationPct: number;
  degradationPct: number;
  annualOm: number;
  inverterCost?: number;
  inverterYear?: number;
  years: number;
  discountRatePct: number;
};

export type SolarYear = { year: number; kwh: number; savings: number; cashFlow: number; cumulative: number };

export type SolarResult = {
  grossCost: number;
  netCost: number;
  firstYearKwh: number;
  firstYearSavings: number;
  paybackYears: number | null;
  lifetimeSavings: number;
  netProfit: number;
  roiPct: number;
  npv: number;
  irrPct: number | null;
  lcoe: number;
  totalKwh: number;
  timeline: SolarYear[];
};

function irr(flows: number[]): number | null {
  const npvAt = (r: number) => flows.reduce((s, f, t) => s + f / Math.pow(1 + r, t), 0);
  let lo = -0.99;
  let hi = 1;
  if (npvAt(lo) * npvAt(hi) > 0) return null;
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    if (npvAt(lo) * npvAt(mid) <= 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

export function solarPayback(i: SolarInput): SolarResult {
  if (!(i.systemKw > 0)) throw new Error(msg('System size must be above zero.'));
  if (!(i.specificYield > 0)) throw new Error(msg('Yearly production per kW must be above zero.'));
  if (!(i.years >= 1 && i.years <= 40)) throw new Error(msg('Analysis period must be 1 to 40 years.'));
  const gross = i.totalCost !== undefined && i.totalCost > 0 ? i.totalCost : i.systemKw * 1000 * (i.costPerWatt ?? 0);
  if (!(gross > 0)) throw new Error(msg('Enter the installed cost.'));
  const credit = (gross * Math.min(100, Math.max(0, i.taxCreditPct))) / 100;
  const net = Math.max(0, gross - credit - Math.max(0, i.rebates));
  const self = Math.min(100, Math.max(0, i.selfUsePct)) / 100;
  const firstKwh = i.systemKw * i.specificYield;
  const disc = i.discountRatePct / 100;
  const timeline: SolarYear[] = [{ year: 0, kwh: 0, savings: 0, cashFlow: -net, cumulative: -net }];
  const flows = [-net];
  let cumulative = -net;
  let payback: number | null = net === 0 ? 0 : null;
  let totalKwh = 0;
  let lifetimeSavings = 0;
  let totalCosts = 0;
  for (let y = 1; y <= i.years; y++) {
    const kwh = firstKwh * Math.pow(1 - i.degradationPct / 100, y - 1);
    const esc = Math.pow(1 + i.priceEscalationPct / 100, y - 1);
    const savings = kwh * self * i.electricityPrice * esc + kwh * (1 - self) * i.exportRate * esc;
    const costs = i.annualOm + (i.inverterCost && i.inverterYear === y ? i.inverterCost : 0);
    const cf = savings - costs;
    const before = cumulative;
    cumulative += cf;
    if (payback === null && cumulative >= 0 && cf > 0) payback = y - 1 + -before / cf;
    totalKwh += kwh;
    lifetimeSavings += savings;
    totalCosts += costs;
    flows.push(cf);
    timeline.push({ year: y, kwh, savings, cashFlow: cf, cumulative });
  }
  const npv = flows.reduce((s, f, t) => s + f / Math.pow(1 + disc, t), 0);
  const r = net > 0 ? irr(flows) : null;
  const netProfit = cumulative;
  return {
    grossCost: gross,
    netCost: net,
    firstYearKwh: firstKwh,
    firstYearSavings: timeline[1].savings,
    paybackYears: payback,
    lifetimeSavings,
    netProfit,
    roiPct: net > 0 ? (netProfit / net) * 100 : 0,
    npv,
    irrPct: r === null ? null : r * 100,
    lcoe: (net + totalCosts) / totalKwh,
    totalKwh,
    timeline,
  };
}
