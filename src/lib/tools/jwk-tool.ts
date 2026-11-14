/**
 * JWK (RFC 7517) <-> PEM conversion, key generation and RFC 7638 thumbprints,
 * built on the Web Crypto API. Everything runs locally.
 */
import {
  bytesToBase64Url,
  concatBytes,
  decodeOid,
  decodePemBlocks,
  encodeDer,
  encodeOid,
  encodePem,
  OID_NAMES,
  parseCertificateDer,
  parseDer,
  parseSpki,
} from './x509-parser';
import { msg } from '../msg';

/** An input error with its English template and values, so the page can show it translated. */
export class JwkError extends Error {
  constructor(readonly text: string, readonly vars: Record<string, string> = {}) {
    super(text.replace(/\{(\w+)\}/g, (all, k: string) => vars[k] ?? all));
  }
}

export type JsonWebKeyLike = JsonWebKey & { kid?: string; [k: string]: unknown };

export type GenerateAlgorithm = 'RS256' | 'PS256' | 'ES256' | 'ES384' | 'EdDSA';

const RSA_OID = '1.2.840.113549.1.1.1';
const EC_OID = '1.2.840.10045.2.1';
const CURVE_OIDS: Record<string, string> = { 'P-256': '1.2.840.10045.3.1.7', 'P-384': '1.3.132.0.34', 'P-521': '1.3.132.0.35' };

/** Members that RFC 7638 section 3.2 requires for each key type, in lexicographic order. */
const THUMBPRINT_MEMBERS: Record<string, string[]> = {
  RSA: ['e', 'kty', 'n'],
  EC: ['crv', 'kty', 'x', 'y'],
  OKP: ['crv', 'kty', 'x'],
  oct: ['k', 'kty'],
};

const PUBLIC_MEMBERS: Record<string, string[]> = {
  RSA: ['kty', 'n', 'e'],
  EC: ['kty', 'crv', 'x', 'y'],
  OKP: ['kty', 'crv', 'x'],
};

/** RFC 7638 JWK thumbprint: SHA-256 over the canonical JSON of the required members, base64url. */
export async function jwkThumbprint(jwk: JsonWebKeyLike, hash: 'SHA-256' | 'SHA-384' | 'SHA-512' = 'SHA-256'): Promise<string> {
  const kty = String(jwk.kty ?? '');
  const members = THUMBPRINT_MEMBERS[kty];
  if (!members) throw new JwkError(msg('Unsupported kty "{kty}" for a thumbprint'), { kty: String(kty) });
  const canonical: Record<string, unknown> = {};
  for (const m of members) {
    if (typeof jwk[m] !== 'string') throw new JwkError(msg('JWK is missing required member "{member}"'), { member: m });
    canonical[m] = jwk[m];
  }
  const digest = await crypto.subtle.digest(hash, new TextEncoder().encode(JSON.stringify(canonical)));
  return bytesToBase64Url(new Uint8Array(digest));
}

export function isPrivateJwk(jwk: JsonWebKeyLike): boolean {
  return typeof jwk.d === 'string' || typeof jwk.k === 'string';
}

export function publicPart(jwk: JsonWebKeyLike): JsonWebKeyLike {
  const members = PUBLIC_MEMBERS[String(jwk.kty)];
  if (!members) throw new JwkError(msg('Unsupported kty "{kty}"'), { kty: String(jwk.kty) });
  const out: JsonWebKeyLike = {};
  for (const m of members) {
    if (typeof jwk[m] !== 'string') throw new JwkError(msg('JWK is missing required member "{member}"'), { member: m });
    out[m] = jwk[m];
  }
  return out;
}

function importParams(jwk: JsonWebKeyLike): { algorithm: AlgorithmIdentifier | RsaHashedImportParams | EcKeyImportParams; pubUsages: KeyUsage[]; privUsages: KeyUsage[] } {
  switch (jwk.kty) {
    case 'RSA':
      // The hash only matters for signing; SPKI/PKCS#8 export is identical for any RSA algorithm.
      return { algorithm: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, pubUsages: ['verify'], privUsages: ['sign'] };
    case 'EC':
      if (!CURVE_OIDS[String(jwk.crv)]) throw new JwkError(msg('Unsupported EC curve "{curve}". Web Crypto supports P-256, P-384 and P-521.'), { curve: String(jwk.crv) });
      return { algorithm: { name: 'ECDSA', namedCurve: String(jwk.crv) }, pubUsages: ['verify'], privUsages: ['sign'] };
    case 'OKP':
      if (jwk.crv === 'Ed25519') return { algorithm: { name: 'Ed25519' }, pubUsages: ['verify'], privUsages: ['sign'] };
      if (jwk.crv === 'X25519') return { algorithm: { name: 'X25519' }, pubUsages: [], privUsages: ['deriveBits'] };
      throw new JwkError(msg('Unsupported OKP curve "{curve}"'), { curve: String(jwk.crv) });
    case 'oct':
      throw new JwkError(msg('Symmetric (oct) keys have no PEM form. Only RSA, EC and OKP keys can be converted.'));
    default:
      throw new JwkError(msg('Unsupported or missing kty "{kty}"'), { kty: String(jwk.kty) });
  }
}

/** Strip members that make Web Crypto reject an otherwise valid key (alg/use/key_ops mismatch). */
function forImport(jwk: JsonWebKeyLike): JsonWebKey {
  const { alg: _alg, use: _use, key_ops: _ops, ext: _ext, kid: _kid, x5c: _x5c, x5t: _x5t, ...rest } = jwk as Record<string, unknown>;
  return rest as JsonWebKey;
}

export interface JwkToPemResult {
  publicPem: string;
  privatePem?: string;
  thumbprint: string;
  kty: string;
}

export async function jwkToPem(jwk: JsonWebKeyLike): Promise<JwkToPemResult> {
  const { algorithm, pubUsages, privUsages } = importParams(jwk);
  const pub = publicPart(jwk);
  const pubKey = await crypto.subtle.importKey('jwk', forImport(pub), algorithm, true, pubUsages);
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pubKey));
  const result: JwkToPemResult = { publicPem: encodePem('PUBLIC KEY', spki), thumbprint: await jwkThumbprint(jwk), kty: String(jwk.kty) };
  if (isPrivateJwk(jwk)) {
    const privKey = await crypto.subtle.importKey('jwk', forImport(jwk), algorithm, true, privUsages);
    result.privatePem = encodePem('PRIVATE KEY', new Uint8Array(await crypto.subtle.exportKey('pkcs8', privKey)));
  }
  return result;
}

/** Parse JWK JSON. A JWK Set ({"keys": [...]}) returns every key. */
export function parseJwkInput(text: string): JsonWebKeyLike[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new JwkError(msg('Input is not valid JSON. Paste a JWK object or a JWK Set.'));
  }
  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { keys?: unknown }).keys)) {
    const keys = (parsed as { keys: JsonWebKeyLike[] }).keys;
    if (!keys.length) throw new JwkError(msg('The JWK Set has no keys'));
    return keys;
  }
  if (!parsed || typeof parsed !== 'object' || !('kty' in parsed)) throw new JwkError(msg('Invalid JWK: missing "kty"'));
  return [parsed as JsonWebKeyLike];
}

function algorithmForSpki(spki: Uint8Array): { algorithm: AlgorithmIdentifier | EcKeyImportParams | RsaHashedImportParams; usages: KeyUsage[]; label: string } {
  const info = parseSpki(parseDer(spki));
  switch (info.algorithm) {
    case 'RSA':
      return { algorithm: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, usages: ['verify'], label: 'RSA' };
    case 'EC':
      if (!info.curve || !CURVE_OIDS[info.curve]) throw new JwkError(msg('Unsupported EC curve {curve}. Web Crypto supports P-256, P-384 and P-521.'), { curve: info.curve ?? '' });
      return { algorithm: { name: 'ECDSA', namedCurve: info.curve }, usages: ['verify'], label: `EC ${info.curve}` };
    case 'Ed25519':
      return { algorithm: { name: 'Ed25519' }, usages: ['verify'], label: 'Ed25519' };
    case 'X25519':
      return { algorithm: { name: 'X25519' }, usages: [], label: 'X25519' };
    default:
      throw new JwkError(msg('Unsupported key algorithm {algorithm}'), { algorithm: String(info.algorithm) });
  }
}

/** Wrap a PKCS#1 RSAPublicKey in a SubjectPublicKeyInfo. */
export function pkcs1PublicToSpki(pkcs1: Uint8Array): Uint8Array {
  const algId = encodeDer(0x30, concatBytes(encodeOid(RSA_OID), new Uint8Array([0x05, 0x00])));
  const bits = encodeDer(0x03, concatBytes(new Uint8Array([0]), pkcs1));
  return encodeDer(0x30, concatBytes(algId, bits));
}

/** Wrap a PKCS#1 RSAPrivateKey in PKCS#8 PrivateKeyInfo. */
export function pkcs1PrivateToPkcs8(pkcs1: Uint8Array): Uint8Array {
  const algId = encodeDer(0x30, concatBytes(encodeOid(RSA_OID), new Uint8Array([0x05, 0x00])));
  return encodeDer(0x30, concatBytes(new Uint8Array([0x02, 0x01, 0x00]), algId, encodeDer(0x04, pkcs1)));
}

/** Wrap a SEC1 ECPrivateKey (BEGIN EC PRIVATE KEY) in PKCS#8, taking the curve from its [0] parameters. */
export function sec1ToPkcs8(sec1: Uint8Array): { pkcs8: Uint8Array; curve: string } {
  const node = parseDer(sec1);
  const params = node.children.find((c) => c.tag === 0xa0);
  if (!params?.children[0]) throw new JwkError(msg('EC private key has no curve parameters'));
  const curveOid = decodeOid(params.children[0].value);
  const curve = OID_NAMES[curveOid] ?? curveOid;
  const algId = encodeDer(0x30, concatBytes(encodeOid(EC_OID), encodeOid(curveOid)));
  return { pkcs8: encodeDer(0x30, concatBytes(new Uint8Array([0x02, 0x01, 0x00]), algId, encodeDer(0x04, sec1))), curve };
}

function pkcs8Algorithm(pkcs8: Uint8Array): { algorithm: AlgorithmIdentifier | EcKeyImportParams | RsaHashedImportParams; usages: KeyUsage[] } {
  const node = parseDer(pkcs8);
  const algId = node.children[1];
  if (node.tag !== 0x30 || algId?.tag !== 0x30 || algId.children[0]?.tag !== 0x06) throw new JwkError(msg('Not a PKCS#8 private key: the algorithm identifier is missing'));
  const oid = decodeOid(algId.children[0].value);
  const name = OID_NAMES[oid];
  if (name === 'RSA') return { algorithm: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, usages: ['sign'] };
  if (name === 'EC') {
    const curve = OID_NAMES[decodeOid(algId.children[1]?.value ?? new Uint8Array())];
    if (!curve || !CURVE_OIDS[curve]) throw new JwkError(msg('Unsupported EC curve. Web Crypto supports P-256, P-384 and P-521.'));
    return { algorithm: { name: 'ECDSA', namedCurve: curve }, usages: ['sign'] };
  }
  if (name === 'Ed25519') return { algorithm: { name: 'Ed25519' }, usages: ['sign'] };
  if (name === 'X25519') return { algorithm: { name: 'X25519' }, usages: ['deriveBits'] };
  throw new JwkError(msg('Unsupported private key algorithm {algorithm}'), { algorithm: String(name ?? oid) });
}

function cleanJwk(jwk: JsonWebKey): JsonWebKeyLike {
  const { key_ops: _ops, ext: _ext, alg: _alg, ...rest } = jwk as Record<string, unknown>;
  return rest as JsonWebKeyLike;
}

export interface PemToJwkResult {
  label: string;
  keyType: string;
  publicJwk: JsonWebKeyLike;
  privateJwk?: JsonWebKeyLike;
  thumbprint: string;
}

/** Convert the first key-bearing PEM block (public key, private key or certificate) to JWK. */
export async function pemToJwk(pem: string): Promise<PemToJwkResult> {
  const blocks = decodePemBlocks(pem);
  if (!blocks.length) throw new JwkError(msg('No PEM block found. Expected -----BEGIN PUBLIC KEY----- or similar.'));
  const block = blocks[0];
  let spki: Uint8Array | undefined;
  let pkcs8: Uint8Array | undefined;
  switch (block.label) {
    case 'PUBLIC KEY':
      spki = block.der;
      break;
    case 'RSA PUBLIC KEY':
      spki = pkcs1PublicToSpki(block.der);
      break;
    case 'CERTIFICATE':
      spki = parseCertificateDer(block.der).publicKey.spki;
      break;
    case 'PRIVATE KEY':
      pkcs8 = block.der;
      break;
    case 'RSA PRIVATE KEY':
      pkcs8 = pkcs1PrivateToPkcs8(block.der);
      break;
    case 'EC PRIVATE KEY':
      pkcs8 = sec1ToPkcs8(block.der).pkcs8;
      break;
    case 'ENCRYPTED PRIVATE KEY':
      throw new JwkError(msg('Encrypted private keys are not supported. Decrypt it first: openssl pkey -in key.pem -out plain.pem'));
    default:
      throw new JwkError(msg('Unsupported PEM type "{type}"'), { type: block.label });
  }

  if (spki) {
    const { algorithm, usages, label } = algorithmForSpki(spki);
    const key = await crypto.subtle.importKey('spki', spki as BufferSource, algorithm, true, usages);
    const publicJwk = cleanJwk(await crypto.subtle.exportKey('jwk', key));
    const thumbprint = await jwkThumbprint(publicJwk);
    return { label: block.label, keyType: label, publicJwk: { ...publicJwk, kid: thumbprint }, thumbprint };
  }
  const { algorithm, usages } = pkcs8Algorithm(pkcs8!);
  const key = await crypto.subtle.importKey('pkcs8', pkcs8! as BufferSource, algorithm, true, usages);
  const privateJwk = cleanJwk(await crypto.subtle.exportKey('jwk', key));
  const publicJwk = publicPart(privateJwk);
  const thumbprint = await jwkThumbprint(publicJwk);
  const keyType = privateJwk.kty === 'RSA' ? 'RSA' : `${privateJwk.kty} ${String(privateJwk.crv)}`;
  return { label: block.label, keyType, publicJwk: { ...publicJwk, kid: thumbprint }, privateJwk: { ...privateJwk, kid: thumbprint }, thumbprint };
}

export interface GeneratedKeyPair {
  publicJwk: JsonWebKeyLike;
  privateJwk: JsonWebKeyLike;
  publicPem: string;
  privatePem: string;
  thumbprint: string;
}

/** Generate a signing key pair; kid is set to the RFC 7638 thumbprint. */
export async function generateKeyPair(alg: GenerateAlgorithm): Promise<GeneratedKeyPair> {
  let params: RsaHashedKeyGenParams | EcKeyGenParams | AlgorithmIdentifier;
  switch (alg) {
    case 'RS256':
      params = { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };
      break;
    case 'PS256':
      params = { name: 'RSA-PSS', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };
      break;
    case 'ES256':
      params = { name: 'ECDSA', namedCurve: 'P-256' };
      break;
    case 'ES384':
      params = { name: 'ECDSA', namedCurve: 'P-384' };
      break;
    case 'EdDSA':
      params = { name: 'Ed25519' };
      break;
    default:
      throw new JwkError(msg('Unsupported algorithm "{algorithm}". Use RS256, PS256, ES256, ES384 or EdDSA.'), { algorithm: String(alg) });
  }
  const pair = (await crypto.subtle.generateKey(params, true, ['sign', 'verify'])) as CryptoKeyPair;
  const pubJwk = cleanJwk(await crypto.subtle.exportKey('jwk', pair.publicKey));
  const privJwk = cleanJwk(await crypto.subtle.exportKey('jwk', pair.privateKey));
  const thumbprint = await jwkThumbprint(pubJwk);
  const meta = { use: 'sig', alg, kid: thumbprint };
  return {
    publicJwk: { ...pubJwk, ...meta },
    privateJwk: { ...privJwk, ...meta },
    publicPem: encodePem('PUBLIC KEY', new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey))),
    privatePem: encodePem('PRIVATE KEY', new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey))),
    thumbprint,
  };
}
