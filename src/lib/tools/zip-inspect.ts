/**
 * Lists a ZIP archive — and the formats wearing a .zip under another name:
 * .jar, .war, .aar, .apk, .docx, .xlsx — from the central directory, the
 * authoritative index at the end of the file, without extracting anything.
 * Reports per-entry sizes and compression, the archive's total ratio,
 * suspicious shapes (absolute paths and ".." traversal names, the zip-bomb
 * smell of absurd compression ratios), and for JARs the parsed
 * META-INF/MANIFEST.MF (stored or deflated — a tiny spec-faithful inflate
 * is included for that one file).
 *
 * Reference: APPNOTE.TXT (PKWARE's .ZIP File Format Specification),
 * sections 4.3.16 (EOCD), 4.3.12 (central directory) and ZIP64 extensions.
 * Dependency-free on purpose: the CLI bundles it.
 */

export type ZipEntry = {
  name: string;
  compressedBytes: number;
  uncompressedBytes: number;
  method: string;
  encrypted: boolean;
  modified?: string;
  crc32: number;
};

export type ZipSummary = {
  kind: 'zip' | 'jar' | 'docx' | 'xlsx' | 'pptx' | 'apk';
  entryCount: number;
  totalCompressed: number;
  totalUncompressed: number;
  comment?: string;
  zip64: boolean;
  entries: ZipEntry[];
  directories: { prefix: string; count: number; bytes: number }[];
  manifest?: Record<string, string>;
  warnings: string[];
};

const METHODS: Record<number, string> = { 0: 'stored', 8: 'deflate', 9: 'deflate64', 12: 'bzip2', 14: 'lzma', 93: 'zstd', 99: 'AES' };

const dosDate = (time: number, date: number): string | undefined => {
  if (!date) return undefined;
  // DOS timestamps carry no zone, so the output must not claim one: build
  // in UTC purely to format, and print without a Z.
  const ms = Date.UTC(1980 + (date >> 9), ((date >> 5) & 15) - 1, date & 31, (time >> 11) & 31, (time >> 5) & 63, (time & 31) * 2);
  return Number.isNaN(ms) ? undefined : new Date(ms).toISOString().slice(0, 19);
};

export function inspectZip(bytes: Uint8Array): ZipSummary {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // EOCD: scan back for PK\x05\x06 within the max comment distance.
  let eocd = -1;
  const stop = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - 22; i >= stop; i--) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error('Not a ZIP archive: the end-of-central-directory record (PK\\x05\\x06) is missing.');

  let entryCount = v.getUint16(eocd + 10, true);
  let cdOffset = v.getUint32(eocd + 16, true);
  let cdSize = v.getUint32(eocd + 12, true);
  const commentLen = v.getUint16(eocd + 20, true);
  const comment = commentLen ? new TextDecoder().decode(bytes.subarray(eocd + 22, eocd + 22 + commentLen)) : undefined;

  // ZIP64: the locator sits just before the EOCD.
  let zip64 = false;
  const loc = eocd - 20;
  if (loc >= 0 && v.getUint32(loc, true) === 0x07064b50) {
    zip64 = true;
    const z64 = Number(v.getBigUint64(loc + 8, true));
    if (v.getUint32(z64, true) !== 0x06064b50) throw new Error('ZIP64 locator points at a missing record: the archive is truncated.');
    entryCount = Number(v.getBigUint64(z64 + 32, true));
    cdSize = Number(v.getBigUint64(z64 + 40, true));
    cdOffset = Number(v.getBigUint64(z64 + 48, true));
  }
  if (cdOffset + cdSize > bytes.length) throw new Error('Central directory runs past the end of the file: the archive is truncated.');

  const entries: ZipEntry[] = [];
  const warnings = new Set<string>();
  let p = cdOffset;
  for (let i = 0; i < entryCount; i++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error(`Central directory entry ${i} is corrupt (bad signature at ${p}).`);
    const flags = v.getUint16(p + 8, true);
    const method = v.getUint16(p + 10, true);
    const nameLen = v.getUint16(p + 28, true);
    const extraLen = v.getUint16(p + 30, true);
    const cmtLen = v.getUint16(p + 32, true);
    let compressed = v.getUint32(p + 20, true);
    let uncompressed = v.getUint32(p + 24, true);
    const utf8 = (flags & 0x800) !== 0;
    const name = new TextDecoder(utf8 ? 'utf-8' : 'latin1').decode(bytes.subarray(p + 46, p + 46 + nameLen));
    // ZIP64 extra field carries the real sizes when the 32-bit ones say -1.
    if (compressed === 0xffffffff || uncompressed === 0xffffffff) {
      let e = p + 46 + nameLen;
      const end = e + extraLen;
      while (e + 4 <= end) {
        const id = v.getUint16(e, true);
        const sz = v.getUint16(e + 2, true);
        if (id === 0x0001) {
          let q = e + 4;
          if (uncompressed === 0xffffffff) { uncompressed = Number(v.getBigUint64(q, true)); q += 8; }
          if (compressed === 0xffffffff) compressed = Number(v.getBigUint64(q, true));
        }
        e += 4 + sz;
      }
    }
    entries.push({
      name,
      compressedBytes: compressed,
      uncompressedBytes: uncompressed,
      method: METHODS[method] ?? `method#${method}`,
      encrypted: (flags & 1) !== 0,
      modified: dosDate(v.getUint16(p + 12, true), v.getUint16(p + 14, true)),
      crc32: v.getUint32(p + 16, true),
    });
    if (name.includes('..') && /(^|\/)\.\.(\/|$)/.test(name)) warnings.add(`Path traversal name: "${name}" — extracting this without checks escapes the target directory.`);
    if (name.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(name)) warnings.add(`Absolute path entry: "${name}".`);
    p += 46 + nameLen + extraLen + cmtLen;
  }

  const totalCompressed = entries.reduce((s, e) => s + e.compressedBytes, 0);
  const totalUncompressed = entries.reduce((s, e) => s + e.uncompressedBytes, 0);
  if (totalCompressed > 0 && totalUncompressed / totalCompressed > 200 && totalUncompressed > 50 * 1024 * 1024) {
    warnings.add(`Compression ratio ${Math.round(totalUncompressed / totalCompressed)}:1 across ${(totalUncompressed / 1024 ** 3).toFixed(1)} GiB claimed — the shape of a zip bomb.`);
  }

  const dirMap = new Map<string, { count: number; bytes: number }>();
  for (const e of entries) {
    if (e.name.endsWith('/')) continue;
    const prefix = e.name.includes('/') ? e.name.slice(0, e.name.indexOf('/') + 1) : '(root)';
    const d = dirMap.get(prefix) ?? { count: 0, bytes: 0 };
    d.count += 1;
    d.bytes += e.uncompressedBytes;
    dirMap.set(prefix, d);
  }

  const names = new Set(entries.map((e) => e.name));
  const kind: ZipSummary['kind'] = names.has('META-INF/MANIFEST.MF')
    ? 'jar'
    : names.has('AndroidManifest.xml')
      ? 'apk'
      : names.has('word/document.xml')
        ? 'docx'
        : names.has('xl/workbook.xml')
          ? 'xlsx'
          : names.has('ppt/presentation.xml')
            ? 'pptx'
            : 'zip';

  let manifest: Record<string, string> | undefined;
  if (kind === 'jar' || kind === 'apk') {
    const mf = readEntry(bytes, v, cdOffset, entryCount, 'META-INF/MANIFEST.MF');
    if (mf) {
      manifest = {};
      // Manifest continuation lines start with one space (JAR spec).
      for (const line of new TextDecoder().decode(mf).replace(/\r\n?/g, '\n').replace(/\n /g, '').split('\n')) {
        const c = line.indexOf(':');
        if (c > 0) manifest[line.slice(0, c).trim()] = line.slice(c + 1).trim();
      }
    }
  }

  return {
    kind,
    entryCount: entries.length,
    totalCompressed,
    totalUncompressed,
    comment,
    zip64,
    entries,
    directories: [...dirMap.entries()].map(([prefix, d]) => ({ prefix, ...d })).sort((a, b) => b.bytes - a.bytes),
    manifest,
    warnings: [...warnings],
  };
}

/** Reads one named entry via its local header; inflates when deflated. */
function readEntry(bytes: Uint8Array, v: DataView, cdOffset: number, count: number, wanted: string): Uint8Array | null {
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    const nameLen = v.getUint16(p + 28, true);
    const extraLen = v.getUint16(p + 30, true);
    const cmtLen = v.getUint16(p + 32, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    if (name === wanted) {
      const method = v.getUint16(p + 10, true);
      let compressed = v.getUint32(p + 20, true);
      let lho = v.getUint32(p + 42, true);
      // Past 4 GiB the 32-bit fields say -1 and the ZIP64 extra carries the
      // real values: sizes first, then the local-header offset.
      if (lho === 0xffffffff || compressed === 0xffffffff) {
        let e = p + 46 + nameLen;
        const extraEnd = e + extraLen;
        while (e + 4 <= extraEnd) {
          const id = v.getUint16(e, true);
          const sz = v.getUint16(e + 2, true);
          if (id === 0x0001) {
            let q = e + 4;
            if (v.getUint32(p + 24, true) === 0xffffffff) q += 8; // uncompressed
            if (compressed === 0xffffffff) { compressed = Number(v.getBigUint64(q, true)); q += 8; }
            if (lho === 0xffffffff) lho = Number(v.getBigUint64(q, true));
          }
          e += 4 + sz;
        }
      }
      if (v.getUint32(lho, true) !== 0x04034b50) return null;
      const lNameLen = v.getUint16(lho + 26, true);
      const lExtraLen = v.getUint16(lho + 28, true);
      const data = bytes.subarray(lho + 30 + lNameLen + lExtraLen, lho + 30 + lNameLen + lExtraLen + compressed);
      if (method === 0) return data;
      if (method === 8) return inflateRaw(data);
      return null;
    }
    p += 46 + nameLen + extraLen + cmtLen;
  }
  return null;
}

/**
 * Raw DEFLATE (RFC 1951), enough for a manifest: stored, fixed-Huffman and
 * dynamic-Huffman blocks. Small by design; the general extraction path is
 * not this tool's job.
 */
export function inflateRaw(src: Uint8Array): Uint8Array {
  const out: number[] = [];
  let bitPos = 0;
  const bit = (): number => {
    // Corrupt input must throw, not spin: past the end every read is junk
    // and a wrong Huffman walk can otherwise loop forever.
    if (bitPos >> 3 >= src.length) throw new Error('Deflated data ended mid-stream: the input is truncated or corrupt.');
    const b = (src[bitPos >> 3] >> (bitPos & 7)) & 1;
    bitPos += 1;
    return b;
  };
  const bitsLSB = (n: number): number => {
    let v = 0;
    for (let i = 0; i < n; i++) v |= bit() << i;
    return v;
  };
  type Tree = { counts: number[]; symbols: number[] };
  const build = (lengths: number[]): Tree => {
    const counts = new Array(16).fill(0);
    for (const l of lengths) counts[l] += 1;
    counts[0] = 0;
    const offs = new Array(16).fill(0);
    for (let i = 1; i < 16; i++) offs[i] = offs[i - 1] + counts[i - 1];
    const symbols = new Array(lengths.length).fill(0);
    lengths.forEach((l, sym) => { if (l) symbols[offs[l]++] = sym; });
    return { counts, symbols };
  };
  const decode = (t: Tree): number => {
    let code = 0;
    let first = 0;
    let index = 0;
    for (let len = 1; len < 16; len++) {
      code |= bit();
      const count = t.counts[len];
      if (code - first < count) return t.symbols[index + code - first];
      index += count;
      first = (first + count) << 1;
      code <<= 1;
    }
    throw new Error('Bad Huffman code in deflated data.');
  };
  const LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  const LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  const DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
  const DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
  let fixedL: Tree | null = null;
  let fixedD: Tree | null = null;
  for (;;) {
    const final = bit();
    const type = bitsLSB(2);
    if (type === 0) {
      bitPos = (bitPos + 7) & ~7;
      const q = bitPos >> 3;
      const len = src[q] | (src[q + 1] << 8);
      for (let i = 0; i < len; i++) out.push(src[q + 4 + i]);
      bitPos += (4 + len) * 8;
    } else {
      let lt: Tree;
      let dt: Tree;
      if (type === 1) {
        if (!fixedL) {
          const ll = new Array(288).fill(0).map((_, i) => (i < 144 ? 8 : i < 256 ? 9 : i < 280 ? 7 : 8));
          fixedL = build(ll);
          fixedD = build(new Array(30).fill(5));
        }
        lt = fixedL;
        dt = fixedD!;
      } else if (type === 2) {
        const hlit = bitsLSB(5) + 257;
        const hdist = bitsLSB(5) + 1;
        const hclen = bitsLSB(4) + 4;
        const ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
        const clens = new Array(19).fill(0);
        for (let i = 0; i < hclen; i++) clens[ORDER[i]] = bitsLSB(3);
        const ct = build(clens);
        const lens: number[] = [];
        while (lens.length < hlit + hdist) {
          const sym = decode(ct);
          if (sym < 16) lens.push(sym);
          else if (sym === 16) { const prev = lens[lens.length - 1]; const n = 3 + bitsLSB(2); for (let i = 0; i < n; i++) lens.push(prev); }
          else if (sym === 17) { const n = 3 + bitsLSB(3); for (let i = 0; i < n; i++) lens.push(0); }
          else { const n = 11 + bitsLSB(7); for (let i = 0; i < n; i++) lens.push(0); }
        }
        lt = build(lens.slice(0, hlit));
        dt = build(lens.slice(hlit));
      } else throw new Error('Deflate block type 3 is reserved.');
      for (;;) {
        const sym = decode(lt);
        if (sym === 256) break;
        if (sym < 256) out.push(sym);
        else {
          const li = sym - 257;
          const len = LBASE[li] + bitsLSB(LEXT[li]);
          const di = decode(dt);
          const dist = DBASE[di] + bitsLSB(DEXT[di]);
          const start = out.length - dist;
          for (let i = 0; i < len; i++) out.push(out[start + i]);
        }
      }
    }
    if (final) break;
  }
  return new Uint8Array(out);
}

const iec = (n: number): string => {
  if (n < 1024) return `${n} B`;
  const units = ['KiB', 'MiB', 'GiB'];
  let v = n;
  let u = -1;
  do { v /= 1024; u += 1; } while (v >= 1024 && u < units.length - 1);
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[u]}`;
};

export function renderZipSummary(z: ZipSummary): string {
  const ratio = z.totalCompressed ? (z.totalUncompressed / z.totalCompressed).toFixed(1) : '—';
  const lines = [
    `${z.kind.toUpperCase()}  ·  ${z.entryCount.toLocaleString('en-US')} entries  ·  ${iec(z.totalCompressed)} packed, ${iec(z.totalUncompressed)} unpacked (${ratio}:1)${z.zip64 ? '  ·  ZIP64' : ''}`,
  ];
  for (const w of z.warnings) lines.push(`WARNING: ${w}`);
  if (z.manifest) {
    lines.push('', 'manifest');
    for (const k of ['Manifest-Version', 'Main-Class', 'Implementation-Title', 'Implementation-Version', 'Built-By', 'Build-Jdk', 'Created-By']) {
      if (z.manifest[k]) lines.push(`  ${k}: ${z.manifest[k]}`);
    }
  }
  lines.push('', 'by top-level folder');
  for (const d of z.directories.slice(0, 10)) lines.push(`  ${iec(d.bytes).padStart(9)}  ${String(d.count).padStart(5)} files  ${d.prefix}`);
  lines.push('', 'largest entries');
  const biggest = [...z.entries].filter((e) => !e.name.endsWith('/')).sort((a, b) => b.uncompressedBytes - a.uncompressedBytes).slice(0, 8);
  for (const e of biggest) lines.push(`  ${iec(e.uncompressedBytes).padStart(9)}  ${e.method.padEnd(8)}  ${e.name}`);
  return lines.join('\n');
}
