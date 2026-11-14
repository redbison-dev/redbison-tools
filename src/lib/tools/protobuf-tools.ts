/**
 * Protocol Buffers helpers for the Protobuf Tools page, built on protobufjs
 * so .proto parsing, type resolution and binary encoding use a real
 * implementation instead of line-by-line string matching.
 */
import * as protobuf from 'protobufjs';
import { msg } from '../msg';

/** A translate function (the page's t); English by default. */
export type Translate = (source: string, vars?: Record<string, string | number>) => string;
const english: Translate = (s, v) => s.replace(/\{(\w+)\}/g, (all, k: string) => (v?.[k] === undefined ? all : String(v[k])));

type PbType = protobuf.Type;
type PbField = protobuf.Field;

export type ProtoSummary = {
  syntax: string;
  packageName: string;
  messages: { name: string; fields: string[] }[];
  enums: { name: string; values: string[] }[];
  services: { name: string; methods: string[] }[];
};

export type ParsedProto = { root: protobuf.Root; summary: ProtoSummary; firstMessage?: PbType };

const INT32_TYPES = new Set(['int32', 'sint32', 'sfixed32']);
const UINT32_TYPES = new Set(['uint32', 'fixed32']);
const INT64_TYPES = new Set(['int64', 'sint64', 'sfixed64']);
const UINT64_TYPES = new Set(['uint64', 'fixed64']);

function walk(ns: protobuf.NamespaceBase, visit: (obj: protobuf.ReflectionObject) => void) {
  for (const child of ns.nestedArray) {
    visit(child);
    if (child instanceof protobuf.Namespace || child instanceof protobuf.Type) walk(child as protobuf.NamespaceBase, visit);
  }
}

function stripDot(name: string) {
  return name.replace(/^\./, '');
}

function fieldLabel(f: PbField, proto2: boolean): string {
  if (f instanceof protobuf.MapField) return `map<${f.keyType}, ${f.type}> ${f.name} = ${f.id}`;
  // proto2 fields always carry a label; outside a oneof, a field that is neither repeated nor required is "optional".
  const proto2Optional = proto2 && !f.partOf;
  const prefix = f.repeated ? 'repeated ' : f.options?.proto3_optional || (proto2Optional && !f.required) ? 'optional ' : f.required ? 'required ' : '';
  return `${prefix}${f.type} ${f.name} = ${f.id}`;
}

/**
 * Parses and fully resolves a .proto definition. Throws an Error with
 * protobufjs's message (which includes the line number) when it is invalid.
 */
export function parseProto(source: string): ParsedProto {
  const parsed = protobuf.parse(source, { keepCase: true, alternateCommentMode: true });
  const root = parsed.root;
  root.resolveAll(); // throws "no such type" for unresolved references

  const summary: ProtoSummary = {
    syntax: /^\s*syntax\s*=\s*["']([^"']+)["']/m.exec(source)?.[1] ?? 'proto2',
    packageName: parsed.package ?? '',
    messages: [],
    enums: [],
    services: [],
  };
  let firstMessage: PbType | undefined;
  walk(root, (obj) => {
    if (obj instanceof protobuf.Type) {
      firstMessage ??= obj;
      summary.messages.push({ name: stripDot(obj.fullName), fields: obj.fieldsArray.map((f) => fieldLabel(f, summary.syntax === 'proto2')) });
    } else if (obj instanceof protobuf.Enum) {
      summary.enums.push({ name: stripDot(obj.fullName), values: Object.entries(obj.values).map(([k, v]) => `${k} = ${v}`) });
    } else if (obj instanceof protobuf.Service) {
      summary.services.push({
        name: stripDot(obj.fullName),
        methods: obj.methodsArray.map((m) => `${m.name}(${m.requestStream ? 'stream ' : ''}${m.requestType}) returns (${m.responseStream ? 'stream ' : ''}${m.responseType})`),
      });
    }
  });
  return { root, summary, firstMessage };
}

export function formatProtoSummary(s: ProtoSummary, t: Translate = english): string {
  let out = `${t('Syntax: {syntax}', { syntax: s.syntax })}\n${t('Package: {name}', { name: s.packageName || t('Not specified') })}\n\n`;
  if (s.messages.length) {
    out += `${t('Messages ({count}):', { count: s.messages.length })}\n`;
    for (const m of s.messages) {
      const vars = { name: m.name, count: m.fields.length };
      out += `- ${t(msg.plural(m.fields.length, { one: '{name} ({count} field)', other: '{name} ({count} fields)' }), vars)}\n`;
      for (const f of m.fields) out += `  • ${f}\n`;
    }
    out += '\n';
  }
  if (s.enums.length) {
    out += `${t('Enums ({count}):', { count: s.enums.length })}\n`;
    for (const e of s.enums) out += `- ${e.name}: ${e.values.join(', ')}\n`;
    out += '\n';
  }
  if (s.services.length) {
    out += `${t('Services ({count}):', { count: s.services.length })}\n`;
    for (const sv of s.services) {
      out += `- ${sv.name}\n`;
      for (const m of sv.methods) out += `  • ${m}\n`;
    }
  }
  return out.trimEnd();
}

/**
 * lowerCamelCase JSON name used by the proto3 JSON mapping, computed like
 * protoc's ToJsonName: every "_" is dropped and the character after it is upper-cased.
 */
export function jsonNameOf(name: string): string {
  let out = '';
  let upper = false;
  for (const c of name) {
    if (c === '_') upper = true;
    else {
      out += upper ? c.toUpperCase() : c;
      upper = false;
    }
  }
  return out;
}

/** The field's JSON name: an explicit [json_name = "..."] option wins. */
function jsonNameOfField(f: PbField): string {
  const explicit = f.options?.json_name;
  return typeof explicit === 'string' ? explicit : jsonNameOf(f.name);
}

export type ProtoJsonCheck = { valid: boolean; messageName: string; errors: string[]; warnings: string[]; encodedBytes?: Uint8Array };

function describe(v: unknown) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function checkScalar(type: string, v: unknown, path: string, errors: string[], t: Translate): unknown {
  const intLike = (value: unknown) => (typeof value === 'string' && /^-?\d+$/.test(value.trim())) || Number.isInteger(value);
  if (INT32_TYPES.has(type) || UINT32_TYPES.has(type)) {
    if (!intLike(v)) {
      errors.push(t('{path}: {type} needs an integer, got {value}', { path, type, value: JSON.stringify(v) }));
      return v;
    }
    const n = Number(v);
    const [min, max] = UINT32_TYPES.has(type) ? [0, 4294967295] : [-2147483648, 2147483647];
    if (n < min || n > max) errors.push(t('{path}: {n} is out of range for {type} ({min} to {max})', { path, n, type, min, max }));
    return n;
  }
  if (INT64_TYPES.has(type) || UINT64_TYPES.has(type)) {
    if (!intLike(v)) errors.push(t('{path}: {type} needs an integer or a decimal string, got {value}', { path, type, value: JSON.stringify(v) }));
    else if (UINT64_TYPES.has(type) && String(v).trim().startsWith('-')) errors.push(t('{path}: {type} cannot be negative', { path, type }));
    return typeof v === 'number' ? v : String(v).trim();
  }
  if (type === 'double' || type === 'float') {
    if (typeof v === 'number' || v === 'NaN' || v === 'Infinity' || v === '-Infinity') return typeof v === 'number' ? v : Number(v);
    if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
    errors.push(t('{path}: {type} needs a number, got {value}', { path, type, value: JSON.stringify(v) }));
    return v;
  }
  if (type === 'bool') {
    if (typeof v !== 'boolean') errors.push(t('{path}: bool needs true or false, got {value}', { path, value: JSON.stringify(v) }));
    return v;
  }
  if (type === 'string') {
    if (typeof v !== 'string') errors.push(t('{path}: string needs a JSON string, got {kind}', { path, kind: describe(v) }));
    return v;
  }
  if (type === 'bytes') {
    // Standard or URL-safe Base64, padded or not; a lone trailing character or partial padding is not Base64.
    const core = typeof v === 'string' ? v.replace(/=+$/, '') : '';
    const ok = typeof v === 'string' && /^[A-Za-z0-9+/_-]*={0,2}$/.test(v) && core.length % 4 !== 1 && (core.length === v.length || v.length % 4 === 0);
    if (!ok) errors.push(t('{path}: bytes need a Base64 string, got {value}', { path, value: JSON.stringify(v) }));
    return v;
  }
  if (type === 'bool-key') {
    // Map keys are always JSON strings, so a bool key is written "true" or "false".
    if (v !== 'true' && v !== 'false') errors.push(t('{path}: bool map keys must be "true" or "false", got {value}', { path, value: JSON.stringify(v) }));
    return v;
  }
  return v;
}

function checkValue(field: PbField, v: unknown, path: string, errors: string[], warnings: string[], t: Translate): unknown {
  const resolved = field.resolvedType;
  if (resolved instanceof protobuf.Enum) {
    if (typeof v === 'string') {
      if (!(v in resolved.values)) errors.push(t('{path}: "{value}" is not a value of enum {name} ({values})', { path, value: v, name: resolved.name, values: Object.keys(resolved.values).join(', ') }));
    } else if (!Number.isInteger(v)) {
      errors.push(t('{path}: enum {name} needs a value name or number, got {value}', { path, name: resolved.name, value: JSON.stringify(v) }));
    }
    return v;
  }
  if (resolved instanceof protobuf.Type) {
    if (resolved.fullName.startsWith('.google.protobuf.')) return v; // well-known types have special JSON forms
    if (!v || typeof v !== 'object' || Array.isArray(v)) {
      errors.push(t('{path}: message {name} needs a JSON object, got {kind}', { path, name: resolved.name, kind: describe(v) }));
      return v;
    }
    return checkMessage(resolved, v as Record<string, unknown>, path, errors, warnings, t);
  }
  return checkScalar(field.type, v, path, errors, t);
}

function checkMessage(type: PbType, obj: Record<string, unknown>, path: string, errors: string[], warnings: string[], t: Translate): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const byName = new Map<string, PbField>();
  for (const f of type.fieldsArray) {
    byName.set(f.name, f);
    byName.set(jsonNameOfField(f), f);
  }
  for (const [key, value] of Object.entries(obj)) {
    const p = path ? `${path}.${key}` : key;
    const field = byName.get(key);
    if (!field) {
      errors.push(t('{path}: {type} has no field named "{key}" (proto3 JSON parsers reject unknown fields by default)', { path: p, type: type.name, key }));
      continue;
    }
    if (value === null) continue; // null means "default value" in proto3 JSON
    if (field instanceof protobuf.MapField) {
      if (typeof value !== 'object' || Array.isArray(value)) {
        errors.push(t('{path}: map field needs a JSON object, got {kind}', { path: p, kind: describe(value) }));
        continue;
      }
      const m: Record<string, unknown> = {};
      for (const [k, mv] of Object.entries(value as Record<string, unknown>)) {
        if (field.keyType !== 'string') checkScalar(field.keyType === 'bool' ? 'bool-key' : field.keyType, k, t('{path}[{key}] key', { path: p, key: k }), errors, t);
        m[k] = checkValue(field, mv, `${p}[${k}]`, errors, warnings, t);
      }
      out[field.name] = m;
    } else if (field.repeated) {
      if (!Array.isArray(value)) {
        errors.push(t('{path}: repeated field needs a JSON array, got {kind}', { path: p, kind: describe(value) }));
        continue;
      }
      out[field.name] = value.map((item, i) => checkValue(field, item, `${p}[${i}]`, errors, warnings, t));
    } else {
      out[field.name] = checkValue(field, value, p, errors, warnings, t);
    }
  }
  for (const f of type.fieldsArray) {
    if (f.required && !(f.name in out)) errors.push(t('{field}: required field is missing', { field: `${path ? `${path}.` : ''}${f.name}` }));
  }
  for (const oneof of type.oneofsArray) {
    const set = oneof.fieldsArray.filter((f) => f.name in out);
    if (set.length > 1) errors.push(t('{path}: oneof "{name}" has more than one field set ({fields})', { path: path || type.name, name: oneof.name, fields: set.map((f) => f.name).join(', ') }));
  }
  return out;
}

/**
 * Checks JSON against a message using the proto3 JSON mapping rules
 * (camelCase or original field names, 64-bit integers as strings, enums by
 * name or number, bytes as Base64) and, when valid, encodes it to the
 * binary wire format with protobufjs.
 */
export function validateProtoJson(type: PbType, json: unknown, t: Translate = english): ProtoJsonCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const messageName = stripDot(type.fullName);
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return { valid: false, messageName, errors: [t('Top-level JSON must be an object for message {name}', { name: messageName })], warnings };
  }
  const normalized = checkMessage(type, json as Record<string, unknown>, '', errors, warnings, t);
  const declared = type.fieldsArray.filter((f) => !(f.name in normalized)).map((f) => f.name);
  if (declared.length) warnings.push(t('Not set (will take default values): {fields}', { fields: declared.join(', ') }));
  if (errors.length) return { valid: false, messageName, errors, warnings };
  let encodedBytes: Uint8Array | undefined;
  try {
    encodedBytes = type.encode(type.fromObject(normalized)).finish();
  } catch (e) {
    warnings.push(t('Could not encode to binary: {error}', { error: e instanceof Error ? e.message : String(e) }));
  }
  return { valid: true, messageName, errors, warnings, encodedBytes };
}

function tsType(f: PbField, typeName: (t: protobuf.ReflectionObject) => string): string {
  const r = f.resolvedType;
  let t: string;
  if (r instanceof protobuf.Enum || r instanceof protobuf.Type) t = typeName(r);
  else if (INT64_TYPES.has(f.type) || UINT64_TYPES.has(f.type)) t = 'string';
  else if (['double', 'float'].includes(f.type) || INT32_TYPES.has(f.type) || UINT32_TYPES.has(f.type)) t = 'number';
  else if (f.type === 'bool') t = 'boolean';
  else t = 'string'; // string, bytes (Base64)
  if (f instanceof protobuf.MapField) return `Record<string, ${t}>`;
  return f.repeated ? `${t}[]` : t;
}

/**
 * Generates TypeScript types describing the proto3 JSON form of every
 * message and enum (64-bit integers and bytes are strings in that form).
 */
export function generateTypeScript(root: protobuf.Root): string {
  const typeName = (t: protobuf.ReflectionObject) => {
    const parts: string[] = [];
    let cur: protobuf.ReflectionObject | null = t;
    while (cur && !(cur instanceof protobuf.Root)) {
      if (cur instanceof protobuf.Type || cur instanceof protobuf.Enum) parts.unshift(cur.name);
      cur = cur.parent;
    }
    return parts.join('_');
  };
  const blocks: string[] = ['// TypeScript types for the proto3 JSON mapping of this schema.', '// int64/uint64 and bytes fields are strings in JSON.'];
  walk(root, (obj) => {
    if (obj instanceof protobuf.Enum) {
      blocks.push(`export type ${typeName(obj)} = ${Object.keys(obj.values).map((k) => `'${k}'`).join(' | ')};`);
    } else if (obj instanceof protobuf.Type) {
      const key = (n: string) => (/^[A-Za-z_$][\w$]*$/.test(n) ? n : JSON.stringify(n));
      const lines = obj.fieldsArray.map((f) => `  ${key(jsonNameOfField(f))}?: ${tsType(f, typeName)};`);
      blocks.push(`export interface ${typeName(obj)} {\n${lines.join('\n')}\n}`);
    }
  });
  return blocks.join('\n\n') + '\n';
}
