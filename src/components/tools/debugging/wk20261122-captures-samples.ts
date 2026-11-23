/**
 * The PCAP File Inspector's built-in sample, shared by the component and the
 * tests that pin its figures (src/test/tools/wk20261122-captures.render.test.tsx,
 * src/test/guides/wk20261122-captures.test.ts). A classic little-endian pcap
 * (magic 0xA1B2C3D4, microsecond timestamps, LinkType 1 Ethernet) built byte
 * by byte per draft-ietf-opsawg-pcap: 24-octet file header, then 16-octet
 * packet record headers. The traffic is a 4-second story on RFC 5737
 * documentation addresses (192.0.2.0/24 and 198.51.100.0/24), so the sample
 * never shows a real network: a DNS lookup and its answer, a TLS-shaped HTTPS
 * exchange with a full handshake, a SYN to port 8080 nothing answers, one ARP
 * request and an ICMP echo pair.
 *
 * The Arrow sample is not built here: it is the pyarrow-written file served
 * at /samples/sample.arrow, byte-identical to src/test/fixtures/sample.arrow
 * (the render test asserts that), because a hand-built flatbuffer would test
 * the parser against itself instead of against the real writer.
 */

const CLIENT = [192, 0, 2, 10];
const RESOLVER = [192, 0, 2, 1];
const SERVER = [198, 51, 100, 7];

export function samplePcapBytes(): Uint8Array {
  const out: number[] = [];
  const u16 = (v: number) => out.push(v & 0xff, (v >> 8) & 0xff);
  const u32 = (v: number) => out.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);
  const be16 = (v: number) => [(v >> 8) & 0xff, v & 0xff];

  // File header: magic (usec), version 2.4, two reserved words, SnapLen, LinkType 1.
  u32(0xa1b2c3d4); u16(2); u16(4); u32(0); u32(0); u32(65535); u32(1);

  const record = (sec: number, usec: number, payload: number[]) => {
    u32(sec); u32(usec); u32(payload.length); u32(payload.length);
    out.push(...payload);
  };
  const eth = (ethertype: number, rest: number[]) => [
    0x02, 0, 0, 0, 0, 0x01, // dst MAC (locally administered, documentation-only)
    0x02, 0, 0, 0, 0, 0x02, // src MAC
    ...be16(ethertype),
    ...rest,
  ];
  const ipv4 = (src: number[], dst: number[], proto: number, l4: number[]) => {
    const total = 20 + l4.length;
    return [0x45, 0, ...be16(total), 0, 0, 0, 0, 64, proto, 0, 0, ...src, ...dst, ...l4];
  };
  const tcp = (sport: number, dport: number, flags: number, payloadLen = 0) => [
    ...be16(sport), ...be16(dport),
    0, 0, 0, 1, 0, 0, 0, 0, // seq, ack
    0x50, flags, 0xff, 0xff, 0, 0, 0, 0, // offset, flags, window, checksum, urgent
    ...new Array<number>(payloadLen).fill(0),
  ];
  const udp = (sport: number, dport: number, payload: number[]) => [
    ...be16(sport), ...be16(dport), ...be16(8 + payload.length), 0, 0, ...payload,
  ];

  // DNS question for api.example.com, type A, class IN (21 bytes).
  const question = [3, 97, 112, 105, 7, 101, 120, 97, 109, 112, 108, 101, 3, 99, 111, 109, 0, 0, 1, 0, 1];
  // Query: id 0x1A2B, flags 0x0100 (QR=0, RD=1), one question.
  const dnsQuery = [0x1a, 0x2b, 0x01, 0x00, 0, 1, 0, 0, 0, 0, 0, 0, ...question];
  // Response: flags 0x8180 (QR=1), one answer: name pointer, A, IN, TTL 300, 198.51.100.7.
  const dnsResponse = [0x1a, 0x2b, 0x81, 0x80, 0, 1, 0, 1, 0, 0, 0, 0, ...question,
    0xc0, 0x0c, 0, 1, 0, 1, 0, 0, 1, 0x2c, 0, 4, ...SERVER];

  const SYN = 0x02, SYNACK = 0x12, ACK = 0x10, PSHACK = 0x18;

  // 1-2: the DNS lookup and its answer.
  record(1000, 0, eth(0x0800, ipv4(CLIENT, RESOLVER, 17, udp(54321, 53, dnsQuery))));
  record(1000, 1200, eth(0x0800, ipv4(RESOLVER, CLIENT, 17, udp(53, 54321, dnsResponse))));
  // 3-9: HTTPS to the answered address: handshake, a ClientHello-sized send,
  // two full server segments, a closing ACK.
  record(1000, 2000, eth(0x0800, ipv4(CLIENT, SERVER, 6, tcp(49200, 443, SYN))));
  record(1000, 22000, eth(0x0800, ipv4(SERVER, CLIENT, 6, tcp(443, 49200, SYNACK))));
  record(1000, 22500, eth(0x0800, ipv4(CLIENT, SERVER, 6, tcp(49200, 443, ACK))));
  record(1000, 30000, eth(0x0800, ipv4(CLIENT, SERVER, 6, tcp(49200, 443, PSHACK, 517))));
  record(1000, 52000, eth(0x0800, ipv4(SERVER, CLIENT, 6, tcp(443, 49200, PSHACK, 1400))));
  record(1000, 52400, eth(0x0800, ipv4(SERVER, CLIENT, 6, tcp(443, 49200, PSHACK, 1400))));
  record(1000, 90000, eth(0x0800, ipv4(CLIENT, SERVER, 6, tcp(49200, 443, ACK))));
  // 10: a SYN to port 8080 that nothing ever answers.
  record(1001, 500000, eth(0x0800, ipv4(CLIENT, SERVER, 6, tcp(49201, 8080, SYN))));
  // 11: an ARP request (who-has 192.0.2.1).
  record(1002, 0, eth(0x0806, [0, 1, 8, 0, 6, 4, 0, 1,
    0x02, 0, 0, 0, 0, 0x02, ...CLIENT, 0, 0, 0, 0, 0, 0, ...RESOLVER]));
  // 12-13: an ICMP echo request and reply with a 48-byte payload.
  const icmp = (type: number) => [type, 0, 0, 0, 0, 1, 0, 1, ...new Array<number>(48).fill(0x61)];
  record(1003, 0, eth(0x0800, ipv4(CLIENT, SERVER, 1, icmp(8))));
  record(1004, 0, eth(0x0800, ipv4(SERVER, CLIENT, 1, icmp(0))));

  return new Uint8Array(out);
}
