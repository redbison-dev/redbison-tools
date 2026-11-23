/**
 * Inspects an Apache Arrow IPC file (.arrow / Feather v2) or stream:
 * schema field names and types, record batch count and row counts, body
 * sizes and compression. Arrow frames every message as a flatbuffer, so
 * this includes a minimal flatbuffers table reader — vtables and field
 * offsets per the flatbuffers internals doc — rather than a library.
 * Columnar *data* is left encoded; this answers "what is in this file
 * and how big", and the page says exactly that.
 *
 * References: the Arrow Columnar IPC specification (File and Streaming
 * formats, continuation marker 0xFFFFFFFF, Message.fbs, Schema.fbs).
 */

type Fb = { b: Uint8Array; v: DataView };

const fb = (b: Uint8Array): Fb => ({ b, v: new DataView(b.buffer, b.byteOffset, b.byteLength) });

/** flatbuffers: field slot -> absolute offset inside the buffer, or -1. */
function slot(f: Fb, table: number, field: number): number {
  const vtable = table - f.v.getInt32(table, true);
  const vtSize = f.v.getUint16(vtable, true);
  const idx = 4 + field * 2;
  if (idx >= vtSize) return -1;
  const off = f.v.getUint16(vtable + idx, true);
  return off === 0 ? -1 : table + off;
}

const tableAt = (f: Fb, pos: number): number => pos + f.v.getInt32(pos, true);
const str = (f: Fb, pos: number): string => {
  const s = pos + f.v.getInt32(pos, true);
  const len = f.v.getUint32(s, true);
  return new TextDecoder().decode(f.b.subarray(s + 4, s + 4 + len));
};
const vec = (f: Fb, pos: number): { base: number; length: number } => {
  const vpos = pos + f.v.getInt32(pos, true);
  return { base: vpos + 4, length: f.v.getUint32(vpos, true) };
};

const TYPES = ['NONE', 'Null', 'Int', 'FloatingPoint', 'Binary', 'Utf8', 'Bool', 'Decimal', 'Date', 'Time', 'Timestamp', 'Interval', 'List', 'Struct', 'Union', 'FixedSizeBinary', 'FixedSizeList', 'Map', 'Duration', 'LargeBinary', 'LargeUtf8', 'LargeList', 'RunEndEncoded', 'BinaryView', 'Utf8View', 'ListView', 'LargeListView'];

export type ArrowField = { name: string; type: string; nullable: boolean };

export type ArrowSummary = {
  layout: 'file' | 'stream';
  fileBytes: number;
  fields: ArrowField[];
  recordBatches: number;
  dictionaryBatches: number;
  totalRows: number;
  totalBodyBytes: number;
  compression?: string;
};

export function inspectArrow(bytes: Uint8Array): ArrowSummary {
  const magic = new TextDecoder().decode(bytes.subarray(0, 6));
  let layout: 'file' | 'stream';
  let p: number;
  if (magic === 'ARROW1') {
    layout = 'file';
    const tail = new TextDecoder().decode(bytes.subarray(bytes.length - 6));
    if (tail !== 'ARROW1') throw new Error('Arrow file magic present at the start but missing at the end: truncated file.');
    p = 8; // magic + 2 bytes padding
  } else {
    // Stream layout starts directly with a message frame.
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.length < 8 || v.getUint32(0, true) !== 0xffffffff) {
      throw new Error('Not Arrow IPC: neither the ARROW1 file magic nor a stream continuation marker (FFFFFFFF) starts the file.');
    }
    layout = 'stream';
    p = 0;
  }

  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = layout === 'file' ? bytes.length - 10 : bytes.length; // file: footer len + magic at tail
  let fields: ArrowField[] = [];
  let recordBatches = 0;
  let dictionaryBatches = 0;
  let totalRows = 0;
  let totalBodyBytes = 0;
  let compression: string | undefined;

  while (p + 8 <= end) {
    let metaLen = v.getUint32(p, true);
    if (metaLen === 0xffffffff) {
      metaLen = v.getUint32(p + 4, true);
      p += 8;
    } else {
      p += 4; // pre-0.15 frames had no continuation marker
    }
    if (metaLen === 0) break; // end-of-stream
    const f = fb(bytes.subarray(p, p + metaLen));
    const msg = tableAt(f, 0);
    const headerTypeOff = slot(f, msg, 1);
    const headerOff = slot(f, msg, 2);
    const bodyLenOff = slot(f, msg, 3);
    const headerType = headerTypeOff >= 0 ? f.v.getUint8(headerTypeOff) : 0;
    const bodyLen = bodyLenOff >= 0 ? Number(f.v.getBigInt64(bodyLenOff, true)) : 0;

    if (headerType === 1 && headerOff >= 0) {
      // Schema
      const schema = tableAt(f, headerOff);
      const fieldsOff = slot(f, schema, 1);
      if (fieldsOff >= 0) {
        const { base, length } = vec(f, fieldsOff);
        fields = [];
        for (let i = 0; i < length; i++) {
          const fld = tableAt(f, base + i * 4);
          const nameOff = slot(f, fld, 0);
          const nullableOff = slot(f, fld, 1);
          const typeTypeOff = slot(f, fld, 2);
          const typeId = typeTypeOff >= 0 ? f.v.getUint8(typeTypeOff) : 0;
          let type = TYPES[typeId] ?? 'unknown';
          // Width matters: Int32 vs Int64 is the difference between a file
          // that fits in a JS number and one that does not.
          const typeOff = slot(f, fld, 3);
          if (typeOff >= 0 && (typeId === 2 || typeId === 3)) {
            const tt = tableAt(f, typeOff);
            if (typeId === 2) {
              const bwOff = slot(f, tt, 0);
              const signedOff = slot(f, tt, 1);
              const bw = bwOff >= 0 ? f.v.getInt32(bwOff, true) : 0;
              const signed = signedOff >= 0 ? f.v.getUint8(signedOff) !== 0 : true;
              if (bw) type = `${signed ? 'Int' : 'Uint'}${bw}`;
            } else {
              const precOff = slot(f, tt, 0);
              const prec = precOff >= 0 ? f.v.getUint16(precOff, true) : 0;
              type = ['Float16', 'Float32', 'Float64'][prec] ?? 'FloatingPoint';
            }
          }
          fields.push({
            name: nameOff >= 0 ? str(f, nameOff) : `f${i}`,
            type,
            nullable: nullableOff >= 0 ? f.v.getUint8(nullableOff) !== 0 : true,
          });
        }
      }
    } else if (headerType === 3 && headerOff >= 0) {
      recordBatches += 1;
      const rb = tableAt(f, headerOff);
      const lenOff = slot(f, rb, 0);
      if (lenOff >= 0) totalRows += Number(f.v.getBigInt64(lenOff, true));
      const compOff = slot(f, rb, 3);
      if (compOff >= 0) {
        const comp = tableAt(f, compOff);
        const codecOff = slot(f, comp, 0);
        compression = codecOff >= 0 && f.v.getInt8(codecOff) === 1 ? 'ZSTD' : 'LZ4_FRAME';
      }
    } else if (headerType === 2) {
      dictionaryBatches += 1;
    }
    totalBodyBytes += bodyLen;
    p += metaLen + bodyLen;
    p = (p + 7) & ~7;
  }

  if (!fields.length && !recordBatches) throw new Error('No schema or record batches found: an empty or corrupt Arrow file.');
  return { layout, fileBytes: bytes.length, fields, recordBatches, dictionaryBatches, totalRows, totalBodyBytes, compression };
}

const iec = (n: number): string => {
  if (n < 1024) return `${n} B`;
  const units = ['KiB', 'MiB', 'GiB'];
  let x = n;
  let u = -1;
  do { x /= 1024; u += 1; } while (x >= 1024 && u < units.length - 1);
  return `${x >= 100 ? Math.round(x) : x.toFixed(1)} ${units[u]}`;
};

export function renderArrowSummary(a: ArrowSummary): string {
  const lines = [
    `Arrow IPC ${a.layout}  ·  ${a.totalRows.toLocaleString('en-US')} rows in ${a.recordBatches} batch${a.recordBatches === 1 ? '' : 'es'}${a.dictionaryBatches ? ` + ${a.dictionaryBatches} dictionaries` : ''}  ·  ${iec(a.totalBodyBytes)} of data${a.compression ? `  ·  ${a.compression}` : ''}`,
    '',
    `schema (${a.fields.length} fields)`,
  ];
  for (const fld of a.fields.slice(0, 20)) lines.push(`  ${fld.name}  ${fld.type}${fld.nullable ? '' : '  NOT NULL'}`);
  if (a.fields.length > 20) lines.push(`  … and ${a.fields.length - 20} more`);
  return lines.join('\n');
}
