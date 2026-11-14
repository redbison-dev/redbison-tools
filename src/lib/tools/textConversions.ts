import Papa from 'papaparse';
import { parseDocument, stringify } from 'yaml';

export function encodeUtf8Base64(text: string): string {
  let binary = '';
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function decodeUtf8Base64(text: string): string {
  const binary = atob(text);
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, c => c.charCodeAt(0)));
}

export function csvToRecords(text: string): Record<string, string>[] {
  const result = Papa.parse<string[]>(text, { delimiter: ',', skipEmptyLines: 'greedy' });
  if (result.errors.length) throw new Error(result.errors[0].message);
  const [headers, ...rows] = result.data;
  if (!headers || !rows.length) throw new Error('CSV must have a header and at least one data row');
  const keys = headers.map(header => header.trim());
  if (new Set(keys).size !== keys.length) throw new Error('Duplicate CSV headers');
  return rows.map(row => {
    if (row.length > keys.length) throw new Error('CSV row has too many fields');
    return Object.fromEntries(keys.map((key, i) => [key, row[i] ?? '']));
  });
}

export function recordsToCsv(data: unknown): string {
  if (!Array.isArray(data) || !data.length || data.some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
    throw new Error('JSON must be a non-empty array of objects');
  }
  // Header is the union of keys in first-seen order, so keys that only appear in later rows are kept.
  const fields: string[] = [];
  for (const row of data) for (const key of Object.keys(row)) if (!fields.includes(key)) fields.push(key);
  // Nested objects and arrays are written as JSON text instead of "[object Object]" or "1,2".
  const rows = data.map(row => fields.map(key => {
    const value = (row as Record<string, unknown>)[key];
    return value !== null && typeof value === 'object' ? JSON.stringify(value) : value;
  }));
  return Papa.unparse({ fields, data: rows }, { newline: '\n' });
}

export function jsonToYamlValue(data: unknown): string {
  return stringify(data);
}

export function yamlToJsonValue(text: string): unknown {
  const document = parseDocument(text, { version: '1.2', uniqueKeys: true });
  if (document.errors.length) throw new Error(document.errors[0].message);
  const value: unknown = document.toJS({ maxAliasCount: 100 });
  // Reject values that JSON would silently drop, truncate, or cannot represent (e.g. cyclic aliases).
  const json = JSON.stringify(value, (_key, item) => {
    if (typeof item === 'number' && !Number.isFinite(item)) throw new Error('Non-finite numbers cannot be represented in JSON');
    return item;
  });
  if (json === undefined) throw new Error('No YAML value to convert');
  return JSON.parse(json);
}

export function matchRegex(text: string, pattern: string, flags: string) {
  const result = text.match(new RegExp(pattern, flags));
  return { matches: result ? Array.from(result) : [], isMatch: result !== null };
}