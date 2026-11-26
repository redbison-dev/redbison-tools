// Writes capture.pcap, the worked-example capture of the packet capture guide
// (wk20261123-capture-more). A live capture needs root, which the build machine
// did not have, so the packets are composed here and then read, filtered and
// rotated by the real tcpdump (4.99.1, Apple version 156). Addresses are the
// RFC 5737 documentation ranges and the MACs are locally administered, so the
// file names no real host. Checksums are computed, so `tcpdump -v` reports them
// as correct.
//
//   node make-capture.mjs [out.pcap] [bulkPackets]
//
// With bulkPackets > 0 it appends that many 1,400-byte HTTPS payload packets,
// which is how the rotation example got a file large enough to split.
import { writeFileSync } from 'node:fs';

const out = process.argv[2] || 'capture.pcap';
const bulk = Number(process.argv[3] || 0);

const CLIENT = [192, 0, 2, 10];
const RESOLVER = [192, 0, 2, 53];
const API = [198, 51, 100, 20];
const DEAD = [203, 0, 113, 7];
const MAC_C = [0x02, 0, 0, 0, 0, 0x0a];
const MAC_GW = [0x02, 0, 0, 0, 0, 0x01];

const T0 = Date.UTC(2026, 10, 23, 9, 0, 0) / 1000;
const packets = [];

function sum16(bytes) {
  let s = 0;
  for (let i = 0; i < bytes.length; i += 2) s += (bytes[i] << 8) + (bytes[i + 1] ?? 0);
  while (s > 0xffff) s = (s & 0xffff) + (s >>> 16);
  return s;
}
const cksum = (bytes) => (~sum16(bytes)) & 0xffff;
const u16 = (n) => [(n >>> 8) & 0xff, n & 0xff];
const u32 = (n) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];

function ipv4(src, dst, proto, payload, id) {
  const len = 20 + payload.length;
  const h = [0x45, 0, ...u16(len), ...u16(id), 0x40, 0, 64, proto, 0, 0, ...src, ...dst];
  const c = cksum(h);
  h[10] = c >>> 8;
  h[11] = c & 0xff;
  return [...h, ...payload];
}

function l4sum(src, dst, proto, seg) {
  return cksum([...src, ...dst, 0, proto, ...u16(seg.length), ...seg]);
}

function tcp(src, dst, sport, dport, seq, ack, flags, data = []) {
  const seg = [...u16(sport), ...u16(dport), ...u32(seq), ...u32(ack), 0x50, flags, ...u16(65535), 0, 0, 0, 0, ...data];
  const c = l4sum(src, dst, 6, seg);
  seg[16] = c >>> 8;
  seg[17] = c & 0xff;
  return seg;
}

function udp(src, dst, sport, dport, data) {
  const seg = [...u16(sport), ...u16(dport), ...u16(8 + data.length), 0, 0, ...data];
  const c = l4sum(src, dst, 17, seg);
  seg[6] = c >>> 8;
  seg[7] = c & 0xff;
  return seg;
}

let ipId = 1;
function add(t, src, dst, proto, seg, fromClient) {
  const eth = [...(fromClient ? MAC_GW : MAC_C), ...(fromClient ? MAC_C : MAC_GW), 0x08, 0x00];
  packets.push({ t, bytes: Uint8Array.from([...eth, ...ipv4(src, dst, proto, seg, ipId++)]) });
}

const ascii = (s) => [...Buffer.from(s, 'latin1')];
const qname = (name) => [...name.split('.').flatMap((l) => [l.length, ...ascii(l)]), 0];

// 1-2: DNS lookup of api.example.com
const q = [...u16(0x1a2b), 0x01, 0x00, ...u16(1), ...u16(0), ...u16(0), ...u16(0), ...qname('api.example.com'), ...u16(1), ...u16(1)];
add(T0 + 0.0001, CLIENT, RESOLVER, 17, udp(CLIENT, RESOLVER, 53001, 53, q), true);
const a = [...u16(0x1a2b), 0x81, 0x80, ...u16(1), ...u16(1), ...u16(0), ...u16(0), ...qname('api.example.com'), ...u16(1), ...u16(1),
  0xc0, 0x0c, ...u16(1), ...u16(1), ...u32(300), ...u16(4), ...API];
add(T0 + 0.0122, RESOLVER, CLIENT, 17, udp(RESOLVER, CLIENT, 53, 53001, a), false);

// 3-9: plain-text HTTP on port 80, carrying a Basic credential and a cookie
const C = 1000, S = 5000;
add(T0 + 0.0130, CLIENT, API, 6, tcp(CLIENT, API, 50100, 80, C, 0, 0x02), true);
add(T0 + 0.0391, API, CLIENT, 6, tcp(API, CLIENT, 80, 50100, S, C + 1, 0x12), false);
add(T0 + 0.0393, CLIENT, API, 6, tcp(CLIENT, API, 50100, 80, C + 1, S + 1, 0x10), true);
const req = ascii('GET /orders/42 HTTP/1.1\r\nHost: api.example.com\r\nAuthorization: Basic ZGVtbzpodW50ZXIy\r\nCookie: session=7f3c9a1e5b\r\n\r\n');
add(T0 + 0.0395, CLIENT, API, 6, tcp(CLIENT, API, 50100, 80, C + 1, S + 1, 0x18, req), true);
const body = '{"order":42,"email":"customer@example.com","total":"19.99"}';
const res = ascii(`HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${body.length}\r\n\r\n${body}`);
add(T0 + 0.0702, API, CLIENT, 6, tcp(API, CLIENT, 80, 50100, S + 1, C + 1 + req.length, 0x18, res), false);
add(T0 + 0.0704, CLIENT, API, 6, tcp(CLIENT, API, 50100, 80, C + 1 + req.length, S + 1 + res.length, 0x11), true);
add(T0 + 0.0951, API, CLIENT, 6, tcp(API, CLIENT, 80, 50100, S + 1 + res.length, C + 2 + req.length, 0x11), false);

// 10-11: a connection attempt to 8080 that nothing answers, and its retransmission
add(T0 + 0.2000, CLIENT, DEAD, 6, tcp(CLIENT, DEAD, 50200, 8080, 9000, 0, 0x02), true);
add(T0 + 1.2004, CLIENT, DEAD, 6, tcp(CLIENT, DEAD, 50200, 8080, 9000, 0, 0x02), true);

// 12-15: HTTPS: handshake and one opaque record (encrypted bytes look random)
let seed = 42;
const rnd = (n) => Array.from({ length: n }, () => ((seed = (seed * 1103515245 + 12345) >>> 0) >>> 16) & 0xff);
add(T0 + 1.3000, CLIENT, API, 6, tcp(CLIENT, API, 50300, 443, 20000, 0, 0x02), true);
add(T0 + 1.3260, API, CLIENT, 6, tcp(API, CLIENT, 443, 50300, 30000, 20001, 0x12), false);
add(T0 + 1.3262, CLIENT, API, 6, tcp(CLIENT, API, 50300, 443, 20001, 30001, 0x10), true);
add(T0 + 1.3264, CLIENT, API, 6, tcp(CLIENT, API, 50300, 443, 20001, 30001, 0x18, [0x17, 0x03, 0x03, ...u16(512), ...rnd(512)]), true);

let seq = 30001;
for (let i = 0; i < bulk; i++) {
  add(T0 + 1.4 + i * 0.0005, API, CLIENT, 6, tcp(API, CLIENT, 443, 50300, seq, 20518, 0x10, rnd(1400)), false);
  seq += 1400;
}

// Classic pcap: magic a1b2c3d4 little-endian, version 2.4, snaplen 262144, LINKTYPE_ETHERNET (1).
const parts = [Buffer.from([0xd4, 0xc3, 0xb2, 0xa1, 2, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 1, 0, 0, 0])];
for (const p of packets) {
  const h = Buffer.alloc(16);
  const sec = Math.floor(p.t);
  h.writeUInt32LE(sec, 0);
  h.writeUInt32LE(Math.round((p.t - sec) * 1e6), 4);
  h.writeUInt32LE(p.bytes.length, 8);
  h.writeUInt32LE(p.bytes.length, 12);
  parts.push(h, Buffer.from(p.bytes));
}
writeFileSync(out, Buffer.concat(parts));
console.log(`${out}: ${packets.length} packets`);
