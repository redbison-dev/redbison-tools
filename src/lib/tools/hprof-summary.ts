/**
 * Reads a Java heap dump in the HPROF binary format ("JAVA PROFILE 1.0.2",
 * the format jmap, jcmd GC.heap_dump and HeapDumpOnOutOfMemoryError write)
 * and builds the summary a leak hunt starts from: the class histogram by
 * instance count and shallow bytes, the biggest single objects, and the
 * bytes wasted in primitive arrays with identical content.
 *
 * It is a streaming push parser: feed it the file in chunks of any size and
 * it keeps only aggregates, never the object graph, so a dump far larger
 * than memory still summarises. Sizes are the data bytes the dump records
 * (instance field bytes; array length × element size). jmap -histo's bytes
 * column INCLUDES the JVM's per-object header, which the dump does not
 * carry, so these figures run a little lower than a live -histo; the tool
 * pages say so. Reference: the HPROF agent format shipped in the JDK
 * (demo/jvmti/hprof and the hprof_b_spec in the OpenJDK sources).
 *
 * Dependency-free on purpose: the CLI bundles it, and the site parses in
 * the browser so the dump never leaves the machine.
 */

const TYPE_SIZE: Record<number, number> = { 4: 1, 5: 2, 6: 4, 7: 8, 8: 1, 9: 2, 10: 4, 11: 8 };
const TYPE_NAME: Record<number, string> = { 4: 'boolean', 5: 'char', 6: 'float', 7: 'double', 8: 'byte', 9: 'short', 10: 'int', 11: 'long' };

export type HprofClassStat = { name: string; count: number; bytes: number };
export type HprofBigObject = { className: string; bytes: number; kind: 'instance' | 'object[]' | string };
export type HprofDuplicate = { type: string; length: number; copies: number; wastedBytes: number };

export type HprofSummary = {
  format: string;
  identifierSize: number;
  timestamp?: Date;
  totalObjects: number;
  totalBytes: number;
  classCount: number;
  classes: HprofClassStat[];
  biggest: HprofBigObject[];
  duplicates: HprofDuplicate[];
  duplicateWastedBytes: number;
  gcRoots: number;
};

/** Pretty-prints a JVM binary class name: [B -> byte[], a/b/C -> a.b.C. */
export function prettyClassName(jvm: string): string {
  let dims = 0;
  let s = jvm;
  while (s.startsWith('[')) {
    dims += 1;
    s = s.slice(1);
  }
  const prim: Record<string, string> = { B: 'byte', C: 'char', D: 'double', F: 'float', I: 'int', J: 'long', S: 'short', Z: 'boolean' };
  let base: string;
  if (dims && prim[s]) base = prim[s];
  else if (dims && s.startsWith('L') && s.endsWith(';')) base = s.slice(1, -1).replace(/\//g, '.');
  else base = s.replace(/\//g, '.');
  return base + '[]'.repeat(dims);
}

/** FNV-1a, streamed; two bases so a collision must beat both. */
class Fnv {
  a = 0x811c9dc5;
  b = 0x01000193 ^ 0x811c9dc5;
  update(bytes: Uint8Array, start: number, end: number): void {
    let { a, b } = this;
    for (let i = start; i < end; i++) {
      a = Math.imul(a ^ bytes[i], 0x01000193) >>> 0;
      b = Math.imul(b ^ bytes[i], 0x01000193) >>> 0;
    }
    this.a = a;
    this.b = b;
  }
  key(): string {
    return `${this.a.toString(36)}.${this.b.toString(36)}`;
  }
}

type ClassAgg = { count: number; bytes: number };

export class HprofParser {
  private buf = new Uint8Array(0);
  private pos = 0; // read position within buf
  private stage: 'header' | 'record' | 'done' = 'header';
  /** Bytes of the current heap-dump body still to consume, else 0. */
  private heapRemaining = 0;
  /** A skip in progress across chunk boundaries (within heap body). */
  private skipRemaining = 0;
  private skipHash: Fnv | null = null;
  private skipMeta: { type: number; length: number; bytes: number } | null = null;

  idSize = 4;
  private format = '';
  private timestamp?: Date;
  private strings = new Map<string, string>();
  private classNames = new Map<string, string>(); // classObjId -> name
  private perClass = new Map<string, ClassAgg>(); // key: class name
  private totalObjects = 0;
  private totalBytes = 0;
  private gcRoots = 0;
  private biggest: HprofBigObject[] = [];
  private dupes = new Map<string, { type: string; length: number; copies: number; bytes: number }>();

  private id(view: DataView, off: number): string {
    return this.idSize === 8 ? view.getBigUint64(off).toString(36) : view.getUint32(off).toString(36);
  }

  private noteBig(className: string, bytes: number, kind: HprofBigObject['kind']): void {
    if (this.biggest.length < 10) {
      this.biggest.push({ className, bytes, kind });
      this.biggest.sort((a, b) => a.bytes - b.bytes);
      return;
    }
    if (bytes > this.biggest[0].bytes) {
      this.biggest[0] = { className, bytes, kind };
      this.biggest.sort((a, b) => a.bytes - b.bytes);
    }
  }

  private bump(className: string, bytes: number): void {
    const agg = this.perClass.get(className) ?? { count: 0, bytes: 0 };
    agg.count += 1;
    agg.bytes += bytes;
    this.perClass.set(className, agg);
    this.totalObjects += 1;
    this.totalBytes += bytes;
  }

  push(chunk: Uint8Array): void {
    if (this.stage === 'done') return;
    // Append the new bytes after the unread remainder.
    const rest = this.buf.subarray(this.pos);
    const merged = new Uint8Array(rest.length + chunk.length);
    merged.set(rest);
    merged.set(chunk, rest.length);
    this.buf = merged;
    this.pos = 0;
    this.drain();
  }

  private drain(): void {
    const view = () => new DataView(this.buf.buffer, this.buf.byteOffset, this.buf.byteLength);

    // A pending long skip (array/instance data) crosses chunks first.
    const continueSkip = (): boolean => {
      if (!this.skipRemaining) return true;
      const avail = this.buf.length - this.pos;
      const take = Math.min(avail, this.skipRemaining);
      if (this.skipHash) this.skipHash.update(this.buf, this.pos, this.pos + take);
      this.pos += take;
      this.skipRemaining -= take;
      this.heapRemaining -= take;
      if (this.skipRemaining) return false;
      if (this.skipHash && this.skipMeta) {
        const key = `${this.skipMeta.type}:${this.skipMeta.length}:${this.skipHash.key()}`;
        const d = this.dupes.get(key) ?? { type: TYPE_NAME[this.skipMeta.type] ?? '?', length: this.skipMeta.length, copies: 0, bytes: this.skipMeta.bytes };
        d.copies += 1;
        this.dupes.set(key, d);
      }
      this.skipHash = null;
      this.skipMeta = null;
      return true;
    };

    for (;;) {
      if (!continueSkip()) return;

      if (this.stage === 'header') {
        const nul = this.buf.indexOf(0, this.pos);
        if (nul === -1 || this.buf.length < nul + 1 + 4 + 8) return;
        this.format = new TextDecoder().decode(this.buf.subarray(this.pos, nul));
        if (!this.format.startsWith('JAVA PROFILE')) throw new Error('Not an HPROF file: the "JAVA PROFILE" magic is missing.');
        const v = view();
        this.idSize = v.getUint32(nul + 1);
        if (this.idSize !== 4 && this.idSize !== 8) throw new Error(`Unsupported identifier size ${this.idSize}.`);
        const ms = v.getBigUint64(nul + 5);
        this.timestamp = new Date(Number(ms));
        this.pos = nul + 13;
        this.stage = 'record';
        continue;
      }

      if (this.heapRemaining > 0) {
        if (!this.heapSub(view())) return;
        continue;
      }

      // Top-level record header: tag u8, time u32, length u32.
      if (this.buf.length - this.pos < 9) return;
      const v = view();
      const tag = v.getUint8(this.pos);
      const len = v.getUint32(this.pos + 5);
      if (tag === 0x0c || tag === 0x1c) {
        this.pos += 9;
        this.heapRemaining = len;
        continue;
      }
      if (this.buf.length - this.pos < 9 + len) return;
      const body = this.pos + 9;
      if (tag === 0x01) {
        const sid = this.id(v, body);
        this.strings.set(sid, new TextDecoder().decode(this.buf.subarray(body + this.idSize, body + len)));
      } else if (tag === 0x02) {
        const classObjId = this.id(v, body + 4);
        const nameId = this.id(v, body + 4 + this.idSize + 4);
        this.classNames.set(classObjId, prettyClassName(this.strings.get(nameId) ?? `class@${classObjId}`));
      } else if (tag === 0x2c) {
        // HEAP_DUMP_END
      }
      this.pos = body + len;
    }
  }

  /** One heap-dump sub-record; false = need more bytes. */
  private heapSub(v: DataView): boolean {
    const start = this.pos;
    const avail = () => this.buf.length - this.pos;
    const need = (n: number): boolean => avail() >= n;
    const id = this.idSize;
    if (!need(1)) return false;
    const tag = v.getUint8(this.pos);

    const take = (n: number): boolean => {
      if (!need(n)) {
        this.pos = start;
        return false;
      }
      this.pos += n;
      return true;
    };

    switch (tag) {
      case 0xff:
      case 0x05:
      case 0x07:
        if (!take(1 + id)) return false;
        this.gcRoots += 1;
        break;
      case 0x01:
        if (!take(1 + id * 2)) return false;
        this.gcRoots += 1;
        break;
      case 0x02:
      case 0x03:
      case 0x08:
        if (!take(1 + id + 8)) return false;
        this.gcRoots += 1;
        break;
      case 0x04:
      case 0x06:
        if (!take(1 + id + 4)) return false;
        this.gcRoots += 1;
        break;
      case 0x20: {
        // CLASS_DUMP: fixed part, then three variable tables.
        const fixed = 1 + id + 4 + id * 6 + 4;
        if (!need(fixed + 2)) {
          this.pos = start;
          return false;
        }
        let p = this.pos + 1;
        const classObjId = this.id(v, p);
        p = this.pos + fixed;
        const cpCount = v.getUint16(p);
        p += 2;
        for (let i = 0; i < cpCount; i++) {
          if (this.buf.length < p + 3) return this.rollback(start);
          const t = v.getUint8(p + 2);
          p += 3 + (TYPE_SIZE[t] ?? id);
        }
        if (this.buf.length < p + 2) return this.rollback(start);
        const staticCount = v.getUint16(p);
        p += 2;
        for (let i = 0; i < staticCount; i++) {
          if (this.buf.length < p + id + 1) return this.rollback(start);
          const t = v.getUint8(p + id);
          p += id + 1 + (TYPE_SIZE[t] ?? id);
        }
        if (this.buf.length < p + 2) return this.rollback(start);
        const fieldCount = v.getUint16(p);
        p += 2 + fieldCount * (id + 1);
        if (this.buf.length < p) return this.rollback(start);
        if (!this.classNames.has(classObjId)) this.classNames.set(classObjId, `class@${classObjId}`);
        this.heapRemaining -= p - this.pos;
        this.pos = p;
        break;
      }
      case 0x21: {
        const head = 1 + id + 4 + id + 4;
        if (!need(head)) return this.rollback(start);
        const classObjId = this.id(v, this.pos + 1 + id + 4);
        const nbytes = v.getUint32(this.pos + 1 + id + 4 + id);
        const name = this.classNames.get(classObjId) ?? `class@${classObjId}`;
        this.bump(name, nbytes);
        this.noteBig(name, nbytes, 'instance');
        this.heapRemaining -= head;
        this.pos += head;
        this.skipRemaining = nbytes; // field data, not needed
        break;
      }
      case 0x22: {
        const head = 1 + id + 4 + 4 + id;
        if (!need(head)) return this.rollback(start);
        const count = v.getUint32(this.pos + 1 + id + 4);
        const arrClassId = this.id(v, this.pos + 1 + id + 4 + 4);
        const bytes = count * id;
        const name = this.classNames.get(arrClassId) ?? 'java.lang.Object[]';
        this.bump(name, bytes);
        this.noteBig(name, bytes, 'object[]');
        this.heapRemaining -= head;
        this.pos += head;
        this.skipRemaining = bytes;
        break;
      }
      case 0x23: {
        const head = 1 + id + 4 + 4 + 1;
        if (!need(head)) return this.rollback(start);
        const count = v.getUint32(this.pos + 1 + id + 4);
        const t = v.getUint8(this.pos + 1 + id + 4 + 4);
        const elem = TYPE_SIZE[t] ?? 1;
        const bytes = count * elem;
        const name = `${TYPE_NAME[t] ?? '?'}[]`;
        this.bump(name, bytes);
        this.noteBig(name, bytes, name);
        this.heapRemaining -= head;
        this.pos += head;
        this.skipRemaining = bytes;
        // Hash only arrays worth deduplicating: big enough to matter.
        if (bytes >= 64) {
          this.skipHash = new Fnv();
          this.skipMeta = { type: t, length: count, bytes };
        }
        break;
      }
      default:
        throw new Error(`Unknown heap sub-record 0x${tag.toString(16)} at offset ${this.pos}: the dump is corrupt or a format this parser does not know.`);
    }
    if (this.skipRemaining === 0 && tag !== 0x20 && tag !== 0x21 && tag !== 0x22 && tag !== 0x23) {
      this.heapRemaining -= this.pos - start;
    }
    return true;
  }

  private rollback(to: number): boolean {
    this.pos = to;
    return false;
  }

  finish(): HprofSummary {
    if (this.stage === 'header') throw new Error('Not an HPROF file: the "JAVA PROFILE" header never appeared.');
    const classes = [...this.perClass.entries()]
      .map(([name, a]) => ({ name, count: a.count, bytes: a.bytes }))
      .sort((a, b) => b.bytes - a.bytes);
    const duplicates = [...this.dupes.values()]
      .filter((d) => d.copies > 1)
      .map((d) => ({ type: `${d.type}[]`, length: d.length, copies: d.copies, wastedBytes: (d.copies - 1) * d.bytes }))
      .sort((a, b) => b.wastedBytes - a.wastedBytes)
      .slice(0, 10);
    return {
      format: this.format,
      identifierSize: this.idSize,
      timestamp: this.timestamp,
      totalObjects: this.totalObjects,
      totalBytes: this.totalBytes,
      // Loaded classes plus histogram rows (primitive array types like
      // int[] never get a LOAD_CLASS record), so the chip and the table
      // cannot disagree on tiny dumps.
      classCount: new Set([...this.classNames.values(), ...this.perClass.keys()]).size,
      classes,
      biggest: [...this.biggest].sort((a, b) => b.bytes - a.bytes),
      duplicates,
      duplicateWastedBytes: duplicates.reduce((s, d) => s + d.wastedBytes, 0),
      gcRoots: this.gcRoots,
    };
  }
}

export function parseHprof(bytes: Uint8Array): HprofSummary {
  const p = new HprofParser();
  p.push(bytes);
  return p.finish();
}

const iec = (n: number): string => {
  if (n < 1024) return `${n} B`;
  const units = ['KiB', 'MiB', 'GiB', 'TiB'];
  let v = n;
  let u = -1;
  do { v /= 1024; u += 1; } while (v >= 1024 && u < units.length - 1);
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[u]}`;
};

/** The histogram as terminal text: totals, top classes, big objects, waste. */
export function renderHprofSummary(s: HprofSummary): string {
  const lines = [
    `${s.format}  ·  ${s.totalObjects.toLocaleString('en-US')} objects  ·  ${iec(s.totalBytes)} shallow  ·  ${s.classCount.toLocaleString('en-US')} classes  ·  ${s.gcRoots.toLocaleString('en-US')} GC roots`,
  ];
  if (s.timestamp) lines.push(`dumped ${s.timestamp.toISOString()}`);
  lines.push('', 'top classes by shallow bytes');
  const top = s.classes.slice(0, 15);
  const w = Math.max(...top.map((c) => iec(c.bytes).length));
  for (const c of top) lines.push(`  ${iec(c.bytes).padStart(w)}  ${c.count.toLocaleString('en-US').padStart(10)} ×  ${c.name}`);
  lines.push('', 'biggest single objects');
  for (const b of s.biggest.slice(0, 5)) lines.push(`  ${iec(b.bytes).padStart(w)}  ${b.className}`);
  if (s.duplicates.length) {
    lines.push('', `duplicate primitive arrays — ${iec(s.duplicateWastedBytes)} spent on repeat content`);
    for (const d of s.duplicates.slice(0, 5)) {
      lines.push(`  ${d.copies.toLocaleString('en-US')} copies of a ${d.type} of ${d.length.toLocaleString('en-US')} elements (${iec(d.wastedBytes)} beyond the first)`);
    }
  }
  return lines.join('\n');
}
