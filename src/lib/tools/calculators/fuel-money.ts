/**
 * Currency for the fuel cost calculator. The currencies the pay tools list
 * (USD, EUR, GBP, INR, CAD, AUD, JPY, CHF) keep exactly the output of
 * formatMoney; the market currencies added for market versions (rand first,
 * for /en-za/fuel-cost-calculator) print the way src/lib/tools/market-money.ts
 * does, with the market's symbol and CLDR grouping (R 1 361,25).
 */
import { CURRENCIES, formatMoney } from './pay';
import { MONEY_CURRENCIES, groupForCurrency, moneySymbol } from '../market-money';
import { msg } from '../../msg';

/** Market currencies the fuel cost calculator offers beyond the pay tools' list. */
export const FUEL_EXTRA_CURRENCIES = [{ code: 'ZAR', label: msg('South African rand (R)') }] as const;

export const FUEL_CURRENCIES: { code: string; label: string }[] = [...CURRENCIES, ...FUEL_EXTRA_CURRENCIES];

const isMarketExtra = (code: string) => FUEL_EXTRA_CURRENCIES.some((c) => c.code === code) && MONEY_CURRENCIES.some((c) => c.code === code);

export function fuelMoney(value: number, currency = 'USD', decimals?: number): string {
  if (!isMarketExtra(currency)) return formatMoney(value, currency, decimals);
  if (!Number.isFinite(value)) return '-';
  // Market currencies use a decimal comma (R 2,27), where a third decimal (R 2,269) reads like thousands: cap at two.
  const d = Math.min(decimals ?? 2, 2);
  return `${value < 0 ? '-' : ''}${moneySymbol(currency)}${groupForCurrency(value, currency, d, d)}`;
}

/** The symbol shown before a price input: R for rand, otherwise null so the caller keeps its own. */
export const fuelInputSymbol = (currency: string): string | null => (isMarketExtra(currency) ? moneySymbol(currency).trim() : null);
