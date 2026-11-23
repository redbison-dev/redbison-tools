/**
 * The dump analyzers: a JVM thread dump (real jcmd output, fixture), an
 * HPROF heap dump (built byte-by-byte from the format spec, so every
 * expectation is known exactly) and a V8 heap snapshot (synthetic JSON in
 * the file's own self-describing layout). The parsers were additionally
 * exercised against a live JVM's 10MB dump and a live Node snapshot while
 * being written; these pins keep the arithmetic from drifting.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseThreadDump, renderThreadDumpSummary } from '@/lib/tools/jvm-thread-dump';
import { HprofParser, parseHprof, prettyClassName, renderHprofSummary } from '@/lib/tools/hprof-summary';
import { parseV8HeapSnapshot, renderV8HeapSummary } from '@/lib/tools/v8-heap-snapshot';

const FIXTURE = resolve(process.cwd(), 'src/test/fixtures/jvm-thread-dump.txt');

describe('jvm thread dump', () => {
  const dump = readFileSync(FIXTURE, 'utf8');

  it('reads the real dump: threads, states, daemons, JVM line', () => {
    const a = parseThreadDump(dump);
    expect(a.javaThreadCount).toBe(18);
    expect(a.vmThreadCount).toBe(7);
    expect(a.daemonCount).toBe(11);
    expect(a.states).toEqual({ RUNNABLE: 9, TIMED_WAITING: 6, BLOCKED: 2, WAITING: 1 });
    expect(a.jvm).toContain('OpenJDK 64-Bit Server VM');
  });

  it('finds the deadlock from the lock graph and matches the JVM report', () => {
    const a = parseThreadDump(dump);
    expect(a.deadlocks).toHaveLength(1);
    expect([...a.deadlocks[0].cycle].sort()).toEqual(['deadlock-a', 'deadlock-b']);
    expect(a.deadlocks[0].reportedByJvm).toBe(true);
  });

  it('does not call Object.wait() a deadlock: the waiter released its monitor', () => {
    // The fixture's Finalizer holds and waits on the same ReferenceQueue
    // lock; an earlier draft reported it as a one-thread deadlock.
    const a = parseThreadDump(dump);
    expect(a.deadlocks.some((d) => d.cycle.includes('Finalizer'))).toBe(false);
    expect(a.contention.every((c) => c.holder !== 'Finalizer')).toBe(true);
  });

  it('groups the worker pool and the identical stacks', () => {
    const a = parseThreadDump(dump);
    const pool = a.pools.find((p) => p.prefix === 'pool-worker');
    expect(pool?.count).toBe(4);
    expect(a.hotStacks[0].count).toBeGreaterThanOrEqual(4);
    expect(a.hotStacks[0].top[0]).toContain('Thread.sleep');
  });

  it('renders the verdict first and refuses non-dumps', () => {
    const text = renderThreadDumpSummary(parseThreadDump(dump));
    expect(text.indexOf('DEADLOCK')).toBeGreaterThan(-1);
    expect(text.indexOf('DEADLOCK')).toBeLessThan(text.indexOf('thread pools'));
    expect(() => parseThreadDump('not a dump at all')).toThrow(/does not look like a JVM thread dump/);
  });
});

/** An HPROF file built to the spec: id size 4, one class, two instances of
 * 16 bytes, three identical int[64] arrays and one distinct int[64]. */
function buildHprof(): Uint8Array {
  const out: number[] = [];
  const u1 = (v: number) => out.push(v & 0xff);
  const u2 = (v: number) => out.push((v >> 8) & 0xff, v & 0xff);
  const u4 = (v: number) => out.push((v >>> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff);
  const u8 = (v: number) => { u4(Math.floor(v / 2 ** 32)); u4(v >>> 0); };
  const str = (s: string) => { for (const c of s) u1(c.charCodeAt(0)); };

  str('JAVA PROFILE 1.0.2'); u1(0);
  u4(4); // id size
  u8(1700000000000);

  const record = (tag: number, body: () => void) => {
    const at = out.length;
    u1(tag); u4(0); u4(0); // length patched below
    body();
    const len = out.length - at - 9;
    out[at + 5] = (len >>> 24) & 0xff; out[at + 6] = (len >> 16) & 0xff; out[at + 7] = (len >> 8) & 0xff; out[at + 8] = len & 0xff;
  };

  record(0x01, () => { u4(100); str('com/acme/Cache'); }); // string id 100
  record(0x02, () => { u4(1); u4(200); u4(0); u4(100); }); // class obj 200 named id 100

  record(0x1c, () => { // heap dump segment
    // CLASS_DUMP for 200: no cp, no statics, one int field
    u1(0x20); u4(200); u4(0); u4(0); u4(0); u4(0); u4(0); u4(0); u4(0); u4(16);
    u2(0); u2(0); u2(1); u4(100); u1(10);
    // two instances, 16 data bytes each
    for (const oid of [301, 302]) { u1(0x21); u4(oid); u4(0); u4(200); u4(16); for (let i = 0; i < 16; i++) u1(7); }
    // three identical int[64] (>=64 bytes so the duplicate hash runs)
    for (const oid of [401, 402, 403]) { u1(0x23); u4(oid); u4(0); u4(64); u1(10); for (let i = 0; i < 64; i++) u4(5); }
    // one different int[64]
    u1(0x23); u4(404); u4(0); u4(64); u1(10); for (let i = 0; i < 64; i++) u4(9);
    // one GC root
    u1(0xff); u4(301);
  });
  record(0x2c, () => undefined);
  return new Uint8Array(out);
}

describe('hprof summary', () => {
  it('reads the histogram, duplicates and roots exactly', () => {
    const s = parseHprof(buildHprof());
    expect(s.format).toBe('JAVA PROFILE 1.0.2');
    expect(s.identifierSize).toBe(4);
    expect(s.totalObjects).toBe(6);
    expect(s.totalBytes).toBe(2 * 16 + 4 * 256);
    expect(s.gcRoots).toBe(1);
    expect(s.classes[0]).toEqual({ name: 'int[]', count: 4, bytes: 1024 });
    expect(s.classes[1]).toEqual({ name: 'com.acme.Cache', count: 2, bytes: 32 });
    expect(s.duplicates).toEqual([{ type: 'int[]', length: 64, copies: 3, wastedBytes: 512 }]);
    expect(s.duplicateWastedBytes).toBe(512);
  });

  it('gives the same answer fed one byte at a time', () => {
    const bytes = buildHprof();
    const p = new HprofParser();
    for (const b of bytes) p.push(new Uint8Array([b]));
    expect(p.finish()).toEqual(parseHprof(bytes));
  });

  it('prints JVM class names the way people write them', () => {
    expect(prettyClassName('[B')).toBe('byte[]');
    expect(prettyClassName('[[I')).toBe('int[][]');
    expect(prettyClassName('[Ljava/lang/String;')).toBe('java.lang.String[]');
    expect(prettyClassName('com/acme/Cache')).toBe('com.acme.Cache');
  });

  it('refuses a non-HPROF file by naming the magic', () => {
    expect(() => parseHprof(new TextEncoder().encode('id,name\n1,Ada\n'))).toThrow(/JAVA PROFILE/);
    const text = renderHprofSummary(parseHprof(buildHprof()));
    expect(text).toContain('6 objects');
    expect(text).toContain('512 B spent on repeat content');
  });
});

describe('v8 heap snapshot', () => {
  const snapshot = JSON.stringify({
    snapshot: {
      meta: {
        node_fields: ['type', 'name', 'id', 'self_size', 'edge_count', 'detachedness'],
        node_types: [['hidden', 'array', 'string', 'object'], 'string', 'number', 'number', 'number', 'number'],
      },
      node_count: 5,
      edge_count: 0,
    },
    nodes: [
      3, 0, 1, 48, 0, 0, // object Cache
      3, 0, 2, 48, 0, 0, // object Cache
      2, 1, 3, 40, 0, 0, // string "duplicate-duplicate-x"
      2, 1, 4, 40, 0, 0, // same string again
      3, 2, 5, 64, 0, 1, // object Detached HTMLDivElement
    ],
    edges: [],
    strings: ['Cache', 'duplicate-duplicate-x', 'Detached HTMLDivElement'],
  });

  it('reads layout from meta and aggregates types, constructors and duplicates', () => {
    const h = parseV8HeapSnapshot(snapshot);
    expect(h.nodeCount).toBe(5);
    expect(h.totalBytes).toBe(48 + 48 + 40 + 40 + 64);
    expect(h.types.find((t) => t.type === 'object')).toEqual({ type: 'object', count: 3, bytes: 160 });
    expect(h.constructors[0]).toEqual({ name: 'Cache', count: 2, bytes: 96 });
    expect(h.duplicateStrings).toEqual([{ preview: 'duplicate-duplicate-x', length: 21, copies: 2, wastedBytes: 40 }]);
    expect(h.detachedNodes).toBe(1);
  });

  it('refuses non-snapshots with a plain message', () => {
    expect(() => parseV8HeapSnapshot('{}')).toThrow(/node_fields/);
    expect(() => parseV8HeapSnapshot('nope')).toThrow(/Not valid JSON/);
    const text = renderV8HeapSummary(parseV8HeapSnapshot(snapshot));
    expect(text).toContain('detached DOM nodes: 1');
  });
});
