/**
 * HMAC (RFC 2104) with Web Crypto, plus the signing recipes used by common
 * webhook providers. Used by the HMAC Generator page and the `hmac` MCP tool.
 */
import { msg } from '../../msg';
import {
  type ByteEncoding,
  base64ToBytes,
  bytesToBase64,
  bytesToBase64Url,
  bytesToHex,
  decodeBytes,
  hexToBytes,
  timingSafeEqual,
  toArrayBuffer,
  utf8Encode,
} from './security-encoding';

export type HmacAlgorithm = 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512';
export const HMAC_ALGORITHMS: HmacAlgorithm[] = ['SHA-256', 'SHA-1', 'SHA-384', 'SHA-512'];

/** Output length in bytes and the hash block size (which sets how long keys are pre-hashed). */
export const HMAC_SIZES: Record<HmacAlgorithm, { outBytes: number; blockBytes: number }> = {
  'SHA-1': { outBytes: 20, blockBytes: 64 },
  'SHA-256': { outBytes: 32, blockBytes: 64 },
  'SHA-384': { outBytes: 48, blockBytes: 128 },
  'SHA-512': { outBytes: 64, blockBytes: 128 },
};

export async function hmacBytes(algorithm: HmacAlgorithm, key: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  if (!HMAC_SIZES[algorithm]) throw new Error(`Unsupported algorithm ${algorithm}.`);
  const subtle = globalThis.crypto.subtle;
  // Web Crypto rejects zero-length HMAC keys; RFC 2104 allows them (the key is zero-padded).
  // A key of one block of zero bytes is mathematically identical, so substitute it.
  const k = key.length === 0 ? new Uint8Array(HMAC_SIZES[algorithm].blockBytes) : key;
  const cryptoKey = await subtle.importKey('raw', toArrayBuffer(k), { name: 'HMAC', hash: algorithm }, false, ['sign']);
  const sig = await subtle.sign('HMAC', cryptoKey, toArrayBuffer(message));
  return new Uint8Array(sig);
}

export type HmacPreset = 'plain' | 'github' | 'stripe' | 'slack';

export const HMAC_PRESETS: { id: HmacPreset; label: string; note: string }[] = [
  { id: 'plain', label: msg('Plain message'), note: msg('Signs the message exactly as entered.') },
  { id: 'github', label: msg('GitHub webhook'), note: msg('HMAC-SHA256 of the raw request body, sent as X-Hub-Signature-256: sha256=<hex>.') },
  { id: 'stripe', label: msg('Stripe webhook'), note: msg('HMAC-SHA256 of "<timestamp>.<raw body>", sent as Stripe-Signature: t=<timestamp>,v1=<hex>.') },
  { id: 'slack', label: msg('Slack request'), note: msg('HMAC-SHA256 of "v0:<timestamp>:<raw body>", sent as X-Slack-Signature: v0=<hex>.') },
];

/** The exact string each provider signs. */
export function presetSigningString(preset: HmacPreset, body: string, timestamp: string): string {
  if (preset === 'stripe') return `${timestamp}.${body}`;
  if (preset === 'slack') return `v0:${timestamp}:${body}`;
  return body;
}

export function presetHeader(preset: HmacPreset, hex: string, timestamp: string): string | null {
  if (preset === 'github') return `X-Hub-Signature-256: sha256=${hex}`;
  if (preset === 'stripe') return `Stripe-Signature: t=${timestamp},v1=${hex}`;
  if (preset === 'slack') return `X-Slack-Request-Timestamp: ${timestamp}\nX-Slack-Signature: v0=${hex}`;
  return null;
}

export type HmacInput = {
  algorithm: HmacAlgorithm;
  key: string;
  keyEncoding: ByteEncoding;
  message: string;
  messageEncoding: ByteEncoding;
  /** Optional signature to check: hex or Base64, with or without a "sha256=" / "v0=" / "v1=" prefix. */
  expected?: string;
  preset?: HmacPreset;
  timestamp?: string;
};

export type HmacResult = {
  algorithm: HmacAlgorithm;
  hex: string;
  base64: string;
  base64url: string;
  bits: number;
  keyBytes: number;
  messageBytes: number;
  /** True when the key was longer than the hash block and therefore hashed first (RFC 2104). */
  keyHashed: boolean;
  signedString?: string;
  header?: string | null;
  /** null when no expected value was given. */
  match: boolean | null;
  expectedFormat?: 'hex' | 'base64' | 'unreadable';
};

/** Strip prefixes such as "sha256=", "v0=", "v1=" and decode as hex or Base64. */
export function parseExpectedSignature(value: string, outBytes: number): { bytes: Uint8Array | null; format: 'hex' | 'base64' | 'unreadable' } {
  let s = value.trim();
  const stripe = s.match(/v1=([0-9a-fA-F]+)/);
  if (stripe && s.includes('t=')) s = stripe[1];
  s = s.replace(/^(sha1|sha256|sha384|sha512|v0|v1)=/i, '');
  const compact = s.replace(/\s+/g, '');
  if (/^[0-9a-fA-F]+$/.test(compact) && compact.length === outBytes * 2) {
    return { bytes: hexToBytes(compact), format: 'hex' };
  }
  try {
    const b = base64ToBytes(compact);
    if (b.length > 0) return { bytes: b, format: 'base64' };
  } catch {
    // fall through
  }
  if (/^[0-9a-fA-F]+$/.test(compact) && compact.length % 2 === 0) return { bytes: hexToBytes(compact), format: 'hex' };
  return { bytes: null, format: 'unreadable' };
}

export async function computeHmac(input: HmacInput): Promise<HmacResult> {
  const preset = input.preset ?? 'plain';
  // Every provider preset signs with HMAC-SHA256.
  const algorithm: HmacAlgorithm = preset === 'plain' ? input.algorithm : 'SHA-256';
  const sizes = HMAC_SIZES[algorithm];
  if (!sizes) throw new Error(`Unsupported algorithm ${algorithm}. Use SHA-1, SHA-256, SHA-384 or SHA-512.`);
  let key: Uint8Array;
  try {
    key = decodeBytes(input.key, input.keyEncoding);
  } catch (e) {
    throw new Error(`Key: ${(e as Error).message}`);
  }
  const timestamp = (input.timestamp ?? '').trim();
  let messageBytes: Uint8Array;
  let signedString: string | undefined;
  if (preset !== 'plain') {
    signedString = presetSigningString(preset, input.message, timestamp);
    messageBytes = utf8Encode(signedString);
  } else {
    try {
      messageBytes = decodeBytes(input.message, input.messageEncoding);
    } catch (e) {
      throw new Error(`Message: ${(e as Error).message}`);
    }
  }
  const mac = await hmacBytes(algorithm, key, messageBytes);
  const hex = bytesToHex(mac);
  let match: boolean | null = null;
  let expectedFormat: HmacResult['expectedFormat'];
  if (input.expected && input.expected.trim()) {
    const parsed = parseExpectedSignature(input.expected, sizes.outBytes);
    expectedFormat = parsed.format;
    match = parsed.bytes ? timingSafeEqual(parsed.bytes, mac) : false;
  }
  return {
    algorithm,
    hex,
    base64: bytesToBase64(mac),
    base64url: bytesToBase64Url(mac),
    bits: mac.length * 8,
    keyBytes: key.length,
    messageBytes: messageBytes.length,
    keyHashed: key.length > sizes.blockBytes,
    signedString,
    header: preset === 'plain' ? null : presetHeader(preset, hex, timestamp),
    match,
    expectedFormat,
  };
}
