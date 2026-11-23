/**
 * Triage for packet captures: classic pcap (the libpcap format Wireshark
 * and tcpdump write) and pcapng. Counts packets and bytes, breaks traffic
 * down by protocol (Ethernet → IPv4/IPv6/ARP → TCP/UDP/ICMP → well-known
 * ports), lists the top conversations, and surfaces TCP SYNs without
 * handshakes and DNS query counts — the five-minute questions, with
 * Wireshark named on the page for everything deeper.
 *
 * References: the pcap format as documented in the IETF
 * draft-ietf-opsawg-pcap (the de-facto libpcap layout) and the pcapng
 * specification. Both byte orders, both precision magics. Dependency-free
 * on purpose: the CLI bundles it.
 */

export type PcapConversation = { a: string; b: string; packets: number; bytes: number; proto: string };

export type PcapSummary = {
  format: 'pcap' | 'pcapng';
  packets: number;
  totalBytes: number;
  truncated: boolean;
  durationSeconds?: number;
  linkType: string;
  byProtocol: { proto: string; packets: number; bytes: number }[];
  byService: { service: string; packets: number }[];
  conversations: PcapConversation[];
  dnsQueries: number;
  synWithoutAck: number;
  ipv4Hosts: number;
  ipv6Hosts: number;
};

const LINK: Record<number, string> = { 0: 'null/loopback', 1: 'Ethernet', 101: 'raw IP', 105: 'IEEE 802.11', 113: 'Linux cooked', 276: 'Linux cooked v2' };
const SERVICES: Record<number, string> = { 20: 'ftp-data', 21: 'ftp', 22: 'ssh', 23: 'telnet', 25: 'smtp', 53: 'dns', 67: 'dhcp', 68: 'dhcp', 80: 'http', 110: 'pop3', 123: 'ntp', 143: 'imap', 161: 'snmp', 443: 'https', 445: 'smb', 853: 'dot', 993: 'imaps', 995: 'pop3s', 1883: 'mqtt', 3306: 'mysql', 3389: 'rdp', 5432: 'postgres', 6379: 'redis', 8080: 'http-alt', 9092: 'kafka', 27017: 'mongodb' };

type Pkt = { ts: number; capLen: number; origLen: number; data: Uint8Array };

export function inspectPcap(bytes: Uint8Array): PcapSummary {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 24) throw new Error('Too short to be a capture file.');
  const magic = v.getUint32(0, true);
  if (magic === 0x0a0d0d0a) return summarise(...pcapng(bytes, v));
  const le = magic === 0xa1b2c3d4 || magic === 0xa1b23c4d;
  const be = magic === 0xd4c3b2a1 || magic === 0x4d3cb2a1;
  if (!le && !be) throw new Error('Not a capture: neither the pcap magic (A1B2C3D4) nor the pcapng block (0A0D0D0A) starts the file.');
  const nanos = magic === 0xa1b2c3d4 || magic === 0xd4c3b2a1 ? false : true;
  const little = le;
  const linkType = v.getUint32(20, little) & 0x0fffffff;
  const pkts: Pkt[] = [];
  let p = 24;
  let truncated = false;
  while (p + 16 <= bytes.length) {
    const sec = v.getUint32(p, little);
    const frac = v.getUint32(p + 4, little);
    const capLen = v.getUint32(p + 8, little);
    const origLen = v.getUint32(p + 12, little);
    if (p + 16 + capLen > bytes.length) {
      truncated = true;
      break;
    }
    pkts.push({ ts: sec + frac / (nanos ? 1e9 : 1e6), capLen, origLen, data: bytes.subarray(p + 16, p + 16 + capLen) });
    p += 16 + capLen;
  }
  return summarise('pcap', linkType, pkts, truncated);
}

function pcapng(bytes: Uint8Array, v: DataView): ['pcapng', number, Pkt[], boolean] {
  // Section header block decides endianness via its byte-order magic.
  const little = v.getUint32(8, true) === 0x1a2b3c4d;
  const pkts: Pkt[] = [];
  let linkType = 1;
  const resolutions: number[] = [];
  const tsOffsets: number[] = [];
  let p = 0;
  let truncated = false;
  while (p + 12 <= bytes.length) {
    const type = v.getUint32(p, little);
    const len = v.getUint32(p + 4, little);
    if (len < 12 || p + len > bytes.length) {
      truncated = len >= 12;
      break;
    }
    if (type === 1) {
      // Interface description block
      linkType = v.getUint16(p + 8, little);
      let resolution = 1e6;
      let tsOffset = 0;
      let o = p + 16;
      while (o + 4 <= p + len - 4) {
        const optCode = v.getUint16(o, little);
        const optLen = v.getUint16(o + 2, little);
        if (optCode === 9 && optLen >= 1) {
          const raw = bytes[o + 4];
          resolution = raw & 0x80 ? 2 ** (raw & 0x7f) : 10 ** raw;
        }
        // if_tsoffset: seconds every packet timestamp on this interface is
        // relative to (pcapng §4.2); ignoring it shifts durations by hours.
        if (optCode === 14 && optLen >= 8) tsOffset = Number(v.getBigInt64(o + 4, little));
        if (optCode === 0) break;
        o += 4 + ((optLen + 3) & ~3);
      }
      resolutions.push(resolution);
      tsOffsets.push(tsOffset);
    } else if (type === 6) {
      // Enhanced packet block
      const iface = v.getUint32(p + 8, little);
      const tsHigh = v.getUint32(p + 12, little);
      const tsLow = v.getUint32(p + 16, little);
      const capLen = v.getUint32(p + 20, little);
      const origLen = v.getUint32(p + 24, little);
      const res = resolutions[iface] ?? 1e6;
      const ts = (tsHigh * 2 ** 32 + tsLow) / res + (tsOffsets[iface] ?? 0);
      pkts.push({ ts, capLen, origLen, data: bytes.subarray(p + 28, p + 28 + capLen) });
    }
    p += (len + 3) & ~3;
  }
  return ['pcapng', linkType, pkts, truncated];
}

function summarise(format: 'pcap' | 'pcapng', linkType: number, pkts: Pkt[], truncated: boolean): PcapSummary {
  if (!pkts.length) throw new Error('The capture holds no packets.');
  const protoMap = new Map<string, { packets: number; bytes: number }>();
  const svcMap = new Map<string, number>();
  const convMap = new Map<string, PcapConversation>();
  const v4 = new Set<string>();
  const v6 = new Set<string>();
  let dns = 0;
  const syns = new Map<string, number>(); // flow -> syn seen; remove on syn-ack
  let synNoAck = 0;

  const bump = (proto: string, bytes: number) => {
    const e = protoMap.get(proto) ?? { packets: 0, bytes: 0 };
    e.packets += 1;
    e.bytes += bytes;
    protoMap.set(proto, e);
  };

  for (const pkt of pkts) {
    const d = pkt.data;
    let off = 0;
    let ethertype = 0;
    if (linkType === 1 && d.length >= 14) {
      ethertype = (d[12] << 8) | d[13];
      off = 14;
      if (ethertype === 0x8100 && d.length >= 18) {
        ethertype = (d[16] << 8) | d[17];
        off = 18;
      }
    } else if (linkType === 101) {
      ethertype = (d[0] >> 4) === 4 ? 0x0800 : 0x86dd;
    } else if (linkType === 113 && d.length >= 16) {
      ethertype = (d[14] << 8) | d[15];
      off = 16;
    } else {
      bump(LINK[linkType] ?? `linktype#${linkType}`, pkt.origLen);
      continue;
    }

    if (ethertype === 0x0806) {
      bump('ARP', pkt.origLen);
      continue;
    }
    let srcIp = '';
    let dstIp = '';
    let ipProto = -1;
    let l4 = -1;
    if (ethertype === 0x0800 && d.length >= off + 20) {
      const ihl = (d[off] & 0x0f) * 4;
      srcIp = `${d[off + 12]}.${d[off + 13]}.${d[off + 14]}.${d[off + 15]}`;
      dstIp = `${d[off + 16]}.${d[off + 17]}.${d[off + 18]}.${d[off + 19]}`;
      v4.add(srcIp).add(dstIp);
      ipProto = d[off + 9];
      l4 = off + ihl;
    } else if (ethertype === 0x86dd && d.length >= off + 40) {
      // Render per RFC 5952: lowercase groups without leading zeros, the
      // longest zero run compressed to ::.
      const fmt6 = (s: number): string => {
        const groups: number[] = [];
        for (let i = 0; i < 8; i++) groups.push((d[s + i * 2] << 8) | d[s + i * 2 + 1]);
        let best = -1;
        let bestLen = 0;
        for (let i = 0; i < 8; i++) {
          if (groups[i] !== 0) continue;
          let j = i;
          while (j < 8 && groups[j] === 0) j++;
          if (j - i > bestLen) {
            bestLen = j - i;
            best = i;
          }
        }
        if (bestLen < 2) return groups.map((g) => g.toString(16)).join(':');
        const head = groups.slice(0, best).map((g) => g.toString(16)).join(':');
        const tail = groups.slice(best + bestLen).map((g) => g.toString(16)).join(':');
        return `${head}::${tail}`;
      };
      srcIp = fmt6(off + 8);
      dstIp = fmt6(off + 24);
      v6.add(srcIp).add(dstIp);
      ipProto = d[off + 6];
      l4 = off + 40;
    } else {
      bump(`ethertype 0x${ethertype.toString(16)}`, pkt.origLen);
      continue;
    }

    if (ipProto === 6 && d.length >= l4 + 14) {
      bump('TCP', pkt.origLen);
      const sport = (d[l4] << 8) | d[l4 + 1];
      const dport = (d[l4 + 2] << 8) | d[l4 + 3];
      const flags = d[l4 + 13];
      const syn = (flags & 0x02) !== 0;
      const ack = (flags & 0x10) !== 0;
      const flow = `${srcIp}:${sport}>${dstIp}:${dport}`;
      const rflow = `${dstIp}:${dport}>${srcIp}:${sport}`;
      if (syn && !ack) syns.set(flow, (syns.get(flow) ?? 0) + 1);
      if (syn && ack) syns.delete(rflow);
      noteService(svcMap, sport, dport);
      conversation(convMap, srcIp, dstIp, 'TCP', pkt.origLen);
    } else if (ipProto === 17 && d.length >= l4 + 8) {
      bump('UDP', pkt.origLen);
      const sport = (d[l4] << 8) | d[l4 + 1];
      const dport = (d[l4 + 2] << 8) | d[l4 + 3];
      noteService(svcMap, sport, dport);
      conversation(convMap, srcIp, dstIp, 'UDP', pkt.origLen);
      if (dport === 53 && d.length >= l4 + 10) {
        const qr = d[l4 + 10] & 0x80;
        if (!qr) dns += 1;
      }
    } else if (ipProto === 1 || ipProto === 58) {
      bump(ipProto === 1 ? 'ICMP' : 'ICMPv6', pkt.origLen);
      conversation(convMap, srcIp, dstIp, 'ICMP', pkt.origLen);
    } else {
      bump(`ip-proto ${ipProto}`, pkt.origLen);
    }
  }
  for (const n of syns.values()) synNoAck += n;

  const times = pkts.map((p) => p.ts).filter((t) => t > 0);
  return {
    format,
    packets: pkts.length,
    totalBytes: pkts.reduce((s, p) => s + p.origLen, 0),
    truncated,
    durationSeconds: times.length > 1 ? Math.max(...times) - Math.min(...times) : undefined,
    linkType: LINK[linkType] ?? `linktype#${linkType}`,
    byProtocol: [...protoMap.entries()].map(([proto, e]) => ({ proto, ...e })).sort((a, b) => b.bytes - a.bytes),
    byService: [...svcMap.entries()].map(([service, packets]) => ({ service, packets })).sort((a, b) => b.packets - a.packets).slice(0, 10),
    conversations: [...convMap.values()].sort((a, b) => b.bytes - a.bytes).slice(0, 10),
    dnsQueries: dns,
    synWithoutAck: synNoAck,
    ipv4Hosts: v4.size,
    ipv6Hosts: v6.size,
  };
}

function noteService(map: Map<string, number>, sport: number, dport: number): void {
  const svc = SERVICES[dport] ?? SERVICES[sport];
  if (svc) map.set(svc, (map.get(svc) ?? 0) + 1);
}

function conversation(map: Map<string, PcapConversation>, a: string, b: string, proto: string, bytes: number): void {
  const key = a < b ? `${a}|${b}|${proto}` : `${b}|${a}|${proto}`;
  const c = map.get(key) ?? { a: a < b ? a : b, b: a < b ? b : a, packets: 0, bytes: 0, proto };
  c.packets += 1;
  c.bytes += bytes;
  map.set(key, c);
}

const iec = (n: number): string => {
  if (n < 1024) return `${n} B`;
  const units = ['KiB', 'MiB', 'GiB'];
  let x = n;
  let u = -1;
  do { x /= 1024; u += 1; } while (x >= 1024 && u < units.length - 1);
  return `${x >= 100 ? Math.round(x) : x.toFixed(1)} ${units[u]}`;
};

export function renderPcapSummary(s: PcapSummary): string {
  const lines = [
    `${s.format}  ·  ${s.packets.toLocaleString('en-US')} packets  ·  ${iec(s.totalBytes)}${s.durationSeconds !== undefined ? `  ·  ${s.durationSeconds.toFixed(1)}s` : ''}  ·  ${s.linkType}${s.truncated ? '  ·  TRUNCATED mid-packet' : ''}`,
    `${s.ipv4Hosts} IPv4 hosts, ${s.ipv6Hosts} IPv6 hosts  ·  ${s.dnsQueries} DNS queries${s.synWithoutAck ? `  ·  ${s.synWithoutAck} SYNs never answered` : ''}`,
    '',
    'by protocol',
  ];
  for (const p of s.byProtocol) lines.push(`  ${iec(p.bytes).padStart(9)}  ${p.packets.toLocaleString('en-US').padStart(8)} pkts  ${p.proto}`);
  if (s.byService.length) {
    lines.push('', 'services (well-known ports)');
    for (const sv of s.byService) lines.push(`  ${sv.packets.toLocaleString('en-US').padStart(8)} pkts  ${sv.service}`);
  }
  lines.push('', 'top conversations');
  for (const c of s.conversations.slice(0, 6)) lines.push(`  ${iec(c.bytes).padStart(9)}  ${c.a} <-> ${c.b}  (${c.proto}, ${c.packets} pkts)`);
  return lines.join('\n');
}
