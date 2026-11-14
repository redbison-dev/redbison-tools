/**
 * The MCP tool registry: a curated set of this repo's pure tool functions,
 * exposed to AI assistants by src/mcp/server.ts. Everything runs locally —
 * no network calls, no accounts, no telemetry.
 *
 * Each entry is plain data + a run() so tests can exercise tools without
 * speaking the protocol.
 */
import cronstrue from 'cronstrue';
import { marked } from 'marked';
import { convertCases } from '@/lib/tools/case-converter';
import {
  csvToRecords,
  decodeUtf8Base64,
  encodeUtf8Base64,
  jsonToYamlValue,
  matchRegex,
  yamlToJsonValue,
} from '@/lib/tools/textConversions';
import { hashBytes, type HashAlgorithm } from '@/lib/tools/hashing';
import { decodeJwt } from '@/lib/tools/jwt-decoder';
import { binaryToText, textToBinary, textToHex } from '@/lib/tools/specialty-converters';
import { detectEpochUnit, epochToDate } from '@/lib/tools/epoch-converter';

type Json = Record<string, unknown>;

export interface McpTool {
  description: string;
  inputSchema: Json;
  run: (args: Json) => unknown | Promise<unknown>;
  example: Json;
}

const str = (description: string): Json => ({ type: 'string', description });

const HASH_CHOICES: HashAlgorithm[] = ['MD5', 'SHA-1', 'SHA-256', 'SHA-512', 'SHA3-256'];

function baseConvert(value: string, fromBase: number, toBase: number): string {
  const digits = '0123456789abcdefghijklmnopqrstuvwxyz';
  const clean = value.trim().toLowerCase().replace(/^0[xbo]/, '');
  let n = 0n;
  for (const c of clean) {
    const d = BigInt(digits.indexOf(c));
    if (d < 0n || d >= BigInt(fromBase)) throw new Error(`'${c}' is not a base-${fromBase} digit`);
    n = n * BigInt(fromBase) + d;
  }
  if (n === 0n) return '0';
  let out = '';
  while (n > 0n) {
    out = digits[Number(n % BigInt(toBase))] + out;
    n /= BigInt(toBase);
  }
  return out;
}

export const TOOLS: Record<string, McpTool> = {
  case_convert: {
    description: 'Convert text into every common case format: camelCase, snake_case, kebab-case, PascalCase, CONSTANT_CASE, Title Case and more.',
    inputSchema: { type: 'object', properties: { text: str('The text to convert') }, required: ['text'] },
    run: ({ text }) => convertCases(String(text)),
    example: { text: 'hello world example' },
  },
  regex_test: {
    description: 'Test a JavaScript regular expression against text and return the matches with their positions and capture groups.',
    inputSchema: {
      type: 'object',
      properties: { text: str('The text to search'), pattern: str('The regex pattern, without slashes'), flags: str("Regex flags, e.g. 'gi' (default 'g')") },
      required: ['text', 'pattern'],
    },
    run: ({ text, pattern, flags }) => matchRegex(String(text), String(pattern), String(flags ?? 'g')),
    example: { text: 'cat bat hat', pattern: '([bh])at', flags: 'g' },
  },
  hash_text: {
    description: 'Hash UTF-8 text with MD5, SHA-1, SHA-256, SHA-512 or SHA3-256 and return the hex digest.',
    inputSchema: {
      type: 'object',
      properties: { text: str('The text to hash'), algorithm: { type: 'string', enum: HASH_CHOICES, description: 'Hash algorithm (default SHA-256)' } },
      required: ['text'],
    },
    run: async ({ text, algorithm }) => {
      const alg = (algorithm ?? 'SHA-256') as HashAlgorithm;
      if (!HASH_CHOICES.includes(alg)) throw new Error(`algorithm must be one of ${HASH_CHOICES.join(', ')}`);
      return { algorithm: alg, hex: await hashBytes(new TextEncoder().encode(String(text)), alg) };
    },
    example: { text: 'hello', algorithm: 'SHA-256' },
  },
  json_format: {
    description: 'Validate and pretty-print JSON. Returns the formatted document or the parse error with its position.',
    inputSchema: {
      type: 'object',
      properties: { json: str('The JSON text'), indent: { type: 'number', description: 'Spaces of indentation (default 2)' } },
      required: ['json'],
    },
    run: ({ json, indent }) => ({ formatted: JSON.stringify(JSON.parse(String(json)), null, Number(indent ?? 2)) }),
    example: { json: '{"b":1,"a":[1,2]}' },
  },
  json_to_yaml: {
    description: 'Convert a JSON document to YAML.',
    inputSchema: { type: 'object', properties: { json: str('The JSON text') }, required: ['json'] },
    run: ({ json }) => ({ yaml: jsonToYamlValue(JSON.parse(String(json))) }),
    example: { json: '{"name":"demo","items":[1,2]}' },
  },
  yaml_to_json: {
    description: 'Convert a YAML document to JSON.',
    inputSchema: { type: 'object', properties: { yaml: str('The YAML text') }, required: ['yaml'] },
    run: ({ yaml }) => ({ json: JSON.stringify(yamlToJsonValue(String(yaml)), null, 2) }),
    example: { yaml: 'name: demo\nitems:\n  - 1\n  - 2\n' },
  },
  csv_to_json: {
    description: 'Parse CSV text (first row = headers) into an array of JSON records.',
    inputSchema: { type: 'object', properties: { csv: str('The CSV text') }, required: ['csv'] },
    run: ({ csv }) => csvToRecords(String(csv)),
    example: { csv: 'name,qty\nbolt,4\nnut,9' },
  },
  base64_convert: {
    description: 'Base64-encode or -decode UTF-8 text.',
    inputSchema: {
      type: 'object',
      properties: { mode: { type: 'string', enum: ['encode', 'decode'], description: 'Direction' }, text: str('The input text') },
      required: ['mode', 'text'],
    },
    run: ({ mode, text }) => ({ result: mode === 'decode' ? decodeUtf8Base64(String(text)) : encodeUtf8Base64(String(text)) }),
    example: { mode: 'encode', text: 'hello' },
  },
  binary_text_convert: {
    description: 'Convert text to binary or hex byte strings (UTF-8), or binary back to text.',
    inputSchema: {
      type: 'object',
      properties: { mode: { type: 'string', enum: ['to-binary', 'to-hex', 'from-binary'], description: 'Direction' }, text: str('The input') },
      required: ['mode', 'text'],
    },
    run: ({ mode, text }) => {
      if (mode === 'to-binary') return { result: textToBinary(String(text)) };
      if (mode === 'to-hex') return { result: textToHex(String(text)) };
      const out = binaryToText(String(text));
      if ('error' in (out as object)) throw new Error(String((out as { error: string }).error));
      return out;
    },
    example: { mode: 'to-binary', text: 'Hi' },
  },
  epoch_convert: {
    description: 'Convert a Unix epoch timestamp (seconds, milliseconds, microseconds or nanoseconds — unit auto-detected) to an ISO 8601 UTC datetime.',
    inputSchema: { type: 'object', properties: { value: str('The epoch value') }, required: ['value'] },
    run: ({ value }) => {
      const v = String(value).trim();
      const unit = detectEpochUnit(v);
      if (!unit) throw new Error('Not a recognizable epoch timestamp');
      const date = epochToDate(v, unit);
      if (!date) throw new Error('Out of range');
      return { unit, iso: date.toISOString() };
    },
    example: { value: '1700000000' },
  },
  jwt_decode: {
    description: 'Decode a JWT without verifying it: returns the header and payload. Never paste production secrets.',
    inputSchema: { type: 'object', properties: { token: str('The JWT') }, required: ['token'] },
    run: ({ token }) => decodeJwt(String(token)),
    example: { token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c' },
  },
  cron_describe: {
    description: 'Explain a cron expression in plain English.',
    inputSchema: { type: 'object', properties: { expression: str("The cron expression, e.g. '*/15 9-17 * * 1-5'") }, required: ['expression'] },
    run: ({ expression }) => ({ description: cronstrue.toString(String(expression)) }),
    example: { expression: '*/15 9-17 * * 1-5' },
  },
  number_base_convert: {
    description: 'Convert an integer between bases 2–36 (binary, octal, decimal, hex, …) using exact arbitrary-precision arithmetic.',
    inputSchema: {
      type: 'object',
      properties: {
        value: str('The number, in the source base'),
        fromBase: { type: 'number', description: 'Source base, 2-36' },
        toBase: { type: 'number', description: 'Target base, 2-36' },
      },
      required: ['value', 'fromBase', 'toBase'],
    },
    run: ({ value, fromBase, toBase }) => {
      const f = Number(fromBase), t = Number(toBase);
      if (!(f >= 2 && f <= 36 && t >= 2 && t <= 36)) throw new Error('Bases must be between 2 and 36');
      return { result: baseConvert(String(value), f, t) };
    },
    example: { value: 'ff', fromBase: 16, toBase: 2 },
  },
  markdown_to_html: {
    description: 'Convert Markdown (CommonMark + GitHub tables, strikethrough, task lists) to HTML.',
    inputSchema: { type: 'object', properties: { markdown: str('The Markdown text') }, required: ['markdown'] },
    run: ({ markdown }) => ({ html: String(marked.parse(String(markdown), { async: false, gfm: true })) }),
    example: { markdown: '# Hi\n\n- one\n- two' },
  },
};
