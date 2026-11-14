/**
 * File checksum verification. Parses the expected value in the formats people
 * actually paste (bare hex, sha256sum lines, BSD/openssl "SHA256 (f) = x",
 * colon-separated hex, SRI "sha256-<base64>") and compares case-insensitively.
 */
import MD5 from 'crypto-js/md5';
import WordArray from 'crypto-js/lib-typedarrays';
import { base64ToBytes, toHex } from './x509-parser';
import { msg } from '../msg';

/** An input error with its English template and values, so a page can show it translated. */
export class HashInputError extends Error {
  text: string;
  vars?: Record<string, string | number>;
  constructor(text: string, vars?: Record<string, string | number>) {
    super(vars ? text.replace(/\{(\w+)\}/g, (all, k: string) => (vars[k] === undefined ? all : String(vars[k]))) : text);
    this.text = text;
    this.vars = vars;
  }
}

export type FileHashAlgorithm = 'MD5' | 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512';

export const FILE_HASH_ALGORITHMS: FileHashAlgorithm[] = ['MD5', 'SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'];

const BY_HEX_LENGTH: Record<number, FileHashAlgorithm> = { 32: 'MD5', 40: 'SHA-1', 64: 'SHA-256', 96: 'SHA-384', 128: 'SHA-512' };

export function algorithmForHexLength(length: number): FileHashAlgorithm | undefined {
  return BY_HEX_LENGTH[length];
}

export interface ExpectedHash {
  hex: string;
  algorithm?: FileHashAlgorithm;
  format: 'hex' | 'coreutils' | 'bsd' | 'sri';
}

const SRI_ALG: Record<string, FileHashAlgorithm> = { sha256: 'SHA-256', sha384: 'SHA-384', sha512: 'SHA-512' };

export function parseExpectedHash(input: string): ExpectedHash {
  const s = input.trim();
  if (!s) throw new HashInputError(msg('Enter the expected hash'));

  const sri = s.match(/^(sha256|sha384|sha512)-([A-Za-z0-9+/=]+)$/i);
  if (sri) {
    const hex = toHex(base64ToBytes(sri[2]));
    return { hex, algorithm: SRI_ALG[sri[1].toLowerCase()], format: 'sri' };
  }

  // BSD / openssl dgst style: "SHA256 (file.iso) = abc..." or "SHA2-256(file)= abc..."
  const bsd = s.match(/^[A-Za-z0-9-]+\s*\(.*\)\s*=\s*([0-9a-fA-F:\s]+)$/);
  if (bsd) {
    const hex = bsd[1].replace(/[:\s]/g, '').toLowerCase();
    return { hex, algorithm: algorithmForHexLength(hex.length), format: 'bsd' };
  }

  const tokens = s.split(/\s+/);
  // Space- or colon-separated byte pairs: "AB CD EF ..." / "AB:CD:EF:..."
  const joined = s.replace(/[:\s]/g, '');
  if (tokens.every((t) => /^([0-9a-fA-F]{2}:?)+$/.test(t)) && /^[0-9a-fA-F]+$/.test(joined) && (tokens.length > 1 || s.includes(':'))) {
    return { hex: joined.toLowerCase(), algorithm: algorithmForHexLength(joined.length), format: 'hex' };
  }

  // GNU coreutils: "<hex>  filename" or "<hex> *filename"
  const first = tokens[0];
  if (!/^[0-9a-fA-F]+$/.test(first)) throw new HashInputError(msg('Expected hash must be hexadecimal (or an SRI value like sha256-...)'));
  return { hex: first.toLowerCase(), algorithm: algorithmForHexLength(first.length), format: tokens.length > 1 ? 'coreutils' : 'hex' };
}

export async function hashBytes(bytes: Uint8Array, algorithm: FileHashAlgorithm): Promise<string> {
  if (algorithm === 'MD5') {
    return MD5(WordArray.create(bytes as unknown as number[])).toString();
  }
  const digest = await crypto.subtle.digest(algorithm, bytes as BufferSource);
  return toHex(new Uint8Array(digest));
}

export function hashesMatch(a: string, b: string): boolean {
  const norm = (x: string) => x.replace(/[:\s]/g, '').toLowerCase();
  return norm(a).length > 0 && norm(a) === norm(b);
}

export interface VerifyOutcome {
  algorithm: FileHashAlgorithm;
  actual: string;
  expected: string;
  match: boolean;
}

/**
 * Hash the bytes and compare. When `algorithm` is 'auto' it is chosen from
 * the expected value (SRI prefix or hex length).
 */
export async function verifyBytes(bytes: Uint8Array, expectedInput: string, algorithm: FileHashAlgorithm | 'auto' = 'auto'): Promise<VerifyOutcome> {
  const expected = parseExpectedHash(expectedInput);
  const alg = algorithm === 'auto' ? expected.algorithm : algorithm;
  if (!alg) {
    throw new HashInputError(msg('Cannot tell the algorithm from a {length}-character hash. Pick one from the list (MD5 = 32, SHA-1 = 40, SHA-256 = 64, SHA-384 = 96, SHA-512 = 128).'), { length: expected.hex.length });
  }
  const actual = await hashBytes(bytes, alg);
  return { algorithm: alg, actual, expected: expected.hex, match: hashesMatch(actual, expected.hex) };
}
