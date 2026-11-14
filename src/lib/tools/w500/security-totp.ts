/**
 * HOTP (RFC 4226) and TOTP (RFC 6238) one-time passwords, plus the
 * otpauth:// Key URI format that authenticator apps scan from QR codes.
 */
import { base32ToBytes, bytesToBase32, randomBytes } from './security-encoding';
import { hmacBytes } from './security-hmac';
import { msg } from '../../msg';

export type OtpAlgorithm = 'SHA-1' | 'SHA-256' | 'SHA-512';
export const OTP_ALGORITHMS: OtpAlgorithm[] = ['SHA-1', 'SHA-256', 'SHA-512'];

export type OtpConfig = {
  type: 'totp' | 'hotp';
  /** Base32 secret as shown by the service. */
  secret: string;
  algorithm: OtpAlgorithm;
  digits: number;
  /** Time step in seconds (TOTP). */
  period: number;
  /** Moving counter (HOTP). */
  counter: number;
  issuer: string;
  account: string;
};

export const DEFAULT_OTP: OtpConfig = {
  type: 'totp',
  secret: 'JBSWY3DPEHPK3PXP',
  algorithm: 'SHA-1',
  digits: 6,
  period: 30,
  counter: 0,
  issuer: 'Example',
  account: 'alice@example.com',
};

/** 8-byte big-endian counter, as RFC 4226 section 5.2 requires. */
export function counterBytes(counter: number): Uint8Array {
  if (!Number.isSafeInteger(counter) || counter < 0) throw new Error('The counter must be a non-negative whole number.');
  const out = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    out[i] = c % 256;
    c = Math.floor(c / 256);
  }
  return out;
}

/** RFC 4226 dynamic truncation of an HMAC value to a 31-bit integer. */
export function dynamicTruncate(mac: Uint8Array): number {
  const offset = mac[mac.length - 1] & 0x0f;
  return ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
}

export async function hotp(key: Uint8Array, counter: number, digits = 6, algorithm: OtpAlgorithm = 'SHA-1'): Promise<string> {
  if (!Number.isInteger(digits) || digits < 6 || digits > 10) throw new Error('Digits must be between 6 and 10.');
  const mac = await hmacBytes(algorithm, key, counterBytes(counter));
  const code = dynamicTruncate(mac) % 10 ** digits;
  return String(code).padStart(digits, '0');
}

/** Time step number T = floor((unixSeconds - T0) / period). */
export function timeStep(unixSeconds: number, period = 30, t0 = 0): number {
  if (!(period > 0)) throw new Error('The period must be a positive number of seconds.');
  return Math.floor((unixSeconds - t0) / period);
}

export async function totp(key: Uint8Array, unixSeconds: number, period = 30, digits = 6, algorithm: OtpAlgorithm = 'SHA-1'): Promise<string> {
  return hotp(key, timeStep(unixSeconds, period), digits, algorithm);
}

export function secondsRemaining(unixSeconds: number, period = 30): number {
  return period - (Math.floor(unixSeconds) % period);
}

export function normalizeSecret(secret: string): string {
  return secret.toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '');
}

export function decodeSecret(secret: string): Uint8Array {
  const bytes = base32ToBytes(secret);
  if (bytes.length === 0) throw new Error('The secret decodes to zero bytes.');
  return bytes;
}

/** A new random secret. RFC 4226 requires at least 128 bits and recommends 160. */
export function generateSecret(byteLength = 20): string {
  return bytesToBase32(randomBytes(byteLength));
}

export type CodeRow = { offset: number; step: number; code: string; validFrom: number; validTo: number };

/** Codes for the current step and `window` steps either side. */
export async function codeWindow(cfg: OtpConfig, unixSeconds: number, window = 1): Promise<CodeRow[]> {
  const key = decodeSecret(cfg.secret);
  const rows: CodeRow[] = [];
  if (cfg.type === 'hotp') {
    for (let o = 0; o <= window * 2; o++) {
      const step = cfg.counter + o;
      rows.push({ offset: o, step, code: await hotp(key, step, cfg.digits, cfg.algorithm), validFrom: NaN, validTo: NaN });
    }
    return rows;
  }
  const now = timeStep(unixSeconds, cfg.period);
  for (let o = -window; o <= window; o++) {
    const step = now + o;
    if (step < 0) continue; // nothing before the Unix epoch's first step
    rows.push({
      offset: o,
      step,
      code: await hotp(key, step, cfg.digits, cfg.algorithm),
      validFrom: step * cfg.period,
      validTo: (step + 1) * cfg.period,
    });
  }
  return rows;
}

/** `message` as interface text with {placeholders}, for the page to translate. */
export type VerifyMsg = { text: string; vars: Record<string, string | number> };
export type VerifyResult = { valid: boolean; offset: number | null; step: number | null; message: string };

const VERIFY_MSG = new WeakMap<VerifyResult, VerifyMsg>();
/** The translatable form of a verifyCode message (kept out of the result object, which stays plain data). */
export const verifyMessage = (r: VerifyResult): VerifyMsg | undefined => VERIFY_MSG.get(r);

function verifyResult(valid: boolean, offset: number | null, step: number | null, text: string, vars: VerifyMsg['vars'] = {}): VerifyResult {
  const message = text.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k]));
  const out: VerifyResult = { valid, offset, step, message };
  VERIFY_MSG.set(out, { text, vars });
  return out;
}

/**
 * Check a code against the current step and `window` steps either side
 * (RFC 6238 section 5.2 recommends at most one step of tolerance).
 * For HOTP, looks ahead `window` counters (RFC 4226 section 7.4).
 */
export async function verifyCode(cfg: OtpConfig, code: string, unixSeconds: number, window = 1): Promise<VerifyResult> {
  const clean = code.replace(/\s+/g, '');
  if (!/^\d+$/.test(clean)) return verifyResult(false, null, null, msg('Codes contain digits only.'));
  if (clean.length !== cfg.digits) return verifyResult(false, null, null, msg('Expected {digits} digits, got {length}.'), { digits: cfg.digits, length: clean.length });
  const rows = await codeWindow(cfg, unixSeconds, window);
  const hit = rows.find((r) => r.code === clean);
  if (!hit) return verifyResult(false, null, null, msg('No match in the checked window. Check the secret, the algorithm and your clock.'));
  if (cfg.type === 'hotp') {
    return hit.offset === 0
      ? verifyResult(true, hit.offset, hit.step, msg('Valid for the current counter.'))
      : verifyResult(true, hit.offset, hit.step, msg('Valid for counter {step} ({offset} ahead). The server would resynchronise to {next}.'), { step: hit.step, offset: hit.offset, next: hit.step + 1 });
  }
  if (hit.offset === 0) return verifyResult(true, hit.offset, hit.step, msg('Valid for the current time step.'));
  const n = Math.abs(hit.offset);
  const vars = { n, seconds: n * cfg.period };
  const text = hit.offset < 0
    ? (msg.plural(n, { one: 'Valid {n} step behind: one of the clocks is off by about {seconds} seconds.', other: 'Valid {n} steps behind: one of the clocks is off by about {seconds} seconds.' }))
    : (msg.plural(n, { one: 'Valid {n} step ahead: one of the clocks is off by about {seconds} seconds.', other: 'Valid {n} steps ahead: one of the clocks is off by about {seconds} seconds.' }));
  return verifyResult(true, hit.offset, hit.step, text, vars);
}

/**
 * Parse an otpauth:// URI (Google Authenticator Key Uri Format).
 * Defaults per that format: SHA1, 6 digits, 30 second period.
 */
export function parseOtpauthUri(uri: string): OtpConfig {
  const text = uri.trim();
  const m = text.match(/^otpauth:\/\/(totp|hotp)\/([^?]*)(?:\?(.*))?$/i);
  if (!m) throw new Error('Not an otpauth URI. It should start with otpauth://totp/ or otpauth://hotp/.');
  const type = m[1].toLowerCase() as 'totp' | 'hotp';
  let label: string;
  try {
    label = decodeURIComponent(m[2] || '');
  } catch {
    throw new Error('The label has malformed percent-encoding.');
  }
  const params = new URLSearchParams(m[3] || '');
  const secret = params.get('secret');
  if (!secret) throw new Error('The URI has no secret parameter.');
  let issuer = params.get('issuer') ?? '';
  let account = label;
  const colon = label.indexOf(':');
  if (colon >= 0) {
    if (!issuer) issuer = label.slice(0, colon);
    account = label.slice(colon + 1);
  }
  const algoRaw = (params.get('algorithm') || 'SHA1').toUpperCase().replace('-', '');
  const algoMap: Record<string, OtpAlgorithm> = { SHA1: 'SHA-1', SHA256: 'SHA-256', SHA512: 'SHA-512' };
  const algorithm = algoMap[algoRaw];
  if (!algorithm) throw new Error(`Unsupported algorithm ${params.get('algorithm')}. Use SHA1, SHA256 or SHA512.`);
  const digits = params.has('digits') ? Number(params.get('digits')) : 6;
  const period = params.has('period') ? Number(params.get('period')) : 30;
  const counter = params.has('counter') ? Number(params.get('counter')) : 0;
  if (!Number.isInteger(digits) || digits < 6 || digits > 10) throw new Error('digits must be between 6 and 10.');
  if (!Number.isInteger(period) || period < 1) throw new Error('period must be a positive whole number of seconds.');
  if (type === 'hotp' && !params.has('counter')) throw new Error('HOTP URIs must include a counter parameter.');
  if (!Number.isSafeInteger(counter) || counter < 0) throw new Error('counter must be a non-negative whole number.');
  const cfg: OtpConfig = { type, secret: normalizeSecret(secret), algorithm, digits, period, counter, issuer: issuer.trim(), account: account.trim() };
  decodeSecret(cfg.secret);
  return cfg;
}

export function buildOtpauthUri(cfg: OtpConfig): string {
  const issuer = cfg.issuer.trim();
  const account = cfg.account.trim();
  const label = issuer ? `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}` : encodeURIComponent(account);
  const params: string[] = [`secret=${normalizeSecret(cfg.secret)}`];
  if (issuer) params.push(`issuer=${encodeURIComponent(issuer)}`);
  params.push(`algorithm=${cfg.algorithm.replace('-', '')}`);
  params.push(`digits=${cfg.digits}`);
  if (cfg.type === 'totp') params.push(`period=${cfg.period}`);
  else params.push(`counter=${cfg.counter}`);
  return `otpauth://${cfg.type}/${label}?${params.join('&')}`;
}

/** Bits of key material in a Base32 secret, for the strength note. */
export function secretBits(secret: string): number {
  try {
    return decodeSecret(secret).length * 8;
  } catch {
    return 0;
  }
}
