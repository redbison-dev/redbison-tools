/**
 * Reads the footer of an Apache Parquet file: the 4-byte "PAR1" magic at both
 * ends, a little-endian 4-byte footer length, and the FileMetaData struct
 * serialized with the Thrift compact protocol (parquet.thrift). This gives
 * the real schema, row count, row groups and per-column codecs without
 * decoding any data pages.
 */

import Papa from 'papaparse';
import YAML from 'yaml';

const MAGIC = [0x50, 0x41, 0x52, 0x31]; // "PAR1"

type ThriftValue = number | bigint | boolean | string | Uint8Array | ThriftValue[] | ThriftStruct | Map<ThriftValue, ThriftValue>;
type ThriftStruct = { [fieldId: number]: ThriftValue };

class CompactReader {
  pos = 0;
  constructor(private readonly buf: Uint8Array) {}

  private byte(): number {
    if (this.pos >= this.buf.length) throw new Error('Unexpected end of Parquet footer');
    return this.buf[this.pos++];
  }

  private varint(): bigint {
    let result = 0n;
    let shift = 0n;
    for (;;) {
      const b = this.byte();
      result |= BigInt(b & 0x7f) << shift;
      if ((b & 0x80) === 0) return result;
      shift += 7n;
      if (shift > 70n) throw new Error('Malformed varint in Parquet footer');
    }
  }

  private zigzag(): bigint {
    const n = this.varint();
    return (n >> 1n) ^ -(n & 1n);
  }

  private readValue(type: number): ThriftValue {
    switch (type) {
      case 1: return true;
      case 2: return false;
      case 3: { const b = this.byte(); return b > 127 ? b - 256 : b; }
      case 4:
      case 5: return Number(this.zigzag());
      case 6: return this.zigzag();
      case 7: {
        if (this.pos + 8 > this.buf.length) throw new Error('Unexpected end of Parquet footer');
        const v = new DataView(this.buf.buffer, this.buf.byteOffset + this.pos, 8).getFloat64(0, true);
        this.pos += 8;
        return v;
      }
      case 8: {
        const len = Number(this.varint());
        if (this.pos + len > this.buf.length) throw new Error('Unexpected end of Parquet footer');
        const bytes = this.buf.subarray(this.pos, this.pos + len);
        this.pos += len;
        return bytes;
      }
      case 9:
      case 10: {
        const header = this.byte();
        let size = header >> 4;
        const elemType = header & 0x0f;
        if (size === 15) size = Number(this.varint());
        const list: ThriftValue[] = [];
        for (let i = 0; i < size; i++) list.push(elemType === 1 || elemType === 2 ? this.byte() === 1 : this.readValue(elemType));
        return list;
      }
      case 11: {
        const size = Number(this.varint());
        const map = new Map<ThriftValue, ThriftValue>();
        if (size === 0) return map;
        const kv = this.byte();
        // Like list elements, map keys and values of type bool take one byte each (1 = true).
        const read = (t: number) => (t === 1 || t === 2 ? this.byte() === 1 : this.readValue(t));
        for (let i = 0; i < size; i++) map.set(read(kv >> 4), read(kv & 0x0f));
        return map;
      }
      case 12: return this.struct();
      default: throw new Error(`Unknown Thrift compact type ${type}`);
    }
  }

  struct(): ThriftStruct {
    const out: ThriftStruct = {};
    let lastId = 0;
    for (;;) {
      const header = this.byte();
      if (header === 0) return out;
      const delta = header >> 4;
      const type = header & 0x0f;
      const id = delta === 0 ? Number(this.zigzag()) : lastId + delta;
      lastId = id;
      out[id] = this.readValue(type);
    }
  }
}

const PHYSICAL_TYPES = ['BOOLEAN', 'INT32', 'INT64', 'INT96', 'FLOAT', 'DOUBLE', 'BYTE_ARRAY', 'FIXED_LEN_BYTE_ARRAY'];
const REPETITION = ['REQUIRED', 'OPTIONAL', 'REPEATED'];
const CODECS = ['UNCOMPRESSED', 'SNAPPY', 'GZIP', 'LZO', 'BROTLI', 'LZ4', 'ZSTD', 'LZ4_RAW'];
const ENCODINGS = ['PLAIN', 'GROUP_VAR_INT', 'PLAIN_DICTIONARY', 'RLE', 'BIT_PACKED', 'DELTA_BINARY_PACKED', 'DELTA_LENGTH_BYTE_ARRAY', 'DELTA_BYTE_ARRAY', 'RLE_DICTIONARY', 'BYTE_STREAM_SPLIT'];
const CONVERTED = ['UTF8', 'MAP', 'MAP_KEY_VALUE', 'LIST', 'ENUM', 'DECIMAL', 'DATE', 'TIME_MILLIS', 'TIME_MICROS', 'TIMESTAMP_MILLIS', 'TIMESTAMP_MICROS', 'UINT_8', 'UINT_16', 'UINT_32', 'UINT_64', 'INT_8', 'INT_16', 'INT_32', 'INT_64', 'JSON', 'BSON', 'INTERVAL'];
const LOGICAL: Record<number, string> = { 1: 'STRING', 2: 'MAP', 3: 'LIST', 4: 'ENUM', 5: 'DECIMAL', 6: 'DATE', 7: 'TIME', 8: 'TIMESTAMP', 10: 'INTEGER', 11: 'UNKNOWN', 12: 'JSON', 13: 'BSON', 14: 'UUID', 15: 'FLOAT16' };

export type ParquetColumn = {
  /** Dotted path for nested columns, e.g. "address.city". */
  name: string;
  physicalType: string;
  logicalType?: string;
  repetition: string;
  nullable: boolean;
};

export type ParquetMetadata = {
  formatVersion: number;
  numRows: number;
  createdBy?: string;
  columns: ParquetColumn[];
  rowGroups: { numRows: number; totalByteSize: number }[];
  codecs: string[];
  encodings: string[];
  keyValueMetadata: Record<string, string>;
};

const text = (v: ThriftValue | undefined) => (v instanceof Uint8Array ? new TextDecoder().decode(v) : undefined);
const num = (v: ThriftValue | undefined) => (typeof v === 'bigint' ? Number(v) : typeof v === 'number' ? v : 0);
const name = (list: string[], v: ThriftValue | undefined) => (typeof v === 'number' ? list[v] ?? `UNKNOWN(${v})` : undefined);

function logicalTypeName(el: ThriftStruct): string | undefined {
  const logical = el[10];
  if (logical && typeof logical === 'object' && !(logical instanceof Uint8Array) && !Array.isArray(logical) && !(logical instanceof Map)) {
    const id = Number(Object.keys(logical)[0]);
    const label = LOGICAL[id];
    if (label === 'DECIMAL') {
      const d = (logical as ThriftStruct)[id] as ThriftStruct;
      return `DECIMAL(${num(d[2])},${num(d[1])})`;
    }
    if (label === 'TIMESTAMP' || label === 'TIME') {
      const t = (logical as ThriftStruct)[id] as ThriftStruct;
      const unit = t[2] as ThriftStruct | undefined;
      const unitName = unit ? ({ 1: 'MILLIS', 2: 'MICROS', 3: 'NANOS' } as Record<number, string>)[Number(Object.keys(unit)[0])] : undefined;
      return unitName ? `${label}(${unitName})` : label;
    }
    if (label === 'INTEGER') {
      const t = (logical as ThriftStruct)[id] as ThriftStruct;
      return `${t[2] ? 'INT' : 'UINT'}${num(t[1])}`;
    }
    if (label) return label;
  }
  const converted = name(CONVERTED, el[6]);
  if (converted === 'DECIMAL') return `DECIMAL(${num(el[8])},${num(el[7])})`;
  return converted;
}

/** True when the buffer starts and ends with the PAR1 magic. */
export function isParquet(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  return MAGIC.every((m, i) => bytes[i] === m && bytes[bytes.length - 4 + i] === m);
}

export function readParquetMetadata(bytes: Uint8Array): ParquetMetadata {
  if (bytes.length < 12) throw new Error('File is too small to be a Parquet file');
  if (!MAGIC.every((m, i) => bytes[bytes.length - 4 + i] === m)) {
    throw new Error('Missing "PAR1" magic at the end of the file, so this is not a complete Parquet file');
  }
  if (!MAGIC.every((m, i) => bytes[i] === m)) {
    throw new Error('Missing "PAR1" magic at the start of the file');
  }
  const footerLen = new DataView(bytes.buffer, bytes.byteOffset + bytes.length - 8, 4).getUint32(0, true);
  const start = bytes.length - 8 - footerLen;
  if (start < 4) throw new Error(`Footer length ${footerLen} is larger than the file`);
  const meta = new CompactReader(bytes.subarray(start, bytes.length - 8)).struct();

  const schema = (meta[2] as ThriftStruct[] | undefined) ?? [];
  const columns: ParquetColumn[] = [];
  // schema[0] is the root; walk the flattened depth-first tree using num_children.
  let idx = 1;
  const visit = (prefix: string, parentNullable: boolean) => {
    const el = schema[idx++];
    if (!el) return;
    const elName = text(el[4]) ?? '';
    const repetition = name(REPETITION, el[3]) ?? 'REQUIRED';
    const path = prefix ? `${prefix}.${elName}` : elName;
    const nullable = parentNullable || repetition !== 'REQUIRED';
    const children = num(el[5]);
    if (children > 0) {
      for (let c = 0; c < children; c++) visit(path, nullable);
      return;
    }
    columns.push({
      name: path,
      physicalType: name(PHYSICAL_TYPES, el[1]) ?? 'UNKNOWN',
      logicalType: logicalTypeName(el),
      repetition,
      nullable,
    });
  };
  const rootChildren = schema[0] ? num(schema[0][5]) : 0;
  for (let c = 0; c < rootChildren; c++) visit('', false);

  const codecs = new Set<string>();
  const encodings = new Set<string>();
  const rowGroups = ((meta[4] as ThriftStruct[] | undefined) ?? []).map((rg) => {
    for (const chunk of (rg[1] as ThriftStruct[] | undefined) ?? []) {
      const cmd = chunk[3] as ThriftStruct | undefined;
      if (!cmd) continue;
      const codec = name(CODECS, cmd[4]);
      if (codec) codecs.add(codec);
      for (const e of (cmd[2] as number[] | undefined) ?? []) encodings.add(name(ENCODINGS, e) ?? String(e));
    }
    return { numRows: num(rg[3]), totalByteSize: num(rg[2]) };
  });

  const keyValueMetadata: Record<string, string> = {};
  for (const kv of (meta[5] as ThriftStruct[] | undefined) ?? []) {
    const k = text(kv[1]);
    if (k) keyValueMetadata[k] = text(kv[2]) ?? '';
  }

  return {
    formatVersion: num(meta[1]),
    numRows: num(meta[3]),
    createdBy: text(meta[6]),
    columns,
    rowGroups,
    codecs: [...codecs],
    encodings: [...encodings],
    keyValueMetadata,
  };
}

/**
 * Converts the viewer's JSON (an upload summary, an array of row objects, or
 * an object with a sample_data array) to JSON, CSV or YAML.
 * CSV gets the rows when there are rows, otherwise the schema fields.
 */
export function convertParquetSummary(data: unknown, format: 'json' | 'csv' | 'yaml'): string {
  if (format === 'json') return JSON.stringify(data, null, 2);
  if (format === 'yaml') return YAML.stringify(data);
  const d = data as any;
  const rows: unknown[] | undefined = Array.isArray(d) ? d : Array.isArray(d?.sample_data) ? d.sample_data : Array.isArray(d?.schema?.fields) ? d.schema.fields : undefined;
  if (!rows || rows.length === 0) throw new Error('Nothing tabular to convert to CSV');
  const flat = rows.map((r) => (r && typeof r === 'object' && !Array.isArray(r)
    ? Object.fromEntries(Object.entries(r as Record<string, unknown>).map(([k, v]) => [k, v !== null && typeof v === 'object' ? JSON.stringify(v) : v]))
    : { value: r }));
  const fields = [...new Set(flat.flatMap((r) => Object.keys(r)))];
  return Papa.unparse({ fields, data: flat.map((r) => fields.map((f) => (r as Record<string, unknown>)[f] ?? '')) });
}
