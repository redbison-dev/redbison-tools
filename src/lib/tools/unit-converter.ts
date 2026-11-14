import { msg } from '../msg';

export interface ConversionUnit {
  name: string;
  /** Size of one unit in the category's base unit. */
  factor: number;
  symbol: string;
}

export interface ConversionCategory {
  name: string;
  baseUnit: string;
  units: ConversionUnit[];
}

/**
 * Factors use the exact legal definitions: the 1959 international yard and
 * pound (1 in = 2.54 cm, 1 lb = 0.45359237 kg), the US gallon of 231 cubic
 * inches and the UK gallon of 4.54609 L. The UK (imperial) quart, pint and
 * fluid ounce are 1/4, 1/8 and 1/160 of that gallon (Weights and Measures Act
 * 1985, Schedule 1; Canada's Weights and Measures Act, Schedule II, defines
 * the same gallon), and the UK long ton is 2,240 lb. "Year" is the Julian year of 365.25
 * days used in astronomy.
 */
export const conversionCategories: Record<string, ConversionCategory> = {
  length: {
    name: msg('Length'),
    baseUnit: 'meter',
    units: [
      { name: msg('Meter'), factor: 1, symbol: 'm' },
      { name: msg('Kilometer'), factor: 1000, symbol: 'km' },
      { name: msg('Centimeter'), factor: 0.01, symbol: 'cm' },
      { name: msg('Millimeter'), factor: 0.001, symbol: 'mm' },
      { name: msg('Micrometer'), factor: 0.000001, symbol: 'μm' },
      { name: msg('Nanometer'), factor: 0.000000001, symbol: 'nm' },
      { name: msg('Mile'), factor: 1609.344, symbol: 'mi' },
      { name: msg('Yard'), factor: 0.9144, symbol: 'yd' },
      { name: msg('Foot'), factor: 0.3048, symbol: 'ft' },
      { name: msg('Inch'), factor: 0.0254, symbol: 'in' },
      { name: msg('Light Year'), factor: 9460730472580800, symbol: 'ly' },
    ],
  },
  temperature: {
    name: msg('Temperature'),
    baseUnit: 'celsius',
    units: [
      { name: msg('Celsius'), factor: 1, symbol: '°C' },
      { name: msg('Fahrenheit'), factor: 1, symbol: '°F' },
      { name: msg('Kelvin'), factor: 1, symbol: 'K' },
      { name: msg('Rankine'), factor: 1, symbol: '°R' },
    ],
  },
  area: {
    name: msg('Area'),
    baseUnit: 'square meter',
    units: [
      { name: msg('Square Meter'), factor: 1, symbol: 'm²' },
      { name: msg('Square Kilometer'), factor: 1000000, symbol: 'km²' },
      { name: msg('Square Centimeter'), factor: 0.0001, symbol: 'cm²' },
      { name: msg('Square Millimeter'), factor: 0.000001, symbol: 'mm²' },
      { name: msg('Square Inch'), factor: 0.00064516, symbol: 'in²' },
      { name: msg('Square Foot'), factor: 0.09290304, symbol: 'ft²' },
      { name: msg('Square Yard'), factor: 0.83612736, symbol: 'yd²' },
      { name: msg('Acre'), factor: 4046.8564224, symbol: 'ac' },
      { name: msg('Hectare'), factor: 10000, symbol: 'ha' },
    ],
  },
  volume: {
    name: msg('Volume'),
    baseUnit: 'liter',
    units: [
      { name: msg('Liter'), factor: 1, symbol: 'l' },
      { name: msg('Milliliter'), factor: 0.001, symbol: 'ml' },
      { name: msg('Cubic Meter'), factor: 1000, symbol: 'm³' },
      { name: msg('Gallon (US)'), factor: 3.785411784, symbol: 'gal' },
      { name: msg('Gallon (UK)'), factor: 4.54609, symbol: 'gal (UK)' },
      { name: msg('Quart (US)'), factor: 0.946352946, symbol: 'qt' },
      { name: msg('Pint (US)'), factor: 0.473176473, symbol: 'pt' },
      { name: msg('Cup (US)'), factor: 0.2365882365, symbol: 'cup' },
      { name: msg('Fluid Ounce (US)'), factor: 0.0295735295625, symbol: 'fl oz' },
      { name: msg('Quart (UK)'), factor: 1.1365225, symbol: 'qt (UK)' },
      { name: msg('Pint (UK)'), factor: 0.56826125, symbol: 'pt (UK)' },
      { name: msg('Fluid Ounce (UK)'), factor: 0.0284130625, symbol: 'fl oz (UK)' },
      { name: msg('Tablespoon (US)'), factor: 0.01478676478125, symbol: 'tbsp' },
      { name: msg('Teaspoon (US)'), factor: 0.00492892159375, symbol: 'tsp' },
    ],
  },
  weight: {
    name: msg('Weight'),
    baseUnit: 'kilogram',
    units: [
      { name: msg('Kilogram'), factor: 1, symbol: 'kg' },
      { name: msg('Gram'), factor: 0.001, symbol: 'g' },
      { name: msg('Milligram'), factor: 0.000001, symbol: 'mg' },
      { name: msg('Metric Ton'), factor: 1000, symbol: 't' },
      { name: msg('Pound'), factor: 0.45359237, symbol: 'lb' },
      { name: msg('Ounce'), factor: 0.028349523125, symbol: 'oz' },
      { name: msg('Stone'), factor: 6.35029318, symbol: 'st' },
      { name: msg('US Ton'), factor: 907.18474, symbol: 'ton' },
      { name: msg('Long Ton (UK)'), factor: 1016.0469088, symbol: 'ton (UK)' },
    ],
  },
  time: {
    name: msg('Time'),
    baseUnit: 'second',
    units: [
      { name: msg('Second'), factor: 1, symbol: 's' },
      { name: msg('Minute'), factor: 60, symbol: 'min' },
      { name: msg('Hour'), factor: 3600, symbol: 'h' },
      { name: msg('Day'), factor: 86400, symbol: 'd' },
      { name: msg('Week'), factor: 604800, symbol: 'wk' },
      { name: msg('Year'), factor: 31557600, symbol: 'yr' },
      { name: msg('Millisecond'), factor: 0.001, symbol: 'ms' },
      { name: msg('Microsecond'), factor: 0.000001, symbol: 'μs' },
      { name: msg('Nanosecond'), factor: 0.000000001, symbol: 'ns' },
    ],
  },
  /*
   * The quantities below power the dedicated converter pages
   * (src/config/unitConverters.ts). Factors are the exact legal or standard
   * definitions: NIST SP 811 and Handbook 44 Appendix C for the US customary
   * units (1 lbf = 4.4482216152605 N, 1 psi = 6,894.757293168361 Pa,
   * 1 BTU(IT) = 1,055.05585262 J, 1 hp = 550 ft·lbf/s), the SI Brochure for
   * prefixes and g₀ = 9.80665 m/s², and IEEE 1541 / ISO 80000-13 for binary
   * data prefixes (1 KiB = 1,024 B).
   */
  speed: {
    name: msg('Speed'),
    baseUnit: 'meter per second',
    units: [
      { name: msg('Meter per Second'), factor: 1, symbol: 'm/s' },
      { name: msg('Kilometer per Hour'), factor: 1 / 3.6, symbol: 'km/h' },
      { name: msg('Mile per Hour'), factor: 0.44704, symbol: 'mph' },
      { name: msg('Knot'), factor: 1852 / 3600, symbol: 'kn' },
      { name: msg('Foot per Second'), factor: 0.3048, symbol: 'ft/s' },
      { name: msg('Mach (sea level, 15 °C)'), factor: 340.294, symbol: 'Ma' },
    ],
  },
  pressure: {
    name: msg('Pressure'),
    baseUnit: 'pascal',
    units: [
      { name: msg('Pascal'), factor: 1, symbol: 'Pa' },
      { name: msg('Kilopascal'), factor: 1000, symbol: 'kPa' },
      { name: msg('Megapascal'), factor: 1e6, symbol: 'MPa' },
      { name: msg('Bar'), factor: 1e5, symbol: 'bar' },
      { name: msg('Millibar'), factor: 100, symbol: 'mbar' },
      { name: msg('PSI'), factor: 6894.757293168361, symbol: 'psi' },
      { name: msg('Standard Atmosphere'), factor: 101325, symbol: 'atm' },
      { name: msg('Torr'), factor: 101325 / 760, symbol: 'Torr' },
      { name: msg('Millimeter of Mercury'), factor: 133.322387415, symbol: 'mmHg' },
      { name: msg('Inch of Mercury'), factor: 3386.388640341, symbol: 'inHg' },
    ],
  },
  energy: {
    name: msg('Energy'),
    baseUnit: 'joule',
    units: [
      { name: msg('Joule'), factor: 1, symbol: 'J' },
      { name: msg('Kilojoule'), factor: 1000, symbol: 'kJ' },
      { name: msg('Megajoule'), factor: 1e6, symbol: 'MJ' },
      { name: msg('Calorie (thermochemical)'), factor: 4.184, symbol: 'cal' },
      { name: msg('Kilocalorie (food Calorie)'), factor: 4184, symbol: 'kcal' },
      { name: msg('Watt Hour'), factor: 3600, symbol: 'Wh' },
      { name: msg('Kilowatt Hour'), factor: 3.6e6, symbol: 'kWh' },
      { name: msg('BTU (IT)'), factor: 1055.05585262, symbol: 'BTU' },
      { name: msg('Foot-Pound'), factor: 1.3558179483314004, symbol: 'ft·lbf' },
      { name: msg('Electronvolt'), factor: 1.602176634e-19, symbol: 'eV' },
    ],
  },
  power: {
    name: msg('Power'),
    baseUnit: 'watt',
    units: [
      { name: msg('Watt'), factor: 1, symbol: 'W' },
      { name: msg('Kilowatt'), factor: 1000, symbol: 'kW' },
      { name: msg('Megawatt'), factor: 1e6, symbol: 'MW' },
      { name: msg('Horsepower (mechanical)'), factor: 745.6998715822702, symbol: 'hp' },
      { name: msg('Horsepower (metric)'), factor: 735.49875, symbol: 'PS' },
      { name: msg('BTU per Hour'), factor: 1055.05585262 / 3600, symbol: 'BTU/h' },
      { name: msg('Ton of Refrigeration'), factor: 3516.8528420667, symbol: 'TR' },
      { name: msg('Foot-Pound per Second'), factor: 1.3558179483314004, symbol: 'ft·lbf/s' },
    ],
  },
  'data-storage': {
    name: msg('Data Storage'),
    baseUnit: 'byte',
    units: [
      { name: msg('Byte'), factor: 1, symbol: 'B' },
      { name: msg('Bit'), factor: 0.125, symbol: 'bit' },
      { name: msg('Kilobyte'), factor: 1e3, symbol: 'KB' },
      { name: msg('Megabyte'), factor: 1e6, symbol: 'MB' },
      { name: msg('Gigabyte'), factor: 1e9, symbol: 'GB' },
      { name: msg('Terabyte'), factor: 1e12, symbol: 'TB' },
      { name: msg('Kibibyte'), factor: 1024, symbol: 'KiB' },
      { name: msg('Mebibyte'), factor: 1048576, symbol: 'MiB' },
      { name: msg('Gibibyte'), factor: 1073741824, symbol: 'GiB' },
      { name: msg('Tebibyte'), factor: 1099511627776, symbol: 'TiB' },
    ],
  },
  'data-transfer': {
    name: msg('Data Transfer Rate'),
    baseUnit: 'bit per second',
    units: [
      { name: msg('Bit per Second'), factor: 1, symbol: 'bit/s' },
      { name: msg('Kilobit per Second'), factor: 1e3, symbol: 'kbit/s' },
      { name: msg('Megabit per Second'), factor: 1e6, symbol: 'Mbit/s' },
      { name: msg('Gigabit per Second'), factor: 1e9, symbol: 'Gbit/s' },
      { name: msg('Byte per Second'), factor: 8, symbol: 'B/s' },
      { name: msg('Kilobyte per Second'), factor: 8e3, symbol: 'KB/s' },
      { name: msg('Megabyte per Second'), factor: 8e6, symbol: 'MB/s' },
      { name: msg('Mebibyte per Second'), factor: 8388608, symbol: 'MiB/s' },
    ],
  },
  angle: {
    name: msg('Angle'),
    baseUnit: 'radian',
    units: [
      { name: msg('Radian'), factor: 1, symbol: 'rad' },
      { name: msg('Degree'), factor: Math.PI / 180, symbol: '°' },
      { name: msg('Gradian'), factor: Math.PI / 200, symbol: 'gon' },
      { name: msg('Arcminute'), factor: Math.PI / 10800, symbol: '′' },
      { name: msg('Arcsecond'), factor: Math.PI / 648000, symbol: '″' },
      { name: msg('Turn (revolution)'), factor: 2 * Math.PI, symbol: 'tr' },
      { name: msg('Milliradian'), factor: 0.001, symbol: 'mrad' },
    ],
  },
  frequency: {
    name: msg('Frequency'),
    baseUnit: 'hertz',
    units: [
      { name: msg('Hertz'), factor: 1, symbol: 'Hz' },
      { name: msg('Kilohertz'), factor: 1e3, symbol: 'kHz' },
      { name: msg('Megahertz'), factor: 1e6, symbol: 'MHz' },
      { name: msg('Gigahertz'), factor: 1e9, symbol: 'GHz' },
      { name: msg('Revolution per Minute'), factor: 1 / 60, symbol: 'rpm' },
      { name: msg('Beat per Minute'), factor: 1 / 60, symbol: 'bpm' },
      { name: msg('Radian per Second'), factor: 1 / (2 * Math.PI), symbol: 'rad/s' },
    ],
  },
  torque: {
    name: msg('Torque'),
    baseUnit: 'newton meter',
    units: [
      { name: msg('Newton Meter'), factor: 1, symbol: 'N·m' },
      { name: msg('Newton Centimeter'), factor: 0.01, symbol: 'N·cm' },
      { name: msg('Pound-Foot'), factor: 1.3558179483314004, symbol: 'lbf·ft' },
      { name: msg('Pound-Inch'), factor: 0.1129848290276167, symbol: 'lbf·in' },
      { name: msg('Kilogram-Force Meter'), factor: 9.80665, symbol: 'kgf·m' },
      { name: msg('Ounce-Inch'), factor: 0.007061551814068604, symbol: 'ozf·in' },
    ],
  },
  density: {
    name: msg('Density'),
    baseUnit: 'kilogram per cubic meter',
    units: [
      { name: msg('Kilogram per Cubic Meter'), factor: 1, symbol: 'kg/m³' },
      { name: msg('Gram per Cubic Centimeter'), factor: 1000, symbol: 'g/cm³' },
      { name: msg('Gram per Milliliter'), factor: 1000, symbol: 'g/mL' },
      { name: msg('Kilogram per Liter'), factor: 1000, symbol: 'kg/L' },
      { name: msg('Pound per Cubic Foot'), factor: 16.018463373960138, symbol: 'lb/ft³' },
      { name: msg('Pound per US Gallon'), factor: 119.82642731689663, symbol: 'lb/gal' },
      { name: msg('Ounce per Cubic Inch'), factor: 1729.9940443869063, symbol: 'oz/in³' },
    ],
  },
  force: {
    name: msg('Force'),
    baseUnit: 'newton',
    units: [
      { name: msg('Newton'), factor: 1, symbol: 'N' },
      { name: msg('Kilonewton'), factor: 1000, symbol: 'kN' },
      { name: msg('Pound-Force'), factor: 4.4482216152605, symbol: 'lbf' },
      { name: msg('Kilogram-Force'), factor: 9.80665, symbol: 'kgf' },
      { name: msg('Dyne'), factor: 1e-5, symbol: 'dyn' },
      { name: msg('Ounce-Force'), factor: 0.2780138509537812, symbol: 'ozf' },
      { name: msg('Poundal'), factor: 0.138254954376, symbol: 'pdl' },
    ],
  },
  acceleration: {
    name: msg('Acceleration'),
    baseUnit: 'meter per second squared',
    units: [
      { name: msg('Meter per Second Squared'), factor: 1, symbol: 'm/s²' },
      { name: msg('Standard Gravity'), factor: 9.80665, symbol: 'g₀' },
      { name: msg('Foot per Second Squared'), factor: 0.3048, symbol: 'ft/s²' },
      { name: msg('Kilometer per Hour per Second'), factor: 1 / 3.6, symbol: 'km/h/s' },
      { name: msg('Gal (galileo)'), factor: 0.01, symbol: 'Gal' },
    ],
  },
  'flow-rate': {
    name: msg('Flow Rate'),
    baseUnit: 'liter per second',
    units: [
      { name: msg('Liter per Second'), factor: 1, symbol: 'L/s' },
      { name: msg('Liter per Minute'), factor: 1 / 60, symbol: 'L/min' },
      { name: msg('Cubic Meter per Hour'), factor: 1000 / 3600, symbol: 'm³/h' },
      { name: msg('Cubic Meter per Second'), factor: 1000, symbol: 'm³/s' },
      { name: msg('US Gallon per Minute'), factor: 3.785411784 / 60, symbol: 'gpm' },
      { name: msg('Cubic Foot per Minute'), factor: 28.316846592 / 60, symbol: 'cfm' },
      { name: msg('US Gallon per Hour'), factor: 3.785411784 / 3600, symbol: 'gph' },
    ],
  },
  'metric-prefix': {
    name: msg('Metric Prefix'),
    baseUnit: 'one (no prefix)',
    units: [
      { name: msg('One (no prefix)'), factor: 1, symbol: '1' },
      { name: msg('Quetta (10³⁰)'), factor: 1e30, symbol: 'Q' },
      { name: msg('Yotta (10²⁴)'), factor: 1e24, symbol: 'Y' },
      { name: msg('Exa (10¹⁸)'), factor: 1e18, symbol: 'E' },
      { name: msg('Peta (10¹⁵)'), factor: 1e15, symbol: 'P' },
      { name: msg('Tera (10¹²)'), factor: 1e12, symbol: 'T' },
      { name: msg('Giga (10⁹)'), factor: 1e9, symbol: 'G' },
      { name: msg('Mega (10⁶)'), factor: 1e6, symbol: 'M' },
      { name: msg('Kilo (10³)'), factor: 1e3, symbol: 'k' },
      { name: msg('Centi (10⁻²)'), factor: 1e-2, symbol: 'c' },
      { name: msg('Milli (10⁻³)'), factor: 1e-3, symbol: 'm' },
      { name: msg('Micro (10⁻⁶)'), factor: 1e-6, symbol: 'µ' },
      { name: msg('Nano (10⁻⁹)'), factor: 1e-9, symbol: 'n' },
      { name: msg('Pico (10⁻¹²)'), factor: 1e-12, symbol: 'p' },
      { name: msg('Femto (10⁻¹⁵)'), factor: 1e-15, symbol: 'f' },
      { name: msg('Quecto (10⁻³⁰)'), factor: 1e-30, symbol: 'q' },
    ],
  },
  'blood-glucose': {
    // Unit conversion only (glucose molar mass 180.156 g/mol, so
    // 1 mmol/L = 18.0156 mg/dL); never dosing or interpretation.
    name: msg('Blood Glucose'),
    baseUnit: 'milligram per deciliter',
    units: [
      { name: msg('Milligram per Deciliter'), factor: 1, symbol: 'mg/dL' },
      { name: msg('Millimole per Liter'), factor: 18.0156, symbol: 'mmol/L' },
    ],
  },
  'fuel-economy': {
    // Converted specially: mpg and km/L are distance per volume while
    // L/100 km is volume per distance, so the mapping is reciprocal.
    name: msg('Fuel Economy'),
    baseUnit: 'kilometer per liter',
    units: [
      { name: msg('Kilometer per Liter'), factor: 1, symbol: 'km/L' },
      { name: msg('Liter per 100 Kilometers'), factor: 1, symbol: 'L/100km' },
      { name: msg('Mile per US Gallon'), factor: 1.609344 / 3.785411784, symbol: 'mpg (US)' },
      { name: msg('Mile per UK Gallon'), factor: 1.609344 / 4.54609, symbol: 'mpg (UK)' },
    ],
  },
};

/**
 * Fuel economy mixes distance-per-volume and volume-per-distance units, so
 * L/100 km converts through a reciprocal: km/L = 100 / (L/100 km).
 */
export function convertFuelEconomy(value: number, from: string, to: string): number {
  if (from === to) return value;
  const cat = conversionCategories['fuel-economy'];
  const f = cat.units.find((u) => u.name === from);
  const t = cat.units.find((u) => u.name === to);
  if (!f || !t || !Number.isFinite(value)) return NaN;
  const recip = (name: string) => name === 'Liter per 100 Kilometers';
  const kmPerL = recip(from) ? (value === 0 ? NaN : 100 / value) : value * f.factor;
  return recip(to) ? (kmPerL === 0 ? NaN : 100 / kmPerL) : kmPerL / t.factor;
}

/** Temperature scales differ by an offset as well as a factor, so they go through Celsius. */
export function convertTemperature(value: number, from: string, to: string): number {
  if (from === to) return value;
  let celsius = value;
  if (from === 'Fahrenheit') celsius = ((value - 32) * 5) / 9;
  else if (from === 'Kelvin') celsius = value - 273.15;
  else if (from === 'Rankine') celsius = ((value - 491.67) * 5) / 9;

  if (to === 'Fahrenheit') return (celsius * 9) / 5 + 32;
  if (to === 'Kelvin') return celsius + 273.15;
  if (to === 'Rankine') return (celsius * 9) / 5 + 491.67;
  return celsius;
}

export function convertUnit(value: number, categoryKey: string, from: string, to: string): number {
  if (categoryKey === 'temperature') return convertTemperature(value, from, to);
  if (categoryKey === 'fuel-economy') return convertFuelEconomy(value, from, to);
  const category = conversionCategories[categoryKey];
  if (!category) return NaN;
  const fromFactor = category.units.find((u) => u.name === from)?.factor;
  const toFactor = category.units.find((u) => u.name === to)?.factor;
  // An unknown unit name (a stale or mangled share link) must surface as NaN,
  // never silently convert as if the value were in the base unit.
  if (fromFactor === undefined || toFactor === undefined) return NaN;
  return (value * fromFactor) / toFactor;
}
