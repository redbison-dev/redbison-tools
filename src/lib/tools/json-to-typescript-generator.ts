/**
 * Infers TypeScript interfaces or type aliases from a JSON sample.
 * Pure logic for the JSON to TypeScript Generator tool.
 */

export type JsonToTsOptions = {
  rootName: string;
  useInterfaces: boolean;
  exportAll: boolean;
  optionalNulls: boolean;
  readonlyFields: boolean;
};

export const DEFAULT_JSON_TO_TS_OPTIONS: JsonToTsOptions = {
  rootName: 'Root',
  useInterfaces: true,
  exportAll: true,
  optionalNulls: true,
  readonlyFields: false,
};

// Words that cannot be used as a type name. Property keys may be reserved
// words in TypeScript, but quoting them is harmless and keeps output readable.
const RESERVED = new Set([
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do', 'else',
  'enum', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'import', 'in', 'instanceof',
  'new', 'null', 'return', 'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'var', 'void',
  'while', 'with', 'yield', 'implements', 'interface', 'let', 'package', 'private', 'protected', 'public',
  'static',
]);

const isValidIdent = (name: string) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) && !RESERVED.has(name);

export const pascalCase = (s: string): string => {
  const cleaned = s.replace(/[^A-Za-z0-9]+/g, ' ').trim();
  if (!cleaned) return 'Root';
  let out = cleaned
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
  // Type names cannot start with a digit ("2fa" -> "T2fa").
  if (/^[0-9]/.test(out)) out = `T${out}`;
  return out;
};

const singularize = (name: string) =>
  name.endsWith('ies') ? name.slice(0, -3) + 'y'
    : name.endsWith('ses') ? name.slice(0, -2)
    : name.endsWith('s') && !name.endsWith('ss') ? name.slice(0, -1)
    : name;

/** Name for the element type of an array called `name`. Never returns `name` itself. */
const itemNameFor = (name: string) => {
  const single = singularize(name);
  return single && single !== name ? single : `${name || 'Root'}Item`;
};

type Field = { shape: Shape; optional: boolean };
type ObjectShape = { kind: 'object'; fields: Record<string, Field>; name: string };
type Shape =
  | { kind: 'primitive'; type: 'string' | 'number' | 'boolean' | 'null' | 'any' }
  | { kind: 'array'; items: Shape }
  | ObjectShape
  | { kind: 'union'; variants: Shape[] };

const shapeOfPrimitive = (v: unknown): Shape => {
  if (v === null) return { kind: 'primitive', type: 'null' };
  const t = typeof v;
  if (t === 'string') return { kind: 'primitive', type: 'string' };
  if (t === 'number') return { kind: 'primitive', type: 'number' };
  if (t === 'boolean') return { kind: 'primitive', type: 'boolean' };
  return { kind: 'primitive', type: 'any' };
};

const shapeEquals = (a: Shape, b: Shape): boolean => {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'primitive' && b.kind === 'primitive') return a.type === b.type;
  if (a.kind === 'array' && b.kind === 'array') return shapeEquals(a.items, b.items);
  if (a.kind === 'object' && b.kind === 'object') {
    const ak = Object.keys(a.fields), bk = Object.keys(b.fields);
    if (ak.length !== bk.length) return false;
    return ak.every((k) => k in b.fields
      && a.fields[k].optional === b.fields[k].optional
      && shapeEquals(a.fields[k].shape, b.fields[k].shape));
  }
  if (a.kind === 'union' && b.kind === 'union') {
    return a.variants.length === b.variants.length &&
      a.variants.every((v, i) => shapeEquals(v, b.variants[i]));
  }
  return false;
};

const mergeShapes = (a: Shape, b: Shape, name: string): Shape => {
  if (shapeEquals(a, b)) return a;
  if (a.kind === 'object' && b.kind === 'object') {
    const keys = new Set([...Object.keys(a.fields), ...Object.keys(b.fields)]);
    const fields: Record<string, Field> = Object.create(null); // a "__proto__" key stays a field
    keys.forEach((k) => {
      const inA = a.fields[k];
      const inB = b.fields[k];
      if (inA && inB) {
        fields[k] = {
          shape: mergeShapes(inA.shape, inB.shape, pascalCase(k)),
          optional: inA.optional || inB.optional,
        };
      } else {
        fields[k] = { shape: (inA ?? inB)!.shape, optional: true };
      }
    });
    return { kind: 'object', fields, name: a.name || name };
  }
  if (a.kind === 'array' && b.kind === 'array') {
    return { kind: 'array', items: mergeShapes(a.items, b.items, itemNameFor(name)) };
  }
  // Build a flat union. Objects merge with objects and arrays with arrays, so
  // [1, {a: 1}, {b: 2}] becomes number | Item, not number | Item | Item2.
  const flat = (s: Shape): Shape[] => (s.kind === 'union' ? s.variants : [s]);
  const variants: Shape[] = [];
  [...flat(a), ...flat(b)].forEach((v) => {
    const sameKind = variants.findIndex((x) => (x.kind === 'object' && v.kind === 'object') || (x.kind === 'array' && v.kind === 'array'));
    if (sameKind >= 0) {
      variants[sameKind] = mergeShapes(variants[sameKind], v, name);
    } else if (!variants.some((x) => shapeEquals(x, v))) {
      variants.push(v);
    }
  });
  if (variants.length === 1) return variants[0];
  return { kind: 'union', variants };
};

const inferShape = (value: unknown, name: string): Shape => {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return { kind: 'array', items: { kind: 'primitive', type: 'any' } };
    }
    const itemName = itemNameFor(name);
    let merged = inferShape(value[0], itemName);
    for (let i = 1; i < value.length; i++) {
      merged = mergeShapes(merged, inferShape(value[i], itemName), itemName);
    }
    return { kind: 'array', items: merged };
  }
  if (value && typeof value === 'object') {
    const fields: Record<string, Field> = Object.create(null); // a "__proto__" key stays a field
    Object.entries(value as Record<string, unknown>).forEach(([k, v]) => {
      fields[k] = { shape: inferShape(v, pascalCase(k)), optional: false };
    });
    return { kind: 'object', fields, name };
  }
  return shapeOfPrimitive(value);
};

type Register = (obj: ObjectShape) => string;

/**
 * Renders a shape as a type expression. `dropNull` removes null from a
 * union; it is only used at property level, where the property becomes
 * optional instead. Nulls inside arrays are always kept.
 */
const renderInline = (shape: Shape, register: Register, dropNull = false): string => {
  switch (shape.kind) {
    case 'primitive':
      return shape.type;
    case 'array': {
      const inner = renderInline(shape.items, register);
      return shape.items.kind === 'union' ? `(${inner})[]` : `${inner}[]`;
    }
    case 'object':
      return register(shape);
    case 'union': {
      const parts = shape.variants.map((v) => renderInline(v, register));
      const nonNull = parts.filter((p) => p !== 'null');
      if (dropNull && nonNull.length > 0 && nonNull.length < parts.length) return nonNull.join(' | ');
      return parts.join(' | ');
    }
  }
};

const shapeHasNull = (s: Shape): boolean => {
  if (s.kind === 'primitive') return s.type === 'null';
  if (s.kind === 'union') return s.variants.some(shapeHasNull);
  return false;
};

/** Parses `input` as JSON and returns TypeScript declarations. Throws on invalid JSON. */
export function generateTypescript(input: string, options: Partial<JsonToTsOptions> = {}): string {
  const opts = { ...DEFAULT_JSON_TO_TS_OPTIONS, ...options };
  const parsed = JSON.parse(input);
  const rootName = pascalCase(opts.rootName || 'Root');
  const root = inferShape(parsed, rootName);

  const registry: { name: string; shape: ObjectShape }[] = [];
  const usedNames = new Set<string>();
  // A non-object root is emitted as `type Root = ...`, so reserve the name.
  if (root.kind !== 'object') usedNames.add(rootName);

  const register: Register = (obj) => {
    const base = pascalCase(obj.name || 'Type');
    const existing = registry.find((r) => shapeEquals(r.shape, obj));
    if (existing) return existing.name;
    let name = base;
    let i = 2;
    while (usedNames.has(name)) name = `${base}${i++}`;
    usedNames.add(name);
    registry.push({ name, shape: obj });
    return name;
  };

  const rootType = root.kind === 'object' ? register(root) : renderInline(root, register);

  const exp = opts.exportAll ? 'export ' : '';
  const ro = opts.readonlyFields ? 'readonly ' : '';
  const blocks: string[] = [];

  // Registry grows while rendering, so iterate by index.
  for (let idx = 0; idx < registry.length; idx++) {
    const { name, shape } = registry[idx];
    const lines: string[] = [opts.useInterfaces ? `${exp}interface ${name} {` : `${exp}type ${name} = {`];
    Object.entries(shape.fields).forEach(([key, { shape: fs, optional }]) => {
      const nullable = opts.optionalNulls && shapeHasNull(fs);
      const rendered = renderInline(fs, register, opts.optionalNulls);
      const safeKey = isValidIdent(key) ? key : JSON.stringify(key);
      const opt = optional || nullable ? '?' : '';
      lines.push(`  ${ro}${safeKey}${opt}: ${rendered};`);
    });
    lines.push(opts.useInterfaces ? '}' : '};');
    blocks.push(lines.join('\n'));
  }

  if (root.kind !== 'object') blocks.unshift(`${exp}type ${rootName} = ${rootType};`);

  return blocks.join('\n\n') + '\n';
}
