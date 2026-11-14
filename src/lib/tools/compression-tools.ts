/**
 * Compression and encoding helpers shared by Compression Tools and the
 * Compression Comparison benchmark. Everything works on UTF-8 bytes and uses
 * real codecs: pako (gzip, zlib deflate), lz4js (LZ4 frame format) and a
 * Brotli implementation injected by the caller (brotli-wasm in the browser).
 */
import * as pako from 'pako';
import * as lz4 from 'lz4js';
import { msg } from '../msg';

type Vars = Record<string, string | number>;
const fill = (text: string, vars: Vars) => text.replace(/\{(\w+)\}/g, (all, k: string) => (k in vars ? String(vars[k]) : all));

/**
 * An error whose message is interface text: `source` (marked with msg()) and
 * `vars` let the page show it translated; `message` is the English text.
 */
export class CodecError extends Error {
  constructor(readonly source: string, readonly vars: Vars = {}) {
    super(fill(source, vars));
  }
}

export type CodecFormat = 'gzip' | 'deflate' | 'lz4' | 'brotli';
export type EncodingFormat = 'base64' | 'url' | 'hex';
export type CompressionFormat = CodecFormat | EncodingFormat;

export type BrotliCodec = {
  compress: (data: Uint8Array, options?: { quality?: number }) => Uint8Array;
  decompress: (data: Uint8Array) => Uint8Array;
};

export const CODEC_FORMATS: CodecFormat[] = ['gzip', 'deflate', 'lz4', 'brotli'];

let brotliPromise: Promise<BrotliCodec> | null = null;

/** Lazily loads brotli-wasm in the browser. Tests pass their own codec instead. */
export function loadBrotli(): Promise<BrotliCodec> {
  brotliPromise ??= import('brotli-wasm').then((m) => m.default as unknown as Promise<BrotliCodec>);
  return brotliPromise;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function base64ToBytes(input: string): Uint8Array {
  const clean = input.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (/[^A-Za-z0-9+/=]/.test(clean)) throw new CodecError(msg('Input is not valid Base64'));
  let bin: string;
  try {
    bin = atob(clean.padEnd(clean.length + ((4 - (clean.length % 4)) % 4), '='));
  } catch {
    throw new CodecError(msg('Input is not valid Base64'));
  }
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function hexToBytes(input: string): Uint8Array {
  const clean = input.replace(/\s+/g, '');
  if (/[^0-9a-fA-F]/.test(clean) || clean.length % 2 !== 0) throw new CodecError(msg('Input is not valid hex (it needs an even number of 0-9/a-f digits)'));
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

const utf8 = (b: Uint8Array) => new TextDecoder('utf-8', { fatal: true }).decode(b);

/** Raw codec on bytes. Level applies to gzip/deflate (1 to 9) and Brotli quality (0 to 11). */
export function compressBytes(data: Uint8Array, format: CodecFormat, brotli?: BrotliCodec, level?: number): Uint8Array {
  switch (format) {
    case 'gzip':
      return pako.gzip(data, level === undefined ? undefined : { level: level as pako.DeflateFunctionOptions['level'] });
    case 'deflate':
      return pako.deflate(data, level === undefined ? undefined : { level: level as pako.DeflateFunctionOptions['level'] });
    case 'lz4':
      return new Uint8Array(lz4.compress(data));
    case 'brotli':
      if (!brotli) throw new CodecError(msg('Brotli codec is not loaded'));
      return brotli.compress(data, level === undefined ? undefined : { quality: level });
  }
}

/** pako throws plain strings ("incorrect header check"); turn them into Errors the UI can show. */
function inflateOrThrow(run: () => Uint8Array, label: string): Uint8Array {
  try {
    return run();
  } catch (e) {
    throw new CodecError(msg('Input is not valid {label} data ({detail})'), { label, detail: e instanceof Error ? e.message : String(e) });
  }
}

/**
 * Walks an LZ4 frame's block headers (LZ4 frame format spec) and throws when the
 * data ends early; lz4js does not check this and fills the missing bytes with zeros.
 * lz4js also reads a block checksum from before the block instead of after it,
 * so frames with block checksums are returned without them.
 */
function normalizeLz4Frame(data: Uint8Array): Uint8Array {
  const u32 = (k: number) => (data[k] | (data[k + 1] << 8) | (data[k + 2] << 16) | (data[k + 3] << 24)) >>> 0;
  if (data.length < 7 || u32(0) !== 0x184d2204) throw new CodecError(msg('Input is not an LZ4 frame (missing the 04 22 4D 18 magic number)'));
  const flg = data[4];
  const blockSums = (flg & 0x10) !== 0;
  const headerEnd = 6 + (flg & 0x08 ? 8 : 0) + 1;
  const parts: Uint8Array[] = [data.slice(0, headerEnd)];
  let k = headerEnd;
  for (;;) {
    if (k + 4 > data.length) throw new CodecError(msg('LZ4 data is truncated'));
    const size = u32(k) & 0x7fffffff;
    const end = k + 4 + size;
    if (end + (size && blockSums ? 4 : 0) > data.length) throw new CodecError(msg('LZ4 data is truncated'));
    parts.push(data.subarray(k, end));
    if (size === 0) break;
    k = end + (blockSums ? 4 : 0);
  }
  if (flg & 0x04 && k + 8 > data.length) throw new CodecError(msg('LZ4 data is truncated'));
  if (!blockSums) return data;
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  out[4] = flg & ~0x10 & ~0x04; // no block or content checksums left to skip
  return out;
}

export function decompressBytes(data: Uint8Array, format: CodecFormat, brotli?: BrotliCodec): Uint8Array {
  switch (format) {
    case 'gzip':
      return inflateOrThrow(() => pako.ungzip(data), 'gzip');
    case 'deflate':
      return inflateOrThrow(() => pako.inflate(data), 'zlib deflate');
    case 'lz4':
      return new Uint8Array(lz4.decompress(normalizeLz4Frame(data)));
    case 'brotli':
      if (!brotli) throw new CodecError(msg('Brotli codec is not loaded'));
      return brotli.decompress(data);
  }
}

export type ProcessResult = {
  output: string;
  /** UTF-8 bytes going in. */
  inputBytes: number;
  /** Size of the result: compressed bytes for codecs, text bytes for encodings. */
  resultBytes: number;
};

/**
 * Compresses text. Codec output is binary, so it is shown as Base64; the
 * size comparison uses the binary length, not the longer Base64 text.
 */
export function compressText(text: string, format: CompressionFormat, brotli?: BrotliCodec): ProcessResult {
  const data = new TextEncoder().encode(text);
  if (format === 'base64' || format === 'url' || format === 'hex') {
    const output = format === 'base64'
      ? bytesToBase64(data)
      : format === 'url'
        ? encodeURIComponent(text)
        : Array.from(data, (b) => b.toString(16).padStart(2, '0')).join('');
    return { output, inputBytes: data.length, resultBytes: new TextEncoder().encode(output).length };
  }
  const compressed = compressBytes(data, format, brotli, format === 'brotli' ? 11 : undefined);
  return { output: bytesToBase64(compressed), inputBytes: data.length, resultBytes: compressed.length };
}

/** Reverses compressText: Base64 in, original UTF-8 text out. */
export function decompressText(input: string, format: CompressionFormat, brotli?: BrotliCodec): string {
  if (format === 'url') return decodeURIComponent(input);
  if (format === 'hex') return utf8(hexToBytes(input));
  const bytes = base64ToBytes(input);
  if (format === 'base64') return utf8(bytes);
  return utf8(decompressBytes(bytes, format, brotli));
}

/** Space saving as a percentage of the original: positive = smaller, negative = larger. */
export function spaceSavings(originalBytes: number, resultBytes: number): number {
  if (originalBytes <= 0) return 0;
  return ((originalBytes - resultBytes) / originalBytes) * 100;
}

/** Compression ratio in the conventional direction: original / compressed (3.2 means 3.2:1). */
export function compressionRatio(originalBytes: number, compressedBytes: number): number {
  if (compressedBytes <= 0) return 0;
  return originalBytes / compressedBytes;
}

/**
 * "62.5% smaller" or "33.3% larger", never a negative "reduced". A page passes
 * its `t` and number formatter to show it in its language.
 */
export function describeSizeChange(
  originalBytes: number,
  resultBytes: number,
  t: (source: string, vars?: Vars) => string = fill,
  num: (n: number) => string = (n) => n.toFixed(1),
): string {
  const s = spaceSavings(originalBytes, resultBytes);
  if (Math.abs(s) < 0.05) return t(msg('same size'), {});
  return s > 0 ? t(msg('{pct}% smaller'), { pct: num(s) }) : t(msg('{pct}% larger'), { pct: num(-s) });
}

/** Nearest-rank percentile (p in 0..100) of a list of timings. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[Math.min(rank, sorted.length) - 1];
}

export function summarize(values: number[], stat: 'average' | 'p50' | 'p95' | 'p99'): number {
  if (values.length === 0) return 0;
  if (stat === 'average') return values.reduce((a, b) => a + b, 0) / values.length;
  return percentile(values, Number(stat.slice(1)));
}
