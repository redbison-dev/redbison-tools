/**
 * Pure conversion logic for the Text Encoding Converter. Every byte-based
 * representation (Base64, hex, binary) works on the UTF-8 bytes of the
 * text, so non-ASCII characters and emoji survive a round trip.
 */

import { msg } from '../msg';

export type TextEncodingId ='utf8' | 'ascii' | 'base64' | 'hex' | 'binary' | 'url' | 'html' | 'unicode';

const utf8Decoder = () => new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

const NOT_UTF8: Record<string, string> = {
  Base64: msg('The Base64 input decodes to bytes that are not valid UTF-8'),
  hex: msg('The hex input decodes to bytes that are not valid UTF-8'),
  binary: msg('The binary input decodes to bytes that are not valid UTF-8'),
};

function bytesToUtf8(bytes: Uint8Array, source: 'Base64' | 'hex' | 'binary'): string {
  try {
    return utf8Decoder().decode(bytes);
  } catch {
    throw new Error(NOT_UTF8[source]);
  }
}

function base64ToBytes(input: string): Uint8Array {
  // Accept Base64URL and missing padding, ignore whitespace and line breaks.
  let clean = input.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (/[^A-Za-z0-9+/=]/.test(clean)) throw new Error(msg('Input contains characters that are not valid Base64'));
  clean = clean.replace(/=+$/, '');
  if (clean.length % 4 === 1) throw new Error(msg('Base64 input has an invalid length'));
  clean += '='.repeat((4 - (clean.length % 4)) % 4);
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function hexToBytes(input: string): Uint8Array {
  const clean = input.replace(/0x/gi, '').replace(/[\s,:]+/g, '');
  if (/[^0-9a-fA-F]/.test(clean)) throw new Error(msg('Input contains characters that are not hex digits'));
  if (clean.length % 2 !== 0) throw new Error(msg('Hex input has an odd number of digits'));
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function binaryToBytes(input: string): Uint8Array {
  const clean = input.replace(/\s+/g, '');
  if (/[^01]/.test(clean)) throw new Error(msg('Binary input may only contain 0, 1 and spaces'));
  if (clean.length % 8 !== 0) throw new Error(msg('Binary input must be a whole number of 8-bit bytes'));
  const bytes = new Uint8Array(clean.length / 8);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(clean.slice(i * 8, i * 8 + 8), 2);
  return bytes;
}

// Named references are case-sensitive; AMP, LT, GT and QUOT are the legacy upper-case forms HTML also accepts.
const HTML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', AMP: '&', LT: '<', GT: '>', QUOT: '"' };

// HTML numeric character reference rules: 0x80-0x9F are read as windows-1252.
const C1_REMAP: Record<number, number> = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030,
  0x8a: 0x0160, 0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022,
  0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a, 0x9c: 0x0153, 0x9e: 0x017e, 0x9f: 0x0178,
};

/** Code point for a numeric reference, as the HTML parser decodes it (NUL, surrogates and out-of-range become U+FFFD). */
function numericRef(cp: number): string {
  if (cp === 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return '\ufffd';
  return String.fromCodePoint(C1_REMAP[cp] ?? cp);
}

function decodeHtml(input: string): string {
  if (typeof document !== 'undefined') {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = input;
    return textarea.value;
  }
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, body: string) => {
    if (body[0] === '#') {
      const cp = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return numericRef(cp);
    }
    return Object.prototype.hasOwnProperty.call(HTML_ENTITIES, body) ? HTML_ENTITIES[body] : m;
  });
}

/** Decodes \uXXXX (including surrogate pairs), \u{XXXXX} and \xXX escapes. */
function decodeUnicodeEscapes(input: string): string {
  return input
    .replace(/\\u\{([0-9a-fA-F]{1,6})\}/g, (m, hex: string) => {
      const cp = parseInt(hex, 16);
      return cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    })
    .replace(/\\u([0-9a-fA-F]{4})/g, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\x([0-9a-fA-F]{2})/g, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

/** Escapes non-ASCII as \uXXXX UTF-16 code units, so emoji become a surrogate pair (JSON/JS style). */
function encodeUnicodeEscapes(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    out += code > 0x7e || (code < 0x20 && code !== 0x0a && code !== 0x0d && code !== 0x09)
      ? `\\u${code.toString(16).padStart(4, '0')}`
      : text[i];
  }
  return out;
}

/** Turns input in the given representation into a JavaScript string. */
export function decodeFrom(input: string, from: TextEncodingId): string {
  switch (from) {
    case 'base64':
      return bytesToUtf8(base64ToBytes(input), 'Base64');
    case 'hex':
      return bytesToUtf8(hexToBytes(input), 'hex');
    case 'binary':
      return bytesToUtf8(binaryToBytes(input), 'binary');
    case 'url':
      return decodeURIComponent(input);
    case 'html':
      return decodeHtml(input);
    case 'unicode':
      return decodeUnicodeEscapes(input);
    default:
      return input;
  }
}

/** Turns a JavaScript string into the given representation. */
export function encodeTo(text: string, to: TextEncodingId): string {
  const bytes = () => new TextEncoder().encode(text);
  switch (to) {
    case 'base64':
      return bytesToBase64(bytes());
    case 'hex':
      return Array.from(bytes(), (b) => b.toString(16).padStart(2, '0')).join('');
    case 'binary':
      return Array.from(bytes(), (b) => b.toString(2).padStart(8, '0')).join(' ');
    case 'url':
      return encodeURIComponent(text);
    case 'html':
      return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
    case 'unicode':
      return encodeUnicodeEscapes(text);
    case 'ascii':
      // One "?" per character (code point) that has no ASCII equivalent.
      return Array.from(text, (ch) => (ch.codePointAt(0)! <= 0x7f ? ch : '?')).join('');
    default:
      return text;
  }
}

export function convertEncoding(input: string, from: TextEncodingId, to: TextEncodingId): string {
  return encodeTo(decodeFrom(input, from), to);
}
