/**
 * Ethereum gas fee maths, done in BigInt wei so sub-gwei L2 prices and
 * large gas limits stay exact.
 *
 * Legacy (type 0/1): fee = gas x gasPrice.
 * EIP-1559 (type 2): effective price = min(maxFee, baseFee + priorityFee);
 * fee = gas x effective price, of which gas x baseFee is burned and the
 * rest goes to the block proposer as a tip.
 */
import { formatDecimal, parseDecimal } from './cryptocurrency-unit-converter';
import { msg } from '../msg';

const GWEI_DECIMALS = 9;
const ETH_DECIMALS = 18;

export function gweiToWei(gwei: string): bigint {
  return parseDecimal(gwei, GWEI_DECIMALS);
}

export function parseGasUnits(gas: string): bigint {
  const s = gas.trim().replace(/,/g, '');
  if (!/^\d+$/.test(s) || BigInt(s) === 0n) {
    throw new Error(msg('Gas must be a whole number greater than zero'));
  }
  return BigInt(s);
}

export function weiToEthString(wei: bigint): string {
  return formatDecimal(wei, ETH_DECIMALS);
}

export function weiToGweiString(wei: bigint): string {
  return formatDecimal(wei, GWEI_DECIMALS);
}

/** Fiat value of a wei amount. Fiat is display-only, so a float is fine here. */
export function weiToFiat(wei: bigint, ethPrice: number): number {
  return Number(weiToEthString(wei)) * ethPrice;
}

export type FeeBreakdown = {
  /** Price actually paid per gas unit, in wei. */
  effectiveGasPriceWei: bigint;
  /** Total fee in wei. */
  feeWei: bigint;
  /** Portion burned (EIP-1559 base fee). 0 for legacy. */
  burnedWei: bigint;
  /** Portion paid to the block proposer. */
  tipWei: bigint;
  /** Up-front amount the wallet must hold for gas (gas x maxFee or gas x gasPrice). */
  maxCostWei: bigint;
  /** True when maxFee capped base + priority. */
  capped: boolean;
};

export function legacyFee(gasUnits: bigint, gasPriceWei: bigint): FeeBreakdown {
  const feeWei = gasUnits * gasPriceWei;
  return {
    effectiveGasPriceWei: gasPriceWei,
    feeWei,
    burnedWei: 0n,
    tipWei: feeWei,
    maxCostWei: feeWei,
    capped: false,
  };
}

export function eip1559Fee(
  gasUnits: bigint,
  baseFeeWei: bigint,
  priorityFeeWei: bigint,
  maxFeeWei: bigint,
): FeeBreakdown {
  if (maxFeeWei < baseFeeWei) {
    throw new Error(msg('Max fee is below the base fee, so the transaction cannot be included until the base fee drops'));
  }
  const uncapped = baseFeeWei + priorityFeeWei;
  const effective = uncapped < maxFeeWei ? uncapped : maxFeeWei;
  return {
    effectiveGasPriceWei: effective,
    feeWei: gasUnits * effective,
    burnedWei: gasUnits * baseFeeWei,
    tipWei: gasUnits * (effective - baseFeeWei),
    maxCostWei: gasUnits * maxFeeWei,
    capped: uncapped > maxFeeWei,
  };
}

/**
 * Scale a wei price by a percentage (e.g. 80, 120) using integer maths.
 * Used for the slower/faster comparison tiers.
 */
export function scalePrice(wei: bigint, percent: number): bigint {
  return (wei * BigInt(Math.round(percent))) / 100n;
}

/**
 * Currencies the fee can be read in. The ETH price is typed by the user in
 * that currency; the symbol and digit grouping follow the market (en-IN groups
 * ₹ amounts in lakhs: ₹1,23,456.78).
 */
export const GAS_FIAT_CURRENCIES = {
  USD: { symbol: '$', locale: 'en-US' },
  GBP: { symbol: '£', locale: 'en-GB' },
  EUR: { symbol: '€', locale: 'en-IE' },
  INR: { symbol: '₹', locale: 'en-IN' },
  CAD: { symbol: 'CA$', locale: 'en-CA' },
  AUD: { symbol: 'A$', locale: 'en-AU' },
  // UAE dirham as CLDR en-AE writes it ("AED 1,234.50"), the same symbol as market-money.ts.
  AED: { symbol: 'AED ', locale: 'en-AE' },
} as const;
export type GasFiatCurrency = keyof typeof GAS_FIAT_CURRENCIES;

export const isGasFiatCurrency = (c: string): c is GasFiatCurrency => Object.prototype.hasOwnProperty.call(GAS_FIAT_CURRENCIES, c);

/** A fiat amount with its symbol, 2 to 4 decimals ("£0.8732", "₹1,234.50"); "-" for a bad price. */
export function formatGasFiat(amount: number, currency: string): string {
  const c = isGasFiatCurrency(currency) ? GAS_FIAT_CURRENCIES[currency] : GAS_FIAT_CURRENCIES.USD;
  if (!Number.isFinite(amount) || amount < 0) return '-';
  return `${c.symbol}${amount.toLocaleString(c.locale, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}
