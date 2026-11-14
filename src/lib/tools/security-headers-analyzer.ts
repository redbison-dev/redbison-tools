/**
 * Parses pasted HTTP response headers (curl -I output, DevTools "raw"
 * headers) and grades the security-relevant ones. Pure and offline: browsers
 * hide most response headers of other origins from page JavaScript (CORS), so
 * the tool analyses headers the user pastes rather than fetching them.
 */
import { msg } from '../msg';

export type HeaderStatus = 'present' | 'weak' | 'missing' | 'info';

/**
 * A finding's note as a msg()-marked template and its values, for t() on
 * language pages; `parts` (CSP problems) are msg()-marked phrases joined
 * with "; " into {problems}. `note` stays the US English text.
 */
export type NoteMsg = { text: string; vars?: Record<string, string | number>; parts?: string[] };

const fill = (m: NoteMsg): string => m.text.replace(/\{(\w+)\}/g, (all, k: string) => (k === 'problems' && m.parts ? m.parts.join('; ') : m.vars?.[k] !== undefined ? String(m.vars[k]) : all));

export interface HeaderDefinition {
  key: string;
  name: string;
  description: string;
  critical: boolean;
}

export const SECURITY_HEADERS: HeaderDefinition[] = [
  { key: 'strict-transport-security', name: msg('HTTP Strict Transport Security (HSTS)'), description: msg('Tells browsers to use HTTPS only for this host, blocking protocol downgrades and cookie theft over plain HTTP.'), critical: true },
  { key: 'content-security-policy', name: msg('Content Security Policy (CSP)'), description: msg('Restricts where scripts, styles, frames and other resources may load from. The main defence-in-depth layer against XSS.'), critical: true },
  { key: 'x-content-type-options', name: 'X-Content-Type-Options', description: msg('nosniff stops browsers from guessing a MIME type and executing an upload as script or CSS.'), critical: false },
  { key: 'x-frame-options', name: 'X-Frame-Options', description: msg('Controls whether other sites may frame the page (clickjacking). CSP frame-ancestors is the modern equivalent.'), critical: false },
  { key: 'referrer-policy', name: 'Referrer-Policy', description: msg('Controls how much of the current URL is sent in the Referer header to other sites.'), critical: false },
  { key: 'permissions-policy', name: 'Permissions-Policy', description: msg('Turns browser features such as camera, microphone and geolocation on or off for the page and its frames.'), critical: false },
  { key: 'cross-origin-opener-policy', name: 'Cross-Origin-Opener-Policy (COOP)', description: msg('Isolates the browsing context from cross-origin popups and openers.'), critical: false },
  { key: 'cross-origin-resource-policy', name: 'Cross-Origin-Resource-Policy (CORP)', description: msg('Limits which origins may embed this response as a resource.'), critical: false },
  { key: 'cross-origin-embedder-policy', name: 'Cross-Origin-Embedder-Policy (COEP)', description: msg('Required (with COOP) for cross-origin isolation features such as SharedArrayBuffer.'), critical: false },
  { key: 'x-xss-protection', name: msg('X-XSS-Protection (legacy)'), description: msg('Controlled the old XSS auditor, which current browsers have removed. Omit it or send 0.'), critical: false },
];

export interface HeaderFinding {
  key: string;
  name: string;
  description: string;
  critical: boolean;
  value?: string;
  status: HeaderStatus;
  note: string;
  /** `note` as a message for t(). */
  noteMsg: NoteMsg;
}

export interface HeaderReport {
  statusLine?: string;
  headers: Record<string, string>;
  findings: HeaderFinding[];
  disclosures: { header: string; value: string }[];
  present: number;
  missing: number;
  criticalMissing: number;
  weak: number;
}

/**
 * Parse raw header text. When the paste contains several responses (curl -IL
 * following redirects), only the last response block is used.
 */
export function parseRawHeaders(raw: string): { statusLine?: string; headers: Record<string, string> } {
  const lines = raw.replace(/\r/g, '').split('\n');
  let statusLine: string | undefined;
  let headers: Record<string, string> = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^HTTP\/\d(\.\d)?\s+\d{3}/i.test(trimmed)) {
      statusLine = trimmed;
      headers = {};
      continue;
    }
    const idx = trimmed.indexOf(':');
    if (idx <= 0) continue;
    const name = trimmed.slice(0, idx).trim().toLowerCase();
    if (!/^[a-z0-9!#$%&'*+.^_`|~-]+$/.test(name)) continue;
    const value = trimmed.slice(idx + 1).trim();
    if ((name === 'http' || name === 'https') && value.startsWith('//')) continue; // a pasted URL, not a header
    // Repeated headers are combined with a comma, as RFC 9110 5.3 allows.
    headers[name] = headers[name] !== undefined ? `${headers[name]}, ${value}` : value;
  }
  return { statusLine, headers };
}

function cspDirectives(csp: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const part of csp.split(';')) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) continue;
    const name = tokens[0].toLowerCase();
    if (!(name in out)) out[name] = tokens.slice(1);
  }
  return out;
}

function gradeHsts(v: string): [HeaderStatus, NoteMsg] {
  const m = v.match(/max-age\s*=\s*"?(\d+)"?/i);
  if (!m) return ['weak', { text: msg('No max-age directive, so browsers ignore the header.') }];
  const age = Number(m[1]);
  if (age === 0) return ['weak', { text: msg('max-age=0 tells browsers to forget HSTS for this host.') }];
  if (age < 15_768_000) return ['weak', { text: msg('max-age is {age} seconds (under six months). One year (31536000) is the usual target.'), vars: { age } }];
  const extras = [/includesubdomains/i.test(v) ? 'includeSubDomains' : '', /preload/i.test(v) ? 'preload' : ''].filter(Boolean);
  if (extras.length === 2) return ['present', { text: msg('max-age {age} seconds with {a} and {b}.'), vars: { age, a: extras[0], b: extras[1] } }];
  if (extras.length === 1) return ['present', { text: msg('max-age {age} seconds with {a}.'), vars: { age, a: extras[0] } }];
  return ['present', { text: msg('max-age {age} seconds.'), vars: { age } }];
}

function gradeCsp(v: string): [HeaderStatus, NoteMsg] {
  const d = cspDirectives(v);
  const scripts = d['script-src'] ?? d['default-src'];
  if (!scripts) return ['weak', { text: msg('No script-src or default-src, so scripts are not restricted.') }];
  const problems: string[] = [];
  const hasNonceOrHash = scripts.some((t) => /^'(nonce-|sha256-|sha384-|sha512-)/i.test(t));
  const strictDynamic = scripts.includes("'strict-dynamic'");
  if (scripts.includes("'unsafe-inline'") && !hasNonceOrHash) problems.push(msg("'unsafe-inline' allows injected inline scripts"));
  if (scripts.includes("'unsafe-eval'")) problems.push(msg("'unsafe-eval' allows eval()"));
  if (!strictDynamic && scripts.some((t) => t === '*' || t === 'http:' || t === 'https:' || t === 'data:')) problems.push(msg('a wildcard or scheme-only source lets scripts load from anywhere'));
  if (!d['object-src'] && !(d['default-src'] ?? []).includes("'none'")) problems.push(msg("object-src is not set to 'none'"));
  if (problems.length) return ['weak', { text: msg('Present, but {problems}.'), parts: problems }];
  return ['present', { text: msg('Scripts are restricted without unsafe-inline or unsafe-eval.') }];
}

const REFERRER_POLICIES = ['no-referrer', 'no-referrer-when-downgrade', 'same-origin', 'origin', 'strict-origin', 'origin-when-cross-origin', 'strict-origin-when-cross-origin', 'unsafe-url'];

function grade(key: string, value: string): [HeaderStatus, NoteMsg] {
  const v = value.trim();
  switch (key) {
    case 'strict-transport-security':
      return gradeHsts(v);
    case 'content-security-policy':
      return gradeCsp(v);
    case 'x-content-type-options':
      // Fetch standard: only the first value of a repeated header is checked.
      return v.split(',')[0].trim().toLowerCase() === 'nosniff' ? ['present', { text: msg('nosniff is set.') }] : ['weak', { text: msg('The only valid value is nosniff, got "{value}".'), vars: { value: v } }];
    case 'x-frame-options': {
      // HTML standard: repeated identical values ("DENY, DENY") act as one value.
      const values = [...new Set(v.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean))];
      const u = values.length === 1 ? values[0] : v.toUpperCase();
      if (u === 'DENY' || u === 'SAMEORIGIN') return ['present', { text: '{value}.', vars: { value: u } }];
      if (u.startsWith('ALLOW-FROM')) return ['weak', { text: msg('ALLOW-FROM is not supported by current browsers. Use CSP frame-ancestors.') }];
      return ['weak', { text: msg('Unrecognised value "{value}". Use DENY or SAMEORIGIN.'), vars: { value: v } }];
    }
    case 'referrer-policy': {
      // Referrer Policy spec: unknown tokens are ignored and the last recognised one applies.
      const last = v.split(',').map((s) => s.trim().toLowerCase()).filter((t) => REFERRER_POLICIES.includes(t)).pop();
      if (!last) return ['weak', v ? { text: msg('No recognised policy in "{value}", so the browser default applies.'), vars: { value: v } } : { text: msg('Empty value, so the browser default applies.') }];
      if (last === 'unsafe-url') return ['weak', { text: msg('unsafe-url sends full URLs, including query strings, to every site.') }];
      if (last === 'no-referrer-when-downgrade') return ['weak', { text: msg('Sends the full URL to other HTTPS sites. strict-origin-when-cross-origin is the browser default and safer.') }];
      return ['present', { text: '{value}.', vars: { value: last } }];
    }
    case 'x-xss-protection':
      return v.startsWith('0') ? ['present', { text: msg('Disabled, which is the current recommendation.') }] : ['info', { text: msg('Legacy header. Modern browsers ignore it; OWASP recommends 0 or omitting it.') }];
    default:
      return ['present', { text: msg('Set.') }];
  }
}

const finding = (def: HeaderDefinition, status: HeaderStatus, noteMsg: NoteMsg, value?: string): HeaderFinding => ({ ...def, ...(value !== undefined ? { value } : {}), status, note: fill(noteMsg), noteMsg });

export function analyzeSecurityHeaders(raw: string): HeaderReport {
  const { statusLine, headers } = parseRawHeaders(raw);
  if (!Object.keys(headers).length) throw new Error(msg('No headers found. Paste lines in the form "Name: value".'));
  const csp = headers['content-security-policy'];
  const frameAncestors = csp ? cspDirectives(csp)['frame-ancestors'] : undefined;

  const findings: HeaderFinding[] = SECURITY_HEADERS.map((def) => {
    const value = headers[def.key];
    if (value === undefined) {
      if (def.key === 'x-xss-protection') return finding(def, 'info', { text: msg('Not set. Nothing to do: the XSS auditor is gone from modern browsers.') });
      if (def.key === 'x-frame-options' && frameAncestors) return finding(def, 'present', { text: msg('Not set, but CSP frame-ancestors ({sources}) covers it.'), vars: { sources: frameAncestors.join(' ') } });
      if (def.key === 'content-security-policy' && headers['content-security-policy-report-only']) {
        return finding(def, 'weak', { text: msg('Only Content-Security-Policy-Report-Only is set: violations are reported, nothing is blocked.') }, headers['content-security-policy-report-only']);
      }
      return finding(def, 'missing', { text: def.critical ? msg('Missing. Add this header.') : msg('Missing.') });
    }
    const [status, noteMsg] = grade(def.key, value);
    return finding(def, status, noteMsg, value);
  });

  const disclosures: { header: string; value: string }[] = [];
  for (const h of ['server', 'x-powered-by', 'x-aspnet-version', 'x-aspnetmvc-version', 'x-generator']) {
    const value = headers[h];
    if (value === undefined) continue;
    if (h === 'server' && !/\d/.test(value)) continue; // "nginx" or "cloudflare" without a version is harmless
    disclosures.push({ header: h, value });
  }

  return {
    statusLine,
    headers,
    findings,
    disclosures,
    present: findings.filter((f) => f.status === 'present').length,
    weak: findings.filter((f) => f.status === 'weak').length,
    missing: findings.filter((f) => f.status === 'missing').length,
    criticalMissing: findings.filter((f) => f.status === 'missing' && f.critical).length,
  };
}

export function curlCommand(url: string): string {
  let u = url.trim() || 'https://example.com';
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  return `curl -sSIL "${u}"`;
}
