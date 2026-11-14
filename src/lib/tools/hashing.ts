import MD5 from 'crypto-js/md5';
import RIPEMD160 from 'crypto-js/ripemd160';
import { msg } from '../msg';

/**
 * Hash algorithms offered by the Hash Generator. The original seven keep
 * their existing implementations for text (Web Crypto for SHA, crypto-js
 * for MD5 and RIPEMD-160, the CRC32 loop below). Everything else, and all
 * file hashing, uses hash-wasm, which is loaded on demand so it never
 * reaches the main bundle.
 */
export type HashAlgorithm =
  | 'MD5' | 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512' | 'CRC32' | 'RIPEMD-160'
  | 'MD4' | 'SHA-224'
  | 'SHA3-224' | 'SHA3-256' | 'SHA3-384' | 'SHA3-512' | 'Keccak-256'
  | 'BLAKE2b-512' | 'BLAKE2s-256' | 'BLAKE3' | 'Whirlpool' | 'SM3'
  | 'CRC32C' | 'Adler-32' | 'xxHash64' | 'XXH3-64';

export type HashFamily = 'Common' | 'SHA-3 and Keccak' | 'Modern and regional' | 'Checksums (not cryptographic)' | 'Legacy';

export interface HashAlgorithmInfo {
  value: HashAlgorithm;
  label: string;
  bits: number;
  family: HashFamily;
  description: string;
}

export const HASH_ALGORITHMS: HashAlgorithmInfo[] = [
  { value: 'SHA-256', label: 'SHA-256', bits: 256, family: msg('Common'), description: msg('256-bit SHA-2 (recommended default)') },
  { value: 'SHA-512', label: 'SHA-512', bits: 512, family: msg('Common'), description: msg('512-bit SHA-2, fast on 64-bit CPUs') },
  { value: 'SHA-384', label: 'SHA-384', bits: 384, family: msg('Common'), description: msg('384-bit truncated SHA-512') },
  { value: 'SHA-224', label: 'SHA-224', bits: 224, family: msg('Common'), description: msg('224-bit truncated SHA-256') },
  { value: 'MD5', label: 'MD5', bits: 128, family: msg('Common'), description: msg('128-bit (broken for security, fine as a checksum)') },
  { value: 'SHA-1', label: 'SHA-1', bits: 160, family: msg('Common'), description: msg('160-bit (broken for security)') },
  { value: 'SHA3-224', label: 'SHA3-224', bits: 224, family: msg('SHA-3 and Keccak'), description: msg('224-bit SHA-3 (FIPS 202)') },
  { value: 'SHA3-256', label: 'SHA3-256', bits: 256, family: msg('SHA-3 and Keccak'), description: msg('256-bit SHA-3 (FIPS 202)') },
  { value: 'SHA3-384', label: 'SHA3-384', bits: 384, family: msg('SHA-3 and Keccak'), description: msg('384-bit SHA-3 (FIPS 202)') },
  { value: 'SHA3-512', label: 'SHA3-512', bits: 512, family: msg('SHA-3 and Keccak'), description: msg('512-bit SHA-3 (FIPS 202)') },
  { value: 'Keccak-256', label: 'Keccak-256', bits: 256, family: msg('SHA-3 and Keccak'), description: msg('Original Keccak padding, as used by Ethereum') },
  { value: 'BLAKE3', label: 'BLAKE3', bits: 256, family: msg('Modern and regional'), description: msg('256-bit, very fast, tree-hashed') },
  { value: 'BLAKE2b-512', label: 'BLAKE2b', bits: 512, family: msg('Modern and regional'), description: msg('512-bit BLAKE2b (RFC 7693)') },
  { value: 'BLAKE2s-256', label: 'BLAKE2s', bits: 256, family: msg('Modern and regional'), description: msg('256-bit BLAKE2s for 32-bit platforms') },
  { value: 'SM3', label: 'SM3', bits: 256, family: msg('Modern and regional'), description: msg('256-bit Chinese national standard (GB/T 32905)') },
  { value: 'Whirlpool', label: 'Whirlpool', bits: 512, family: msg('Modern and regional'), description: msg('512-bit ISO/IEC 10118-3 hash') },
  { value: 'RIPEMD-160', label: 'RIPEMD-160', bits: 160, family: msg('Modern and regional'), description: msg('160-bit, used in Bitcoin addresses') },
  { value: 'CRC32', label: 'CRC32', bits: 32, family: msg('Checksums (not cryptographic)'), description: msg('32-bit checksum used by ZIP, gzip and PNG') },
  { value: 'CRC32C', label: 'CRC32C', bits: 32, family: msg('Checksums (not cryptographic)'), description: msg('Castagnoli CRC used by iSCSI, ext4 and SCTP') },
  { value: 'Adler-32', label: 'Adler-32', bits: 32, family: msg('Checksums (not cryptographic)'), description: msg('zlib stream checksum') },
  { value: 'xxHash64', label: 'xxHash64', bits: 64, family: msg('Checksums (not cryptographic)'), description: msg('Fast 64-bit non-cryptographic hash (seed 0)') },
  { value: 'XXH3-64', label: 'XXH3 (64-bit)', bits: 64, family: msg('Checksums (not cryptographic)'), description: msg('xxHash3, 64-bit output (seed 0)') },
  { value: 'MD4', label: 'MD4', bits: 128, family: msg('Legacy'), description: msg('128-bit, broken; still seen in NTLM and eDonkey') },
];

const LEGACY_TEXT = new Set(['MD5', 'SHA-1', 'SHA-256', 'SHA-384', 'SHA-512', 'CRC32', 'RIPEMD-160']);

interface Hasher {
  init(): Hasher;
  update(data: Uint8Array | string): Hasher;
  digest(outputType?: 'hex'): string;
}

/** Create a streaming hash-wasm hasher for any supported algorithm. */
export async function createHasher(algorithm: HashAlgorithm): Promise<Hasher> {
  const h = await import('hash-wasm');
  switch (algorithm) {
    case 'MD4': return h.createMD4();
    case 'MD5': return h.createMD5();
    case 'SHA-1': return h.createSHA1();
    case 'SHA-224': return h.createSHA224();
    case 'SHA-256': return h.createSHA256();
    case 'SHA-384': return h.createSHA384();
    case 'SHA-512': return h.createSHA512();
    case 'SHA3-224': return h.createSHA3(224);
    case 'SHA3-256': return h.createSHA3(256);
    case 'SHA3-384': return h.createSHA3(384);
    case 'SHA3-512': return h.createSHA3(512);
    case 'Keccak-256': return h.createKeccak(256);
    case 'RIPEMD-160': return h.createRIPEMD160();
    case 'Whirlpool': return h.createWhirlpool();
    case 'BLAKE2b-512': return h.createBLAKE2b(512);
    case 'BLAKE2s-256': return h.createBLAKE2s(256);
    case 'BLAKE3': return h.createBLAKE3(256);
    case 'SM3': return h.createSM3();
    case 'CRC32': return h.createCRC32();
    // Castagnoli polynomial, reversed form.
    case 'CRC32C': return h.createCRC32(0x82f63b78);
    case 'Adler-32': return h.createAdler32();
    case 'xxHash64': return h.createXXHash64();
    case 'XXH3-64': return h.createXXHash3();
    default: throw new Error('Unsupported hash algorithm');
  }
}

export async function hashBytes(bytes: Uint8Array, algorithm: HashAlgorithm): Promise<string> {
  const hasher = await createHasher(algorithm);
  return hasher.init().update(bytes).digest('hex');
}

function crc32(bytes: Uint8Array): string {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0');
}

/** Hash the UTF-8 bytes of a string and return lower-case hex. */
export async function hashText(text: string, algorithm: string): Promise<string> {
  if (!LEGACY_TEXT.has(algorithm)) {
    if (!HASH_ALGORITHMS.some((a) => a.value === algorithm)) throw new Error('Unsupported hash algorithm');
    return hashBytes(new TextEncoder().encode(text), algorithm as HashAlgorithm);
  }
  if (algorithm === 'MD5') return MD5(text).toString();
  if (algorithm === 'RIPEMD-160') return RIPEMD160(text).toString();
  const bytes = new TextEncoder().encode(text);
  if (algorithm === 'CRC32') return crc32(bytes);
  const result = await crypto.subtle.digest(algorithm, bytes);
  return Array.from(new Uint8Array(result), byte => byte.toString(16).padStart(2, '0')).join('');
}

export const FILE_CHUNK_BYTES = 4 * 1024 * 1024;

/**
 * Hash a File or Blob in 4 MB slices so large files never sit in memory
 * twice. Several algorithms share one read of the file.
 */
export async function hashBlob(
  blob: Blob,
  algorithms: HashAlgorithm[],
  onProgress?: (fraction: number) => void,
): Promise<Record<string, string>> {
  const hashers = await Promise.all(algorithms.map(async (a) => [a, (await createHasher(a)).init()] as const));
  for (let offset = 0; offset < blob.size; offset += FILE_CHUNK_BYTES) {
    const chunk = new Uint8Array(await blob.slice(offset, offset + FILE_CHUNK_BYTES).arrayBuffer());
    for (const [, h] of hashers) h.update(chunk);
    onProgress?.(Math.min(1, (offset + chunk.length) / blob.size));
  }
  if (blob.size === 0) onProgress?.(1);
  return Object.fromEntries(hashers.map(([a, h]) => [a, h.digest('hex')]));
}
