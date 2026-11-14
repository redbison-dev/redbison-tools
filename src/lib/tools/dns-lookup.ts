/**
 * Accept what people paste (URLs, mixed case, a trailing root dot) and
 * return a bare hostname, or null if it cannot be a DNS name.
 */
export function normalizeDomainInput(input: string): string | null {
  let v = input.trim().toLowerCase();
  if (!v) return null;
  v = v.replace(/^[a-z][a-z0-9+.-]*:\/\//, ''); // scheme
  v = v.split(/[/?#]/)[0]; // path, query, fragment
  v = v.replace(/^[^@]*@/, ''); // userinfo
  v = v.replace(/:\d+$/, ''); // port
  v = v.replace(/\.$/, ''); // root dot
  if (v.length === 0 || v.length > 253) return null;
  const labels = v.split('.');
  const ok = labels.every((l) => /^[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?$/.test(l) || /^xn--[a-z0-9-]+$/.test(l));
  return ok ? v : null;
}

export interface DohRequest {
  url: string;
  method: 'GET';
  headers: Record<string, string>;
}

/**
 * DNS JSON API request. Google, Cloudflare and Quad9 all take
 * GET ?name=&type= with Accept: application/dns-json; a POST to these
 * endpoints must carry binary RFC 8484 wire format, not JSON.
 */
export function buildDohRequest(provider: string, name: string, typeNum: number): DohRequest {
  return {
    url: `${provider}?name=${encodeURIComponent(name)}&type=${typeNum}`,
    method: 'GET',
    headers: { Accept: 'application/dns-json' },
  };
}
