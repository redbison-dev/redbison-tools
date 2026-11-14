import { intToIPv4, parseIPv4 } from './ip-converter';
import { msg } from '../msg';

export interface SubnetInfo {
  networkAddress: string;
  /** null for /31 (RFC 3021 point-to-point) and /32 (single host): neither has a broadcast address. */
  broadcastAddress: string | null;
  subnetMask: string;
  wildcardMask: string;
  cidr: string;
  prefix: number;
  totalHosts: number;
  usableHosts: number;
  firstUsableIP: string;
  lastUsableIP: string;
  networkClass: string;
}

/** Netmask for a prefix length as an unsigned 32-bit integer. Handles /0, where `<< 32` is a no-op in JS. */
export function prefixToMask(prefix: number): number {
  if (prefix === 0) return 0;
  return (0xffffffff << (32 - prefix)) >>> 0;
}

export function prefixToMaskString(prefix: number): string {
  return intToIPv4(prefixToMask(prefix));
}

/** Historical classful label for the first octet (RFC 791 classes; obsolete since CIDR, shown for reference). */
export function getNetworkClass(firstOctet: number): string {
  if (firstOctet === 0) return msg('Class A (0.0.0.0/8, "this network")');
  if (firstOctet === 127) return msg('Class A (127.0.0.0/8 loopback)');
  if (firstOctet <= 127) return msg('Class A');
  if (firstOctet <= 191) return msg('Class B');
  if (firstOctet <= 223) return msg('Class C');
  if (firstOctet <= 239) return msg('Class D (Multicast)');
  return msg('Class E (Reserved)');
}

export function calculateSubnet(ip: string, prefix: number): SubnetInfo {
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) throw new Error(msg('Prefix length must be between /0 and /32'));
  const ipInt = parseIPv4(ip);
  const mask = prefixToMask(prefix);
  const wildcard = ~mask >>> 0;
  const network = (ipInt & mask) >>> 0;
  const last = (network | wildcard) >>> 0;
  const totalHosts = 2 ** (32 - prefix);

  let usableHosts: number;
  let first: number;
  let lastUsable: number;
  let broadcast: number | null;
  if (prefix === 32) {
    usableHosts = 1;
    first = lastUsable = network;
    broadcast = null;
  } else if (prefix === 31) {
    // RFC 3021: both addresses of a /31 are usable on point-to-point links.
    usableHosts = 2;
    first = network;
    lastUsable = last;
    broadcast = null;
  } else {
    usableHosts = totalHosts - 2;
    first = network + 1;
    lastUsable = last - 1;
    broadcast = last;
  }

  return {
    networkAddress: intToIPv4(network),
    broadcastAddress: broadcast === null ? null : intToIPv4(broadcast),
    subnetMask: intToIPv4(mask),
    wildcardMask: intToIPv4(wildcard),
    cidr: `/${prefix}`,
    prefix,
    totalHosts,
    usableHosts,
    firstUsableIP: intToIPv4(first),
    lastUsableIP: intToIPv4(lastUsable),
    networkClass: getNetworkClass(ipInt >>> 24),
  };
}
