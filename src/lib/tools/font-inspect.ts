/**
 * Inspects an OpenType/TrueType font (.ttf, .otf, and .ttc collections):
 * the family/style/version/copyright strings from the name table, glyph
 * count, units per em, the OS/2 weight/width class, embedding permissions
 * (fsType — the bits foundries actually enforce), supported scripts via
 * cmap coverage counts, and the per-table byte layout.
 *
 * Read straight from the OpenType specification (Microsoft typography
 * docs): the offset table, and the name, head, maxp, OS/2 and cmap tables.
 * WOFF/WOFF2 are compressed wrappers and are named as such rather than
 * half-parsed. Dependency-free on purpose: the CLI bundles it.
 */

export type FontNames = Partial<Record<'family' | 'subfamily' | 'fullName' | 'version' | 'postScriptName' | 'copyright' | 'trademark' | 'manufacturer' | 'designer' | 'license', string>>;

export type FontFace = {
  flavor: 'TrueType glyphs' | 'CFF (PostScript) glyphs';
  names: FontNames;
  glyphCount: number;
  unitsPerEm: number;
  created?: string;
  modified?: string;
  weightClass?: number;
  weightName?: string;
  widthClass?: number;
  italic: boolean;
  bold: boolean;
  embedding?: string;
  /** Mapped character count from the best cmap subtable. */
  mappedChars?: number;
  tables: { tag: string; bytes: number }[];
};

export type FontSummary = { kind: 'font' | 'collection'; fileBytes: number; faces: FontFace[] };

const WEIGHTS: Record<number, string> = { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' };

export function inspectFont(bytes: Uint8Array): FontSummary {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 12) throw new Error('Too short to be a font file.');
  const tag = v.getUint32(0);
  if (tag === 0x774f4646) throw new Error('A WOFF file: a compressed wrapper around a font. Decompress to TTF/OTF first (this reads the raw tables).');
  if (tag === 0x774f4632) throw new Error('A WOFF2 file: Brotli-compressed; decompress to TTF/OTF first.');
  if (tag === 0x74746366) {
    // 'ttcf' collection
    const count = v.getUint32(8);
    if (count > 64) throw new Error('Collection claims more than 64 fonts: corrupt header.');
    const faces: FontFace[] = [];
    for (let i = 0; i < count; i++) faces.push(face(bytes, v, v.getUint32(12 + i * 4)));
    return { kind: 'collection', fileBytes: bytes.length, faces };
  }
  if (tag !== 0x00010000 && tag !== 0x4f54544f && tag !== 0x74727565) {
    throw new Error('Not an OpenType/TrueType font: the sfnt version is none of 0x00010000, "OTTO" or "true".');
  }
  return { kind: 'font', fileBytes: bytes.length, faces: [face(bytes, v, 0)] };
}

function face(b: Uint8Array, v: DataView, off: number): FontFace {
  const sfnt = v.getUint32(off);
  const numTables = v.getUint16(off + 4);
  const tables = new Map<string, { offset: number; bytes: number }>();
  const list: { tag: string; bytes: number }[] = [];
  for (let i = 0; i < numTables; i++) {
    const o = off + 12 + i * 16;
    const tag = new TextDecoder().decode(b.subarray(o, o + 4));
    const rec = { offset: v.getUint32(o + 8), bytes: v.getUint32(o + 12) };
    tables.set(tag, rec);
    list.push({ tag, bytes: rec.bytes });
  }

  const names: FontNames = {};
  const name = tables.get('name');
  if (name) {
    const n = name.offset;
    const count = v.getUint16(n + 2);
    const strOff = n + v.getUint16(n + 4);
    const WANT: Record<number, keyof FontNames> = { 0: 'copyright', 1: 'family', 2: 'subfamily', 4: 'fullName', 5: 'version', 6: 'postScriptName', 7: 'trademark', 8: 'manufacturer', 9: 'designer', 13: 'license' };
    for (let i = 0; i < count; i++) {
      const r = n + 6 + i * 12;
      const platform = v.getUint16(r);
      const nameId = v.getUint16(r + 6);
      const len = v.getUint16(r + 8);
      const so = strOff + v.getUint16(r + 10);
      const key = WANT[nameId];
      if (!key) continue;
      // Prefer Windows Unicode (platform 3) strings; fall back to Mac Roman.
      const text = platform === 3 || platform === 0
        ? new TextDecoder('utf-16be').decode(b.subarray(so, so + len))
        : new TextDecoder('latin1').decode(b.subarray(so, so + len));
      if (!names[key] || platform === 3) names[key] = text;
    }
  }

  let unitsPerEm = 0;
  let created: string | undefined;
  let modified: string | undefined;
  let bold = false;
  let italic = false;
  const head = tables.get('head');
  if (head) {
    unitsPerEm = v.getUint16(head.offset + 18);
    const EPOCH = Date.UTC(1904, 0, 1);
    const toDate = (o: number): string | undefined => {
      const secs = Number(v.getBigUint64(o));
      if (!secs) return undefined;
      const d = new Date(EPOCH + secs * 1000);
      return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
    };
    created = toDate(head.offset + 20);
    modified = toDate(head.offset + 28);
    const macStyle = v.getUint16(head.offset + 44);
    bold = (macStyle & 1) !== 0;
    italic = (macStyle & 2) !== 0;
  }

  const maxp = tables.get('maxp');
  const glyphCount = maxp ? v.getUint16(maxp.offset + 4) : 0;

  let weightClass: number | undefined;
  let widthClass: number | undefined;
  let embedding: string | undefined;
  const os2 = tables.get('OS/2');
  if (os2) {
    weightClass = v.getUint16(os2.offset + 4);
    widthClass = v.getUint16(os2.offset + 6);
    const fsType = v.getUint16(os2.offset + 8);
    if (fsType === 0) embedding = 'installable (no restrictions)';
    else if (fsType & 0x0002) embedding = 'restricted: no embedding without permission';
    // OS/2 fsType: bit 8 (0x0100) forbids subsetting, bit 9 (0x0200) allows
    // bitmap embedding only — an earlier draft had the two swapped.
    else if (fsType & 0x0100) embedding = 'no subsetting' + (fsType & 0x0200 ? ', bitmap only' : '');
    else if (fsType & 0x0200) embedding = 'bitmap embedding only';
    else if (fsType & 0x0008) embedding = 'editable embedding';
    else if (fsType & 0x0004) embedding = 'preview and print embedding';
    else embedding = `fsType 0x${fsType.toString(16)}`;
  }

  // cmap: count mapped characters from the best unicode subtable (format 4
  // or 12), which answers "how much of Unicode does this cover".
  let mappedChars: number | undefined;
  const cmap = tables.get('cmap');
  if (cmap) {
    const c = cmap.offset;
    const n = v.getUint16(c + 2);
    let best = -1;
    let bestScore = -1;
    for (let i = 0; i < n; i++) {
      const platform = v.getUint16(c + 4 + i * 8);
      const enc = v.getUint16(c + 6 + i * 8);
      const o = v.getUint32(c + 8 + i * 8);
      const score = platform === 3 && enc === 10 ? 3 : platform === 0 && enc >= 3 ? 3 : platform === 3 && enc === 1 ? 2 : 1;
      if (score > bestScore) {
        bestScore = score;
        best = c + o;
      }
    }
    if (best >= 0) {
      const format = v.getUint16(best);
      if (format === 4) {
        const segX2 = v.getUint16(best + 6);
        let total = 0;
        for (let i = 0; i < segX2 / 2; i++) {
          const end = v.getUint16(best + 14 + i * 2);
          const start = v.getUint16(best + 16 + segX2 + i * 2);
          if (end !== 0xffff || start !== 0xffff) total += end - start + 1;
        }
        mappedChars = total;
      } else if (format === 12) {
        const groups = v.getUint32(best + 12);
        let total = 0;
        for (let i = 0; i < groups; i++) {
          const g = best + 16 + i * 12;
          total += v.getUint32(g + 4) - v.getUint32(g) + 1;
        }
        mappedChars = total;
      }
    }
  }

  return {
    flavor: sfnt === 0x4f54544f ? 'CFF (PostScript) glyphs' : 'TrueType glyphs',
    names,
    glyphCount,
    unitsPerEm,
    created,
    modified,
    weightClass,
    weightName: weightClass ? WEIGHTS[weightClass] ?? String(weightClass) : undefined,
    widthClass,
    italic,
    bold,
    embedding,
    mappedChars,
    tables: list.sort((a, b) => b.bytes - a.bytes),
  };
}

const iec = (n: number): string => {
  if (n < 1024) return `${n} B`;
  const units = ['KiB', 'MiB'];
  let x = n;
  let u = -1;
  do { x /= 1024; u += 1; } while (x >= 1024 && u < units.length - 1);
  return `${x >= 100 ? Math.round(x) : x.toFixed(1)} ${units[u]}`;
};

export function renderFontSummary(f: FontSummary): string {
  const lines: string[] = [];
  if (f.kind === 'collection') lines.push(`Font collection  ·  ${f.faces.length} faces  ·  ${iec(f.fileBytes)}`);
  for (const face of f.faces) {
    const title = [face.names.family, face.names.subfamily].filter(Boolean).join(' ') || face.names.fullName || '(unnamed)';
    lines.push(`${title}  ·  ${face.flavor}  ·  ${face.glyphCount.toLocaleString('en-US')} glyphs  ·  ${face.unitsPerEm} units/em`);
    if (face.names.version) lines.push(`  ${face.names.version}`);
    const style = [face.weightName && `weight ${face.weightClass} (${face.weightName})`, face.italic && 'italic', face.bold && 'bold'].filter(Boolean).join(', ');
    if (style) lines.push(`  ${style}`);
    if (face.mappedChars) lines.push(`  maps ${face.mappedChars.toLocaleString('en-US')} characters`);
    if (face.embedding) lines.push(`  embedding: ${face.embedding}`);
    if (face.modified) lines.push(`  modified ${face.modified}${face.created ? ` (created ${face.created})` : ''}`);
    if (face.names.manufacturer || face.names.designer) lines.push(`  by ${[face.names.designer, face.names.manufacturer].filter(Boolean).join(' / ')}`);
    lines.push('  biggest tables: ' + face.tables.slice(0, 5).map((t) => `${t.tag} ${iec(t.bytes)}`).join(', '));
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}
