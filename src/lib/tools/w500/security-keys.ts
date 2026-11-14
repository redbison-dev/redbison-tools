/**
 * RSA, ECDSA and Ed25519 key pairs generated with Web Crypto and exported as
 * PEM (PKCS#8 / SPKI), JWK and OpenSSH (public key line and the
 * openssh-key-v1 private key file described in OpenSSH's PROTOCOL.key).
 */
import { base64ToBytes, bytesToBase64, concatBytes, randomBytes, toArrayBuffer, utf8Encode } from './security-encoding';

export type KeyType = 'RSA' | 'ECDSA' | 'Ed25519';
export type RsaBits = 2048 | 3072 | 4096;
export type EcCurve = 'P-256' | 'P-384' | 'P-521';
export type RsaUse = 'RSASSA-PKCS1-v1_5' | 'RSA-PSS' | 'RSA-OAEP';

export type KeySpec = {
  type: KeyType;
  rsaBits?: RsaBits;
  rsaUse?: RsaUse;
  rsaHash?: 'SHA-256' | 'SHA-384' | 'SHA-512';
  curve?: EcCurve;
  comment?: string;
};

export type KeyPairOutput = {
  type: KeyType;
  label: string;
  privatePem: string;
  publicPem: string;
  privateJwk: JsonWebKey;
  publicJwk: JsonWebKey;
  /** One line for authorized_keys, or null when the key use has no SSH equivalent (RSA-OAEP). */
  sshPublic: string | null;
  /** openssh-key-v1 file (unencrypted), or null when not applicable. */
  sshPrivate: string | null;
  /** "SHA256:..." as printed by ssh-keygen -l. */
  sshFingerprint: string | null;
  /** RFC 7638 JWK thumbprint (SHA-256, Base64url). */
  jwkThumbprint: string;
  securityBits: number;
};

const SSH_CURVE: Record<EcCurve, { name: string; id: string; hash: 'SHA-256' | 'SHA-384' | 'SHA-512'; coord: number; bits: number }> = {
  'P-256': { name: 'ecdsa-sha2-nistp256', id: 'nistp256', hash: 'SHA-256', coord: 32, bits: 128 },
  'P-384': { name: 'ecdsa-sha2-nistp384', id: 'nistp384', hash: 'SHA-384', coord: 48, bits: 192 },
  'P-521': { name: 'ecdsa-sha2-nistp521', id: 'nistp521', hash: 'SHA-512', coord: 66, bits: 256 },
};

/** NIST SP 800-57 Part 1 comparable security strength for RSA moduli. */
export function rsaSecurityBits(bits: number): number {
  if (bits >= 15360) return 256;
  if (bits >= 7680) return 192;
  if (bits >= 3072) return 128;
  if (bits >= 2048) return 112;
  return 80;
}

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error('Web Crypto is not available. Use a current browser over HTTPS.');
  return s;
}

export function pemWrap(label: string, der: Uint8Array): string {
  const b64 = bytesToBase64(der);
  const lines = b64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----\n`;
}

export function pemUnwrap(pem: string): { label: string; der: Uint8Array } {
  const m = pem.match(/-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/);
  if (!m) throw new Error('No PEM block found.');
  return { label: m[1], der: base64ToBytes(m[2]) };
}

/* ---- SSH wire encoding (RFC 4251 section 5) ---- */

function u32(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
}

export function sshString(data: Uint8Array | string): Uint8Array {
  const bytes = typeof data === 'string' ? utf8Encode(data) : data;
  return concatBytes(u32(bytes.length), bytes);
}

/** mpint: two's complement big-endian, minimal length, with a leading zero when the top bit is set. */
export function sshMpint(unsigned: Uint8Array): Uint8Array {
  let i = 0;
  while (i < unsigned.length && unsigned[i] === 0) i++;
  let body = unsigned.slice(i);
  if (body.length > 0 && body[0] & 0x80) body = concatBytes(new Uint8Array([0]), body);
  return sshString(body);
}

const b64u = (s: string | undefined): Uint8Array => {
  if (!s) throw new Error('The exported JWK is missing a field.');
  return base64ToBytes(s);
};

export function sshPublicBlob(jwk: JsonWebKey): Uint8Array {
  if (jwk.kty === 'RSA') return concatBytes(sshString('ssh-rsa'), sshMpint(b64u(jwk.e)), sshMpint(b64u(jwk.n)));
  if (jwk.kty === 'EC') {
    const c = SSH_CURVE[jwk.crv as EcCurve];
    if (!c) throw new Error(`Unsupported curve ${jwk.crv}.`);
    const q = concatBytes(new Uint8Array([4]), b64u(jwk.x), b64u(jwk.y));
    return concatBytes(sshString(c.name), sshString(c.id), sshString(q));
  }
  if (jwk.kty === 'OKP' && jwk.crv === 'Ed25519') return concatBytes(sshString('ssh-ed25519'), sshString(b64u(jwk.x)));
  throw new Error('This key type has no OpenSSH form.');
}

function sshKeyName(jwk: JsonWebKey): string {
  if (jwk.kty === 'RSA') return 'ssh-rsa';
  if (jwk.kty === 'EC') return SSH_CURVE[jwk.crv as EcCurve].name;
  return 'ssh-ed25519';
}

export function sshPublicLine(jwk: JsonWebKey, comment = ''): string {
  // Build the blob first: it rejects key types and curves that have no OpenSSH name.
  const blob = sshPublicBlob(jwk);
  const line = `${sshKeyName(jwk)} ${bytesToBase64(blob)}`;
  return comment.trim() ? `${line} ${comment.trim()}` : line;
}

export async function sshFingerprint(jwk: JsonWebKey): Promise<string> {
  const digest = new Uint8Array(await subtle().digest('SHA-256', toArrayBuffer(sshPublicBlob(jwk))));
  return `SHA256:${bytesToBase64(digest).replace(/=+$/, '')}`;
}

/** Unencrypted openssh-key-v1 private key file, the format ssh-keygen writes by default. */
export function sshPrivateKeyFile(jwk: JsonWebKey, comment = '', checkInt?: number): string {
  let keyFields: Uint8Array;
  if (jwk.kty === 'RSA') {
    keyFields = concatBytes(
      sshString('ssh-rsa'),
      sshMpint(b64u(jwk.n)), sshMpint(b64u(jwk.e)), sshMpint(b64u(jwk.d)),
      sshMpint(b64u(jwk.qi)), sshMpint(b64u(jwk.p)), sshMpint(b64u(jwk.q)),
    );
  } else if (jwk.kty === 'EC') {
    const c = SSH_CURVE[jwk.crv as EcCurve];
    if (!c) throw new Error(`Unsupported curve ${jwk.crv}.`);
    const q = concatBytes(new Uint8Array([4]), b64u(jwk.x), b64u(jwk.y));
    keyFields = concatBytes(sshString(c.name), sshString(c.id), sshString(q), sshMpint(b64u(jwk.d)));
  } else if (jwk.kty === 'OKP' && jwk.crv === 'Ed25519') {
    const pub = b64u(jwk.x);
    keyFields = concatBytes(sshString('ssh-ed25519'), sshString(pub), sshString(concatBytes(b64u(jwk.d), pub)));
  } else {
    throw new Error('This key type has no OpenSSH form.');
  }
  const check = checkInt ?? new DataView(toArrayBuffer(randomBytes(4))).getUint32(0);
  let priv = concatBytes(u32(check), u32(check), keyFields, sshString(comment));
  const padLen = (8 - (priv.length % 8)) % 8;
  const pad = new Uint8Array(padLen);
  for (let i = 0; i < padLen; i++) pad[i] = i + 1;
  priv = concatBytes(priv, pad);
  const file = concatBytes(
    utf8Encode('openssh-key-v1\0'),
    sshString('none'), sshString('none'), sshString(new Uint8Array(0)),
    u32(1),
    sshString(sshPublicBlob(jwk)),
    sshString(priv),
  );
  const lines = bytesToBase64(file).match(/.{1,70}/g) ?? [];
  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${lines.join('\n')}\n-----END OPENSSH PRIVATE KEY-----\n`;
}

/** RFC 7638 thumbprint over the required members in lexicographic order. */
export async function jwkThumbprint(jwk: JsonWebKey): Promise<string> {
  let canonical: string;
  if (jwk.kty === 'RSA') canonical = JSON.stringify({ e: jwk.e, kty: 'RSA', n: jwk.n });
  else if (jwk.kty === 'EC') canonical = JSON.stringify({ crv: jwk.crv, kty: 'EC', x: jwk.x, y: jwk.y });
  else if (jwk.kty === 'OKP') canonical = JSON.stringify({ crv: jwk.crv, kty: 'OKP', x: jwk.x });
  else throw new Error(`No thumbprint for key type ${jwk.kty}.`);
  const digest = new Uint8Array(await subtle().digest('SHA-256', toArrayBuffer(utf8Encode(canonical))));
  return bytesToBase64(digest).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function algorithmFor(spec: KeySpec): { params: RsaHashedKeyGenParams | EcKeyGenParams | Algorithm; usages: KeyUsage[]; label: string; securityBits: number } {
  if (spec.type === 'RSA') {
    const bits = spec.rsaBits ?? 2048;
    const use = spec.rsaUse ?? 'RSASSA-PKCS1-v1_5';
    const hash = spec.rsaHash ?? 'SHA-256';
    return {
      params: { name: use, modulusLength: bits, publicExponent: new Uint8Array([1, 0, 1]), hash },
      usages: use === 'RSA-OAEP' ? ['encrypt', 'decrypt'] : ['sign', 'verify'],
      label: `RSA ${bits}-bit (${use}, ${hash})`,
      securityBits: rsaSecurityBits(bits),
    };
  }
  if (spec.type === 'ECDSA') {
    const curve = spec.curve ?? 'P-256';
    return { params: { name: 'ECDSA', namedCurve: curve }, usages: ['sign', 'verify'], label: `ECDSA ${curve}`, securityBits: SSH_CURVE[curve].bits };
  }
  return { params: { name: 'Ed25519' }, usages: ['sign', 'verify'], label: 'Ed25519', securityBits: 128 };
}

/** Feature test: Ed25519 shipped in Chrome 137, Firefox 129 and Safari 17. */
export async function supportsEd25519(): Promise<boolean> {
  try {
    await subtle().generateKey({ name: 'Ed25519' }, false, ['sign', 'verify']);
    return true;
  } catch {
    return false;
  }
}

export async function generateKeyPair(spec: KeySpec): Promise<KeyPairOutput> {
  const { params, usages, label, securityBits } = algorithmFor(spec);
  let pair: CryptoKeyPair;
  try {
    pair = (await subtle().generateKey(params, true, usages)) as CryptoKeyPair;
  } catch (e) {
    if (spec.type === 'Ed25519') throw new Error('This browser cannot generate Ed25519 keys with Web Crypto. Update the browser or choose ECDSA P-256.');
    throw e;
  }
  return exportKeyPair(pair, spec, label, securityBits);
}

export async function exportKeyPair(pair: CryptoKeyPair, spec: KeySpec, label: string, securityBits: number): Promise<KeyPairOutput> {
  const s = subtle();
  const pkcs8 = new Uint8Array(await s.exportKey('pkcs8', pair.privateKey));
  const spki = new Uint8Array(await s.exportKey('spki', pair.publicKey));
  const privateJwk = await s.exportKey('jwk', pair.privateKey);
  const publicJwk = await s.exportKey('jwk', pair.publicKey);
  const comment = spec.comment ?? '';
  const sshCapable = !(spec.type === 'RSA' && spec.rsaUse === 'RSA-OAEP');
  return {
    type: spec.type,
    label,
    privatePem: pemWrap('PRIVATE KEY', pkcs8),
    publicPem: pemWrap('PUBLIC KEY', spki),
    privateJwk,
    publicJwk,
    sshPublic: sshCapable ? sshPublicLine(publicJwk, comment) : null,
    sshPrivate: sshCapable ? sshPrivateKeyFile(privateJwk, comment) : null,
    sshFingerprint: sshCapable ? await sshFingerprint(publicJwk) : null,
    jwkThumbprint: await jwkThumbprint(publicJwk),
    securityBits,
  };
}
