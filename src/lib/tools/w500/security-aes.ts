/**
 * AES-GCM and AES-CBC text encryption with Web Crypto.
 *
 * Key sources:
 *  - password: PBKDF2-HMAC-SHA256 with a random 16-byte salt (iterations stated in the output)
 *  - raw key: 128, 192 or 256-bit key in hex or Base64
 *  - openssl: compatible with `openssl enc -aes-256-cbc -pbkdf2 -iter N -a`
 *
 * Output formats:
 *  - compact: Base64 of salt (password mode only) + IV + ciphertext (GCM includes the 16-byte tag at the end)
 *  - json: every parameter spelled out, so the bundle can be decrypted elsewhere
 *  - openssl: Base64 of "Salted__" + 8-byte salt + ciphertext
 */
import {
  base64ToBytes,
  bytesToBase64,
  bytesToHex,
  concatBytes,
  decodeBytes,
  randomBytes,
  toArrayBuffer,
  utf8Decode,
  utf8Encode,
} from './security-encoding';

export type AesMode = 'GCM' | 'CBC';
export type KeySource = 'password' | 'raw' | 'openssl';
export type OutputFormat = 'compact' | 'json';

/** OWASP Password Storage Cheat Sheet figure for PBKDF2-HMAC-SHA256. */
export const DEFAULT_PBKDF2_ITERATIONS = 600_000;
/** `openssl enc -pbkdf2` default when -iter is not given (OpenSSL 1.1.1 and 3.x). */
export const OPENSSL_DEFAULT_ITERATIONS = 10_000;
export const SALT_BYTES = 16;
export const IV_BYTES: Record<AesMode, number> = { GCM: 12, CBC: 16 };
export const GCM_TAG_BYTES = 16;

export type EncryptOptions = {
  mode: AesMode;
  source: KeySource;
  /** Password for password/openssl sources. */
  password?: string;
  /** Raw key as hex or Base64 for the raw source. */
  key?: string;
  keyEncoding?: 'hex' | 'base64';
  iterations?: number;
  format?: OutputFormat;
  /** Fixed salt / IV for tests and reproducible examples. Never reuse an IV with the same key in real use. */
  salt?: Uint8Array;
  iv?: Uint8Array;
};

export type EncryptResult = {
  output: string;
  saltHex: string | null;
  ivHex: string;
  ciphertextHex: string;
  tagHex: string | null;
  keyBits: number;
  iterations: number | null;
  layout: string;
};

export type AesBundle = {
  v: 1;
  alg: 'AES-GCM' | 'AES-CBC';
  kdf: 'PBKDF2-SHA256' | 'none';
  iter?: number;
  salt?: string;
  iv: string;
  ct: string;
};

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error('Web Crypto is not available. Use a current browser over HTTPS.');
  return s;
}

export async function pbkdf2Sha256(password: string, salt: Uint8Array, iterations: number, bytes: number): Promise<Uint8Array> {
  if (!Number.isInteger(iterations) || iterations < 1) throw new Error('Iterations must be a positive whole number.');
  const base = await subtle().importKey('raw', toArrayBuffer(utf8Encode(password)), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle().deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: toArrayBuffer(salt), iterations }, base, bytes * 8);
  return new Uint8Array(bits);
}

export function parseRawKey(key: string, encoding: 'hex' | 'base64'): Uint8Array {
  const bytes = decodeBytes(key.trim(), encoding);
  if (![16, 24, 32].includes(bytes.length)) {
    throw new Error(`An AES key must be 16, 24 or 32 bytes (128, 192 or 256 bits); this one is ${bytes.length} bytes.`);
  }
  return bytes;
}

export function generateKey(bits: 128 | 192 | 256 = 256): Uint8Array {
  return randomBytes(bits / 8);
}

async function importAesKey(raw: Uint8Array, mode: AesMode, usage: KeyUsage): Promise<CryptoKey> {
  try {
    return await subtle().importKey('raw', toArrayBuffer(raw), { name: `AES-${mode}` }, false, [usage]);
  } catch (e) {
    if (raw.length === 24) throw new Error('This browser does not support 192-bit AES keys in Web Crypto (Chrome and Edge refuse them). Use a 128 or 256-bit key.');
    throw e;
  }
}

async function aesEncrypt(mode: AesMode, key: CryptoKey, iv: Uint8Array, plaintext: Uint8Array): Promise<Uint8Array> {
  const params = mode === 'GCM' ? { name: 'AES-GCM', iv: toArrayBuffer(iv), tagLength: 128 } : { name: 'AES-CBC', iv: toArrayBuffer(iv) };
  return new Uint8Array(await subtle().encrypt(params, key, toArrayBuffer(plaintext)));
}

async function aesDecrypt(mode: AesMode, key: CryptoKey, iv: Uint8Array, ciphertext: Uint8Array): Promise<Uint8Array> {
  const params = mode === 'GCM' ? { name: 'AES-GCM', iv: toArrayBuffer(iv), tagLength: 128 } : { name: 'AES-CBC', iv: toArrayBuffer(iv) };
  try {
    return new Uint8Array(await subtle().decrypt(params, key, toArrayBuffer(ciphertext)));
  } catch {
    throw new Error(mode === 'GCM'
      ? 'Decryption failed: the authentication tag does not match. The password or key is wrong, a setting differs, or the data was changed.'
      : 'Decryption failed: the padding is invalid. The password or key is wrong or a setting differs.');
  }
}

/** OpenSSL `enc -pbkdf2`: PBKDF2-SHA256 produces key || IV in one call. */
async function opensslKeyIv(password: string, salt: Uint8Array, iterations: number, keyBytes = 32): Promise<{ key: Uint8Array; iv: Uint8Array }> {
  const kiv = await pbkdf2Sha256(password, salt, iterations, keyBytes + 16);
  return { key: kiv.slice(0, keyBytes), iv: kiv.slice(keyBytes) };
}

const OPENSSL_MAGIC = utf8Encode('Salted__');

export async function encryptText(plaintext: string, opts: EncryptOptions): Promise<EncryptResult> {
  const data = utf8Encode(plaintext);
  if (opts.source === 'openssl') {
    if (!opts.password) throw new Error('Enter a password.');
    const iterations = opts.iterations ?? OPENSSL_DEFAULT_ITERATIONS;
    const salt = opts.salt ?? randomBytes(8);
    if (salt.length !== 8) throw new Error('OpenSSL uses an 8-byte salt.');
    const { key, iv } = await opensslKeyIv(opts.password, salt, iterations);
    const ct = await aesEncrypt('CBC', await importAesKey(key, 'CBC', 'encrypt'), iv, data);
    return {
      output: bytesToBase64(concatBytes(OPENSSL_MAGIC, salt, ct)),
      saltHex: bytesToHex(salt),
      ivHex: bytesToHex(iv),
      ciphertextHex: bytesToHex(ct),
      tagHex: null,
      keyBits: 256,
      iterations,
      layout: '"Salted__" (8 bytes) + salt (8) + AES-256-CBC ciphertext; key and IV both come from PBKDF2-SHA256',
    };
  }

  const mode = opts.mode;
  const iv = opts.iv ?? randomBytes(IV_BYTES[mode]);
  if (iv.length !== IV_BYTES[mode]) throw new Error(`AES-${mode} needs a ${IV_BYTES[mode]}-byte IV.`);
  let keyBytes: Uint8Array;
  let salt: Uint8Array | null = null;
  let iterations: number | null = null;
  if (opts.source === 'password') {
    if (!opts.password) throw new Error('Enter a password.');
    iterations = opts.iterations ?? DEFAULT_PBKDF2_ITERATIONS;
    salt = opts.salt ?? randomBytes(SALT_BYTES);
    keyBytes = await pbkdf2Sha256(opts.password, salt, iterations, 32);
  } else {
    keyBytes = parseRawKey(opts.key ?? '', opts.keyEncoding ?? 'hex');
  }
  const ct = await aesEncrypt(mode, await importAesKey(keyBytes, mode, 'encrypt'), iv, data);
  const format = opts.format ?? 'compact';
  let output: string;
  if (format === 'json') {
    const bundle: AesBundle = {
      v: 1,
      alg: mode === 'GCM' ? 'AES-GCM' : 'AES-CBC',
      kdf: salt ? 'PBKDF2-SHA256' : 'none',
      ...(salt ? { iter: iterations ?? undefined, salt: bytesToBase64(salt) } : {}),
      iv: bytesToBase64(iv),
      ct: bytesToBase64(ct),
    };
    output = JSON.stringify(bundle);
  } else {
    output = bytesToBase64(salt ? concatBytes(salt, iv, ct) : concatBytes(iv, ct));
  }
  const tag = mode === 'GCM' ? ct.slice(ct.length - GCM_TAG_BYTES) : null;
  const body = mode === 'GCM' ? ct.slice(0, ct.length - GCM_TAG_BYTES) : ct;
  const parts = [salt ? `salt (${SALT_BYTES} bytes)` : null, `IV (${IV_BYTES[mode]})`, mode === 'GCM' ? 'ciphertext + 16-byte tag' : 'ciphertext (PKCS#7 padded)'].filter(Boolean);
  return {
    output,
    saltHex: salt ? bytesToHex(salt) : null,
    ivHex: bytesToHex(iv),
    ciphertextHex: bytesToHex(body),
    tagHex: tag ? bytesToHex(tag) : null,
    keyBits: keyBytes.length * 8,
    iterations,
    layout: format === 'json' ? 'JSON with Base64 fields' : `Base64 of ${parts.join(' + ')}`,
  };
}

export type DecryptOptions = Omit<EncryptOptions, 'format' | 'salt' | 'iv'>;

export async function decryptText(input: string, opts: DecryptOptions): Promise<string> {
  const text = input.trim();
  if (!text) throw new Error('Paste the encrypted text first.');

  if (text.startsWith('{')) {
    let bundle: AesBundle;
    try {
      bundle = JSON.parse(text);
    } catch {
      throw new Error('The JSON bundle could not be parsed.');
    }
    if (!bundle || typeof bundle !== 'object' || typeof bundle.iv !== 'string' || typeof bundle.ct !== 'string') {
      throw new Error('The JSON bundle needs "iv" and "ct" fields in Base64.');
    }
    const mode: AesMode = bundle.alg === 'AES-CBC' ? 'CBC' : 'GCM';
    const iv = base64ToBytes(bundle.iv);
    const ct = base64ToBytes(bundle.ct);
    let key: Uint8Array;
    if (bundle.kdf === 'PBKDF2-SHA256') {
      if (!opts.password) throw new Error('This bundle was encrypted with a password. Enter it.');
      key = await pbkdf2Sha256(opts.password, base64ToBytes(bundle.salt ?? ''), bundle.iter ?? DEFAULT_PBKDF2_ITERATIONS, 32);
    } else {
      key = parseRawKey(opts.key ?? '', opts.keyEncoding ?? 'hex');
    }
    return utf8OrError(await aesDecrypt(mode, await importAesKey(key, mode, 'decrypt'), iv, ct));
  }

  let raw: Uint8Array;
  try {
    raw = base64ToBytes(text);
  } catch {
    throw new Error('The input is not Base64. Paste the whole output, including any trailing = signs.');
  }

  const isOpenssl = raw.length >= 16 && OPENSSL_MAGIC.every((b, i) => raw[i] === b);
  if (opts.source === 'openssl' || isOpenssl) {
    if (!isOpenssl) throw new Error('OpenSSL output starts with "U2FsdGVkX1" (Base64 of "Salted__"). This input does not.');
    if (!opts.password) throw new Error('Enter the password used with openssl enc.');
    const salt = raw.slice(8, 16);
    const { key, iv } = await opensslKeyIv(opts.password, salt, opts.iterations ?? OPENSSL_DEFAULT_ITERATIONS);
    return utf8OrError(await aesDecrypt('CBC', await importAesKey(key, 'CBC', 'decrypt'), iv, raw.slice(16)));
  }

  const mode = opts.mode;
  const ivLen = IV_BYTES[mode];
  if (opts.source === 'password') {
    if (!opts.password) throw new Error('Enter the password.');
    const min = SALT_BYTES + ivLen + (mode === 'GCM' ? GCM_TAG_BYTES : 16);
    if (raw.length < min) throw new Error(`Too short for AES-${mode} with a password: expected at least ${min} bytes, got ${raw.length}.`);
    const salt = raw.slice(0, SALT_BYTES);
    const iv = raw.slice(SALT_BYTES, SALT_BYTES + ivLen);
    const key = await pbkdf2Sha256(opts.password, salt, opts.iterations ?? DEFAULT_PBKDF2_ITERATIONS, 32);
    return utf8OrError(await aesDecrypt(mode, await importAesKey(key, mode, 'decrypt'), iv, raw.slice(SALT_BYTES + ivLen)));
  }
  const key = parseRawKey(opts.key ?? '', opts.keyEncoding ?? 'hex');
  const min = ivLen + (mode === 'GCM' ? GCM_TAG_BYTES : 16);
  if (raw.length < min) throw new Error(`Too short for AES-${mode}: expected at least ${min} bytes, got ${raw.length}.`);
  return utf8OrError(await aesDecrypt(mode, await importAesKey(key, mode, 'decrypt'), raw.slice(0, ivLen), raw.slice(ivLen)));
}

function utf8OrError(bytes: Uint8Array): string {
  try {
    return utf8Decode(bytes);
  } catch {
    throw new Error('Decrypted, but the result is not UTF-8 text. It may be binary data or the wrong settings.');
  }
}

/** Raw AES block primitives, exposed for known-answer tests against NIST vectors. */
export async function aesEncryptRaw(mode: AesMode, key: Uint8Array, iv: Uint8Array, plaintext: Uint8Array): Promise<Uint8Array> {
  return aesEncrypt(mode, await importAesKey(key, mode, 'encrypt'), iv, plaintext);
}

export async function aesDecryptRaw(mode: AesMode, key: Uint8Array, iv: Uint8Array, ciphertext: Uint8Array): Promise<Uint8Array> {
  return aesDecrypt(mode, await importAesKey(key, mode, 'decrypt'), iv, ciphertext);
}
