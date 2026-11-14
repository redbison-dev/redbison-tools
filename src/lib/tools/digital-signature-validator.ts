/**
 * Real signature verification with the Web Crypto API: RSA PKCS#1 v1.5,
 * RSA-PSS, ECDSA (DER or raw r||s) and Ed25519. Accepts the public key as an
 * SPKI PEM, an X.509 certificate or a JWK.
 */
import { jwkThumbprint, parseJwkInput, pkcs1PublicToSpki, publicPart } from './jwk-tool';
import { base64ToBytes, decodePemBlocks, parseCertificateDer, parseDer, parseSpki, type PublicKeyInfo } from './x509-parser';
import { msg } from '../msg';

/**
 * An error whose English message comes from a msg()-marked source with
 * `{placeholders}`, so the page can show it translated: t(err.source, err.vars).
 */
export class SignatureError extends Error {
  constructor(readonly source: string, readonly vars?: Record<string, string | number>) {
    super(vars ? source.replace(/\{(\w+)\}/g, (all, k: string) => (vars[k] === undefined ? all : String(vars[k]))) : source);
  }
}

export type SignatureAlgorithm =
  | 'auto'
  | 'RS256' | 'RS384' | 'RS512' | 'RS1'
  | 'PS256' | 'PS384' | 'PS512'
  | 'ES256' | 'ES384' | 'ES512'
  | 'Ed25519';

export const SIGNATURE_ALGORITHMS: { value: SignatureAlgorithm; label: string }[] = [
  { value: 'auto', label: msg('Auto-detect from key') },
  { value: 'RS256', label: 'RSA PKCS#1 v1.5 + SHA-256 (RS256)' },
  { value: 'RS384', label: 'RSA PKCS#1 v1.5 + SHA-384 (RS384)' },
  { value: 'RS512', label: 'RSA PKCS#1 v1.5 + SHA-512 (RS512)' },
  { value: 'RS1', label: msg('RSA PKCS#1 v1.5 + SHA-1 (legacy)') },
  { value: 'PS256', label: 'RSA-PSS + SHA-256 (PS256)' },
  { value: 'PS384', label: 'RSA-PSS + SHA-384 (PS384)' },
  { value: 'PS512', label: 'RSA-PSS + SHA-512 (PS512)' },
  { value: 'ES256', label: 'ECDSA P-256 + SHA-256 (ES256)' },
  { value: 'ES384', label: 'ECDSA P-384 + SHA-384 (ES384)' },
  { value: 'ES512', label: 'ECDSA P-521 + SHA-512 (ES512)' },
  { value: 'Ed25519', label: 'Ed25519 (EdDSA)' },
];

const HASH: Record<string, string> = { '1': 'SHA-1', '256': 'SHA-256', '384': 'SHA-384', '512': 'SHA-512' };
const HASH_BYTES: Record<string, number> = { 'SHA-1': 20, 'SHA-256': 32, 'SHA-384': 48, 'SHA-512': 64 };
const CURVE_SIZE: Record<string, number> = { 'P-256': 32, 'P-384': 48, 'P-521': 66 };

export type SignatureEncoding = 'hex' | 'base64' | 'base64url';

export function decodeSignature(text: string): { bytes: Uint8Array; encoding: SignatureEncoding } {
  const s = text.trim().replace(/\s+/g, '');
  if (!s) throw new SignatureError(msg('Signature is empty'));
  const hex = s.replace(/:/g, '');
  if (/^[0-9a-fA-F]+$/.test(hex) && hex.length % 2 === 0 && (s.includes(':') || hex.length >= 64)) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return { bytes, encoding: 'hex' };
  }
  try {
    return { bytes: base64ToBytes(s), encoding: /[-_]/.test(s) ? 'base64url' : 'base64' };
  } catch {
    throw new SignatureError(msg('Signature is not valid Base64, Base64url or hex'));
  }
}

export interface LoadedKey {
  spki: Uint8Array;
  info: PublicKeyInfo;
  source: string;
  thumbprint?: string;
}

export async function loadPublicKey(text: string): Promise<LoadedKey> {
  const t = text.trim();
  if (!t) throw new SignatureError(msg('Public key is empty'));
  if (t.startsWith('{')) {
    const jwk = publicPart(parseJwkInput(t)[0]);
    const params: AlgorithmIdentifier | EcKeyImportParams | RsaHashedImportParams =
      jwk.kty === 'RSA' ? { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' } : jwk.kty === 'EC' ? { name: 'ECDSA', namedCurve: String(jwk.crv) } : { name: String(jwk.crv) };
    const key = await crypto.subtle.importKey('jwk', jwk as JsonWebKey, params, true, ['verify']);
    const spki = new Uint8Array(await crypto.subtle.exportKey('spki', key));
    return { spki, info: parseSpki(parseDer(spki)), source: 'JWK', thumbprint: await jwkThumbprint(jwk) };
  }
  const blocks = decodePemBlocks(t);
  if (!blocks.length) throw new SignatureError(msg('Public key must be PEM ({pem} or {cert}) or a JWK'), { pem: '-----BEGIN PUBLIC KEY-----', cert: 'CERTIFICATE' });
  const b = blocks[0];
  if (b.label === 'PUBLIC KEY') return { spki: b.der, info: parseSpki(parseDer(b.der)), source: 'PUBLIC KEY' };
  if (b.label === 'RSA PUBLIC KEY') {
    const spki = pkcs1PublicToSpki(b.der);
    return { spki, info: parseSpki(parseDer(spki)), source: 'RSA PUBLIC KEY' };
  }
  if (b.label === 'CERTIFICATE') {
    const cert = parseCertificateDer(b.der);
    return { spki: cert.publicKey.spki, info: cert.publicKey, source: `CERTIFICATE (${cert.subjectString})` };
  }
  if (b.label.includes('PRIVATE KEY')) throw new SignatureError(msg('That is a private key. Verification needs the public key only; never paste private keys into web pages.'));
  throw new SignatureError(msg('Unsupported PEM type "{label}"'), { label: b.label });
}

/** Convert a DER ECDSA-Sig-Value (SEQUENCE { r, s }) to the IEEE P1363 r||s form Web Crypto expects. */
export function ecdsaDerToRaw(der: Uint8Array, size: number): Uint8Array {
  const node = parseDer(der);
  if (node.tag !== 0x30 || node.children.length !== 2) throw new SignatureError(msg('Not a DER ECDSA signature'));
  const out = new Uint8Array(size * 2);
  node.children.forEach((int, i) => {
    let v = int.value;
    while (v.length > size && v[0] === 0) v = v.subarray(1);
    if (v.length > size) throw new SignatureError(msg('ECDSA integer too large for curve'));
    out.set(v, i * size + (size - v.length));
  });
  return out;
}

function candidates(info: PublicKeyInfo, chosen: SignatureAlgorithm): SignatureAlgorithm[] {
  const family = info.algorithm === 'RSA' ? 'RSA' : info.algorithm === 'EC' ? 'EC' : info.algorithm === 'Ed25519' ? 'Ed25519' : '';
  if (!family) throw new SignatureError(msg('Keys of type {algorithm} are not supported for verification'), { algorithm: info.algorithm });
  if (chosen !== 'auto') {
    const ok = (family === 'RSA' && /^(RS|PS)/.test(chosen)) || (family === 'EC' && chosen.startsWith('ES')) || (family === 'Ed25519' && chosen === 'Ed25519');
    if (!ok) throw new SignatureError(msg('{chosen} does not match the {key} public key'), { chosen, key: `${info.algorithm}${info.curve ? ` ${info.curve}` : ''}` });
    return [chosen];
  }
  if (family === 'RSA') return ['RS256', 'RS384', 'RS512', 'PS256', 'PS384', 'PS512', 'RS1'];
  if (family === 'Ed25519') return ['Ed25519'];
  const preferred: Record<string, SignatureAlgorithm> = { 'P-256': 'ES256', 'P-384': 'ES384', 'P-521': 'ES512' };
  const first = preferred[info.curve ?? ''];
  if (!first) throw new SignatureError(msg('Unsupported EC curve {curve}'), { curve: info.curve ?? '' });
  return [first, ...(['ES256', 'ES384', 'ES512'] as SignatureAlgorithm[]).filter((a) => a !== first)];
}

async function verifyOne(alg: SignatureAlgorithm, info: PublicKeyInfo, spki: Uint8Array, sig: Uint8Array, data: Uint8Array): Promise<boolean> {
  if (alg === 'Ed25519') {
    const key = await crypto.subtle.importKey('spki', spki as BufferSource, { name: 'Ed25519' }, false, ['verify']);
    return crypto.subtle.verify({ name: 'Ed25519' }, key, sig as BufferSource, data as BufferSource);
  }
  const hash = HASH[alg.slice(2)];
  if (alg.startsWith('RS')) {
    const key = await crypto.subtle.importKey('spki', spki as BufferSource, { name: 'RSASSA-PKCS1-v1_5', hash }, false, ['verify']);
    return crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, key, sig as BufferSource, data as BufferSource);
  }
  if (alg.startsWith('PS')) {
    const key = await crypto.subtle.importKey('spki', spki as BufferSource, { name: 'RSA-PSS', hash }, false, ['verify']);
    const hLen = HASH_BYTES[hash];
    const emLen = Math.ceil(((info.keySize ?? 2048) - 1) / 8);
    // Salt = hash length is the common default (RFC 8017, JWA PS*); also try the maximum salt.
    for (const saltLength of [hLen, emLen - hLen - 2]) {
      if (saltLength < 0) continue;
      if (await crypto.subtle.verify({ name: 'RSA-PSS', saltLength }, key, sig as BufferSource, data as BufferSource)) return true;
    }
    return false;
  }
  const curve = info.curve ?? 'P-256';
  const size = CURVE_SIZE[curve];
  const raw = sig.length === size * 2 ? sig : sig[0] === 0x30 ? ecdsaDerToRaw(sig, size) : sig;
  const key = await crypto.subtle.importKey('spki', spki as BufferSource, { name: 'ECDSA', namedCurve: curve }, false, ['verify']);
  return crypto.subtle.verify({ name: 'ECDSA', hash }, key, raw as BufferSource, data as BufferSource);
}

export interface VerificationResult {
  valid: boolean;
  matchedAlgorithm?: SignatureAlgorithm;
  tried: SignatureAlgorithm[];
  key: LoadedKey;
  signatureEncoding: SignatureEncoding;
  signatureBytes: number;
  messageBytes: number;
}

export async function verifySignature(opts: {
  message: string | Uint8Array;
  signature: string;
  publicKey: string;
  algorithm?: SignatureAlgorithm;
}): Promise<VerificationResult> {
  const key = await loadPublicKey(opts.publicKey);
  const { bytes: sig, encoding } = decodeSignature(opts.signature);
  const data = typeof opts.message === 'string' ? new TextEncoder().encode(opts.message) : opts.message;
  const list = candidates(key.info, opts.algorithm ?? 'auto');
  const tried: SignatureAlgorithm[] = [];
  for (const alg of list) {
    tried.push(alg);
    try {
      if (await verifyOne(alg, key.info, key.spki, sig, data)) {
        return { valid: true, matchedAlgorithm: alg, tried, key, signatureEncoding: encoding, signatureBytes: sig.length, messageBytes: data.length };
      }
    } catch {
      // A malformed signature for this algorithm simply does not verify.
    }
  }
  return { valid: false, tried, key, signatureEncoding: encoding, signatureBytes: sig.length, messageBytes: data.length };
}
