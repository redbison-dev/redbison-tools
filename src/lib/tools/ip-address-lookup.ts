const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

export function isValidIPv4(ip: string): boolean {
  return IPV4.test(ip);
}

/**
 * RFC 4291 text forms: full (8 groups), "::" compressed (once), and a
 * trailing embedded IPv4 address such as ::ffff:192.0.2.1. Zone IDs (%eth0)
 * are not accepted because lookup services do not take them.
 */
export function isValidIPv6(ip: string): boolean {
  if (!ip || !/^[0-9a-fA-F:.]+$/.test(ip)) return false;
  const halves = ip.split('::');
  if (halves.length > 2) return false;

  const groupsOf = (s: string): string[] | null => (s === '' ? [] : s.split(':'));
  const head = groupsOf(halves[0]);
  const tail = halves.length === 2 ? groupsOf(halves[1]) : [];
  if (!head || !tail) return false;
  const all = [...head, ...tail];

  let count = 0;
  for (let i = 0; i < all.length; i++) {
    const g = all[i];
    const isLast = i === all.length - 1;
    if (isLast && g.includes('.')) {
      if (!isValidIPv4(g)) return false;
      count += 2;
    } else if (/^[0-9a-fA-F]{1,4}$/.test(g)) {
      count += 1;
    } else {
      return false;
    }
  }
  return halves.length === 2 ? count < 8 : count === 8;
}

export function isValidIpForLookup(ip: string): boolean {
  const v = ip.trim();
  return isValidIPv4(v) || isValidIPv6(v);
}
