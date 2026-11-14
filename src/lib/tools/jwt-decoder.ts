import { decodeUtf8Base64 } from './textConversions';

/** Decodes one Base64URL JWT segment as UTF-8 JSON. */
export function decodeJwtSegment(segment: string): unknown {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return JSON.parse(decodeUtf8Base64(padded));
}

/** Splits a compact JWS token and decodes its header and payload. No signature check. */
export function decodeJwt(token: string): { header: unknown; payload: unknown } {
  const parts = token.trim().replace(/^Bearer\s+/i, '').split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT format');
  return { header: decodeJwtSegment(parts[0]), payload: decodeJwtSegment(parts[1]) };
}
