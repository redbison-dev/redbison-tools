/**
 * Summarises a Go pprof profile (the gzipped profile.proto format Go's
 * runtime/pprof and net/http/pprof write; many other profilers export
 * converters to it, though async-profiler and py-spy emit their own
 * formats natively): sample types, period,
 * duration, and the top functions by flat and cumulative value — the
 * `top` view of `go tool pprof`, in the browser.
 *
 * The file is a gzipped profile.proto message; gunzip here is the raw
 * inflate shared with the ZIP inspector plus the RFC 1952 wrapper, so
 * nothing depends on a library. Field numbers follow
 * github.com/google/pprof/proto/profile.proto. Label-based views and
 * flame graphs are deliberately out: for those the page points at
 * `go tool pprof -http`.
 */
import { inflateRaw } from './zip-inspect';

export type PprofValueType = { type: string; unit: string };
export type PprofFunc = { name: string; file?: string; flat: number; cum: number };

export type PprofSummary = {
  sampleTypes: PprofValueType[];
  defaultType: number;
  sampleCount: number;
  periodType?: PprofValueType;
  period?: number;
  durationSeconds?: number;
  timestamp?: Date;
  functionCount: number;
  locationCount: number;
  mappingNames: string[];
  /** Top of the `top` table for each sample type's values. */
  top: { byFlat: PprofFunc[]; byCum: PprofFunc[]; totals: number[] };
};

/** RFC 1952 gzip around the shared RFC 1951 inflate. */
export function gunzip(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 18 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) throw new Error('Not gzip data (1F 8B magic missing).');
  if (bytes[2] !== 8) throw new Error(`gzip compression method ${bytes[2]} is not deflate.`);
  const flg = bytes[3];
  let p = 10;
  if (flg & 0x04) {
    const xlen = bytes[p] | (bytes[p + 1] << 8);
    p += 2 + xlen;
  }
  if (flg & 0x08) while (bytes[p++] !== 0);
  if (flg & 0x10) while (bytes[p++] !== 0);
  if (flg & 0x02) p += 2;
  return inflateRaw(bytes.subarray(p, bytes.length - 8));
}

function varint(b: Uint8Array, p: number): [bigint, number] {
  let v = 0n;
  let s = 0n;
  for (let i = 0; i < 10; i++) {
    const byte = b[p + i];
    if (byte === undefined) throw new Error('Truncated profile.');
    v |= BigInt(byte & 0x7f) << s;
    if ((byte & 0x80) === 0) return [v, p + i + 1];
    s += 7n;
  }
  throw new Error('Varint too long.');
}

type Field = { n: number; wire: number; v?: bigint; bytes?: Uint8Array };

function* fields(b: Uint8Array): Generator<Field> {
  let p = 0;
  while (p < b.length) {
    const [tag, q] = varint(b, p);
    const wire = Number(tag & 7n);
    const n = Number(tag >> 3n);
    if (wire === 0) {
      const [v, r] = varint(b, q);
      yield { n, wire, v };
      p = r;
    } else if (wire === 2) {
      const [len, r] = varint(b, q);
      const end = r + Number(len);
      yield { n, wire, bytes: b.subarray(r, end) };
      p = end;
    } else if (wire === 1) {
      yield { n, wire, v: new DataView(b.buffer, b.byteOffset + q, 8).getBigUint64(0, true) };
      p = q + 8;
    } else if (wire === 5) {
      yield { n, wire, v: BigInt(new DataView(b.buffer, b.byteOffset + q, 4).getUint32(0, true)) };
      p = q + 4;
    } else throw new Error(`Wire type ${wire} in a profile.proto message.`);
  }
}

const packedVarints = (b: Uint8Array): number[] => {
  const out: number[] = [];
  let p = 0;
  while (p < b.length) {
    const [v, q] = varint(b, p);
    // sample values are signed but non-negative in practice; keep Number.
    out.push(Number(BigInt.asIntN(64, v)));
    p = q;
  }
  return out;
};

export function parsePprof(raw: Uint8Array): PprofSummary {
  const bytes = raw[0] === 0x1f && raw[1] === 0x8b ? gunzip(raw) : raw;
  const strings: string[] = [];
  const sampleTypes: PprofValueType[] = [];
  type Sample = { locs: number[]; values: number[] };
  const samples: Sample[] = [];
  const locations = new Map<number, number[]>(); // id -> function ids (leaf first)
  const functions = new Map<number, { nameIdx: number; fileIdx: number }>();
  const mappingNames: number[] = [];
  let periodType: { t: number; u: number } | undefined;
  let period: number | undefined;
  let duration: number | undefined;
  let time: number | undefined;
  let defaultType = 0;
  const typeIdx: { t: number; u: number }[] = [];

  for (const f of fields(bytes)) {
    if (f.n === 6 && f.bytes) strings.push(new TextDecoder().decode(f.bytes));
    else if (f.n === 1 && f.bytes) {
      let t = 0;
      let u = 0;
      for (const g of fields(f.bytes)) {
        if (g.n === 1) t = Number(g.v);
        if (g.n === 2) u = Number(g.v);
      }
      typeIdx.push({ t, u });
    } else if (f.n === 2 && f.bytes) {
      const s: Sample = { locs: [], values: [] };
      for (const g of fields(f.bytes)) {
        if (g.n === 1) {
          if (g.bytes) s.locs.push(...packedVarints(g.bytes));
          else s.locs.push(Number(g.v));
        } else if (g.n === 2) {
          if (g.bytes) s.values.push(...packedVarints(g.bytes));
          else s.values.push(Number(g.v));
        }
      }
      samples.push(s);
    } else if (f.n === 3 && f.bytes) {
      for (const g of fields(f.bytes)) if (g.n === 5) mappingNames.push(Number(g.v));
    } else if (f.n === 4 && f.bytes) {
      let id = 0;
      const funcs: number[] = [];
      for (const g of fields(f.bytes)) {
        if (g.n === 1) id = Number(g.v);
        if (g.n === 4 && g.bytes) {
          for (const l of fields(g.bytes)) if (l.n === 1) funcs.push(Number(l.v));
        }
      }
      locations.set(id, funcs);
    } else if (f.n === 5 && f.bytes) {
      let id = 0;
      let nameIdx = 0;
      let fileIdx = 0;
      for (const g of fields(f.bytes)) {
        if (g.n === 1) id = Number(g.v);
        if (g.n === 2) nameIdx = Number(g.v);
        if (g.n === 4) fileIdx = Number(g.v);
      }
      functions.set(id, { nameIdx, fileIdx });
    } else if (f.n === 9) time = Number(f.v) / 1e9;
    else if (f.n === 10) duration = Number(f.v) / 1e9;
    else if (f.n === 11 && f.bytes) {
      let t = 0;
      let u = 0;
      for (const g of fields(f.bytes)) {
        if (g.n === 1) t = Number(g.v);
        if (g.n === 2) u = Number(g.v);
      }
      periodType = { t, u };
    } else if (f.n === 12) period = Number(f.v);
    // profile.proto: 13 is `comment`, 14 is `default_sample_type`; 7 is
    // `drop_frames`, a regex string index, not a count. An earlier draft
    // misread both.
    else if (f.n === 14) defaultType = Number(f.v);
  }

  if (!strings.length || strings[0] !== '') throw new Error('Not a pprof profile: the string table must start with the empty string (profile.proto).');
  for (const { t, u } of typeIdx) sampleTypes.push({ type: strings[t] ?? '?', unit: strings[u] ?? '?' });
  if (!sampleTypes.length) throw new Error('Not a pprof profile: no sample_type entries.');

  // The top table for the last sample type (go tool pprof's default).
  const vi = Math.max(0, sampleTypes.length - 1);
  const flat = new Map<number, number>();
  const cum = new Map<number, number>();
  const totals = new Array(sampleTypes.length).fill(0);
  for (const s of samples) {
    s.values.forEach((val, i) => {
      totals[i] += val;
    });
    const v = s.values[vi] ?? 0;
    const seen = new Set<number>();
    s.locs.forEach((locId, idx) => {
      const funcs = locations.get(locId) ?? [];
      for (const fid of funcs) {
        if (idx === 0) flat.set(fid, (flat.get(fid) ?? 0) + v);
        if (!seen.has(fid)) {
          cum.set(fid, (cum.get(fid) ?? 0) + v);
          seen.add(fid);
        }
      }
    });
  }
  const toFuncs = (m: Map<number, number>): PprofFunc[] =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([fid, val]) => {
        const fn = functions.get(fid);
        return {
          name: fn ? strings[fn.nameIdx] ?? `func#${fid}` : `func#${fid}`,
          file: fn && fn.fileIdx ? strings[fn.fileIdx] : undefined,
          flat: m === flat ? val : flat.get(fid) ?? 0,
          cum: cum.get(fid) ?? 0,
        };
      });

  return {
    sampleTypes,
    defaultType,
    sampleCount: samples.length,
    periodType: periodType ? { type: strings[periodType.t] ?? '?', unit: strings[periodType.u] ?? '?' } : undefined,
    period,
    durationSeconds: duration,
    timestamp: time ? new Date(time * 1000) : undefined,
    functionCount: functions.size,
    locationCount: locations.size,
    mappingNames: mappingNames.map((i) => strings[i] ?? '').filter(Boolean).slice(0, 5),
    top: { byFlat: toFuncs(flat), byCum: toFuncs(cum), totals },
  };
}

const human = (v: number, unit: string): string => {
  if (unit === 'nanoseconds') return v >= 1e9 ? `${(v / 1e9).toFixed(2)}s` : v >= 1e6 ? `${(v / 1e6).toFixed(1)}ms` : `${(v / 1e3).toFixed(0)}µs`;
  if (unit === 'bytes') {
    if (v < 1024) return `${v} B`;
    const units = ['KiB', 'MiB', 'GiB'];
    let x = v;
    let u = -1;
    do { x /= 1024; u += 1; } while (x >= 1024 && u < units.length - 1);
    return `${x >= 100 ? Math.round(x) : x.toFixed(1)} ${units[u]}`;
  }
  return v.toLocaleString('en-US');
};

export function renderPprofSummary(p: PprofSummary): string {
  const vi = p.sampleTypes.length - 1;
  const st = p.sampleTypes[vi];
  const lines = [
    `pprof  ·  ${p.sampleCount.toLocaleString('en-US')} samples  ·  ${p.sampleTypes.map((s) => `${s.type}/${s.unit}`).join(', ')}${p.durationSeconds ? `  ·  ${p.durationSeconds.toFixed(1)}s` : ''}`,
  ];
  if (p.timestamp) lines.push(`captured ${p.timestamp.toISOString()}`);
  lines.push(`total ${st.type}: ${human(p.top.totals[vi] ?? 0, st.unit)}  ·  ${p.functionCount.toLocaleString('en-US')} functions, ${p.locationCount.toLocaleString('en-US')} locations`);
  lines.push('', `top by flat ${st.type}`);
  for (const f of p.top.byFlat.slice(0, 10)) lines.push(`  ${human(f.flat, st.unit).padStart(10)} flat  ${human(f.cum, st.unit).padStart(10)} cum  ${f.name}`);
  return lines.join('\n');
}
