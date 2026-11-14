/**
 * Pure helpers for the Binary & Hex Editor. Bytes are the source of truth:
 * text typed into the editor is encoded as UTF-8, and every view (hex,
 * binary, ASCII column, formatted dump) is derived from the same bytes.
 */

import { msg } from '../msg';

/** `error` is English; the page shows t(errorMsg.text, errorMsg.vars). */
export type HexParseResult =
  | { bytes: Uint8Array; error?: undefined; errorMsg?: undefined }
  | { bytes?: undefined; error: string; errorMsg: { text: string; vars: Record<string, string | number> } };

const hexError = (text: string, vars: Record<string, string | number>) => ({
  error: text.replace(/\{(\w+)\}/g, (all, k: string) => (vars[k] === undefined ? all : String(vars[k]))),
  errorMsg: { text, vars },
});

/**
 * Parses space/newline separated hex such as "48 65 6C" or "48656c".
 * Accepts an optional 0x prefix per byte. Rejects odd digit counts and
 * non-hex characters instead of silently turning them into dots.
 */
export function parseHex(input: string): HexParseResult {
  const clean = input.replace(/0x/gi, '').replace(/[\s,]+/g, '');
  if (clean.length === 0) return { bytes: new Uint8Array(0) };
  const bad = clean.match(/[^0-9a-fA-F]/);
  if (bad) return hexError(msg('"{char}" is not a hex digit'), { char: bad[0] });
  if (clean.length % 2 !== 0) {
    return hexError(msg('Odd number of hex digits ({count}); each byte needs two digits'), { count: clean.length });
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return { bytes };
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

export function bytesToBinary(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(2).padStart(8, '0')).join(' ');
}

/** Printable ASCII (0x20 to 0x7E) as-is, everything else as a dot, like hexdump -C. */
export function bytesToAscii(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : '.')).join('');
}

/** Text typed in the Text view becomes UTF-8 bytes (so "é" is C3 A9, not E9). */
export function textToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** Classic 16-bytes-per-line dump: "00000010: 48 65 ... |Hello...|". */
export function formatHexDump(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 16) {
    const line = bytes.subarray(i, i + 16);
    const offset = i.toString(16).padStart(8, '0').toUpperCase();
    out += `${offset}: ${bytesToHex(line).padEnd(47)} |${bytesToAscii(line)}|\n`;
  }
  return out;
}

/**
 * Text shown in the editable Text view. When the bytes are valid UTF-8 with
 * no control characters other than tab, CR and LF, show the decoded text so
 * editing it round-trips. Otherwise fall back to the lossy dotted ASCII view.
 */
export function bytesToEditableText(bytes: Uint8Array): { text: string; lossy: boolean } {
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    // eslint-disable-next-line no-control-regex
    if (!/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text) && !text.startsWith('\uFEFF')) {
      return { text, lossy: false };
    }
  } catch {
    // not UTF-8
  }
  return { text: bytesToAscii(bytes), lossy: true };
}
