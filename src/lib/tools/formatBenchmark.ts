import { parse } from 'protobufjs';
import { msg } from '../msg';

export type Statistic = 'average' | 'p50' | 'p95' | 'p99';

// A generic JSON-value schema preserves arbitrary custom JSON, unlike a fixed User schema.
export const jsonValueSchema = `syntax = "proto3";
message JsonValue {
  oneof kind {
    bool null_value = 1;
    double number_value = 2;
    string string_value = 3;
    bool bool_value = 4;
    JsonObject object_value = 5;
    JsonArray array_value = 6;
  }
}
message JsonObject { map<string, JsonValue> fields = 1; }
message JsonArray { repeated JsonValue values = 1; }`;
const valueType = parse(jsonValueSchema).root.lookupType('JsonValue');

function toProto(value: unknown): Record<string, unknown> {
  if (value === null) return { nullValue: true };
  if (typeof value === 'number') return { numberValue: value };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { boolValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toProto) } };
  if (value && typeof value === 'object') return { objectValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toProto(item)])) } };
  throw new Error(msg('Only JSON values are supported'));
}

export function encodeJsonProto(value: unknown): Uint8Array {
  return valueType.encode(valueType.fromObject(toProto(value))).finish();
}

export function decodeJsonProto(bytes: Uint8Array): unknown {
  const fromProto = (value: Record<string, any>): unknown => {
    if ('nullValue' in value) return null;
    if ('numberValue' in value) return value.numberValue;
    if ('stringValue' in value) return value.stringValue;
    if ('boolValue' in value) return value.boolValue;
    if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(fromProto);
    return Object.fromEntries(Object.entries(value.objectValue?.fields ?? {}).map(([key, item]) => [key, fromProto(item as Record<string, any>)]));
  };
  return fromProto(valueType.toObject(valueType.decode(bytes)));
}

export function calculateStatistic(values: number[], type: Statistic): number {
  if (!values.length) throw new Error(msg('At least one sample is required'));
  if (type === 'average') return values.reduce((sum, value) => sum + value, 0) / values.length;
  const sorted = [...values].sort((a, b) => a - b);
  const quantile = { p50: 0.5, p95: 0.95, p99: 0.99 }[type];
  const index = (sorted.length - 1) * quantile;
  const lower = Math.floor(index);
  return sorted[lower] + (sorted[Math.ceil(index)] - sorted[lower]) * (index - lower);
}

export function serializeXml(value: unknown): string {
  const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  const node = (item: unknown): string => {
    if (item === null) return '<null/>';
    if (Array.isArray(item)) return `<array>${item.map(node).join('')}</array>`;
    if (typeof item === 'object') return `<object>${Object.entries(item).map(([key, child]) => `<entry key="${escape(key)}">${node(child)}</entry>`).join('')}</object>`;
    return `<${typeof item}>${escape(String(item))}</${typeof item}>`;
  };
  return `<?xml version="1.0" encoding="UTF-8"?><data>${node(value)}</data>`;
}

export function benchmarkCodec<T>(encode: () => T, decode: (data: T) => unknown, iterations: number, statistic: Statistic, clock = () => performance.now()) {
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 1000) throw new Error(msg('Invalid iteration count'));
  const serialization: number[] = [];
  const deserialization: number[] = [];
  let encoded = encode();
  decode(encoded); // warm up outside measured samples
  for (let i = 0; i < iterations; i++) {
    const start = clock();
    encoded = encode();
    const middle = clock();
    decode(encoded);
    const end = clock();
    serialization.push(middle - start);
    deserialization.push(end - middle);
  }
  return { encoded, serializationTime: calculateStatistic(serialization, statistic), deserializationTime: calculateStatistic(deserialization, statistic) };
}

export async function compareFormats(data: unknown, iterations: number, statistic: Statistic) {
  const codecs = [
    { format: 'JSON', encode: () => JSON.stringify(data, null, 2), decode: (value: string) => JSON.parse(value), readability: 'High', schemaSupport: false, humanReadable: true },
    { format: 'XML', encode: () => serializeXml(data), decode: (value: string) => {
      const document = new DOMParser().parseFromString(value, 'application/xml');
      if (document.querySelector('parsererror')) throw new Error(msg('Invalid XML'));
      return document;
    }, readability: 'Medium', schemaSupport: true, humanReadable: true },
    { format: 'Protocol Buffers', encode: () => encodeJsonProto(data), decode: (value: Uint8Array) => decodeJsonProto(value), readability: 'Low', schemaSupport: true, humanReadable: false },
  ];
  const results = [];
  for (const codec of codecs) {
    await new Promise(resolve => setTimeout(resolve, 0));
    const measured = benchmarkCodec<string | Uint8Array>(codec.encode, codec.decode as (value: string | Uint8Array) => unknown, iterations, statistic);
    const encoded = measured.encoded;
    const size = typeof encoded === 'string' ? new TextEncoder().encode(encoded).length : encoded.length;
    const preview = typeof encoded === 'string' ? encoded : `# Generic JSON-value Protocol Buffer Schema\n${jsonValueSchema}\n\n# Binary Data (${size} bytes)\n${Array.from(encoded, byte => byte.toString(16).padStart(2, '0')).join(' ')}`;
    results.push({ ...codec, size, serializationTime: measured.serializationTime, deserializationTime: measured.deserializationTime, data: preview.slice(0, 500) + (preview.length > 500 ? '...' : '') });
  }
  return results;
}