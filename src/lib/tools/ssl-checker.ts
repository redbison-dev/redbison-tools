/**
 * Offline checks for a pasted TLS certificate chain. Browsers do not expose a
 * site's certificate to page JavaScript, so the SSL Checker works on the PEM
 * output of `openssl s_client -showcerts` instead of connecting itself.
 */
import {
  commonName,
  daysUntil,
  isWeakKey,
  isWeakSignature,
  parseCertificates,
  toHex,
  validityState,
  type ParsedCertificate,
  type ValidityState,
} from './x509-parser';
import { msg } from '../msg';

/** A translate function (the page's t); English by default. */
type Translate = (source: string, vars?: Record<string, string | number>) => string;
const english: Translate = (s, v) => s.replace(/\{(\w+)\}/g, (all, k: string) => (v?.[k] === undefined ? all : String(v[k])));

export type CheckLevel = 'pass' | 'warn' | 'fail' | 'info';

export interface ChainCheck {
  id: string;
  level: CheckLevel;
  label: string;
  detail: string;
}

export interface ChainReport {
  certificates: ParsedCertificate[];
  leaf: ParsedCertificate;
  daysUntilExpiry: number;
  validity: ValidityState;
  hostnameMatch?: boolean;
  checks: ChainCheck[];
}

/** Strip scheme, path, port and trailing dot from user input. */
export function normalizeHostname(input: string): string {
  const host = input
    .trim()
    .replace(/^[a-z]+:\/\//i, '')
    .replace(/[/?#].*$/, '');
  // [IPv6]:port (RFC 3986) or a bare IPv6 literal: the colons belong to the address.
  const bracketed = host.match(/^\[([^\]]*)\](?::\d+)?$/);
  if (bracketed) return bracketed[1].toLowerCase();
  if ((host.match(/:/g) ?? []).length > 1) return host.toLowerCase();
  return host
    .replace(/:\d+$/, '')
    .replace(/\.$/, '')
    .toLowerCase();
}

/** Expand an IPv6 literal to eight lowercase groups without leading zeros, as the SAN list prints it. */
function expandIpv6(ip: string): string | null {
  const halves = ip.toLowerCase().split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...tail];
  if (!groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => parseInt(g, 16).toString(16)).join(':');
}

/**
 * RFC 6125 style matching against SAN entries only (browsers ignore the CN).
 * A wildcard covers exactly one left-most label: *.example.com matches
 * www.example.com but not example.com or a.b.example.com.
 */
export function hostnameMatches(hostname: string, subjectAltNames: string[]): boolean {
  const host = normalizeHostname(hostname);
  if (!host) return false;
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':');
  for (const san of subjectAltNames) {
    if (isIp && san.startsWith('IP:')) {
      const value = san.slice(3).toLowerCase();
      if (value === host) return true;
      // IP SANs are compared as addresses, so 2001:db8::1 matches 2001:db8:0:0:0:0:0:1.
      if (host.includes(':') && expandIpv6(value) !== null && expandIpv6(value) === expandIpv6(host)) return true;
      continue;
    }
    if (isIp || !san.startsWith('DNS:')) continue;
    const pattern = san.slice(4).toLowerCase().replace(/\.$/, '');
    if (pattern === host) return true;
    if (pattern.startsWith('*.')) {
      const suffix = pattern.slice(1); // ".example.com"
      if (host.endsWith(suffix)) {
        const label = host.slice(0, -suffix.length);
        if (label && !label.includes('.')) return true;
      }
    }
  }
  return false;
}

export function opensslCommand(hostname: string): string {
  const host = normalizeHostname(hostname) || 'example.com';
  return `openssl s_client -connect ${host}:443 -servername ${host} -showcerts </dev/null`;
}

export function describeKey(cert: ParsedCertificate): string {
  const k = cert.publicKey;
  return [k.algorithm, k.curve, k.keySize ? `${k.keySize} bits` : ''].filter(Boolean).join(' ');
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return toHex(a) === toHex(b);
}

export function analyzeChain(pem: string, hostname = '', now: Date = new Date(), t: Translate = english): ChainReport {
  const certificates = parseCertificates(pem);
  const leaf = certificates[0];
  const checks: ChainCheck[] = [];
  const days = daysUntil(leaf.notAfter, now);
  const validity = validityState(leaf, now);

  if (validity === 'expired') {
    checks.push({ id: 'expiry', level: 'fail', label: t(msg('Expired')), detail: t(msg('The leaf certificate expired {days} day(s) ago.'), { days: -days }) });
  } else if (validity === 'not-yet-valid') {
    checks.push({ id: 'expiry', level: 'fail', label: t(msg('Not yet valid')), detail: t(msg('The leaf certificate only becomes valid on {date}.'), { date: leaf.notBefore.toISOString() }) });
  } else if (days < 14) {
    checks.push({ id: 'expiry', level: 'warn', label: t(msg('Expires soon')), detail: t(msg('{days} day(s) left. Renew now.'), { days }) });
  } else if (days < 30) {
    checks.push({ id: 'expiry', level: 'warn', label: t(msg('Renewal window')), detail: t(msg('{days} day(s) left. Most ACME clients renew at 30 days.'), { days }) });
  } else {
    checks.push({ id: 'expiry', level: 'pass', label: t(msg('Within validity period')), detail: t(msg('{days} day(s) until expiry.'), { days }) });
  }

  let hostnameMatch: boolean | undefined;
  if (normalizeHostname(hostname)) {
    hostnameMatch = hostnameMatches(hostname, leaf.subjectAltNames);
    checks.push(
      hostnameMatch
        ? { id: 'hostname', level: 'pass', label: t(msg('Hostname matches')), detail: t(msg('{host} is covered by the SAN list.'), { host: normalizeHostname(hostname) }) }
        : {
            id: 'hostname',
            level: 'fail',
            label: t(msg('Hostname mismatch')),
            detail: leaf.subjectAltNames.length
              ? t(msg('{host} is not in the SAN list. Browsers ignore the Common Name.'), { host: normalizeHostname(hostname) })
              : t(msg('The certificate has no Subject Alternative Name extension, so modern browsers reject it for any hostname.')),
          },
    );
  }

  // A root's self-signature is never checked by clients, so it is skipped here.
  const weakSig = certificates.filter(
    (c, i) => !(i > 0 && i === certificates.length - 1 && c.selfIssued) && isWeakSignature(c.signatureAlgorithm),
  );
  checks.push(
    weakSig.length
      ? { id: 'signature', level: 'fail', label: t(msg('Weak signature algorithm')), detail: weakSig.map((c) => `${commonName(c.subject) ?? c.subjectString}: ${c.signatureAlgorithm}`).join('; ') }
      : { id: 'signature', level: 'pass', label: t(msg('Signature algorithms')), detail: t(msg('Leaf signed with {algorithm}.'), { algorithm: leaf.signatureAlgorithm }) },
  );

  const weakKeys = certificates.filter((c) => isWeakKey(c.publicKey));
  checks.push(
    weakKeys.length
      ? { id: 'key', level: 'fail', label: t(msg('Weak key')), detail: weakKeys.map((c) => `${commonName(c.subject) ?? c.subjectString}: ${c.publicKey.algorithm} ${c.publicKey.keySize ?? '?'} bits`).join('; ') }
      : { id: 'key', level: 'pass', label: t(msg('Key strength')), detail: t(msg('Leaf key: {key}.'), { key: describeKey(leaf) }) },
  );

  if (leaf.selfIssued) {
    checks.push({ id: 'self-signed', level: 'warn', label: t(msg('Self-signed')), detail: t(msg('Issuer and subject are identical. Browsers only trust this if it is installed as a root.')) });
  }

  if (leaf.basicConstraints?.ca) {
    checks.push({ id: 'leaf-ca', level: 'warn', label: t(msg('First certificate is a CA')), detail: t(msg('The first certificate should be the server (leaf) certificate. Check the order of the chain.')) });
  }

  if (leaf.extendedKeyUsage.length && !leaf.extendedKeyUsage.some((u) => u === 'Server Authentication' || u === 'Any Extended Key Usage')) {
    checks.push({ id: 'eku', level: 'fail', label: t(msg('Not a server certificate')), detail: t(msg('Extended Key Usage is {usages}; TLS servers need Server Authentication.'), { usages: leaf.extendedKeyUsage.join(', ') }) });
  }

  for (let i = 0; i + 1 < certificates.length; i++) {
    const child = certificates[i];
    const parent = certificates[i + 1];
    if (!sameBytes(child.issuerDer, parent.subjectDer)) {
      checks.push({
        id: `order-${i}`,
        level: 'fail',
        label: t(msg('Chain out of order')),
        detail: t(msg('Certificate {n} was issued by "{issuer}", but certificate {next} is "{subject}".'), { n: i + 1, issuer: child.issuerString, next: i + 2, subject: parent.subjectString }),
      });
    }
  }

  if (certificates.length === 1 && !leaf.selfIssued) {
    checks.push({
      id: 'intermediates',
      level: 'warn',
      label: t(msg('No intermediates supplied')),
      detail: t(msg('Only one certificate was pasted. If the server sends only this one, clients without the intermediate cached will fail with "unable to get local issuer certificate".')),
    });
  } else if (certificates.length > 1) {
    checks.push({ id: 'chain', level: 'info', label: t(msg('Chain length')), detail: t(msg('{n} certificates supplied.'), { n: certificates.length }) });
  }

  const intermediateExpiry = certificates.slice(1).filter((c) => c.notAfter < now);
  if (intermediateExpiry.length) {
    checks.push({ id: 'intermediate-expired', level: 'fail', label: t(msg('Expired intermediate')), detail: intermediateExpiry.map((c) => c.subjectString).join('; ') });
  }

  return { certificates, leaf, daysUntilExpiry: days, validity, hostnameMatch, checks };
}
