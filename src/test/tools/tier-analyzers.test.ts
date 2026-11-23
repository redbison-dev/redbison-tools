/**
 * The Tier 1-3 analyzer parsers. Every fixture is either a real artifact
 * (a G1 GC log and SQLite file from live programs, a JDK-built JAR,
 * pyarrow-written Arrow and Parquet files, the repo's own DejaVu font) or
 * bytes built in-test from the format's specification; the expectations
 * are cross-checked against the writing tool (sqlite3's own counts,
 * pyarrow's chunking, V8's WebAssembly.validate, node zlib round-trips)
 * so a passing test means agreement with the reference implementation,
 * not self-consistency.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deflateRawSync, gzipSync } from 'node:zlib';
import { parseHar, renderHarSummary } from '@/lib/tools/har-analyzer';
import { parseGcLog, renderGcLogSummary } from '@/lib/tools/gc-log-analyzer';
import { inspectSqlite, renderSqliteSummary } from '@/lib/tools/sqlite-inspect';
import { decodeProtoWire, renderProtoWire } from '@/lib/tools/proto-wire';
import { decodeMessagePack, decodeCbor } from '@/lib/tools/binary-json-formats';
import { inspectZip, inflateRaw, renderZipSummary } from '@/lib/tools/zip-inspect';
import { inspectWasm } from '@/lib/tools/wasm-inspect';
import { inspectBinary } from '@/lib/tools/binary-headers';
import { inspectFont } from '@/lib/tools/font-inspect';
import { inspectPcap, renderPcapSummary } from '@/lib/tools/pcap-inspect';
import { parsePprof, gunzip } from '@/lib/tools/pprof-inspect';
import { inspectArrow } from '@/lib/tools/arrow-inspect';
import { readParquetMetadata } from '@/lib/tools/parquet-meta';

const fx = (name: string) => resolve(process.cwd(), 'src/test/fixtures', name);
const hex = (s: string) => new Uint8Array(s.replace(/\s+/g, '').match(/../g)!.map((x) => parseInt(x, 16)));

describe('har analyzer', () => {
  const entry = (url: string, over: Record<string, unknown> = {}) => ({
    startedDateTime: '2026-11-22T10:00:00.000Z',
    time: 120,
    request: { method: 'GET', url },
    response: { status: 200, bodySize: 1000, headersSize: 200, content: { size: 2500, mimeType: 'text/html' }, headers: [] },
    timings: { blocked: 5, dns: -1, connect: -1, ssl: -1, send: 1, wait: 94, receive: 20 },
    ...over,
  });
  const har = JSON.stringify({
    log: {
      pages: [{ id: 'p1', title: 'https://shop.example.com/', pageTimings: { onContentLoad: 900, onLoad: 1800 } }],
      entries: [
        entry('https://shop.example.com/'),
        entry('https://cdn.example.com/app.js', { response: { status: 200, bodySize: 50_000, headersSize: 300, content: { size: 50_400, mimeType: 'application/javascript' }, headers: [] } }),
        entry('https://tracker.ads-example.net/pixel', { time: 800, response: { status: 404, bodySize: 100, headersSize: 100, content: { size: 0, mimeType: 'image/gif' }, headers: [] } }),
        entry('https://shop.example.com/old', { response: { status: 301, bodySize: 0, headersSize: 150, content: { size: 0, mimeType: '' }, headers: [{ name: 'Location', value: 'https://shop.example.com/new' }] } }),
      ],
    },
  });

  it('totals, third-party split and dash-one timing exclusion per the spec', () => {
    const h = parseHar(har);
    expect(h.requestCount).toBe(4);
    expect(h.firstPartyHost).toBe('shop.example.com');
    // cdn.example.com shares the base domain; the tracker does not.
    expect(h.thirdPartyShare.requests).toBe(1);
    // timings of -1 mean "does not apply" (HAR 1.2 §timings): dns/connect/ssl
    // must be absent from the phase totals, not counted as zero or -1.
    expect(h.phaseTotals.dns).toBe(0);
    expect(h.phaseTotals.wait).toBe(94 * 4);
    expect(h.byStatusClass).toEqual({ '2xx': 2, '3xx': 1, '4xx': 1 });
    expect(h.redirects).toEqual([{ from: 'shop.example.com/old', to: 'shop.example.com/new', status: 301 }]);
    expect(h.errors).toEqual([{ url: 'tracker.ads-example.net/pixel', status: 404 }]);
    const text = renderHarSummary(h);
    expect(text).toContain('4 requests');
    expect(text).toContain('third-party: 1 requests');
  });

  it('refuses non-HAR JSON by naming what is missing', () => {
    expect(() => parseHar('{"notHar":true}')).toThrow(/log\.entries/);
    expect(() => parseHar('x')).toThrow(/Not valid JSON/);
  });
});

describe('gc log analyzer', () => {
  it('reads the real JDK 17 G1 log: counts, fulls, percentiles, warnings', () => {
    const g = parseGcLog(readFileSync(fx('g1-gc.log'), 'utf8'));
    expect(g.format).toBe('unified');
    expect(g.collector).toBe('G1');
    expect(g.fullGcCount).toBe(2); // two System.gc() rounds in the program
    expect(g.events.length).toBeGreaterThan(50);
    expect(g.spanSeconds).toBeGreaterThan(4);
    expect(g.pausePercentiles.max).toBeGreaterThan(0);
    expect(g.byType.some((t) => t.type.startsWith('Pause Full') && t.count === 2)).toBe(true);
    expect(renderGcLogSummary(g)).toContain('collections (2 full)');
  });

  it('reads the JDK 8 PrintGCDetails shape too', () => {
    const g = parseGcLog(
      [
        '2.312: [GC (Allocation Failure) [PSYoungGen: 65536K->10720K(76288K)] 65536K->10736K(251392K), 0.0088350 secs]',
        '4.001: [Full GC (Ergonomics) [PSYoungGen: 10720K->0K(76288K)] 150000K->90000K(251392K), 0.2500000 secs]',
      ].join('\n'),
    );
    expect(g.format).toBe('jdk8');
    expect(g.events).toHaveLength(2);
    expect(g.fullGcCount).toBe(1);
    expect(g.events[1].pauseMs).toBeCloseTo(250, 3);
    expect(g.events[0].beforeBytes).toBe(65536 * 1024);
  });

  it('handles nested parentheses in causes: (System.gc())', () => {
    const g = parseGcLog('[1.0s][info][gc] GC(9) Pause Full (System.gc()) 35M->8M(48M) 4.797ms');
    expect(g.fullGcCount).toBe(1);
    expect(g.events[0].cause).toBe('System.gc()');
  });

  it('refuses a non-GC log by naming both supported shapes', () => {
    expect(() => parseGcLog('hello world')).toThrow(/unified logs.*PrintGCDetails/s);
  });
});

describe('sqlite inspector', () => {
  it('matches sqlite3 exactly on the real file: 500 users, 1500 orders', () => {
    const s = inspectSqlite(new Uint8Array(readFileSync(fx('sample.sqlite'))));
    const users = s.tables.find((t) => t.name === 'users');
    const orders = s.tables.find((t) => t.name === 'orders');
    expect(users?.rowCount).toBe(500);
    expect(orders?.rowCount).toBe(1500);
    expect(s.objects.filter((o) => o.type === 'index').map((o) => o.name)).toEqual(['idx_orders_user']);
    expect(s.objects.filter((o) => o.type === 'view').map((o) => o.name)).toEqual(['big_orders']);
    expect(s.encoding).toBe('UTF-8');
    expect(s.pageSize).toBe(4096);
    expect(renderSqliteSummary(s)).toContain('2,000 rows in all');
  });

  it('refuses non-databases by naming the header', () => {
    expect(() => inspectSqlite(new TextEncoder().encode('PK\u0003\u0004 not a db'))).toThrow(/SQLite format 3/);
  });
});

describe('protobuf wire decoder', () => {
  it('decodes the encoding-guide examples and nested messages', () => {
    // protobuf.dev/programming-guides/encoding: 08 96 01 = field 1, 150.
    const f = decodeProtoWire(hex('089601'));
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ fieldNumber: 1, wireTypeName: 'varint', value: '150', zigzag: '75' });
    // 1a03089601 = field 3, nested message carrying field 1 = 150.
    const nested = decodeProtoWire(hex('1a03089601'));
    expect(nested[0].message?.[0]).toMatchObject({ fieldNumber: 1, value: '150' });
    expect(renderProtoWire(decodeProtoWire(hex('120774657374696e67')))).toContain('"testing"');
  });

  it('shows both varint readings and refuses field 0 and truncation', () => {
    expect(decodeProtoWire(hex('0801'))[0].zigzag).toBe('-1');
    // Fixed fields show the sfixed reading when it differs: i32 0xffffffff.
    expect(decodeProtoWire(hex('0dffffffff'))[0].asSigned).toBe('-1');
    expect(() => decodeProtoWire(hex('00'))).toThrow(/Field number 0/);
    expect(() => decodeProtoWire(hex('12ff'))).toThrow();
  });
});

describe('messagepack and cbor', () => {
  it('decodes the msgpack.org example and the timestamp extension', () => {
    expect(decodeMessagePack(hex('82a7636f6d70616374c3a6736368656d6100')).value).toEqual({ compact: true, schema: 0 });
    // timestamp32: ext -1, 4 bytes seconds
    const ts = decodeMessagePack(hex('d6ff5e0be100')).value as { $timestamp: string };
    expect(ts.$timestamp).toBe('2020-01-01T00:00:00.000Z');
  });

  it('decodes RFC 8949 appendix A vectors', () => {
    expect(decodeCbor(hex('00')).value).toBe(0);
    expect(decodeCbor(hex('3863')).value).toBe(-100);
    expect(decodeCbor(hex('f90001')).value).toBeCloseTo(5.960464477539063e-8);
    expect(decodeCbor(hex('fb3ff199999999999a')).value).toBeCloseTo(1.1);
    expect(decodeCbor(hex('a26161016162820203')).value).toEqual({ a: 1, b: [2, 3] });
    expect(decodeCbor(hex('9f018202039f0405ffff')).value).toEqual([1, [2, 3], [4, 5]]);
    expect(decodeCbor(hex('7f657374726561646d696e67ff')).value).toBe('streaming');
    // Indefinite BYTE strings join their chunk content too (an earlier
    // draft returned $bytes:0, dropping it) — the appendix's (_ h'0102', h'030405').
    expect(decodeCbor(hex('5f42010243030405ff')).value).toMatchObject({ $bytes: 5, hex: '0102030405' });
    expect(decodeCbor(hex('c11a514b67b0')).value).toMatchObject({ $tag: 1, epoch: 1363896240 });
    expect(decodeCbor(hex('1bffffffffffffffff')).value).toEqual({ $int64: '18446744073709551615' });
  });

  it('keeps non-string map keys visible instead of colliding them', () => {
    const v = decodeCbor(hex('a2016161026162')).value as Record<string, unknown>;
    expect(Object.keys(v)).toEqual(['$key:1', '$key:2']);
  });
});

describe('zip and jar', () => {
  it('reads the JDK-built jar: manifest through our own inflate', () => {
    const z = inspectZip(new Uint8Array(readFileSync(fx('sample.jar'))));
    expect(z.kind).toBe('jar');
    expect(z.manifest?.['Main-Class']).toBe('A');
    expect(z.entryCount).toBeGreaterThanOrEqual(3);
    expect(renderZipSummary(z)).toContain('Main-Class: A');
  });

  it('throws on truncated deflate instead of spinning', () => {
    const good = new Uint8Array(deflateRawSync('spin guard test data, long enough to span blocks'));
    expect(() => inflateRaw(good.subarray(0, Math.floor(good.length / 2)))).toThrow(/truncated or corrupt/);
  });

  it('round-trips all deflate block types against node zlib', () => {
    for (const text of ['x', 'The quick brown fox. '.repeat(200), JSON.stringify(Array.from({ length: 500 }, (_, i) => i))]) {
      const back = new TextDecoder().decode(inflateRaw(new Uint8Array(deflateRawSync(text))));
      expect(back).toBe(text);
    }
  });

  it('prints DOS timestamps zone-less, because the format carries no zone', () => {
    // 2024-06-15 12:30:00 in DOS fields: date 0x58CF, time 0x63C0.
    const z = inspectZip(buildZipWithDate(0x63c0, 0x58cf));
    expect(z.entries[0].modified).toBe('2024-06-15T12:30:00');
  });

  function buildZipWithDate(time: number, date: number): Uint8Array {
    const name = 'a.txt';
    const data = new TextEncoder().encode('x');
    const out: number[] = [];
    const u16 = (v: number) => out.push(v & 0xff, (v >> 8) & 0xff);
    const u32 = (v: number) => out.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);
    u32(0x04034b50); u16(20); u16(0); u16(0); u16(time); u16(date); u32(0); u32(1); u32(1); u16(name.length); u16(0);
    out.push(...new TextEncoder().encode(name), ...data);
    const cdStart = out.length;
    u32(0x02014b50); u16(20); u16(20); u16(0); u16(0); u16(time); u16(date); u32(0); u32(1); u32(1); u16(name.length); u16(0); u16(0); u16(0); u16(0); u32(0); u32(0);
    out.push(...new TextEncoder().encode(name));
    const cdSize = out.length - cdStart;
    u32(0x06054b50); u16(0); u16(0); u16(1); u16(1); u32(cdSize); u32(cdStart); u16(0);
    return new Uint8Array(out);
  }

  it('flags path traversal names', () => {
    // A minimal zip holding one stored entry named ../evil, built per APPNOTE.
    const name = '../evil';
    const data = new TextEncoder().encode('x');
    const out: number[] = [];
    const u16 = (v: number) => out.push(v & 0xff, (v >> 8) & 0xff);
    const u32 = (v: number) => out.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);
    u32(0x04034b50); u16(20); u16(0); u16(0); u16(0); u16(0); u32(0); u32(1); u32(1); u16(name.length); u16(0);
    out.push(...new TextEncoder().encode(name), ...data);
    const cdStart = out.length;
    u32(0x02014b50); u16(20); u16(20); u16(0); u16(0); u16(0); u16(0); u32(0); u32(1); u32(1); u16(name.length); u16(0); u16(0); u16(0); u16(0); u32(0); u32(0);
    out.push(...new TextEncoder().encode(name));
    const cdSize = out.length - cdStart;
    u32(0x06054b50); u16(0); u16(0); u16(1); u16(1); u32(cdSize); u32(cdStart); u16(0);
    const z = inspectZip(new Uint8Array(out));
    expect(z.warnings.some((w) => w.includes('traversal'))).toBe(true);
  });
});

describe('wasm inspector', () => {
  const build = (): Uint8Array => {
    const b: number[] = [0, 0x61, 0x73, 0x6d, 1, 0, 0, 0];
    const sec = (id: number, body: number[]) => b.push(id, body.length, ...body);
    sec(1, [2, 0x60, 0, 0, 0x60, 2, 0x7f, 0x7f, 1, 0x7f]);
    sec(2, [1, 3, 0x65, 0x6e, 0x76, 3, 0x6c, 0x6f, 0x67, 0, 0]);
    sec(3, [1, 1]);
    sec(5, [1, 1, 1, 4]);
    sec(7, [1, 3, 0x61, 0x64, 0x64, 0, 1]);
    sec(10, [1, 7, 0, 0x20, 0, 0x20, 1, 0x6a, 0x0b]);
    return new Uint8Array(b);
  };

  it('V8 accepts the fixture and the inspector agrees with it', () => {
    const bytes = build();
    // Constructed from number[], so the backing store is a plain ArrayBuffer.
    expect(WebAssembly.validate(bytes.buffer as ArrayBuffer)).toBe(true);
    const s = inspectWasm(bytes);
    expect(s.imports).toEqual([{ module: 'env', name: 'log', kind: 'function' }]);
    expect(s.exports).toEqual([{ name: 'add', kind: 'function' }]);
    expect(s.memories[0]).toEqual({ initialPages: 1, maxPages: 4, bytesMin: 65536 });
    expect(s.functionCount).toBe(1);
  });

  it('refuses non-wasm and names component-model binaries', () => {
    expect(() => inspectWasm(new TextEncoder().encode('\u0000asX...'))).toThrow(/magic/);
    expect(() => inspectWasm(hex('0061736d 0d000100'))).toThrow(/component-model/);
  });
});

describe('binary headers', () => {
  it.skipIf(process.platform !== 'darwin')('reads /bin/ls as a universal binary the way `file` does', () => {
    const s = inspectBinary(new Uint8Array(readFileSync('/bin/ls')));
    expect(s.kind).toBe('Mach-O universal');
    expect(s.slices.map((x) => x.arch)).toEqual(['x86_64', 'arm64e']);
    expect(s.slices[0].libraries).toContain('/usr/lib/libSystem.B.dylib');
  });

  it('reads a minimal ELF64 with a DT_NEEDED library', () => {
    // Header + one LOAD + one DYNAMIC segment; strtab holds "libc.so.6".
    const b = new Uint8Array(0x200);
    const v = new DataView(b.buffer);
    b.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1]); // ELF64 LE
    v.setUint16(16, 2, true); // ET_EXEC
    v.setUint16(18, 62, true); // x86_64
    v.setBigUint64(24, 0x401000n, true); // entry
    v.setBigUint64(32, 64n, true); // phoff
    v.setUint16(54, 56, true); // phentsize
    v.setUint16(56, 2, true); // phnum
    // PH0: LOAD vaddr 0 -> file 0, size 0x200
    v.setUint32(64, 1, true); v.setBigUint64(64 + 8, 0n, true); v.setBigUint64(64 + 16, 0n, true); v.setBigUint64(64 + 32, 0x200n, true);
    // PH1: DYNAMIC at file 0x100, size 0x40
    v.setUint32(120, 2, true); v.setBigUint64(120 + 8, 0x100n, true); v.setBigUint64(120 + 32, 0x40n, true);
    // dynamic: DT_NEEDED(1)=1, DT_STRTAB(5)=0x180, DT_NULL
    v.setBigUint64(0x100, 1n, true); v.setBigUint64(0x108, 1n, true);
    v.setBigUint64(0x110, 5n, true); v.setBigUint64(0x118, 0x180n, true);
    b.set(new TextEncoder().encode('\u0000libc.so.6\u0000'), 0x180);
    const s = inspectBinary(b);
    expect(s.kind).toBe('ELF');
    expect(s.slices[0]).toMatchObject({ arch: 'x86_64', bits: 64, fileType: 'executable' });
    expect(s.slices[0].libraries).toEqual(['libc.so.6']);
  });

  it('tells a Java class file apart from a fat binary', () => {
    expect(() => inspectBinary(hex('cafebabe 00000041 00ff'.padEnd(140, '0')))).toThrow(/Java class file/);
  });
});

describe('font inspector', () => {
  it('reads the repo DejaVu Bold: real facts about a known font', () => {
    const f = inspectFont(new Uint8Array(readFileSync(resolve(process.cwd(), 'public/fonts/DejaVuSans-Bold.ttf'))));
    const face = f.faces[0];
    expect(face.names.family).toBe('DejaVu Sans');
    expect(face.names.subfamily).toBe('Bold');
    expect(face.glyphCount).toBe(6196);
    expect(face.unitsPerEm).toBe(2048);
    expect(face.weightClass).toBe(700);
    expect(face.bold).toBe(true);
    expect(face.embedding).toContain('installable');
    expect(face.mappedChars).toBeGreaterThan(5000);
  });

  it('names WOFF wrappers instead of half-parsing them', () => {
    expect(() => inspectFont(new TextEncoder().encode('wOFF----------------'))).toThrow(/WOFF file/);
    expect(() => inspectFont(new TextEncoder().encode('wOF2----------------'))).toThrow(/WOFF2/);
  });
});

describe('pcap triage', () => {
  /** A classic little-endian pcap: DNS query + TCP SYN, built per the spec. */
  const build = (): Uint8Array => {
    const out: number[] = [];
    const u16 = (v: number) => out.push(v & 0xff, (v >> 8) & 0xff);
    const u32 = (v: number) => out.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);
    u32(0xa1b2c3d4); u16(2); u16(4); u32(0); u32(0); u32(65535); u32(1); // header, linktype 1
    const packet = (payload: number[], ts: number) => {
      u32(ts); u32(0); u32(payload.length); u32(payload.length);
      out.push(...payload);
    };
    const eth = (ethertype: number, rest: number[]) => [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 2, (ethertype >> 8) & 0xff, ethertype & 0xff, ...rest];
    const ipv4 = (proto: number, l4: number[]) => {
      const total = 20 + l4.length;
      return [0x45, 0, (total >> 8) & 0xff, total & 0xff, 0, 0, 0, 0, 64, proto, 0, 0, 10, 0, 0, 1, 10, 0, 0, 2, ...l4];
    };
    // UDP :5353 -> :53, DNS header with QR=0 (a query)
    const dns = [0xab, 0xcd, 0x01, 0x00, 0, 1, 0, 0, 0, 0, 0, 0];
    const udp = [0x14, 0xe9, 0, 53, 0, 8 + dns.length, 0, 0, ...dns];
    packet(eth(0x0800, ipv4(17, udp)), 100);
    // TCP SYN :49152 -> :443, never answered
    const tcp = [0xc0, 0x00, 0x01, 0xbb, 0, 0, 0, 1, 0, 0, 0, 0, 0x50, 0x02, 0xff, 0xff, 0, 0, 0, 0];
    packet(eth(0x0800, ipv4(6, tcp)), 103);
    return new Uint8Array(out);
  };

  it('counts protocols, services, DNS queries and unanswered SYNs', () => {
    const s = inspectPcap(build());
    expect(s.format).toBe('pcap');
    expect(s.packets).toBe(2);
    expect(s.durationSeconds).toBe(3);
    expect(s.byProtocol.map((p) => p.proto).sort()).toEqual(['TCP', 'UDP']);
    expect(s.dnsQueries).toBe(1);
    expect(s.synWithoutAck).toBe(1);
    expect(s.byService.map((x) => x.service).sort()).toEqual(['dns', 'https']);
    expect(s.ipv4Hosts).toBe(2);
    expect(renderPcapSummary(s)).toContain('1 SYNs never answered');
  });

  it('refuses non-captures by naming both magics', () => {
    expect(() => inspectPcap(new TextEncoder().encode('GIF89a..................'))).toThrow(/A1B2C3D4.*0A0D0D0A/s);
  });
});

describe('pprof', () => {
  /** A profile.proto built field-by-field: cpu/nanoseconds, two samples. */
  const build = (): Uint8Array => {
    const out: number[] = [];
    const varint = (v: number) => {
      do {
        let b = v & 0x7f;
        v = Math.floor(v / 128);
        if (v) b |= 0x80;
        out.push(b);
      } while (v);
    };
    const field = (n: number, wire: number) => varint(n * 8 + wire);
    const sub = (n: number, body: () => void) => {
      const tmp = out.length;
      body();
      const bytes = out.splice(tmp);
      field(n, 2);
      varint(bytes.length);
      out.push(...bytes);
    };
    const str = (n: number, s: string) => {
      field(n, 2);
      const b = new TextEncoder().encode(s);
      varint(b.length);
      out.push(...b);
    };
    sub(1, () => { field(1, 0); varint(1); field(2, 0); varint(2); }); // sample_type cpu/nanoseconds
    sub(2, () => { sub(1, () => varint(1)); sub(2, () => varint(7_000_000)); }); // sample loc1 7ms
    sub(2, () => { sub(1, () => { varint(1); varint(2); }); sub(2, () => varint(3_000_000)); }); // loc1<-loc2 3ms
    sub(4, () => { field(1, 0); varint(1); sub(4, () => { field(1, 0); varint(1); }); }); // location 1 -> func 1
    sub(4, () => { field(1, 0); varint(2); sub(4, () => { field(1, 0); varint(2); }); }); // location 2 -> func 2
    sub(5, () => { field(1, 0); varint(1); field(2, 0); varint(3); }); // func1 name=main.hot
    sub(5, () => { field(1, 0); varint(2); field(2, 0); varint(4); }); // func2 name=main.caller
    str(6, ''); str(6, 'cpu'); str(6, 'nanoseconds'); str(6, 'main.hot'); str(6, 'main.caller');
    field(10, 0); varint(10_000_000_000); // 10s duration
    return new Uint8Array(out);
  };

  it('computes flat and cumulative like go tool pprof top', () => {
    const p = parsePprof(build());
    expect(p.sampleTypes).toEqual([{ type: 'cpu', unit: 'nanoseconds' }]);
    expect(p.sampleCount).toBe(2);
    expect(p.durationSeconds).toBe(10);
    const hot = p.top.byFlat[0];
    expect(hot.name).toBe('main.hot');
    expect(hot.flat).toBe(10_000_000); // leaf in both samples
    expect(hot.cum).toBe(10_000_000);
    const caller = p.top.byCum.find((f) => f.name === 'main.caller')!;
    expect(caller.flat).toBe(0);
    expect(caller.cum).toBe(3_000_000);
  });

  it('reads default_sample_type from field 14, not the comment field', () => {
    // Append default_sample_type = 0 (field 14) to the profile; an earlier
    // draft read field 13 (comment) here and field 7 (drop_frames, a string
    // index) as a count.
    const base = build();
    const withDefault = new Uint8Array([...base, 14 * 8, 0]);
    expect(parsePprof(withDefault).defaultType).toBe(0);
  });

  it('gunzips RFC 1952 wrappers with the shared inflate', () => {
    const gz = new Uint8Array(gzipSync(build()));
    expect(parsePprof(gz).sampleCount).toBe(2);
    expect(() => gunzip(new TextEncoder().encode('not gzip........................'))).toThrow(/1F 8B/);
  });
});

describe('arrow ipc', () => {
  it('reads the pyarrow file exactly: 1200 rows in 3 batches of 500', () => {
    const a = inspectArrow(new Uint8Array(readFileSync(fx('sample.arrow'))));
    expect(a.layout).toBe('file');
    expect(a.totalRows).toBe(1200);
    expect(a.recordBatches).toBe(3);
    expect(a.fields).toEqual([
      { name: 'id', type: 'Int64', nullable: true },
      { name: 'name', type: 'Utf8', nullable: true },
      { name: 'score', type: 'Float64', nullable: true },
      { name: 'active', type: 'Bool', nullable: true },
    ]);
  });

  it('cross-checks the pyarrow parquet twin: same table, both readers agree', () => {
    const pm = readParquetMetadata(new Uint8Array(readFileSync(fx('pyarrow.parquet'))));
    expect(pm.numRows).toBe(1200);
    expect(pm.codecs).toEqual(['ZSTD']);
    expect(pm.columns.map((c) => c.name)).toEqual(['id', 'name', 'score', 'active']);
  });

  it('refuses non-arrow files by naming both layouts', () => {
    expect(() => inspectArrow(new TextEncoder().encode('PARQUET1........'))).toThrow(/ARROW1.*FFFFFFFF/s);
  });
});
