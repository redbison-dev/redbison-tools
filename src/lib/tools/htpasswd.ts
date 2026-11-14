/**
 * .htpasswd line generation and verification.
 *
 * - bcrypt uses bcryptjs (output rewritten to Apache's $2y$ prefix, which is
 *   the same algorithm as $2b$).
 * - APR1-MD5 ($apr1$) and MD5-crypt ($1$) follow apr_md5_encode in APR's
 *   crypto/apr_md5.c and Poul-Henning Kamp's md5crypt. There is no
 *   maintained browser library for them, so the algorithm lives here and is
 *   checked against vectors from Apache htpasswd and OpenSSL.
 * - {SHA} is base64(SHA-1(password)) as written by `htpasswd -s`.
 * MD5 and SHA-1 primitives come from hash-wasm, loaded on demand.
 */
import { msg } from '../msg';

export type HtpasswdScheme = 'bcrypt' | 'apr1' | 'sha1';
export type DetectedScheme = HtpasswdScheme | 'md5crypt' | 'ssha' | 'sha256crypt' | 'sha512crypt' | 'des-crypt' | 'plain';

export const ITOA64 = './0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export const BCRYPT_MIN_COST = 4;
export const BCRYPT_MAX_COST = 17;
export const BCRYPT_MAX_BYTES = 72;

const utf8 = (s: string) => new TextEncoder().encode(s);

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

async function md5Factory(): Promise<(data: Uint8Array) => Uint8Array> {
  const { createMD5 } = await import('hash-wasm');
  const hasher = await createMD5();
  return (data) => hasher.init().update(data).digest('binary');
}

function to64(v: number, n: number): string {
  let s = '';
  while (n-- > 0) { s += ITOA64[v & 0x3f]; v >>>= 6; }
  return s;
}

/** Random salt from the 64-character crypt alphabet, using crypto.getRandomValues. */
export function randomSalt(length = 8): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ITOA64[b & 0x3f]).join('');
}

/**
 * MD5-based crypt. magic "$apr1$" gives Apache's APR1 format, "$1$" the
 * original FreeBSD md5crypt; the two differ only in that string.
 */
export async function md5Crypt(password: string, salt: string, magic: '$apr1$' | '$1$' = '$apr1$'): Promise<string> {
  const md5 = await md5Factory();
  const pw = utf8(password);
  // The salt stops at the first "$" and is at most 8 characters.
  const cleanSalt = salt.split('$')[0].slice(0, 8);
  const s = utf8(cleanSalt);
  const m = utf8(magic);

  const alt = md5(concat(pw, s, pw));
  const parts: Uint8Array[] = [pw, m, s];
  for (let pl = pw.length; pl > 0; pl -= 16) parts.push(alt.subarray(0, Math.min(pl, 16)));
  // Odd quirk of the original C code: for each bit of the length, a NUL byte or the first password byte.
  for (let i = pw.length; i; i >>= 1) parts.push(i & 1 ? new Uint8Array([0]) : new Uint8Array([pw[0] ?? 0]));
  let final = md5(concat(...parts));

  // 1000 rounds to slow down brute force (by 1990s standards).
  for (let i = 0; i < 1000; i++) {
    const round: Uint8Array[] = [];
    round.push(i & 1 ? pw : final);
    if (i % 3) round.push(s);
    if (i % 7) round.push(pw);
    round.push(i & 1 ? final : pw);
    final = md5(concat(...round));
  }

  const f = final;
  const encoded =
    to64((f[0] << 16) | (f[6] << 8) | f[12], 4) +
    to64((f[1] << 16) | (f[7] << 8) | f[13], 4) +
    to64((f[2] << 16) | (f[8] << 8) | f[14], 4) +
    to64((f[3] << 16) | (f[9] << 8) | f[15], 4) +
    to64((f[4] << 16) | (f[10] << 8) | f[5], 4) +
    to64(f[11], 2);
  return `${magic}${cleanSalt}$${encoded}`;
}

export async function apr1(password: string, salt = randomSalt()): Promise<string> {
  return md5Crypt(password, salt, '$apr1$');
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function sha1Bytes(data: Uint8Array): Promise<Uint8Array> {
  const { createSHA1 } = await import('hash-wasm');
  return (await createSHA1()).init().update(data).digest('binary');
}

/** Apache's {SHA} format: unsalted SHA-1, base64. Kept for compatibility only. */
export async function shaHtpasswd(password: string): Promise<string> {
  return `{SHA}${toBase64(await sha1Bytes(utf8(password)))}`;
}

/** bcrypt with Apache's $2y$ prefix. Costs follow htpasswd -C: 4 to 17. */
export async function bcryptHtpasswd(password: string, cost = 10): Promise<string> {
  if (!Number.isInteger(cost) || cost < BCRYPT_MIN_COST || cost > BCRYPT_MAX_COST) {
    throw new Error(`bcrypt cost must be a whole number from ${BCRYPT_MIN_COST} to ${BCRYPT_MAX_COST}.`);
  }
  const bcrypt = (await import('bcryptjs')).default;
  const hash = await bcrypt.hash(password, cost);
  return hash.replace(/^\$2[ab]\$/, '$2y$');
}

export function bcryptTruncates(password: string): boolean {
  return utf8(password).length > BCRYPT_MAX_BYTES;
}

export function validateUsername(user: string): string | null {
  if (!user) return msg('Enter a user name.');
  if (user.includes(':')) return msg('User names cannot contain a colon; it separates the name from the hash.');
  if (/[\r\n]/.test(user)) return msg('User names cannot contain line breaks.');
  if (utf8(user).length > 255) return msg('User names are limited to 255 bytes.');
  return null;
}

export async function generateHash(password: string, scheme: HtpasswdScheme, cost = 10): Promise<string> {
  if (scheme === 'bcrypt') return bcryptHtpasswd(password, cost);
  if (scheme === 'apr1') return apr1(password);
  return shaHtpasswd(password);
}

export async function htpasswdLine(user: string, password: string, scheme: HtpasswdScheme, cost = 10): Promise<string> {
  const problem = validateUsername(user);
  if (problem) throw new Error(problem);
  return `${user}:${await generateHash(password, scheme, cost)}`;
}

export function detectScheme(hash: string): DetectedScheme {
  if (/^\$2[abxy]\$\d\d\$/.test(hash)) return 'bcrypt';
  if (hash.startsWith('$apr1$')) return 'apr1';
  if (hash.startsWith('$1$')) return 'md5crypt';
  if (hash.startsWith('$5$')) return 'sha256crypt';
  if (hash.startsWith('$6$')) return 'sha512crypt';
  if (hash.startsWith('{SHA}')) return 'sha1';
  if (hash.startsWith('{SSHA}')) return 'ssha';
  if (/^[./0-9A-Za-z]{13}$/.test(hash)) return 'des-crypt';
  return 'plain';
}

export const SCHEME_LABELS: Record<DetectedScheme, string> = {
  bcrypt: msg('bcrypt'),
  apr1: msg('APR1-MD5 (Apache MD5)'),
  md5crypt: msg('MD5-crypt ($1$)'),
  sha1: msg('SHA-1 ({SHA}, unsalted)'),
  ssha: msg('Salted SHA-1 ({SSHA})'),
  sha256crypt: msg('SHA-256-crypt ($5$)'),
  sha512crypt: msg('SHA-512-crypt ($6$)'),
  'des-crypt': msg('DES crypt (legacy)'),
  plain: msg('Plain text'),
};

export interface ParsedLine {
  user: string;
  hash: string;
}

export function parseHtpasswdLine(line: string): ParsedLine | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const i = trimmed.indexOf(':');
  if (i <= 0) return null;
  // Some files carry extra fields after the hash (user:hash:comment); ignore them.
  const rest = trimmed.slice(i + 1);
  const hash = rest.startsWith('{') || rest.startsWith('$') ? rest.split(':')[0] : rest;
  return { user: trimmed.slice(0, i), hash };
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface VerifyResult {
  scheme: DetectedScheme;
  /** null when the scheme cannot be checked in the browser. */
  match: boolean | null;
  note?: string;
  /** `note` as a message template with its values, for pages that translate it. */
  noteMsg?: { text: string; vars: Record<string, string> };
}

/** Check a password against the hash part of an .htpasswd line. */
export async function verifyHtpasswd(password: string, hash: string): Promise<VerifyResult> {
  const scheme = detectScheme(hash);
  switch (scheme) {
    case 'bcrypt': {
      const bcrypt = (await import('bcryptjs')).default;
      // bcryptjs reads $2a$, $2b$ and $2y$; $2x$ is the buggy pre-2011 variant.
      if (hash.startsWith('$2x$')) return { scheme, match: null, note: msg('$2x$ hashes come from the pre-2011 buggy bcrypt and cannot be checked here.') };
      return { scheme, match: await bcrypt.compare(password, hash) };
    }
    case 'apr1':
    case 'md5crypt': {
      const salt = hash.split('$')[2] ?? '';
      const computed = await md5Crypt(password, salt, scheme === 'apr1' ? '$apr1$' : '$1$');
      return { scheme, match: constantTimeEqual(computed, hash) };
    }
    case 'sha1':
      return { scheme, match: constantTimeEqual(await shaHtpasswd(password), hash) };
    case 'ssha': {
      let raw: Uint8Array;
      try { raw = fromBase64(hash.slice(6)); } catch { return { scheme, match: false, note: msg('The {SSHA} value is not valid base64.') }; }
      if (raw.length <= 20) return { scheme, match: false, note: msg('The {SSHA} value is too short to hold a salt.') };
      const digest = await sha1Bytes(concat(utf8(password), raw.subarray(20)));
      return { scheme, match: constantTimeEqual(toBase64(digest), toBase64(raw.subarray(0, 20))) };
    }
    case 'plain':
      return { scheme, match: constantTimeEqual(password, hash), note: msg('Plain-text entries are only accepted by Apache on Windows and NetWare, and by nginx with {PLAIN}. Replace it.') };
    default:
      return { scheme, match: null, note: `${SCHEME_LABELS[scheme]} depends on the server's crypt() and is not checked in the browser.`, noteMsg: { text: msg("{label} depends on the server's crypt() and is not checked in the browser."), vars: { label: SCHEME_LABELS[scheme] } } };
  }
}

export interface ConfigSnippetOptions {
  realm: string;
  file: string;
  location: string;
}

export function apacheSnippet({ realm, file, location }: ConfigSnippetOptions): string {
  const safeRealm = realm.replace(/"/g, "'");
  return [
    `# Apache 2.4 (httpd.conf or a <VirtualHost>; in .htaccess keep only the Auth*/Require lines)`,
    `<Location "${location}">`,
    `    AuthType Basic`,
    `    AuthName "${safeRealm}"`,
    `    AuthBasicProvider file`,
    `    AuthUserFile "${file}"`,
    `    Require valid-user`,
    `</Location>`,
  ].join('\n');
}

export function nginxSnippet({ realm, file, location }: ConfigSnippetOptions): string {
  const safeRealm = realm.replace(/"/g, "'");
  return [
    `# nginx (inside a server { } block)`,
    `location ${location} {`,
    `    auth_basic           "${safeRealm}";`,
    `    auth_basic_user_file ${file};`,
    `}`,
  ].join('\n');
}
