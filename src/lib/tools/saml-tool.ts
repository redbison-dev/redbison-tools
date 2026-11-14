/**
 * SAML 2.0 message encoding per the Bindings spec (saml-bindings-2.0-os):
 * HTTP-POST carries Base64 of the raw XML; HTTP-Redirect carries raw DEFLATE
 * (RFC 1951, no zlib header), then Base64, then URL-encoding.
 */
import { deflateRaw, inflate, inflateRaw } from 'pako';
import { base64ToBytes, bytesToBase64 } from './x509-parser';
import { msg } from '../msg';

export type SamlBinding = 'HTTP-POST' | 'HTTP-Redirect' | 'zlib (non-standard)' | 'plain XML';

export interface DecodedSaml {
  xml: string;
  binding: SamlBinding;
  parameter?: string;
}

function looksLikeXml(bytes: Uint8Array): boolean {
  let i = 0;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) i = 3; // UTF-8 BOM
  while (i < bytes.length && (bytes[i] === 0x20 || bytes[i] === 0x0a || bytes[i] === 0x0d || bytes[i] === 0x09)) i++;
  return bytes[i] === 0x3c; // '<'
}

const utf8 = (bytes: Uint8Array) => new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '');

/**
 * Decode a SAMLRequest/SAMLResponse value. Accepts the bare value, a
 * "SAMLRequest=..." pair, a whole redirect URL or a pasted POST form value.
 */
export function decodeSamlMessage(input: string): DecodedSaml {
  let s = input.trim();
  if (!s) throw new Error(msg('Paste a SAMLRequest or SAMLResponse value first'));
  if (s.startsWith('<')) return { xml: s, binding: msg('plain XML') };

  let parameter: string | undefined;
  const paramMatch = s.match(/(?:^|[?&])(SAMLRequest|SAMLResponse)=([^&#\s]+)/);
  if (paramMatch) {
    parameter = paramMatch[1];
    s = paramMatch[2];
  }
  if (/%[0-9a-f]{2}/i.test(s)) {
    try {
      s = decodeURIComponent(s);
    } catch {
      throw new Error(msg('The value has broken URL-encoding (a stray % sign)'));
    }
  }
  // A '+' that was decoded to a space by a form parser was really a Base64 '+'.
  s = s.replace(/ /g, '+').replace(/\s+/g, '');

  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(s);
  } catch {
    throw new Error(msg('The value is not valid Base64 after URL-decoding'));
  }

  if (looksLikeXml(bytes)) return { xml: utf8(bytes), binding: 'HTTP-POST', parameter };

  try {
    const inflated = inflateRaw(bytes);
    if (inflated && inflated.length && looksLikeXml(inflated)) return { xml: utf8(inflated), binding: 'HTTP-Redirect', parameter };
  } catch {
    // fall through to the zlib attempt
  }
  try {
    const inflated = inflate(bytes);
    if (inflated && inflated.length && looksLikeXml(inflated)) return { xml: utf8(inflated), binding: msg('zlib (non-standard)'), parameter };
  } catch {
    // fall through
  }
  throw new Error(msg('Decoded Base64 is neither XML nor DEFLATE-compressed XML. Check that the whole value was copied.'));
}

/** HTTP-POST binding: Base64 of the UTF-8 XML, unchanged (so signatures stay valid). */
export function encodeSamlPost(xml: string): string {
  return bytesToBase64(new TextEncoder().encode(xml.trim()));
}

/** HTTP-Redirect binding: raw DEFLATE, Base64, then URL-encode for the query string. */
export function encodeSamlRedirect(xml: string): string {
  return encodeURIComponent(bytesToBase64(deflateRaw(new TextEncoder().encode(xml.trim()))));
}

export interface SamlSummary {
  messageType?: string;
  id?: string;
  issueInstant?: string;
  destination?: string;
  issuer?: string;
  inResponseTo?: string;
  status?: string;
  nameId?: string;
  audience?: string;
  notBefore?: string;
  notOnOrAfter?: string;
  acsUrl?: string;
  signed: boolean;
  encryptedAssertion: boolean;
}

const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`))?.[1];

/** Pull the fields people usually look for out of decoded SAML XML. Display only. */
export function summarizeSaml(xml: string): SamlSummary {
  const root = xml.replace(/<\?xml[^>]*\?>/, '').match(/<([A-Za-z0-9_]+:)?([A-Za-z]+)\b[^>]*>/);
  const rootTag = root?.[0] ?? '';
  const text = (local: string) => xml.match(new RegExp(`<(?:[A-Za-z0-9_]+:)?${local}\\b[^>]*>([\\s\\S]*?)</(?:[A-Za-z0-9_]+:)?${local}>`))?.[1]?.trim();
  const tag = (local: string) => xml.match(new RegExp(`<(?:[A-Za-z0-9_]+:)?${local}\\b[^>]*>`))?.[0] ?? '';
  const conditions = tag('Conditions');
  return {
    messageType: root?.[2],
    id: attr(rootTag, 'ID'),
    issueInstant: attr(rootTag, 'IssueInstant'),
    destination: attr(rootTag, 'Destination'),
    inResponseTo: attr(rootTag, 'InResponseTo'),
    acsUrl: attr(rootTag, 'AssertionConsumerServiceURL'),
    issuer: text('Issuer'),
    status: attr(tag('StatusCode'), 'Value'),
    nameId: text('NameID'),
    audience: text('Audience'),
    notBefore: attr(conditions, 'NotBefore'),
    notOnOrAfter: attr(conditions, 'NotOnOrAfter'),
    signed: /<(?:[A-Za-z0-9_]+:)?Signature\b/.test(xml),
    encryptedAssertion: /<(?:[A-Za-z0-9_]+:)?EncryptedAssertion\b/.test(xml),
  };
}
