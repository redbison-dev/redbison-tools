import { parseGraphQL } from './graphql-language';
import { msg } from '../msg';

/** A translate function (the page's t); English by default. */
type Translate = (source: string, vars?: Record<string, string | number>) => string;
const english: Translate = (s, v) => s.replace(/\{(\w+)\}/g, (all, k: string) => (v?.[k] === undefined ? all : String(v[k])));

export type GraphqlResult = { data?: unknown; errors?: { message: string; [k: string]: unknown }[]; extensions?: unknown };

/**
 * Turn an HTTP response from a GraphQL endpoint into a result object.
 * Servers answer errors with HTML pages or plain text surprisingly often
 * (proxies, 404s, auth gateways); those become a readable error instead of
 * "Unexpected token <".
 */
export function readGraphqlResponse(status: number, statusText: string, body: string, t: Translate = english): GraphqlResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    const snippet = body.trim().slice(0, 300);
    return {
      errors: [{
        message: snippet
          ? t(msg('HTTP {status}: the endpoint did not return JSON. Response starts with: {snippet}'), { status: `${status}${statusText ? ` ${statusText}` : ''}`, snippet })
          : t(msg('HTTP {status}: the endpoint did not return JSON. The response body was empty.'), { status: `${status}${statusText ? ` ${statusText}` : ''}` }),
      }],
    };
  }
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && ('data' in parsed || 'errors' in parsed)) {
    return parsed as GraphqlResult;
  }
  if (status < 200 || status >= 300) {
    return { errors: [{ message: `HTTP ${status}${statusText ? ` ${statusText}` : ''}`, extensions: { response: parsed } }] };
  }
  return { data: parsed };
}

/** Message for a fetch() that rejected before any response arrived. */
export function networkErrorMessage(err: unknown, endpoint: string, t: Translate = english): string {
  const base = err instanceof Error ? err.message : String(err);
  if (err instanceof TypeError) {
    const mixed = typeof location !== 'undefined' && location.protocol === 'https:' && endpoint.startsWith('http:');
    return t(msg('{base}. The browser blocked or could not complete the request. {mixed}The usual cause is CORS: the server must send Access-Control-Allow-Origin for this site and allow the Content-Type and Authorization headers in its preflight response.'), {
      base,
      mixed: mixed ? `${t(msg('This page is HTTPS and the endpoint is plain HTTP, which browsers block as mixed content.'))} ` : '',
    });
  }
  return base;
}

/** The operation to run when a document holds several named operations. */
export function pickOperationName(query: string): string | undefined {
  try {
    const ops = parseGraphQL(query).definitions.filter((d) => d.kind === 'OperationDefinition');
    const first = ops[0];
    return ops.length > 1 && first?.kind === 'OperationDefinition' ? first.name : undefined;
  } catch {
    return undefined; // let the server report the syntax error
  }
}
