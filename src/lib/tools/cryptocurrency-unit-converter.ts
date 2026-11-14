/**
 * Exact decimal conversion between Ethereum and Bitcoin denominations.
 * All maths is done on BigInt base units (wei, satoshi) so values such as
 * 0.1 ETH or 21,000,000 BTC never pass through floating point.
 */
import { msg, built } from '../msg';

export type CryptoChain = 'ethereum' | 'bitcoin';

/** Power of ten of each unit relative to the chain's base unit. */
export const CRYPTO_UNITS: Record<CryptoChain, Record<string, number>> = {
  ethereum: {
    wei: 0,
    kwei: 3,
    mwei: 6,
    gwei: 9,
    szabo: 12,
    finney: 15,
    ether: 18,
  },
  bitcoin: {
    satoshi: 0,
    microbitcoin: 2,
    millibitcoin: 5,
    bitcoin: 8,
  },
};

export const DEFAULT_UNIT: Record<CryptoChain, { from: string; to: string }> = {
  ethereum: { from: 'ether', to: 'wei' },
  bitcoin: { from: 'bitcoin', to: 'satoshi' },
};

/**
 * Parse a non-negative decimal string into an integer scaled by 10^decimals.
 * Accepts "1", "0.1", ".5", "1,000.25" (commas ignored). Rejects exponents,
 * signs and more fractional digits than `decimals` allows.
 */
export function parseDecimal(input: string, decimals: number): bigint {
  const s = input.trim().replace(/,/g, '').replace(/_/g, '');
  if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) {
    throw new Error(msg('Enter a plain non-negative number, for example 0.1 or 21000'));
  }
  const [whole = '', frac = ''] = s.split('.');
  const fracTrimmed = frac.replace(/0+$/, '');
  if (fracTrimmed.length > decimals) {
    throw new Error(built(msg('Too many decimal places: at most {decimals} are allowed here'), { decimals }));
  }
  const padded = fracTrimmed.padEnd(decimals, '0');
  return BigInt((whole || '0') + padded);
}

/** Format an integer scaled by 10^decimals as an exact decimal string. */
export function formatDecimal(value: bigint, decimals: number): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const digits = abs.toString().padStart(decimals + 1, '0');
  const whole = decimals === 0 ? digits : digits.slice(0, -decimals);
  const frac = decimals === 0 ? '' : digits.slice(-decimals).replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`;
}

/** Group the integer part with thousands separators for display. */
export function groupThousands(value: string): string {
  const [whole, frac] = value.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac ? `${grouped}.${frac}` : grouped;
}

export function getUnits(chain: CryptoChain): string[] {
  return Object.keys(CRYPTO_UNITS[chain]);
}

/**
 * Convert `amount` from one unit to another on the same chain.
 * Returns an exact decimal string. Throws when the units belong to
 * different chains or the input is not a valid amount.
 */
export function convertCryptoUnits(
  amount: string,
  chain: CryptoChain,
  fromUnit: string,
  toUnit: string,
): string {
  const units = CRYPTO_UNITS[chain];
  const fromExp = units?.[fromUnit];
  const toExp = units?.[toUnit];
  if (fromExp === undefined || toExp === undefined) {
    throw new Error(built(msg('Both units must be {chain} units'), { chain }));
  }
  // Input may have up to `fromExp` decimals (anything finer is below one base unit).
  const base = parseDecimal(amount, fromExp);
  return formatDecimal(base, toExp);
}
