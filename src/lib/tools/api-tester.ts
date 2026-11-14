import { msg } from '../msg';

export type HeaderPair = { key: string; value: string };

/** A cURL parse error: `message` is the English text, `source` and `vars` let the page show it translated (t(source, vars)). */
export class CurlCommandError extends Error {
  constructor(readonly source: string, readonly vars: Record<string, string> = {}) {
    super(source.replace(/\{(\w+)\}/g, (all, k: string) => vars[k] ?? all));
  }
}

export type ApiRequest = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
};

/** Methods for which fetch() refuses a request body. */
export const BODYLESS_METHODS = ['GET', 'HEAD'];

/**
 * Request headers a browser will not let a page set (Fetch standard
 * "forbidden request-header" list). They are dropped silently by fetch,
 * so the tool warns about them instead.
 */
const FORBIDDEN_HEADERS = new Set([
  'accept-charset', 'accept-encoding', 'access-control-request-headers', 'access-control-request-method',
  'connection', 'content-length', 'cookie', 'cookie2', 'date', 'dnt', 'expect', 'host', 'keep-alive',
  'origin', 'referer', 'set-cookie', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'via',
]);

export function isForbiddenHeader(name: string) {
  const n = name.trim().toLowerCase();
  return FORBIDDEN_HEADERS.has(n) || n.startsWith('proxy-') || n.startsWith('sec-');
}

/** Quote a string for a POSIX shell using single quotes. */
export function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** Build a curl command equivalent to the request. */
export function buildCurlCommand(req: ApiRequest): string {
  const method = req.method.toUpperCase();
  const parts: string[] = ['curl'];
  if (method === 'HEAD') parts.push('-I');
  else if (method !== 'GET') parts.push(`-X ${method}`);
  for (const [k, v] of Object.entries(req.headers)) parts.push(`-H ${shellQuote(`${k}: ${v}`)}`);
  if (req.body.trim() && !BODYLESS_METHODS.includes(method)) parts.push(`--data-raw ${shellQuote(req.body)}`);
  parts.push(shellQuote(req.url.trim()));
  return parts.join(' \\\n  ');
}

/** Split a shell command into words, honouring quotes and line continuations. */
export function shellSplit(input: string): string[] {
  const words: string[] = [];
  let cur = '';
  let has = false;
  let i = 0;
  const s = input.replace(/\\\r?\n/g, ' ');
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) {
      if (has) { words.push(cur); cur = ''; has = false; }
      i++;
      continue;
    }
    has = true;
    if (c === "'") {
      const end = s.indexOf("'", i + 1);
      if (end < 0) throw new CurlCommandError(msg('Unclosed single quote in the command.'));
      cur += s.slice(i + 1, end);
      i = end + 1;
    } else if (c === '$' && s[i + 1] === "'") {
      // ANSI-C quoting, as produced by Chrome's "Copy as cURL (bash)".
      let j = i + 2;
      while (j < s.length && s[j] !== "'") {
        if (s[j] === '\\' && j + 1 < s.length) {
          const e = s[j + 1];
          const map: Record<string, string> = { n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"' };
          cur += map[e] ?? e;
          j += 2;
        } else cur += s[j++];
      }
      if (j >= s.length) throw new CurlCommandError(msg('Unclosed $\'...\' quote in the command.'));
      i = j + 1;
    } else if (c === '"') {
      let j = i + 1;
      while (j < s.length && s[j] !== '"') {
        if (s[j] === '\\' && ['"', '\\', '$', '`'].includes(s[j + 1])) { cur += s[j + 1]; j += 2; }
        else cur += s[j++];
      }
      if (j >= s.length) throw new CurlCommandError(msg('Unclosed double quote in the command.'));
      i = j + 1;
    } else if (c === '\\' && i + 1 < s.length) {
      cur += s[i + 1];
      i += 2;
    } else {
      cur += c;
      i++;
    }
  }
  if (has) words.push(cur);
  return words;
}

const FLAGS_WITHOUT_VALUE = new Set([
  '-s', '--silent', '-S', '--show-error', '-L', '--location', '-v', '--verbose', '-i', '--include', '-k', '--insecure',
  '--compressed', '-f', '--fail', '-g', '--globoff', '-#', '--progress-bar', '-N', '--no-buffer', '--http1.1', '--http2',
]);
const FLAGS_WITH_IGNORED_VALUE = new Set(['-o', '--output', '-m', '--max-time', '--connect-timeout', '-w', '--write-out', '--retry', '-x', '--proxy']);

/** Short options that take a value, which curl also accepts glued on (-XPOST, -HName:v). */
const SHORT_WITH_VALUE = new Set(['-X', '-H', '-d', '-u', '-A', '-e', '-b', '-o', '-m', '-w', '-x']);

/** curl_easy_escape: everything except A-Z a-z 0-9 - . _ ~ becomes %XX (UTF-8). */
function curlEscape(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/**
 * --data-urlencode, per the curl man page: "content" and "=content" send the
 * encoded content, "name=content" sends name=<encoded content>. The @file
 * forms read a file, which cannot happen here, so they are kept as typed.
 */
function dataUrlencode(v: string): string {
  if (v.startsWith('=')) return curlEscape(v.slice(1));
  const eq = v.indexOf('=');
  const at = v.indexOf('@');
  if (at >= 0 && (eq < 0 || at < eq)) return v;
  if (eq > 0) return `${v.slice(0, eq)}=${curlEscape(v.slice(eq + 1))}`;
  return curlEscape(v);
}

export type ParsedCurl = { method: string; url: string; headers: HeaderPair[]; body: string };

function base64(s: string) {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
}

/**
 * Parse a curl command (including the multi-line form browsers copy from
 * DevTools) into method, URL, headers and body. Like curl itself, a request
 * with data and no -X defaults to POST.
 */
export function parseCurlCommand(command: string): ParsedCurl {
  const words = shellSplit(command.trim());
  if (words[0] !== 'curl') throw new CurlCommandError(msg('The command must start with "curl".'));
  let method = '';
  let url = '';
  const headers: HeaderPair[] = [];
  const data: string[] = [];
  let head = false;
  let get = false;
  for (let i = 1; i < words.length; i++) {
    const w = words[i];
    const next = () => {
      if (i + 1 >= words.length) throw new CurlCommandError(msg('Option {option} needs a value.'), { option: w });
      return words[++i];
    };
    // Support --opt=value as well as --opt value, and short options with the value attached (-XPOST).
    const eq = w.startsWith('--') ? w.indexOf('=') : -1;
    const attached = !w.startsWith('--') && w.length > 2 && SHORT_WITH_VALUE.has(w.slice(0, 2));
    const flag = eq > 0 ? w.slice(0, eq) : attached ? w.slice(0, 2) : w;
    const inline = eq > 0 ? w.slice(eq + 1) : attached ? w.slice(2) : undefined;
    const value = () => (inline !== undefined ? inline : next());
    switch (flag) {
      case '-X': case '--request': method = value().toUpperCase(); break;
      case '-H': case '--header': {
        const h = value();
        const idx = h.indexOf(':');
        if (idx > 0) headers.push({ key: h.slice(0, idx).trim(), value: h.slice(idx + 1).trim() });
        break;
      }
      case '-d': case '--data': case '--data-raw': case '--data-binary': case '--data-ascii':
        data.push(value());
        break;
      case '--data-urlencode':
        data.push(dataUrlencode(value()));
        break;
      case '--json': {
        data.push(value());
        if (!headers.some((h) => h.key.toLowerCase() === 'content-type')) headers.push({ key: 'Content-Type', value: 'application/json' });
        if (!headers.some((h) => h.key.toLowerCase() === 'accept')) headers.push({ key: 'Accept', value: 'application/json' });
        break;
      }
      case '-u': case '--user': headers.push({ key: 'Authorization', value: `Basic ${base64(value())}` }); break;
      case '-A': case '--user-agent': headers.push({ key: 'User-Agent', value: value() }); break;
      case '-e': case '--referer': headers.push({ key: 'Referer', value: value() }); break;
      case '-b': case '--cookie': headers.push({ key: 'Cookie', value: value() }); break;
      case '-I': case '--head': head = true; break;
      case '-G': case '--get': get = true; break;
      case '--url': url = value(); break;
      default:
        if (FLAGS_WITH_IGNORED_VALUE.has(flag)) { if (inline === undefined) next(); break; }
        if (FLAGS_WITHOUT_VALUE.has(flag) || w.startsWith('-')) break;
        if (!url) url = w;
    }
  }
  if (!url) throw new CurlCommandError(msg('No URL found in the curl command.'));
  let body = data.join('&');
  if (get && body) {
    url += (url.includes('?') ? '&' : '?') + body;
    body = '';
  }
  if (!method) method = head ? 'HEAD' : body ? 'POST' : 'GET';
  return { method, url, headers, body };
}

export type FetchPlan = { init: RequestInit; ignoredHeaders: string[]; bodyDropped: boolean };

/**
 * Turn the form into fetch() options. Browsers reject a body on GET and
 * HEAD and silently drop forbidden headers, so both are reported back. A
 * Content-Type header is only sent when there is a body, because on a GET
 * it forces a CORS preflight for no benefit.
 */
export function buildFetchPlan(req: ApiRequest): FetchPlan {
  const method = req.method.toUpperCase();
  const hasBody = req.body.trim().length > 0;
  const bodyAllowed = !BODYLESS_METHODS.includes(method);
  const sendBody = hasBody && bodyAllowed;
  const headers: Record<string, string> = {};
  const ignoredHeaders: string[] = [];
  for (const [k, v] of Object.entries(req.headers)) {
    if (!k.trim()) continue;
    if (isForbiddenHeader(k)) { ignoredHeaders.push(k); continue; }
    if (k.trim().toLowerCase() === 'content-type' && !sendBody) continue;
    headers[k.trim()] = v;
  }
  const init: RequestInit = { method, headers };
  if (sendBody) init.body = req.body;
  return { init, ignoredHeaders, bodyDropped: hasBody && !bodyAllowed };
}

/** Pretty-print JSON bodies; return anything else unchanged. */
export function formatResponseBody(text: string, contentType: string | null): string {
  const looksJson = (contentType ?? '').includes('json') || /^\s*[[{]/.test(text);
  if (!looksJson) return text;
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

export function headersToObject(h: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  h.forEach((value, key) => { out[key] = value; });
  return out;
}

export function headerPairsToObject(pairs: HeaderPair[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of pairs) if (p.key.trim() && p.value.trim()) out[p.key.trim()] = p.value.trim();
  return out;
}
