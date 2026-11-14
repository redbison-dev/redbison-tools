/**
 * Minimal DER/ASN.1 reader and X.509 v3 certificate parser (RFC 5280).
 * Pure functions so the X.509 Parser, SSL Checker, JWK Tool and Digital
 * Signature Validator share one tested implementation. Read-only: it decodes
 * fields; it does not verify signatures or build trust chains.
 */
import { msg, built } from '../msg';

export interface Asn1Node {
  /** Full identifier octet (class + constructed bit + tag number). */
  tag: number;
  /** Tag number without class/constructed bits (low-tag-number form only). */
  tagNumber: number;
  tagClass: 'universal' | 'application' | 'context' | 'private';
  constructed: boolean;
  /** Whole TLV encoding. */
  der: Uint8Array;
  /** Value octets only. */
  value: Uint8Array;
  children: Asn1Node[];
}

const CLASSES = ['universal', 'application', 'context', 'private'] as const;

function readNode(bytes: Uint8Array, offset: number): { node: Asn1Node; next: number } {
  if (offset + 2 > bytes.length) throw new Error(msg('Truncated DER data'));
  const tag = bytes[offset];
  if ((tag & 0x1f) === 0x1f) throw new Error(msg('High tag numbers are not supported'));
  let pos = offset + 1;
  let len = bytes[pos++];
  if (len === 0x80) throw new Error(msg('Indefinite length is not allowed in DER'));
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n > 4 || pos + n > bytes.length) throw new Error(msg('Invalid DER length'));
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + bytes[pos++];
  }
  const end = pos + len;
  if (end > bytes.length) throw new Error(msg('DER length runs past the end of the data'));
  const constructed = (tag & 0x20) !== 0;
  const value = bytes.subarray(pos, end);
  const node: Asn1Node = {
    tag,
    tagNumber: tag & 0x1f,
    tagClass: CLASSES[tag >> 6],
    constructed,
    der: bytes.subarray(offset, end),
    value,
    children: [],
  };
  if (constructed) {
    let p = 0;
    while (p < value.length) {
      const r = readNode(value, p);
      node.children.push(r.node);
      p = r.next;
    }
  }
  return { node, next: end };
}

/** Parse one DER element. Throws on trailing garbage unless allowTrailing. */
export function parseDer(bytes: Uint8Array, allowTrailing = false): Asn1Node {
  const { node, next } = readNode(bytes, 0);
  if (!allowTrailing && next !== bytes.length) throw new Error(msg('Unexpected data after DER element'));
  return node;
}

/** Parse the contents of an OCTET STRING or BIT STRING as nested DER. */
export function parseInner(node: Asn1Node): Asn1Node {
  const data = node.tag === 0x03 ? node.value.subarray(1) : node.value;
  return parseDer(data);
}

export function encodeDer(tag: number, content: Uint8Array): Uint8Array {
  const len = content.length;
  let header: number[];
  if (len < 0x80) header = [tag, len];
  else {
    const lb: number[] = [];
    for (let l = len; l > 0; l = Math.floor(l / 256)) lb.unshift(l & 0xff);
    header = [tag, 0x80 | lb.length, ...lb];
  }
  const out = new Uint8Array(header.length + len);
  out.set(header, 0);
  out.set(content, header.length);
  return out;
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function decodeOid(value: Uint8Array): string {
  if (value.length === 0) return '';
  // X.690 8.19: base-128 subidentifiers; the first one packs two arcs as X*40+Y
  // and can itself span several octets (2.999 -> 88 37).
  const subs: number[] = [];
  let acc = 0;
  for (let i = 0; i < value.length; i++) {
    acc = acc * 128 + (value[i] & 0x7f);
    if (!(value[i] & 0x80)) {
      subs.push(acc);
      acc = 0;
    }
  }
  const first = subs[0] ?? 0;
  const parts = [first < 80 ? Math.floor(first / 40) : 2, first < 80 ? first % 40 : first - 80, ...subs.slice(1)];
  return parts.join('.');
}

export function encodeOid(oid: string): Uint8Array {
  const nums = oid.split('.').map(Number);
  const out: number[] = [];
  for (const n of [nums[0] * 40 + nums[1], ...nums.slice(2)]) {
    const stack: number[] = [n & 0x7f];
    for (let v = Math.floor(n / 128); v > 0; v = Math.floor(v / 128)) stack.unshift((v & 0x7f) | 0x80);
    out.push(...stack);
  }
  return encodeDer(0x06, new Uint8Array(out));
}

export function toHex(bytes: Uint8Array, sep = ''): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(sep);
}

export function base64ToBytes(b64: string): Uint8Array {
  let s = b64.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw new Error(msg('Input is not valid Base64'));
  s = s.replace(/=+$/, '');
  if (s.length % 4 === 1) throw new Error(msg('Input is not valid Base64'));
  s += '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface PemBlock {
  label: string;
  der: Uint8Array;
}

/** Extract every PEM block (-----BEGIN X----- ... -----END X-----) from text. */
export function decodePemBlocks(text: string): PemBlock[] {
  const re = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/g;
  const blocks: PemBlock[] = [];
  for (const m of text.matchAll(re)) {
    const body = m[2]
      .split(/\r?\n/)
      .filter((line) => !/^[A-Za-z-]+:/.test(line.trim()))
      .join('');
    blocks.push({ label: m[1], der: base64ToBytes(body) });
  }
  return blocks;
}

export function encodePem(label: string, der: Uint8Array): string {
  const b64 = bytesToBase64(der);
  const lines = b64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`;
}

export const OID_NAMES: Record<string, string> = {
  // Name attributes
  '2.5.4.3': 'CN',
  '2.5.4.4': 'SN',
  '2.5.4.5': 'serialNumber',
  '2.5.4.6': 'C',
  '2.5.4.7': 'L',
  '2.5.4.8': 'ST',
  '2.5.4.9': 'street',
  '2.5.4.10': 'O',
  '2.5.4.11': 'OU',
  '2.5.4.12': 'title',
  '2.5.4.42': 'GN',
  '2.5.4.97': 'organizationIdentifier',
  '1.2.840.113549.1.9.1': 'emailAddress',
  '0.9.2342.19200300.100.1.25': 'DC',
  '0.9.2342.19200300.100.1.1': 'UID',
  '1.3.6.1.4.1.311.60.2.1.3': 'jurisdictionC',
  '2.5.4.15': 'businessCategory',
  // Key algorithms
  '1.2.840.113549.1.1.1': 'RSA',
  '1.2.840.113549.1.1.10': 'RSASSA-PSS',
  '1.2.840.10045.2.1': 'EC',
  '1.3.101.112': 'Ed25519',
  '1.3.101.113': 'Ed448',
  '1.3.101.110': 'X25519',
  '1.3.101.111': 'X448',
  '1.2.840.10040.4.1': 'DSA',
  // Curves
  '1.2.840.10045.3.1.7': 'P-256',
  '1.3.132.0.34': 'P-384',
  '1.3.132.0.35': 'P-521',
  '1.3.132.0.10': 'secp256k1',
  // Signature algorithms
  '1.2.840.113549.1.1.4': 'md5WithRSAEncryption',
  '1.2.840.113549.1.1.5': 'sha1WithRSAEncryption',
  '1.2.840.113549.1.1.11': 'sha256WithRSAEncryption',
  '1.2.840.113549.1.1.12': 'sha384WithRSAEncryption',
  '1.2.840.113549.1.1.13': 'sha512WithRSAEncryption',
  '1.2.840.10045.4.1': 'ecdsa-with-SHA1',
  '1.2.840.10045.4.3.2': 'ecdsa-with-SHA256',
  '1.2.840.10045.4.3.3': 'ecdsa-with-SHA384',
  '1.2.840.10045.4.3.4': 'ecdsa-with-SHA512',
  // Extensions
  '2.5.29.14': 'Subject Key Identifier',
  '2.5.29.15': 'Key Usage',
  '2.5.29.17': 'Subject Alternative Name',
  '2.5.29.18': 'Issuer Alternative Name',
  '2.5.29.19': 'Basic Constraints',
  '2.5.29.30': 'Name Constraints',
  '2.5.29.31': 'CRL Distribution Points',
  '2.5.29.32': 'Certificate Policies',
  '2.5.29.35': 'Authority Key Identifier',
  '2.5.29.37': 'Extended Key Usage',
  '1.3.6.1.5.5.7.1.1': 'Authority Information Access',
  '1.3.6.1.5.5.7.1.24': 'TLS Feature (OCSP Must-Staple)',
  '1.3.6.1.4.1.11129.2.4.2': 'Signed Certificate Timestamps (CT)',
  '1.3.6.1.4.1.11129.2.4.3': 'CT Precertificate Poison',
  // EKU
  '1.3.6.1.5.5.7.3.1': 'Server Authentication',
  '1.3.6.1.5.5.7.3.2': 'Client Authentication',
  '1.3.6.1.5.5.7.3.3': 'Code Signing',
  '1.3.6.1.5.5.7.3.4': 'Email Protection',
  '1.3.6.1.5.5.7.3.8': 'Time Stamping',
  '1.3.6.1.5.5.7.3.9': 'OCSP Signing',
  '2.5.29.37.0': 'Any Extended Key Usage',
  // Policies
  '2.23.140.1.1': 'Extended Validation (EV)',
  '2.23.140.1.2.1': 'Domain Validated (DV)',
  '2.23.140.1.2.2': 'Organization Validated (OV)',
  '2.23.140.1.2.3': 'Individual Validated (IV)',
  '2.5.29.32.0': 'Any Policy',
};

const KEY_USAGE_BITS = [
  'Digital Signature',
  'Non Repudiation',
  'Key Encipherment',
  'Data Encipherment',
  'Key Agreement',
  'Certificate Sign',
  'CRL Sign',
  'Encipher Only',
  'Decipher Only',
];

const CURVE_BITS: Record<string, number> = { 'P-256': 256, 'P-384': 384, 'P-521': 521, secp256k1: 256 };

export interface NameAttribute {
  oid: string;
  name: string;
  value: string;
}

export interface PublicKeyInfo {
  algorithm: string;
  algorithmOid: string;
  keySize?: number;
  curve?: string;
  exponent?: number;
  /** DER of the whole SubjectPublicKeyInfo, for WebCrypto importKey('spki'). */
  spki: Uint8Array;
}

export interface CertificateExtension {
  oid: string;
  name: string;
  critical: boolean;
}

export interface ParsedCertificate {
  version: number;
  serialNumber: string;
  signatureAlgorithm: string;
  signatureAlgorithmOid: string;
  issuer: NameAttribute[];
  subject: NameAttribute[];
  issuerString: string;
  subjectString: string;
  notBefore: Date;
  notAfter: Date;
  publicKey: PublicKeyInfo;
  subjectAltNames: string[];
  keyUsage: string[];
  extendedKeyUsage: string[];
  basicConstraints?: { ca: boolean; pathLength?: number };
  subjectKeyId?: string;
  authorityKeyId?: string;
  ocspUrls: string[];
  caIssuerUrls: string[];
  crlUrls: string[];
  policies: string[];
  extensions: CertificateExtension[];
  /** Issuer and subject names are byte-identical (typical of root CAs and self-signed certs). */
  selfIssued: boolean;
  issuerDer: Uint8Array;
  subjectDer: Uint8Array;
  der: Uint8Array;
}

function decodeString(node: Asn1Node): string {
  switch (node.tag) {
    case 0x1e: {
      // BMPString, UTF-16BE
      let s = '';
      for (let i = 0; i + 1 < node.value.length; i += 2) s += String.fromCharCode((node.value[i] << 8) | node.value[i + 1]);
      return s;
    }
    case 0x1c: {
      // UniversalString, UTF-32BE
      let s = '';
      for (let i = 0; i + 3 < node.value.length; i += 4) {
        s += String.fromCodePoint(((node.value[i] << 24) | (node.value[i + 1] << 16) | (node.value[i + 2] << 8) | node.value[i + 3]) >>> 0);
      }
      return s;
    }
    case 0x14: // T61String, treated as Latin-1
      return Array.from(node.value, (b) => String.fromCharCode(b)).join('');
    default:
      return new TextDecoder().decode(node.value);
  }
}

function parseName(node: Asn1Node): NameAttribute[] {
  const out: NameAttribute[] = [];
  for (const rdn of node.children) {
    for (const atv of rdn.children) {
      const oid = decodeOid(atv.children[0].value);
      out.push({ oid, name: OID_NAMES[oid] ?? oid, value: decodeString(atv.children[1]) });
    }
  }
  return out;
}

export function formatName(attrs: NameAttribute[]): string {
  return attrs.map((a) => `${a.name}=${a.value}`).join(', ');
}

/** Date.UTC that refuses out-of-range fields instead of rolling them over (month 13, 30 February, hour 25). */
function strictUtc(kind: string, text: string, y: number, mo: number, d: number, h: number, mi: number, sec: number): Date {
  const t = new Date(Date.UTC(y, mo - 1, d, h, mi, sec));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d || t.getUTCHours() !== h || t.getUTCMinutes() !== mi || t.getUTCSeconds() !== sec) {
    throw new Error(built(msg('Invalid {kind} "{text}": the date or time is out of range'), { kind, text }));
  }
  return t;
}

function parseTime(node: Asn1Node): Date {
  const s = new TextDecoder().decode(node.value);
  let m: RegExpMatchArray | null;
  if (node.tag === 0x17) {
    // UTCTime: YYMMDDHHMM[SS]Z. RFC 5280 4.1.2.5.1: YY >= 50 means 19YY.
    m = s.match(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?Z$/);
    if (!m) throw new Error(built(msg('Unsupported UTCTime "{value}"'), { value: s }));
    const yy = Number(m[1]);
    const year = yy >= 50 ? 1900 + yy : 2000 + yy;
    return strictUtc('UTCTime', s, year, Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0));
  }
  m = s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\.\d+)?Z$/);
  if (!m) throw new Error(built(msg('Unsupported GeneralizedTime "{value}"'), { value: s }));
  return strictUtc('GeneralizedTime', s, Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
}

function bitLength(bytes: Uint8Array): number {
  let i = 0;
  while (i < bytes.length && bytes[i] === 0) i++;
  if (i === bytes.length) return 0;
  return (bytes.length - i - 1) * 8 + (32 - Math.clz32(bytes[i]));
}

function bigEndianToNumber(bytes: Uint8Array): number {
  let n = 0;
  for (const b of bytes) n = n * 256 + b;
  return n;
}

/** Decode a SubjectPublicKeyInfo element. */
export function parseSpki(node: Asn1Node): PublicKeyInfo {
  const algId = node.children[0];
  const algorithmOid = decodeOid(algId.children[0].value);
  const algorithm = OID_NAMES[algorithmOid] ?? algorithmOid;
  const info: PublicKeyInfo = { algorithm, algorithmOid, spki: node.der };
  const keyBits = node.children[1];
  if (algorithm === 'RSA' || algorithm === 'RSASSA-PSS') {
    const rsa = parseInner(keyBits);
    info.keySize = bitLength(rsa.children[0].value);
    info.exponent = bigEndianToNumber(rsa.children[1].value);
  } else if (algorithm === 'EC') {
    const param = algId.children[1];
    if (param?.tag === 0x06) {
      const curveOid = decodeOid(param.value);
      info.curve = OID_NAMES[curveOid] ?? curveOid;
      info.keySize = CURVE_BITS[info.curve];
    }
  } else if (algorithm === 'Ed25519' || algorithm === 'X25519') {
    info.keySize = 256;
  } else if (algorithm === 'Ed448') {
    info.keySize = 456;
  } else if (algorithm === 'X448') {
    info.keySize = 448;
  }
  return info;
}

function generalNames(node: Asn1Node): string[] {
  const out: string[] = [];
  for (const gn of node.children) {
    if (gn.tagClass !== 'context') continue;
    const text = () => new TextDecoder().decode(gn.value);
    switch (gn.tagNumber) {
      case 1:
        out.push(`email:${text()}`);
        break;
      case 2:
        out.push(`DNS:${text()}`);
        break;
      case 6:
        out.push(`URI:${text()}`);
        break;
      case 7:
        if (gn.value.length === 4) out.push(`IP:${Array.from(gn.value).join('.')}`);
        else if (gn.value.length === 16) {
          const groups: string[] = [];
          for (let i = 0; i < 16; i += 2) groups.push(((gn.value[i] << 8) | gn.value[i + 1]).toString(16));
          out.push(`IP:${groups.join(':')}`);
        }
        break;
      case 4:
        out.push(`DirName:${formatName(parseName(gn.children[0]))}`);
        break;
      default:
        out.push(`other:[${gn.tagNumber}]`);
    }
  }
  return out;
}

function collectUris(node: Asn1Node, out: string[]) {
  if (node.tagClass === 'context' && node.tagNumber === 6 && !node.constructed) {
    out.push(new TextDecoder().decode(node.value));
  }
  node.children.forEach((c) => collectUris(c, out));
}

/** Parse one DER-encoded X.509 certificate. */
export function parseCertificateDer(der: Uint8Array): ParsedCertificate {
  const cert = parseDer(der);
  if (cert.tag !== 0x30 || cert.children.length !== 3) throw new Error(msg('Not an X.509 certificate (expected a SEQUENCE of 3 elements)'));
  try {
    return parseCertificateFields(cert);
  } catch (e) {
    // A structurally wrong TBSCertificate makes the field lookups below fail.
    if (e instanceof TypeError) throw new Error(msg('Not an X.509 certificate: a required field is missing or malformed'));
    throw e;
  }
}

function parseCertificateFields(cert: Asn1Node): ParsedCertificate {
  const tbs = cert.children[0];
  const fields = [...tbs.children];
  let version = 1;
  if (fields[0]?.tag === 0xa0) {
    version = bigEndianToNumber(fields[0].children[0].value) + 1;
    fields.shift();
  }
  const [serial, , issuer, validity, subject, spki, ...rest] = fields;
  if (tbs.tag !== 0x30 || !spki || serial.tag !== 0x02 || validity.children.length !== 2) throw new Error(msg('Certificate is missing required fields'));
  let serialBytes = serial.value;
  if (serialBytes.length > 1 && serialBytes[0] === 0) serialBytes = serialBytes.subarray(1);
  const sigOid = decodeOid(cert.children[1].children[0].value);

  const result: ParsedCertificate = {
    version,
    serialNumber: toHex(serialBytes, ':').toUpperCase(),
    signatureAlgorithm: OID_NAMES[sigOid] ?? sigOid,
    signatureAlgorithmOid: sigOid,
    issuer: parseName(issuer),
    subject: parseName(subject),
    issuerString: '',
    subjectString: '',
    notBefore: parseTime(validity.children[0]),
    notAfter: parseTime(validity.children[1]),
    publicKey: parseSpki(spki),
    subjectAltNames: [],
    keyUsage: [],
    extendedKeyUsage: [],
    ocspUrls: [],
    caIssuerUrls: [],
    crlUrls: [],
    policies: [],
    extensions: [],
    selfIssued: toHex(issuer.der) === toHex(subject.der),
    issuerDer: issuer.der,
    subjectDer: subject.der,
    der: cert.der,
  };
  result.issuerString = formatName(result.issuer);
  result.subjectString = formatName(result.subject);

  const extWrapper = rest.find((n) => n.tag === 0xa3);
  for (const ext of extWrapper?.children[0]?.children ?? []) {
    const oid = decodeOid(ext.children[0].value);
    const critical = ext.children.length === 3 && ext.children[1].tag === 0x01 && ext.children[1].value[0] !== 0;
    const valueNode = ext.children[ext.children.length - 1];
    result.extensions.push({ oid, name: OID_NAMES[oid] ?? oid, critical });
    try {
      const inner = parseInner(valueNode);
      switch (oid) {
        case '2.5.29.17':
          result.subjectAltNames = generalNames(inner);
          break;
        case '2.5.29.15': {
          const unused = inner.value[0];
          const bits = inner.value.subarray(1);
          const total = bits.length * 8 - unused;
          for (let i = 0; i < total && i < KEY_USAGE_BITS.length; i++) {
            if (bits[i >> 3] & (0x80 >> (i & 7))) result.keyUsage.push(KEY_USAGE_BITS[i]);
          }
          break;
        }
        case '2.5.29.37':
          result.extendedKeyUsage = inner.children.map((c) => {
            const o = decodeOid(c.value);
            return OID_NAMES[o] ?? o;
          });
          break;
        case '2.5.29.19': {
          const bc: { ca: boolean; pathLength?: number } = { ca: false };
          for (const c of inner.children) {
            if (c.tag === 0x01) bc.ca = c.value[0] !== 0;
            if (c.tag === 0x02) bc.pathLength = bigEndianToNumber(c.value);
          }
          result.basicConstraints = bc;
          break;
        }
        case '2.5.29.14':
          result.subjectKeyId = toHex(inner.value, ':').toUpperCase();
          break;
        case '2.5.29.35': {
          const kid = inner.children.find((c) => c.tag === 0x80);
          if (kid) result.authorityKeyId = toHex(kid.value, ':').toUpperCase();
          break;
        }
        case '1.3.6.1.5.5.7.1.1':
          for (const ad of inner.children) {
            const method = decodeOid(ad.children[0].value);
            const urls: string[] = [];
            collectUris(ad.children[1], urls);
            if (method === '1.3.6.1.5.5.7.48.1') result.ocspUrls.push(...urls);
            if (method === '1.3.6.1.5.5.7.48.2') result.caIssuerUrls.push(...urls);
          }
          break;
        case '2.5.29.31':
          collectUris(inner, result.crlUrls);
          break;
        case '2.5.29.32':
          result.policies = inner.children.map((p) => {
            const o = decodeOid(p.children[0].value);
            return OID_NAMES[o] ? `${OID_NAMES[o]} (${o})` : o;
          });
          break;
      }
    } catch {
      // Unparseable extension values are listed by OID but otherwise skipped.
    }
  }
  return result;
}

/**
 * Parse every certificate in the input. Accepts PEM (one or many blocks) or a
 * single bare Base64 DER blob.
 */
export function parseCertificates(input: string): ParsedCertificate[] {
  const text = input.trim();
  if (!text) throw new Error(msg('Paste a certificate first'));
  const blocks = decodePemBlocks(text);
  if (blocks.length) {
    const certs = blocks.filter((b) => b.label === 'CERTIFICATE' || b.label === 'TRUSTED CERTIFICATE' || b.label === 'X509 CERTIFICATE');
    if (!certs.length) throw new Error(built(msg('Found a "{label}" block, not a CERTIFICATE. Paste a certificate (-----BEGIN CERTIFICATE-----).'), { label: blocks[0].label }));
    return certs.map((b) => parseCertificateDer(b.der));
  }
  if (text.includes('-----BEGIN')) throw new Error(msg('PEM block is incomplete: check the BEGIN and END lines match'));
  return [parseCertificateDer(base64ToBytes(text))];
}

export async function certificateFingerprints(der: Uint8Array): Promise<{ sha1: string; sha256: string }> {
  const [s1, s256] = await Promise.all([crypto.subtle.digest('SHA-1', der as BufferSource), crypto.subtle.digest('SHA-256', der as BufferSource)]);
  return {
    sha1: toHex(new Uint8Array(s1), ':').toUpperCase(),
    sha256: toHex(new Uint8Array(s256), ':').toUpperCase(),
  };
}

export function commonName(attrs: NameAttribute[]): string | undefined {
  return attrs.find((a) => a.name === 'CN')?.value;
}

/** Whole days from `now` until notAfter (negative once expired). */
export function daysUntil(date: Date, now: Date = new Date()): number {
  return Math.floor((date.getTime() - now.getTime()) / 86_400_000);
}

export type ValidityState = 'not-yet-valid' | 'valid' | 'expired';

export function validityState(cert: Pick<ParsedCertificate, 'notBefore' | 'notAfter'>, now: Date = new Date()): ValidityState {
  if (now < cert.notBefore) return 'not-yet-valid';
  if (now > cert.notAfter) return 'expired';
  return 'valid';
}

export function isWeakSignature(alg: string): boolean {
  return /md2|md5|sha-?1(?!\d)/i.test(alg);
}

export function isWeakKey(key: PublicKeyInfo): boolean {
  if (key.algorithm === 'RSA' || key.algorithm === 'RSASSA-PSS') return (key.keySize ?? 0) < 2048;
  if (key.algorithm === 'EC') return (key.keySize ?? 0) < 256;
  if (key.algorithm === 'DSA') return true;
  return false;
}
