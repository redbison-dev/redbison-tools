/**
 * TOML <-> JSON <-> YAML conversion with validation.
 *
 * TOML is parsed and written with smol-toml (TOML 1.0.0 compliant), YAML
 * with the `yaml` package (YAML 1.2 core schema). Values TOML cannot hold
 * (null) or JSON cannot hold (dates, inf, nan, integers beyond 2^53) are
 * reported as warnings instead of being changed silently.
 *
 * No React, no "@/" imports: this file is also bundled into the MCP server.
 */
import { parse as parseToml, stringify as stringifyToml, TomlDate, TomlError } from 'smol-toml';
import { parseAllDocuments, stringify as stringifyYaml } from 'yaml';

export type DataFormat = 'toml' | 'json' | 'yaml';

export interface ConvertOptions {
  /** Spaces for JSON and YAML output. */
  indent?: number;
  /** JSON/YAML to TOML: turn RFC 3339 date and date-time strings into native TOML dates. */
  detectDates?: boolean;
  /** Sort table keys alphabetically. */
  sortKeys?: boolean;
}

export interface ConvertError {
  message: string;
  line?: number;
  column?: number;
}

export type ConvertResult = { ok: true; output: string; warnings: string[]; error?: undefined } | { ok: false; error: ConvertError; output?: undefined; warnings?: undefined };

export type ParseResult = { ok: true; value: unknown; warnings: string[]; error?: undefined } | { ok: false; error: ConvertError; value?: undefined; warnings?: undefined };

const RFC3339 = /^(\d{4}-\d{2}-\d{2})([Tt ](\d{2}:\d{2}:\d{2}(\.\d+)?)([Zz]|[+-]\d{2}:\d{2})?)?$/;
const LOCAL_TIME = /^\d{2}:\d{2}:\d{2}(\.\d+)?$/;

/** TOML date to its TOML/RFC 3339 text, without the ".000" smol-toml adds when there were no fractional seconds. */
function tomlDateText(d: TomlDate): string {
  return d.toISOString().replace(/\.000(?=$|[Zz+-])/, '');
}

type Plain = null | boolean | number | bigint | string | Plain[] | { [k: string]: Plain };

function pathOf(path: string[]): string {
  return path.length ? path.map((p) => (/^\d+$/.test(p) ? `[${p}]` : `.${p}`)).join('').replace(/^\./, '') : '(root)';
}

/** Converts parsed TOML to plain values for JSON/YAML, collecting warnings. */
function fromToml(v: unknown, path: string[], target: DataFormat, warn: (m: string) => void): Plain {
  if (v instanceof TomlDate) return tomlDateText(v);
  if (typeof v === 'bigint') {
    if (target === 'json') warn(`${pathOf(path)}: ${v} is beyond JavaScript's safe integer range (2^53). It is written exactly, but many JSON parsers will round it.`);
    return v;
  }
  if (typeof v === 'number' && !Number.isFinite(v)) {
    if (target === 'json') {
      const s = Number.isNaN(v) ? 'nan' : v > 0 ? 'inf' : '-inf';
      warn(`${pathOf(path)}: ${s} has no JSON equivalent and was written as the string "${s}".`);
      return s;
    }
    return v;
  }
  if (Array.isArray(v)) return v.map((x, i) => fromToml(x, [...path, String(i)], target, warn));
  if (v && typeof v === 'object') {
    const o: { [k: string]: Plain } = {};
    for (const [k, x] of Object.entries(v)) o[k] = fromToml(x, [...path, k], target, warn);
    return o;
  }
  return v as Plain;
}

const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** True when every date and time field is in range, so new Date() will not roll 2023-02-30 over to March 2. */
function realDateTime(v: string): boolean {
  const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (d) {
    const y = Number(d[1]);
    const mo = Number(d[2]);
    const day = Number(d[3]);
    const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
    if (mo < 1 || mo > 12 || day < 1 || day > (mo === 2 && !leap ? 28 : MONTH_DAYS[mo - 1])) return false;
  }
  const t = /(?:^|[Tt ])(\d{2}):(\d{2}):(\d{2})/.exec(v);
  if (t && (Number(t[1]) > 23 || Number(t[2]) > 59 || Number(t[3]) > 59)) return false;
  const off = /[+-](\d{2}):(\d{2})$/.exec(v);
  return !off || (Number(off[1]) <= 23 && Number(off[2]) <= 59);
}

/** Prepares JSON/YAML values for TOML: drops nulls (with a warning) and optionally turns date strings into TOML dates. */
function toTomlValue(v: unknown, path: string[], opts: ConvertOptions, warn: (m: string) => void): unknown {
  if (typeof v === 'string' && opts.detectDates && realDateTime(v)) {
    const m = RFC3339.exec(v);
    if (m) {
      const d = new TomlDate(v.replace(' ', 'T'));
      if (d.isValid()) return d;
    }
    if (LOCAL_TIME.test(v)) {
      const d = new TomlDate(v);
      if (d.isValid()) return d;
    }
  }
  if (typeof v === 'number' && !Number.isSafeInteger(v) && Number.isInteger(v)) {
    warn(`${pathOf(path)}: ${v} is larger than 2^53, so it may already have lost precision when the input was parsed.`);
  }
  if (Array.isArray(v)) {
    const out: unknown[] = [];
    v.forEach((x, i) => {
      if (x === null || x === undefined) warn(`${pathOf([...path, String(i)])}: null removed from the array (TOML has no null).`);
      else out.push(toTomlValue(x, [...path, String(i)], opts, warn));
    });
    return out;
  }
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (x === null || x === undefined) {
        warn(`${pathOf([...path, k])}: key removed because its value is null (TOML has no null; omit the key or use an empty string).`);
        continue;
      }
      o[k] = toTomlValue(x, [...path, k], opts, warn);
    }
    return o;
  }
  return v;
}

/**
 * smol-toml writes dates with toISOString(), which always has milliseconds.
 * Give each date a toISOString that drops a ".000" it did not need, so only
 * date values change (rewriting the TOML text would also hit strings).
 */
function trimDates(v: unknown): unknown {
  if (v instanceof TomlDate) {
    const text = tomlDateText(v);
    Object.defineProperty(v, 'toISOString', { value: () => text, configurable: true });
    return v;
  }
  if (Array.isArray(v)) return v.map(trimDates);
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) o[k] = trimDates(x);
    return o;
  }
  return v;
}

function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) o[k] = sortDeep((v as Record<string, unknown>)[k]);
    return o;
  }
  return v;
}

/** JSON.stringify that writes bigint as exact digits. */
function jsonStringify(v: unknown, indent: number): string {
  // The placeholder tag must not occur in any string or key of the data itself.
  const probe = JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? 0 : x)) ?? '';
  let tag = 0;
  while (probe.includes(`\\u0000big${tag}_`)) tag++;
  const marks: string[] = [];
  const text = JSON.stringify(
    v,
    (_k, x) => {
      if (typeof x === 'bigint') {
        marks.push(x.toString());
        return `\u0000big${tag}_${marks.length - 1}\u0000`;
      }
      return x;
    },
    indent,
  );
  return text.replace(new RegExp(`"\\\\u0000big${tag}_(\\d+)\\\\u0000"`, 'g'), (_m, i) => marks[Number(i)]);
}

function lineCol(text: string, offset: number): { line: number; column: number } {
  const before = text.slice(0, offset);
  return { line: before.split('\n').length, column: offset - before.lastIndexOf('\n') };
}

export function parseInput(text: string, from: DataFormat): ParseResult {
  const warnings: string[] = [];
  if (text.trim() === '' && from !== 'toml') return { ok: false, error: { message: 'The input is empty.' } };
  if (from === 'toml') {
    try {
      return { ok: true, value: parseToml(text, { integersAsBigInt: 'asNeeded' }), warnings };
    } catch (e) {
      if (e instanceof TomlError) {
        const first = e.message.split('\n')[0].replace(/^Invalid TOML document: /, '');
        return { ok: false, error: { message: first, line: e.line, column: e.column } };
      }
      return { ok: false, error: { message: (e as Error).message } };
    }
  }
  if (from === 'json') {
    try {
      return { ok: true, value: JSON.parse(text), warnings };
    } catch (e) {
      const msg = (e as Error).message;
      const m = /position (\d+)/.exec(msg);
      return { ok: false, error: { message: msg, ...(m ? lineCol(text, Number(m[1])) : {}) } };
    }
  }
  const docs = parseAllDocuments(text, { prettyErrors: false });
  const list = Array.isArray(docs) ? docs : [docs];
  if (list.length === 0) return { ok: false, error: { message: 'The input is empty.' } };
  const doc = list[0];
  if (doc.errors.length) {
    const err = doc.errors[0];
    const pos = err.pos?.[0];
    return { ok: false, error: { message: err.message.split('\n')[0], ...(pos !== undefined ? lineCol(text, pos) : {}) } };
  }
  if (list.length > 1) warnings.push(`The YAML has ${list.length} documents; only the first was converted.`);
  for (const w of doc.warnings) warnings.push(w.message.split('\n')[0]);
  return { ok: true, value: doc.toJS({ maxAliasCount: 1000 }), warnings };
}

export function convertData(text: string, from: DataFormat, to: DataFormat, opts: ConvertOptions = {}): ConvertResult {
  const parsed = parseInput(text, from);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const warnings = [...parsed.warnings];
  const warn = (m: string) => warnings.push(m);
  const indent = opts.indent ?? 2;
  let value: unknown = parsed.value;
  if (opts.sortKeys) value = sortDeep(value);
  try {
    if (to === 'toml') {
      if (from !== 'toml') {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) {
          return {
            ok: false,
            error: { message: 'A TOML document is a table of key/value pairs, so the input must be an object at the top level. Wrap an array in a key, for example {"items": [...]}.' },
          };
        }
        value = toTomlValue(value, [], opts, warn);
      }
      const toml = stringifyToml(trimDates(value) as Record<string, unknown>).replace(/^\n+/, '');
      return { ok: true, output: toml.endsWith('\n') ? toml : toml + '\n', warnings };
    }
    // YAML can hold .inf and .nan too, so it gets the same JSON warnings as TOML.
    const plain = from === 'json' ? value : fromToml(value, [], to, warn);
    if (to === 'json') return { ok: true, output: jsonStringify(plain, indent), warnings };
    return { ok: true, output: stringifyYaml(plain, { indent, lineWidth: 0 }), warnings };
  } catch (e) {
    return { ok: false, error: { message: (e as Error).message } };
  }
}

/** Validates TOML and reports what it contains. */
export function inspectToml(text: string): { ok: true; tables: number; keys: number; error?: undefined } | { ok: false; error: ConvertError } {
  const p = parseInput(text, 'toml');
  if (!p.ok) return { ok: false, error: p.error };
  let tables = 0;
  let keys = 0;
  const walk = (v: unknown) => {
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      if (Array.isArray(v)) v.forEach(walk);
      else {
        tables++;
        for (const x of Object.values(v)) {
          keys++;
          walk(x);
        }
      }
    }
  };
  walk(p.value);
  return { ok: true, tables, keys };
}
