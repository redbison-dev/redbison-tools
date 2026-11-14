/**
 * Byte encoding helpers shared by the security tools (HMAC, TOTP, AES, key
 * generation). Pure functions with no DOM or Node dependencies so they run in
 * the browser, in Vitest and in the Deno MCP bundle.
 */

export type ByteEncoding = 'utf8' | 'hex' | 'base64';

export function utf8Encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function utf8Decode(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

/** Copy into a fresh ArrayBuffer, the type Web Crypto accepts everywhere. */
export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(bytes.length);
  new Uint8Array(out).set(bytes);
  return out;
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
  return s;
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/i, '').replace(/[\s:]/g, '');
  if (clean.length % 2 !== 0) throw new Error('Hex input must have an even number of digits.');
  if (!/^[0-9a-fA-F]*$/.test(clean)) throw new Error('Hex input may only contain 0-9 and a-f.');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (b0 << 16) | (b1 << 8) | b2;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? B64[n & 63] : '=';
  }
  return out;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Accepts standard and URL-safe Base64, with or without padding and whitespace. */
export function base64ToBytes(input: string): Uint8Array {
  let s = input.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  s = s.replace(/=+$/, '');
  if (!/^[A-Za-z0-9+/]*$/.test(s)) throw new Error('Input is not valid Base64.');
  if (s.length % 4 === 1) throw new Error('Base64 input has an impossible length.');
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of s) {
    buffer = (buffer << 6) | B64.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

export function decodeBytes(value: string, encoding: ByteEncoding): Uint8Array {
  if (encoding === 'hex') return hexToBytes(value);
  if (encoding === 'base64') return base64ToBytes(value);
  return utf8Encode(value);
}

/* RFC 4648 Base32, the alphabet authenticator apps use for TOTP secrets. */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function bytesToBase32(bytes: Uint8Array, pad = false): string {
  let out = '';
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < bytes.length; i++) {
    buffer = (buffer << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += B32[(buffer >> bits) & 31];
    }
    buffer &= (1 << bits) - 1;
  }
  if (bits > 0) out += B32[(buffer << (5 - bits)) & 31];
  if (pad) while (out.length % 8 !== 0) out += '=';
  return out;
}

/** Tolerant decoder: ignores case, spaces, hyphens and trailing padding. */
export function base32ToBytes(input: string): Uint8Array {
  const s = input.toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '');
  if (!s) throw new Error('The secret is empty.');
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of s) {
    const v = B32.indexOf(ch);
    if (v < 0) {
      const hint = ch === '0' || ch === '1' || ch === '8' || ch === '9' ? ` Base32 has no "${ch}" (it uses A-Z and 2-7).` : '';
      throw new Error(`"${ch}" is not a Base32 character.${hint}`);
    }
    buffer = (buffer << 5) | v;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
    buffer &= (1 << bits) - 1;
  }
  return new Uint8Array(out);
}

/** Constant-time comparison of two byte arrays of possibly different length. */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a[i % (a.length || 1)] ?? 0) ^ (b[i % (b.length || 1)] ?? 0);
  return diff === 0;
}

export function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
}
