/**
 * Solidity ABI helpers: Keccak-256, canonical signatures, function
 * selectors, event topics and calldata decoding (static and dynamic types,
 * arrays and tuples). Integers are returned as BigInt decimal strings.
 */
import CryptoJS from 'crypto-js';
import { msg } from '../msg';

/** An error whose message is a msg()-marked template plus values, so the page can show it translated (t(e.text, e.vars)); `message` is the US English text. */
export class AbiError extends Error {
  text: string;
  vars: Record<string, string | number>;
  constructor(text: string, vars: Record<string, string | number> = {}) {
    super(text.replace(/\{(\w+)\}/g, (all, k: string) => (vars[k] === undefined ? all : String(vars[k]))));
    this.text = text;
    this.vars = vars;
  }
}

export type AbiParam = {
  name?: string;
  type: string;
  components?: AbiParam[];
  indexed?: boolean;
};

export type AbiItem = {
  type?: string;
  name?: string;
  inputs?: AbiParam[];
  outputs?: AbiParam[];
  stateMutability?: string;
  anonymous?: boolean;
};

export type DecodedValue = string | boolean | DecodedValue[];

/** Keccak-256 (the pre-NIST variant Ethereum uses) of raw bytes, as 0x hex. */
export function keccak256Bytes(bytes: Uint8Array): string {
  const words: number[] = [];
  for (let i = 0; i < bytes.length; i++) {
    words[i >>> 2] |= bytes[i] << (24 - (i % 4) * 8);
  }
  const wordArray = CryptoJS.lib.WordArray.create(words, bytes.length);
  return '0x' + CryptoJS.SHA3(wordArray, { outputLength: 256 }).toString(CryptoJS.enc.Hex);
}

/** Keccak-256 of a UTF-8 string, as 0x hex. */
export function keccak256Text(text: string): string {
  return keccak256Bytes(new TextEncoder().encode(text));
}

export function hexToBytes(hex: string): Uint8Array {
  let h = hex.trim();
  if (h.startsWith('0x') || h.startsWith('0X')) h = h.slice(2);
  h = h.replace(/\s+/g, '');
  if (h.length % 2 !== 0) throw new AbiError(msg('Hex data must have an even number of characters'));
  if (!/^[0-9a-fA-F]*$/.test(h)) throw new AbiError(msg('Hex data contains non-hex characters'));
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  let s = '0x';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

/** EIP-55 mixed-case checksum address. */
export function toChecksumAddress(address: string): string {
  const lower = address.toLowerCase().replace(/^0x/, '');
  const hash = keccak256Text(lower).slice(2);
  let out = '0x';
  for (let i = 0; i < lower.length; i++) {
    out += parseInt(hash[i], 16) >= 8 ? lower[i].toUpperCase() : lower[i];
  }
  return out;
}

/** Canonical type string, expanding tuples to (a,b,...) and keeping array suffixes. */
export function canonicalType(param: AbiParam): string {
  const t = param.type.trim();
  if (t.startsWith('tuple')) {
    const suffix = t.slice('tuple'.length);
    const inner = (param.components ?? []).map(canonicalType).join(',');
    return `(${inner})${suffix}`;
  }
  // Solidity aliases: uint -> uint256, int -> int256 (selectors use the full form).
  return t.replace(/^uint(?=$|\[)/, 'uint256').replace(/^int(?=$|\[)/, 'int256');
}

export function signatureOf(item: AbiItem): string {
  return `${item.name ?? ''}(${(item.inputs ?? []).map(canonicalType).join(',')})`;
}

export function selectorOf(signature: string): string {
  return keccak256Text(signature).slice(0, 10);
}

export type AbiSummaryEntry = {
  kind: 'function' | 'event' | 'error';
  name: string;
  signature: string;
  /** 4-byte selector for functions/errors, 32-byte topic0 for events. */
  id: string;
  inputs: AbiParam[];
  outputs: AbiParam[];
  stateMutability?: string;
};

export type AbiSummary = {
  functions: AbiSummaryEntry[];
  events: AbiSummaryEntry[];
  errors: AbiSummaryEntry[];
  constructors: AbiItem[];
  hasFallback: boolean;
  hasReceive: boolean;
};

export function parseAbiJson(text: string): AbiItem[] {
  const parsed = JSON.parse(text);
  // Accept a bare ABI array or a compiler/Hardhat artifact with an "abi" field.
  const abi = Array.isArray(parsed) ? parsed : parsed && Array.isArray(parsed.abi) ? parsed.abi : null;
  if (!abi) throw new AbiError(msg('Expected a JSON array of ABI entries, or an object with an "abi" array'));
  return abi as AbiItem[];
}

export function summarizeAbi(abi: AbiItem[]): AbiSummary {
  const entries = (kind: 'function' | 'event' | 'error') =>
    abi
      .filter((i) => i.type === kind || (kind === 'function' && i.type === undefined && i.name))
      .map((i) => {
        const signature = signatureOf(i);
        const hash = keccak256Text(signature);
        return {
          kind,
          name: i.name ?? '',
          signature,
          id: kind === 'event' ? hash : hash.slice(0, 10),
          inputs: i.inputs ?? [],
          outputs: i.outputs ?? [],
          stateMutability: i.stateMutability,
        };
      });
  return {
    functions: entries('function'),
    events: entries('event'),
    errors: entries('error'),
    constructors: abi.filter((i) => i.type === 'constructor'),
    hasFallback: abi.some((i) => i.type === 'fallback'),
    hasReceive: abi.some((i) => i.type === 'receive'),
  };
}

/* ---------------- decoding ---------------- */

function readWord(data: Uint8Array, offset: number): Uint8Array {
  if (offset < 0 || offset + 32 > data.length) {
    throw new AbiError(msg('Data too short: needed 32 bytes at offset {offset}, have {length}'), { offset, length: data.length });
  }
  return data.subarray(offset, offset + 32);
}

function wordToBigInt(word: Uint8Array): bigint {
  return word.length ? BigInt(bytesToHex(word)) : 0n;
}

/** `text` is the msg()-marked error, with {value} for the out-of-range number. */
function toSafeIndex(v: bigint, text: string, limit: number): number {
  if (v > BigInt(limit)) throw new AbiError(text, { value: v.toString() });
  return Number(v);
}

type ParsedType =
  | { kind: 'tuple'; components: ParsedType[] }
  | { kind: 'array'; base: ParsedType; length: number | null }
  | { kind: 'elementary'; name: string };

function parseType(param: AbiParam): ParsedType {
  const t = param.type.trim();
  const arr = /^(.*)\[(\d*)\]$/.exec(t);
  if (arr) {
    return {
      kind: 'array',
      base: parseType({ ...param, type: arr[1] }),
      length: arr[2] === '' ? null : Number(arr[2]),
    };
  }
  if (t === 'tuple') {
    return { kind: 'tuple', components: (param.components ?? []).map(parseType) };
  }
  if (t.startsWith('(') && t.endsWith(')')) {
    return { kind: 'tuple', components: splitTupleTypes(t.slice(1, -1)).map((x) => parseType({ type: x })) };
  }
  const name = t === 'uint' ? 'uint256' : t === 'int' ? 'int256' : t;
  if (!/^(address|bool|string|bytes|bytes([1-9]|[12]\d|3[0-2])|u?int(8|16|24|32|40|48|56|64|72|80|88|96|104|112|120|128|136|144|152|160|168|176|184|192|200|208|216|224|232|240|248|256)|function)$/.test(name)) {
    throw new AbiError(msg('Unsupported ABI type: {type}'), { type: t });
  }
  return { kind: 'elementary', name };
}

/** Split "uint256,(address,bool)[],bytes" at top-level commas. */
export function splitTupleTypes(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function isDynamic(t: ParsedType): boolean {
  if (t.kind === 'elementary') return t.name === 'string' || t.name === 'bytes';
  if (t.kind === 'array') return t.length === null || isDynamic(t.base);
  return t.components.some(isDynamic);
}

function headSize(t: ParsedType): number {
  if (isDynamic(t)) return 32;
  if (t.kind === 'array') return (t.length ?? 0) * headSize(t.base);
  if (t.kind === 'tuple') return t.components.reduce((n, c) => n + headSize(c), 0);
  return 32;
}

function decodeElementary(name: string, word: Uint8Array): DecodedValue {
  if (name === 'address') return toChecksumAddress(bytesToHex(word.subarray(12)));
  if (name === 'bool') return wordToBigInt(word) !== 0n;
  if (name === 'function') return bytesToHex(word.subarray(0, 24));
  const bytesN = /^bytes(\d+)$/.exec(name);
  if (bytesN) return bytesToHex(word.subarray(0, Number(bytesN[1])));
  const m = /^(u?)int(\d+)$/.exec(name);
  if (m) {
    const v = wordToBigInt(word);
    if (m[1] === 'u') return v.toString();
    // Two's complement over 256 bits.
    return (v >= 1n << 255n ? v - (1n << 256n) : v).toString();
  }
  throw new AbiError(msg('Unsupported ABI type: {type}'), { type: name });
}

function decodeSequence(types: ParsedType[], data: Uint8Array, base: number): DecodedValue[] {
  const values: DecodedValue[] = [];
  let head = base;
  for (const t of types) {
    if (isDynamic(t)) {
      const rel = toSafeIndex(wordToBigInt(readWord(data, head)), msg('Offset {value} points outside the data'), data.length);
      values.push(decodeAt(t, data, base + rel));
      head += 32;
    } else {
      values.push(decodeAt(t, data, head));
      head += headSize(t);
    }
  }
  return values;
}

function decodeAt(t: ParsedType, data: Uint8Array, offset: number): DecodedValue {
  if (t.kind === 'elementary') {
    if (t.name === 'bytes' || t.name === 'string') {
      const len = toSafeIndex(wordToBigInt(readWord(data, offset)), msg('Length {value} points outside the data'), data.length);
      const start = offset + 32;
      if (start + len > data.length) throw new AbiError(msg('Data too short for {type} of length {length}'), { type: t.name, length: len });
      const raw = data.subarray(start, start + len);
      return t.name === 'string' ? new TextDecoder().decode(raw) : bytesToHex(raw);
    }
    return decodeElementary(t.name, readWord(data, offset));
  }
  if (t.kind === 'tuple') return decodeSequence(t.components, data, offset);
  // array: check the heads fit before allocating, so a huge declared length cannot exhaust memory.
  const elementHead = isDynamic(t.base) ? 32 : headSize(t.base);
  if (t.length === null) {
    const len = toSafeIndex(wordToBigInt(readWord(data, offset)), msg('Array length {value} points outside the data'), data.length);
    if (offset + 32 + len * elementHead > data.length) throw new AbiError(msg('Data too short for an array of {count} elements'), { count: len });
    return decodeSequence(Array(len).fill(t.base), data, offset + 32);
  }
  if (offset + t.length * elementHead > data.length) throw new AbiError(msg('Data too short for an array of {count} elements'), { count: t.length });
  return decodeSequence(Array(t.length).fill(t.base), data, offset);
}

/** Decode ABI-encoded parameters (no selector) for the given types. */
export function decodeAbiParameters(params: AbiParam[], data: Uint8Array | string): DecodedValue[] {
  const bytes = typeof data === 'string' ? hexToBytes(data) : data;
  return decodeSequence(params.map(parseType), bytes, 0);
}

export type DecodedCall = {
  name: string;
  signature: string;
  selector: string;
  args: { name: string; type: string; value: DecodedValue }[];
};

/** Match calldata's first 4 bytes against the ABI's functions and decode the rest. */
export function decodeCalldata(abi: AbiItem[], calldata: string): DecodedCall {
  const bytes = hexToBytes(calldata);
  if (bytes.length < 4) throw new AbiError(msg('Calldata must be at least 4 bytes (the function selector)'));
  const selector = bytesToHex(bytes.subarray(0, 4));
  const fn = summarizeAbi(abi).functions.find((f) => f.id === selector);
  if (!fn) throw new AbiError(msg('No function in this ABI has selector {selector}'), { selector });
  const values = decodeAbiParameters(fn.inputs, bytes.subarray(4));
  return {
    name: fn.name,
    signature: fn.signature,
    selector,
    args: fn.inputs.map((p, i) => ({ name: p.name || `arg${i}`, type: canonicalType(p), value: values[i] })),
  };
}

export function formatDecodedValue(v: DecodedValue): string {
  if (Array.isArray(v)) return `[${v.map(formatDecodedValue).join(', ')}]`;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return v;
}

/** Common ERC-20/721 functions, used when no ABI is supplied. */
export const COMMON_FUNCTIONS: AbiItem[] = [
  { type: 'function', name: 'transfer', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }] },
  { type: 'function', name: 'approve', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }] },
  { type: 'function', name: 'transferFrom', inputs: [{ name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }] },
  { type: 'function', name: 'safeTransferFrom', inputs: [{ name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'tokenId', type: 'uint256' }] },
  { type: 'function', name: 'setApprovalForAll', inputs: [{ name: 'operator', type: 'address' }, { name: 'approved', type: 'bool' }] },
  { type: 'function', name: 'deposit', inputs: [] },
  { type: 'function', name: 'withdraw', inputs: [{ name: 'amount', type: 'uint256' }] },
];
