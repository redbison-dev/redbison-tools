import { describe, expect, it } from 'vitest';
import { parseIPv4, intToIPv4, parseIPv4Integer, ipv4ToHex, ipv4ToBinary } from '@/lib/tools/ip-converter';
import { calculateSubnet, prefixToMask, getNetworkClass } from '@/lib/tools/subnet-calculator';
import { normalizeMac, analyzeMac, lookupOui } from '@/lib/tools/mac-address-lookup';
import { isValidIPv6, isValidIpForLookup } from '@/lib/tools/ip-address-lookup';
import { normalizeDomainInput, buildDohRequest } from '@/lib/tools/dns-lookup';
import { parsePortList } from '@/lib/tools/port-scanner';

describe('ip-converter: dotted decimal parsing', () => {
  it('converts known addresses to integers', () => {
    expect(parseIPv4('192.168.1.1')).toBe(3232235777);
    expect(parseIPv4('127.0.0.1')).toBe(2130706433);
    expect(parseIPv4('0.0.0.0')).toBe(0);
    expect(parseIPv4('255.255.255.255')).toBe(4294967295);
    expect(parseIPv4('  8.8.8.8 ')).toBe(134744072);
  });
  it.each(['256.1.1.1', '1.2.3', '1.2.3.4.5', '1.2.3.-4', '1a.2.3.4', '', '1..2.3', '1.2.3.4/24'])(
    'rejects %s',
    (bad) => expect(() => parseIPv4(bad)).toThrow(),
  );
  it('rejects leading zeros instead of guessing decimal or octal', () => {
    expect(() => parseIPv4('192.168.001.010')).toThrow(/leading zero/i);
  });
});

describe('ip-converter: integer input', () => {
  it('converts integers back to dotted decimal', () => {
    expect(intToIPv4(3232235777)).toBe('192.168.1.1');
    expect(intToIPv4(0)).toBe('0.0.0.0');
    expect(intToIPv4(4294967295)).toBe('255.255.255.255');
  });
  it('accepts decimal and 0x hex strings', () => {
    expect(parseIPv4Integer('3232235777')).toBe(3232235777);
    expect(parseIPv4Integer('0xC0A80101')).toBe(3232235777);
  });
  it.each(['123abc', '1.5', '1e3', '-1', '4294967296', '0x100000000', ''])(
    'rejects junk or out-of-range integer %s (old parseInt accepted some of these)',
    (bad) => expect(() => parseIPv4Integer(bad)).toThrow(),
  );
  it('formats hex and binary', () => {
    expect(ipv4ToHex(3232235777)).toBe('0xC0A80101');
    expect(ipv4ToBinary(3232235777)).toBe('11000000.10101000.00000001.00000001');
  });
});

describe('subnet-calculator', () => {
  it('computes a /24', () => {
    const r = calculateSubnet('192.168.1.130', 24);
    expect(r).toMatchObject({
      networkAddress: '192.168.1.0',
      broadcastAddress: '192.168.1.255',
      subnetMask: '255.255.255.0',
      wildcardMask: '0.0.0.255',
      totalHosts: 256,
      usableHosts: 254,
      firstUsableIP: '192.168.1.1',
      lastUsableIP: '192.168.1.254',
    });
  });
  it('computes a /26 that does not start on an octet boundary', () => {
    const r = calculateSubnet('10.20.30.77', 26);
    expect(r.networkAddress).toBe('10.20.30.64');
    expect(r.broadcastAddress).toBe('10.20.30.127');
    expect(r.wildcardMask).toBe('0.0.0.63');
    expect(r.usableHosts).toBe(62);
  });
  it('computes a /20 spanning octets', () => {
    const r = calculateSubnet('172.16.37.9', 20);
    expect(r.networkAddress).toBe('172.16.32.0');
    expect(r.broadcastAddress).toBe('172.16.47.255');
    expect(r.firstUsableIP).toBe('172.16.32.1');
    expect(r.lastUsableIP).toBe('172.16.47.254');
    expect(r.usableHosts).toBe(4094);
  });
  it('treats /31 as a two-host point-to-point link (RFC 3021)', () => {
    const r = calculateSubnet('10.0.0.1', 31);
    expect(r.totalHosts).toBe(2);
    expect(r.usableHosts).toBe(2);
    expect(r.firstUsableIP).toBe('10.0.0.0');
    expect(r.lastUsableIP).toBe('10.0.0.1');
    expect(r.broadcastAddress).toBeNull();
  });
  it('treats /32 as a single host', () => {
    const r = calculateSubnet('203.0.113.7', 32);
    expect(r.totalHosts).toBe(1);
    expect(r.usableHosts).toBe(1);
    expect(r.firstUsableIP).toBe('203.0.113.7');
    expect(r.lastUsableIP).toBe('203.0.113.7');
    expect(r.subnetMask).toBe('255.255.255.255');
    expect(r.wildcardMask).toBe('0.0.0.0');
  });
  it('handles /0 and /1 without 32-bit shift bugs', () => {
    expect(prefixToMask(0)).toBe(0);
    const r0 = calculateSubnet('8.8.8.8', 0);
    expect(r0.subnetMask).toBe('0.0.0.0');
    expect(r0.totalHosts).toBe(4294967296);
    const r1 = calculateSubnet('200.1.1.1', 1);
    expect(r1.networkAddress).toBe('128.0.0.0');
    expect(r1.subnetMask).toBe('128.0.0.0');
  });
  it('rejects invalid octets and prefixes', () => {
    expect(() => calculateSubnet('192.168.1.256', 24)).toThrow();
    expect(() => calculateSubnet('192.168.1.1a', 24)).toThrow();
    expect(() => calculateSubnet('192.168.1.1', 33)).toThrow();
    expect(() => calculateSubnet('192.168.1.1', -1)).toThrow();
  });
  it('classifies 0.x and 127.x instead of returning Unknown', () => {
    expect(getNetworkClass(127)).toMatch(/Class A/);
    expect(getNetworkClass(10)).toBe('Class A');
    expect(getNetworkClass(0)).toMatch(/Class A/);
    expect(getNetworkClass(224)).toMatch(/Class D/);
  });
});

describe('mac-address-lookup', () => {
  it.each([
    '00:50:56:c0:00:08',
    '00-50-56-C0-00-08',
    '0050.56c0.0008',
    '005056C00008',
    ' 00 50 56 c0 00 08 ',
  ])('normalises %s', (input) => expect(normalizeMac(input)).toBe('00:50:56:C0:00:08'));
  it.each(['00:50:56:C0:00', '00:50:56:C0:00:08:09', 'GG:50:56:C0:00:08', ''])('rejects %s', (bad) =>
    expect(normalizeMac(bad)).toBeNull(),
  );
  it('reads the multicast bit from the low bit of the first octet', () => {
    const a = analyzeMac('01:00:5E:00:00:FB');
    expect(a.isMulticast).toBe(true);
    expect(a.addressType).toBe('Multicast');
  });
  it('reads the locally administered bit', () => {
    const a = analyzeMac('DA:A1:19:00:00:01');
    expect(a.isLocal).toBe(true);
    expect(a.isMulticast).toBe(false);
    expect(a.addressType).toBe('Locally Administered');
  });
  it('does not guess a vendor from a partial prefix match', () => {
    // 00:50:99 is not in the table; the old code matched it to 00:50:56 (VMware).
    expect(lookupOui('00:50:99')).toBeNull();
  });
  it('uses correct IEEE assignments', () => {
    expect(lookupOui('00:1A:92')?.vendor).toMatch(/ASUSTek/);
    expect(lookupOui('84:2B:2B')?.vendor).toMatch(/Dell/);
    expect(lookupOui('00:26:08')?.vendor).toMatch(/Apple/);
    expect(lookupOui('00:12:CF')?.vendor).toMatch(/Accton/);
    expect(lookupOui('00:50:56')?.vendor).toMatch(/VMware/);
  });
});

describe('ip-address-lookup validation', () => {
  it.each(['2001:4860:4860::8888', '::1', '::', 'fe80::1', '2001:db8:0:0:0:0:2:1', '::ffff:192.0.2.1'])(
    'accepts compressed IPv6 %s',
    (ip) => expect(isValidIPv6(ip)).toBe(true),
  );
  it.each(['2001:db8::1::1', '12345::1', '1:2:3:4:5:6:7:8:9', 'gggg::1', ':1:2', '1:2:3:4:5:6:7::8:9'])(
    'rejects malformed IPv6 %s',
    (ip) => expect(isValidIPv6(ip)).toBe(false),
  );
  it('accepts IPv4 and rejects garbage', () => {
    expect(isValidIpForLookup('8.8.8.8')).toBe(true);
    expect(isValidIpForLookup('8.8.8')).toBe(false);
    expect(isValidIpForLookup('example.com')).toBe(false);
  });
});

describe('dns-lookup', () => {
  it.each([
    ['example.com', 'example.com'],
    ['  Example.COM. ', 'example.com'],
    ['https://www.example.com/path?q=1', 'www.example.com'],
    ['http://example.com:8080', 'example.com'],
  ])('normalises %s', (input, out) => expect(normalizeDomainInput(input)).toBe(out));
  it('rejects things that are not hostnames', () => {
    expect(normalizeDomainInput('')).toBeNull();
    expect(normalizeDomainInput('exa mple.com')).toBeNull();
  });
  it('builds GET JSON queries for every provider (Cloudflare and Quad9 reject JSON POST bodies)', () => {
    for (const p of ['https://dns.google/resolve', 'https://cloudflare-dns.com/dns-query', 'https://dns.quad9.net:5053/dns-query']) {
      const req = buildDohRequest(p, 'example.com', 28);
      expect(req.method).toBe('GET');
      expect(req.url).toBe(`${p}?name=example.com&type=28`);
      expect(req.headers.Accept).toBe('application/dns-json');
    }
  });
});

describe('port-scanner port list', () => {
  it('parses lists and ranges, dedupes and sorts', () => {
    expect(parsePortList('443, 80,22,80')).toEqual([22, 80, 443]);
    expect(parsePortList('20-25')).toEqual([20, 21, 22, 23, 24, 25]);
  });
  it('drops junk instead of truncating it with parseInt', () => {
    expect(parsePortList('8080abc, 0, 70000, 3306')).toEqual([3306]);
  });
});
