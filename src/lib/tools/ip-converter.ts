/**
 * Strict IPv4 helpers shared by the IP Converter and Subnet Calculator.
 * Inputs are validated rather than coerced: parseInt-style truncation
 * ("123abc" -> 123) and wrap-around (2^32 -> 0) are rejected.
 */

import { msg } from '../msg';

export const MAX_IPV4 = 0xffffffff;

/** Parse dotted-decimal IPv4 into an unsigned 32-bit integer. Throws on anything invalid. */
export function parseIPv4(input: string): number {
  const parts = input.trim().split('.');
  if (parts.length !== 4) throw new Error(msg('An IPv4 address has exactly four octets, like 192.168.1.1'));
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) throw new Error(msg('Each octet must be a whole number from 0 to 255'));
    if (part.length > 1 && part.startsWith('0')) {
      throw new Error(msg('Remove leading zeros: some parsers read 010 as octal 8, others as decimal 10'));
    }
    const n = Number(part);
    if (n > 255) throw new Error(msg('Each octet must be between 0 and 255'));
    value = value * 256 + n;
  }
  return value;
}

/** Format an unsigned 32-bit integer as dotted decimal. */
export function intToIPv4(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > MAX_IPV4) throw new Error(msg('Value must be between 0 and 4294967295'));
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

/** Parse a decimal ("3232235777") or 0x-prefixed hex ("0xC0A80101") integer form of an IPv4 address. */
export function parseIPv4Integer(input: string): number {
  const v = input.trim();
  let n: number;
  if (/^0x[0-9a-f]{1,8}$/i.test(v)) n = parseInt(v.slice(2), 16);
  else if (/^\d{1,10}$/.test(v)) n = Number(v);
  else throw new Error(msg('Enter a whole number from 0 to 4294967295 (or hex such as 0xC0A80101)'));
  if (n > MAX_IPV4) throw new Error(msg('Value must be between 0 and 4294967295 (2^32 - 1)'));
  return n;
}

export function ipv4ToHex(n: number): string {
  return '0x' + n.toString(16).toUpperCase().padStart(8, '0');
}

/** Binary form grouped by octet, e.g. 11000000.10101000.00000001.00000001 */
export function ipv4ToBinary(n: number): string {
  return n.toString(2).padStart(32, '0').match(/.{8}/g)!.join('.');
}
