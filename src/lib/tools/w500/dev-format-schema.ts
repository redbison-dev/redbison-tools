/**
 * JSON Schema: validate a document with Ajv (drafts 06, 07, 2019-09 and
 * 2020-12) and infer a starter schema from sample JSON.
 *
 * Formats are implemented here (date, time, date-time, email, uri, uuid,
 * ipv4, ipv6, hostname, ...) following RFC 3339, RFC 3986, RFC 4122 and the
 * JSON Schema validation spec, because ajv-formats is not a dependency.
 *
 * No React, no "@/" imports: this file is also bundled into the MCP server.
 */
import Ajv from 'ajv';
import Ajv2019 from 'ajv/dist/2019.js';
import Ajv2020 from 'ajv/dist/2020.js';

export type SchemaDraft = 'auto' | 'draft-06' | 'draft-07' | '2019-09' | '2020-12';

export interface JsonParseFailure {
  message: string;
  line?: number;
  column?: number;
}

/** JSON.parse with a line and column for the error, which browsers word differently. */
export type JsonParseResult = { ok: true; value: unknown; error?: undefined } | { ok: false; error: JsonParseFailure; value?: undefined };

export function parseJsonWithLocation(text: string): JsonParseResult {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    const msg = (e as Error).message;
    let pos: number | undefined;
    const m1 = /position (\d+)/i.exec(msg);
    const m2 = /line (\d+) column (\d+)/i.exec(msg);
    if (m2) return { ok: false, error: { message: msg, line: Number(m2[1]), column: Number(m2[2]) } };
    if (m1) pos = Number(m1[1]);
    if (pos === undefined && text.trim() === '') return { ok: false, error: { message: 'The input is empty.' } };
    if (pos !== undefined) {
      const before = text.slice(0, pos);
      const line = before.split('\n').length;
      const column = pos - before.lastIndexOf('\n');
      return { ok: false, error: { message: msg, line, column } };
    }
    return { ok: false, error: { message: msg } };
  }
}

/* ------------------------------------------------------------------ */
/* Formats                                                             */
/* ------------------------------------------------------------------ */

const DAYS = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const isLeap = (y: number) => y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);

/** RFC 3339 full-date with a real calendar check (2023-02-29 fails, 2024-02-29 passes). */
export function isDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return mo >= 1 && mo <= 12 && d >= 1 && d <= (mo === 2 && isLeap(y) ? 29 : DAYS[mo]);
}

/** RFC 3339 full-time: hh:mm:ss[.frac](Z|+/-hh:mm). A leap second (60) is only valid at 23:59 UTC. */
export function isTime(s: string): boolean {
  const m = /^(\d{2}):(\d{2}):(\d{2})(\.\d+)?(z|[+-]\d{2}:\d{2})$/i.exec(s);
  if (!m) return false;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  const sec = Number(m[3]);
  let offset = 0;
  if (m[5].toLowerCase() !== 'z') {
    const oh = Number(m[5].slice(1, 3));
    const om = Number(m[5].slice(4, 6));
    if (oh > 23 || om > 59) return false;
    offset = (m[5][0] === '-' ? -1 : 1) * (oh * 60 + om);
  }
  if (h > 23 || mi > 59 || sec > 60) return false;
  if (sec < 60) return true;
  const utcMinutes = (((h * 60 + mi - offset) % 1440) + 1440) % 1440;
  return utcMinutes === 23 * 60 + 59;
}

export function isDateTime(s: string): boolean {
  const parts = s.split(/t|\s/i);
  return parts.length === 2 && isDate(parts[0]) && isTime(parts[1]);
}

const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

const FORMATS: Record<string, RegExp | ((s: string) => boolean)> = {
  date: isDate,
  time: isTime,
  'date-time': isDateTime,
  duration: /^P(?!$)((\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+S)?)?|(\d+W)?)$/,
  email: /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i,
  hostname: /^(?=.{1,253}\.?$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[-0-9a-z]{0,61}[0-9a-z])?)*\.?$/i,
  ipv4: IPV4,
  ipv6: (s: string) => {
    if (!/^[0-9a-f:.]+$/i.test(s)) return false;
    let str = s;
    let needed = 8;
    const v4 = /^(.*:)(\d+\.\d+\.\d+\.\d+)$/.exec(s);
    if (v4) {
      if (!IPV4.test(v4[2])) return false;
      str = v4[1].endsWith('::') ? v4[1] : v4[1].slice(0, -1);
      needed = 6;
    }
    const halves = str.split('::');
    if (halves.length > 2) return false;
    const groups = (h: string) => (h === '' ? [] : h.split(':'));
    const all = halves.flatMap(groups);
    if (!all.every((g) => /^[0-9a-f]{1,4}$/i.test(g))) return false;
    return halves.length === 2 ? all.length < needed : all.length === needed;
  },
  uri: /^[a-z][a-z0-9+\-.]*:[^\s]*$/i,
  'uri-reference': /^[^\s]*$/,
  iri: /^[a-z][a-z0-9+\-.]*:\S*$/i,
  'iri-reference': /^\S*$/,
  // eslint-disable-next-line no-control-regex
  'uri-template': /^(?:[^\x00-\x20"'<>%\\^`{|}]|%[0-9a-f]{2}|\{[+#./;?&=,!@|]?(?:[a-z0-9_]|%[0-9a-f]{2})+(?::[1-9][0-9]{0,3}|\*)?(?:,(?:[a-z0-9_]|%[0-9a-f]{2})+(?::[1-9][0-9]{0,3}|\*)?)*\})*$/i,
  uuid: /^(?:urn:uuid:)?[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i,
  'json-pointer': /^(?:\/(?:[^~/]|~0|~1)*)*$/,
  'relative-json-pointer': /^(?:0|[1-9][0-9]*)(?:#|(?:\/(?:[^~/]|~0|~1)*)*)$/,
  regex: (s: string) => {
    try {
      new RegExp(s, 'u');
      return true;
    } catch {
      return false;
    }
  },
};
export const SUPPORTED_FORMATS = Object.keys(FORMATS);

export function checkFormat(format: string, value: string): boolean | undefined {
  const f = FORMATS[format];
  if (!f) return undefined;
  return typeof f === 'function' ? f(value) : f.test(value);
}

/* ------------------------------------------------------------------ */
/* Validate                                                            */
/* ------------------------------------------------------------------ */

export interface SchemaError {
  /** JSON Pointer to the failing value ("" is the root). */
  path: string;
  message: string;
  keyword: string;
  schemaPath: string;
  params: Record<string, unknown>;
}

export interface ValidateResult {
  /** Problems with the inputs themselves (bad JSON, invalid schema). When set, `valid` is false. */
  inputError?: { where: 'schema' | 'data'; message: string; line?: number; column?: number };
  valid: boolean;
  errors: SchemaError[];
  draft: Exclude<SchemaDraft, 'auto'>;
  warnings: string[];
}

export function detectDraft(schema: unknown): Exclude<SchemaDraft, 'auto'> {
  const id = schema && typeof schema === 'object' ? String((schema as Record<string, unknown>).$schema ?? '') : '';
  if (id.includes('2020-12')) return '2020-12';
  if (id.includes('2019-09')) return '2019-09';
  if (id.includes('draft-06')) return 'draft-06';
  if (id.includes('draft-04') || id.includes('draft-03')) return 'draft-07';
  if (id.includes('draft-07')) return 'draft-07';
  return '2020-12';
}

function makeAjv(draft: Exclude<SchemaDraft, 'auto'>, warnings: string[]) {
  const logger = { log: () => undefined, warn: (...a: unknown[]) => warnings.push(a.map(String).join(' ')), error: (...a: unknown[]) => warnings.push(a.map(String).join(' ')) };
  const opts = { allErrors: true, strict: false, logger, validateFormats: true };
  const ajv = draft === '2020-12' ? new Ajv2020(opts) : draft === '2019-09' ? new Ajv2019(opts) : new Ajv(opts);
  for (const [name, f] of Object.entries(FORMATS)) ajv.addFormat(name, typeof f === 'function' ? { validate: f } : f);
  return ajv;
}

/** Reads the value at a JSON Pointer, for showing what failed. */
export function valueAtPointer(root: unknown, pointer: string): unknown {
  if (pointer === '') return root;
  let cur: unknown = root;
  for (const raw of pointer.split('/').slice(1)) {
    const key = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    if (cur && typeof cur === 'object') cur = (cur as Record<string, unknown>)[key];
    else return undefined;
  }
  return cur;
}

export function validateJson(schemaText: string, dataText: string, draftOpt: SchemaDraft = 'auto'): ValidateResult {
  const warnings: string[] = [];
  const s = parseJsonWithLocation(schemaText);
  if (!s.ok) return { valid: false, errors: [], draft: '2020-12', warnings, inputError: { where: 'schema', ...s.error } };
  const d = parseJsonWithLocation(dataText);
  const draft = draftOpt === 'auto' ? detectDraft(s.value) : draftOpt;
  if (!d.ok) return { valid: false, errors: [], draft, warnings, inputError: { where: 'data', ...d.error } };
  return validateValue(s.value, d.value, draft, warnings);
}

export function validateValue(schema: unknown, data: unknown, draft: Exclude<SchemaDraft, 'auto'>, warnings: string[] = []): ValidateResult {
  const id = schema && typeof schema === 'object' ? String((schema as Record<string, unknown>).$schema ?? '') : '';
  if (id.includes('draft-04') || id.includes('draft-03')) {
    warnings.push('Draft-04 and earlier are checked with draft-07 rules. Boolean exclusiveMinimum/exclusiveMaximum and "id" behave differently in those drafts.');
  }
  if (typeof schema !== 'boolean' && (typeof schema !== 'object' || schema === null || Array.isArray(schema))) {
    return { valid: false, errors: [], draft, warnings, inputError: { where: 'schema', message: 'A schema must be a JSON object (or true/false).' } };
  }
  // The draft is already chosen, so the root $schema is dropped (Ajv would otherwise reject draft-06 or
  // unknown meta-schema URLs). Draft-06 and older schemas are compiled with draft-07 rules, which only add keywords.
  let compiled: unknown = schema;
  if (typeof schema === 'object') {
    const copy = { ...(schema as Record<string, unknown>) };
    delete copy.$schema;
    compiled = copy;
  }
  const ajv = makeAjv(draft === 'draft-06' ? 'draft-07' : draft, warnings);
  let validate;
  try {
    validate = ajv.compile(compiled as object);
  } catch (e) {
    return { valid: false, errors: [], draft, warnings, inputError: { where: 'schema', message: (e as Error).message } };
  }
  const valid = validate(data) as boolean;
  const errors: SchemaError[] = (validate.errors ?? []).map((e) => ({
    path: e.instancePath,
    message: e.message ?? e.keyword,
    keyword: e.keyword,
    schemaPath: e.schemaPath,
    params: e.params as Record<string, unknown>,
  }));
  return { valid, errors, draft, warnings: [...new Set(warnings)] };
}

/** One readable line per error, e.g. "/age: must be >= 0". */
export function describeError(e: SchemaError): string {
  let msg = e.message;
  if (e.keyword === 'additionalProperties' && e.params.additionalProperty) msg = `has unexpected property "${String(e.params.additionalProperty)}"`;
  if (e.keyword === 'enum' && Array.isArray(e.params.allowedValues)) msg = `must be one of ${(e.params.allowedValues as unknown[]).map((v) => JSON.stringify(v)).join(', ')}`;
  return `${e.path || '(root)'}: ${msg}`;
}

/* ------------------------------------------------------------------ */
/* Infer                                                               */
/* ------------------------------------------------------------------ */

type JsonType = 'null' | 'boolean' | 'integer' | 'number' | 'string' | 'array' | 'object';

interface Shape {
  types: Set<JsonType>;
  objects: number;
  props: Map<string, { shape: Shape; seen: number }>;
  items: Shape | null;
  /** Format shared by every string seen here; null once a string matches none (or they differ). */
  format: string | null | undefined;
}

const newShape = (): Shape => ({ types: new Set(), objects: 0, props: new Map(), items: null, format: undefined });

const DETECT_ORDER = ['date-time', 'date', 'time', 'email', 'uuid', 'ipv4', 'ipv6', 'uri'];

function detectFormat(s: string): string | null {
  for (const f of DETECT_ORDER) {
    if (f === 'uri' && !/^(https?|ftp|mailto|urn):/i.test(s)) continue;
    if (checkFormat(f, s)) return f;
  }
  return null;
}

function addSample(shape: Shape, v: unknown, formats: boolean): void {
  if (v === null) shape.types.add('null');
  else if (typeof v === 'boolean') shape.types.add('boolean');
  else if (typeof v === 'number') shape.types.add(Number.isInteger(v) ? 'integer' : 'number');
  else if (typeof v === 'string') {
    shape.types.add('string');
    if (formats) {
      const f = detectFormat(v);
      if (shape.format === undefined) shape.format = f;
      else if (shape.format !== f) shape.format = null;
    }
  } else if (Array.isArray(v)) {
    shape.types.add('array');
    if (!shape.items) shape.items = newShape();
    for (const x of v) addSample(shape.items, x, formats);
  } else if (typeof v === 'object') {
    shape.types.add('object');
    shape.objects++;
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      let p = shape.props.get(k);
      if (!p) {
        p = { shape: newShape(), seen: 0 };
        shape.props.set(k, p);
      }
      p.seen++;
      addSample(p.shape, x, formats);
    }
  }
}

export interface InferOptions {
  draft?: '2020-12' | 'draft-07';
  /** 'all' marks keys present in every sampled object as required. */
  required?: 'all' | 'none';
  /** Add "format" for strings that all look like dates, emails, UUIDs, URIs or IPs. */
  formats?: boolean;
  /** Set additionalProperties: false on every object. */
  strictObjects?: boolean;
  title?: string;
}

function shapeToSchema(shape: Shape, o: Required<Omit<InferOptions, 'title' | 'draft'>>): Record<string, unknown> {
  const types = [...shape.types];
  if (types.includes('integer') && types.includes('number')) types.splice(types.indexOf('integer'), 1);
  const order: JsonType[] = ['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'];
  types.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const out: Record<string, unknown> = {};
  if (types.length === 1) out.type = types[0];
  else if (types.length > 1) out.type = types;
  if (shape.types.has('string') && o.formats && shape.format) out.format = shape.format;
  if (shape.types.has('object')) {
    const props: Record<string, unknown> = {};
    const req: string[] = [];
    for (const [k, p] of shape.props) {
      // defineProperty keeps a "__proto__" key as a property instead of setting the prototype.
      Object.defineProperty(props, k, { value: shapeToSchema(p.shape, o), enumerable: true, writable: true, configurable: true });
      if (o.required === 'all' && p.seen === shape.objects) req.push(k);
    }
    out.properties = props;
    if (req.length) out.required = req;
    if (o.strictObjects) out.additionalProperties = false;
  }
  if (shape.types.has('array') && shape.items && shape.items.types.size) out.items = shapeToSchema(shape.items, o);
  return out;
}

/** Builds a schema that the sample satisfies. Arrays of objects are merged so optional keys are not required. */
export function inferSchema(sample: unknown, opts: InferOptions = {}): Record<string, unknown> {
  const shape = newShape();
  addSample(shape, sample, opts.formats ?? true);
  const body = shapeToSchema(shape, { required: opts.required ?? 'all', formats: opts.formats ?? true, strictObjects: opts.strictObjects ?? false });
  const head: Record<string, unknown> = {
    $schema: (opts.draft ?? '2020-12') === '2020-12' ? 'https://json-schema.org/draft/2020-12/schema' : 'http://json-schema.org/draft-07/schema#',
  };
  if (opts.title) head.title = opts.title;
  return { ...head, ...body };
}

export function inferSchemaFromText(
  text: string,
  opts: InferOptions = {},
): { ok: true; schema: Record<string, unknown>; error?: undefined } | { ok: false; error: JsonParseFailure; schema?: undefined } {
  const p = parseJsonWithLocation(text);
  if (!p.ok) return { ok: false, error: p.error };
  return { ok: true, schema: inferSchema(p.value, opts) };
}
