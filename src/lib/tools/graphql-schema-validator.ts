import {
  BUILT_IN_SCALARS,
  GraphQLSyntaxError,
  namedType,
  parseGraphQL,
  printTypeRef,
  type Directive,
  type DirectiveDefinition,
  type DocumentNode,
  type EnumValueDefinition,
  type FieldDefinition,
  type InputValueDefinition,
  type Loc,
  type SchemaDefinition,
  type TypeDefinition,
  type TypeRef,
} from './graphql-language';
import { msg } from '../msg';

/** `message` is the English text; `text` and `vars` are the same as a message template for pages that translate it. */
export type SchemaIssue = { message: string; line?: number; column?: number; text?: string; vars?: Record<string, string | number> };

export type SchemaValidationResult = {
  isValid: boolean;
  errors: SchemaIssue[];
  warnings: SchemaIssue[];
  suggestions: SchemaIssue[];
};

type Kind = TypeDefinition['kind'];

/** A type after `extend` definitions have been merged into it. */
export type MergedType = {
  kind: Kind;
  name: string;
  description?: string;
  loc: Loc;
  interfaces: string[];
  fields: FieldDefinition[];
  inputFields: InputValueDefinition[];
  values: EnumValueDefinition[];
  types: string[];
  builtIn?: boolean;
};

export type MergedSchema = {
  types: Map<string, MergedType>;
  /** Type names in source order (built-ins excluded). */
  order: string[];
  directives: Map<string, DirectiveDefinition>;
  schemaDefinition?: SchemaDefinition;
  roots: { query?: string; mutation?: string; subscription?: string };
};

const BUILT_IN_DIRECTIVES = new Set(['skip', 'include', 'deprecated', 'specifiedBy', 'oneOf']);

/** Locations and arguments of the built-in directives (spec 3.13). */
const BUILT_IN_DIRECTIVE_SPECS: Record<string, { locations: string[]; args: { name: string; type: string; required: boolean }[] }> = {
  skip: { locations: ['FIELD', 'FRAGMENT_SPREAD', 'INLINE_FRAGMENT'], args: [{ name: 'if', type: 'Boolean!', required: true }] },
  include: { locations: ['FIELD', 'FRAGMENT_SPREAD', 'INLINE_FRAGMENT'], args: [{ name: 'if', type: 'Boolean!', required: true }] },
  deprecated: { locations: ['FIELD_DEFINITION', 'ARGUMENT_DEFINITION', 'INPUT_FIELD_DEFINITION', 'ENUM_VALUE'], args: [{ name: 'reason', type: 'String', required: false }] },
  specifiedBy: { locations: ['SCALAR'], args: [{ name: 'url', type: 'String!', required: true }] },
  oneOf: { locations: ['INPUT_OBJECT'], args: [] },
};

const KIND_LOCATION: Record<Kind, string> = {
  ScalarTypeDefinition: 'SCALAR',
  ObjectTypeDefinition: 'OBJECT',
  InterfaceTypeDefinition: 'INTERFACE',
  UnionTypeDefinition: 'UNION',
  EnumTypeDefinition: 'ENUM',
  InputObjectTypeDefinition: 'INPUT_OBJECT',
};

const fill = (text: string, vars?: Record<string, string | number>) => (vars ? text.replace(/\{(\w+)\}/g, (all, k: string) => (vars[k] === undefined ? all : String(vars[k]))) : text);
const issue = (text: string, loc?: Loc, vars?: Record<string, string | number>): SchemaIssue => ({
  message: fill(text, vars),
  ...(loc ? { line: loc.line, column: loc.column } : {}),
  text,
  ...(vars ? { vars } : {}),
});

/**
 * Merge type definitions and extensions into one map. Problems found on the
 * way (duplicates, extending an unknown type) are pushed to `errors`.
 */
export function mergeSchema(doc: DocumentNode, errors: SchemaIssue[] = []): MergedSchema {
  const types = new Map<string, MergedType>();
  const order: string[] = [];
  const directives = new Map<string, DirectiveDefinition>();
  let schemaDefinition: SchemaDefinition | undefined;
  const extensions: TypeDefinition[] = [];
  const schemaExtensions: SchemaDefinition[] = [];

  for (const s of BUILT_IN_SCALARS) {
    types.set(s, { kind: 'ScalarTypeDefinition', name: s, loc: { line: 0, column: 0 }, interfaces: [], fields: [], inputFields: [], values: [], types: [], builtIn: true });
  }

  for (const def of doc.definitions) {
    if (def.kind === 'SchemaDefinition') {
      if (def.extend) schemaExtensions.push(def);
      else if (schemaDefinition) errors.push(issue(msg('Must provide only one schema definition.'), def.loc));
      else schemaDefinition = def;
      continue;
    }
    if (def.kind === 'DirectiveDefinition') {
      if (BUILT_IN_DIRECTIVES.has(def.name)) errors.push(issue(msg('Directive "@{name}" already exists in the schema. It cannot be redefined.'), def.loc, { name: def.name }));
      else if (directives.has(def.name)) errors.push(issue(msg('There can be only one directive named "@{name}".'), def.loc, { name: def.name }));
      else directives.set(def.name, def);
      continue;
    }
    if (def.kind === 'OperationDefinition' || def.kind === 'FragmentDefinition') continue;
    if (def.extend) { extensions.push(def); continue; }
    const existing = types.get(def.name);
    if (existing?.builtIn) { errors.push(issue(msg('Type "{name}" already exists in the schema. It cannot also be defined in this type definition.'), def.loc, { name: def.name })); continue; }
    if (existing) { errors.push(issue(msg('There can be only one type named "{name}".'), def.loc, { name: def.name })); continue; }
    types.set(def.name, {
      kind: def.kind,
      name: def.name,
      description: def.description?.value,
      loc: def.loc,
      interfaces: 'interfaces' in def ? [...def.interfaces] : [],
      fields: def.kind === 'ObjectTypeDefinition' || def.kind === 'InterfaceTypeDefinition' ? [...def.fields] : [],
      inputFields: def.kind === 'InputObjectTypeDefinition' ? [...def.fields] : [],
      values: def.kind === 'EnumTypeDefinition' ? [...def.values] : [],
      types: def.kind === 'UnionTypeDefinition' ? [...def.types] : [],
    });
    order.push(def.name);
  }

  for (const ext of extensions) {
    const target = types.get(ext.name);
    if (!target) { errors.push(issue(msg('Cannot extend type "{name}" because it is not defined.'), ext.loc, { name: ext.name })); continue; }
    if (target.kind !== ext.kind) {
      errors.push(issue(msg('Cannot extend non-{kind} type "{name}".'), ext.loc, { kind: kindLabel(ext.kind), name: ext.name }));
      continue;
    }
    if ('interfaces' in ext) target.interfaces.push(...ext.interfaces);
    if (ext.kind === 'ObjectTypeDefinition' || ext.kind === 'InterfaceTypeDefinition') target.fields.push(...ext.fields);
    if (ext.kind === 'InputObjectTypeDefinition') target.inputFields.push(...ext.fields);
    if (ext.kind === 'EnumTypeDefinition') target.values.push(...ext.values);
    if (ext.kind === 'UnionTypeDefinition') target.types.push(...ext.types);
  }

  const roots: MergedSchema['roots'] = {};
  if (schemaDefinition || schemaExtensions.length) {
    const seen = new Set<string>();
    for (const s of [schemaDefinition, ...schemaExtensions].filter(Boolean) as SchemaDefinition[]) {
      for (const op of s.operationTypes) {
        if (seen.has(op.operation)) errors.push(issue(msg('There can be only one {operation} type in schema.'), op.loc, { operation: op.operation }));
        seen.add(op.operation);
        roots[op.operation] = op.type;
      }
    }
    if (!schemaDefinition) errors.push(issue(msg('Cannot extend schema because no schema definition exists.'), schemaExtensions[0].loc));
  } else {
    if (types.get('Query')?.kind === 'ObjectTypeDefinition') roots.query = 'Query';
    if (types.get('Mutation')?.kind === 'ObjectTypeDefinition') roots.mutation = 'Mutation';
    if (types.get('Subscription')?.kind === 'ObjectTypeDefinition') roots.subscription = 'Subscription';
  }

  return { types, order, directives, schemaDefinition, roots };
}

function kindLabel(kind: Kind) {
  return {
    ScalarTypeDefinition: 'scalar',
    ObjectTypeDefinition: 'object',
    InterfaceTypeDefinition: 'interface',
    UnionTypeDefinition: 'union',
    EnumTypeDefinition: 'enum',
    InputObjectTypeDefinition: 'input object',
  }[kind];
}

const isInputKind = (k: Kind) => k === 'ScalarTypeDefinition' || k === 'EnumTypeDefinition' || k === 'InputObjectTypeDefinition';
const isOutputKind = (k: Kind) => k !== 'InputObjectTypeDefinition';

/** Is `sub` a valid (covariant) replacement for `sup` when implementing an interface field? */
function isSubType(schema: MergedSchema, sub: TypeRef, sup: TypeRef): boolean {
  if (sup.kind === 'NonNull') return sub.kind === 'NonNull' && isSubType(schema, sub.ofType, sup.ofType);
  if (sub.kind === 'NonNull') return isSubType(schema, sub.ofType, sup);
  if (sup.kind === 'List') return sub.kind === 'List' && isSubType(schema, sub.ofType, sup.ofType);
  if (sub.kind === 'List') return false;
  if (sub.name === sup.name) return true;
  const supType = schema.types.get(sup.name);
  const subType = schema.types.get(sub.name);
  if (!supType || !subType) return false;
  if (supType.kind === 'UnionTypeDefinition') return supType.types.includes(sub.name);
  if (supType.kind === 'InterfaceTypeDefinition') return subType.interfaces.includes(sup.name);
  return false;
}

function sameType(a: TypeRef, b: TypeRef) {
  return printTypeRef(a) === printTypeRef(b);
}

/**
 * Validate GraphQL SDL the way a GraphQL server does when it builds a
 * schema: syntax, unknown and duplicate names, input/output type rules,
 * interface implementation, unions, enums and root operation types.
 * Errors make the schema invalid; warnings and suggestions are style notes.
 */
export function validateSchemaSDL(source: string): SchemaValidationResult {
  const errors: SchemaIssue[] = [];
  const warnings: SchemaIssue[] = [];
  const suggestions: SchemaIssue[] = [];
  let doc: DocumentNode;
  try {
    doc = parseGraphQL(source);
  } catch (e) {
    if (e instanceof GraphQLSyntaxError) return { isValid: false, errors: [{ message: e.message, line: e.line, column: e.column }], warnings, suggestions };
    throw e;
  }

  for (const def of doc.definitions) {
    if (def.kind === 'OperationDefinition' || def.kind === 'FragmentDefinition') {
      const label = def.kind === 'FragmentDefinition' ? `fragment "${def.name}"` : `${def.operation} operation${def.name ? ` "${def.name}"` : ''}`;
      errors.push(issue(msg('Found a {label}. A schema document may only contain type system definitions (type, input, enum, schema...). Check operations against a schema in the GraphQL Playground instead.'), def.loc, { label: label }));
    }
  }

  const schema = mergeSchema(doc, errors);
  const { types } = schema;

  const checkName = (name: string, loc: Loc, what: string) => {
    if (name.startsWith('__')) errors.push(issue(msg('Name "{name}" must not begin with "__", which is reserved by GraphQL introspection ({what}).'), loc, { name: name, what: what }));
  };

  const checkTypeExists = (t: TypeRef, where: string) => {
    const n = namedType(t);
    const found = types.get(n);
    if (!found) errors.push(issue(msg('Unknown type "{typeName}" used by {where}.'), t.loc, { typeName: n, where: where }));
    return found;
  };

  const checkDirectives = (ds: Directive[], where: string, location: string) => {
    const seen = new Set<string>();
    for (const d of ds) {
      const custom = schema.directives.get(d.name);
      const spec = custom
        ? { locations: custom.locations, args: custom.args.map((a) => ({ name: a.name, type: printTypeRef(a.type), required: a.type.kind === 'NonNull' && !a.defaultValue })) }
        : BUILT_IN_DIRECTIVE_SPECS[d.name];
      if (!spec) errors.push(issue(msg('Unknown directive "@{name}" on {where}.'), d.loc, { name: d.name, where: where }));
      else {
        if (!spec.locations.includes(location)) errors.push(issue(msg('Directive "@{name}" may not be used on {location} ({where}).'), d.loc, { name: d.name, location: location, where: where }));
        for (const a of d.args) {
          if (!spec.args.some((x) => x.name === a.name)) errors.push(issue(msg('Unknown argument "{name}" on directive "@{name2}" ({where}).'), a.loc, { name: a.name, name2: d.name, where: where }));
        }
        for (const x of spec.args) {
          if (x.required && !d.args.some((a) => a.name === x.name)) {
            errors.push(issue(msg('Directive "@{name}" argument "{name2}" of type "{type}" is required, but it was not provided ({where}).'), d.loc, { name: d.name, name2: x.name, type: x.type, where: where }));
          }
        }
      }
      const repeatable = schema.directives.get(d.name)?.repeatable;
      if (seen.has(d.name) && !repeatable) errors.push(issue(msg('The directive "@{name}" can only be used once at this location ({where}).'), d.loc, { name: d.name, where: where }));
      seen.add(d.name);
    }
  };

  const checkArgs = (args: InputValueDefinition[], where: string) => {
    const seen = new Set<string>();
    for (const a of args) {
      checkName(a.name, a.loc, `argument of ${where}`);
      if (seen.has(a.name)) errors.push(issue(msg('Argument "{where}({name}:)" can only be defined once.'), a.loc, { where: where, name: a.name }));
      seen.add(a.name);
      const t = checkTypeExists(a.type, `argument "${where}(${a.name}:)"`);
      if (t && !isInputKind(t.kind)) errors.push(issue(msg('The type of "{where}({name}:)" must be an input type, but got "{type}" ({kind}).'), a.loc, { where: where, name: a.name, type: printTypeRef(a.type), kind: kindLabel(t.kind) }));
      checkDirectives(a.directives, `argument "${where}(${a.name}:)"`, 'ARGUMENT_DEFINITION');
      checkDefault(a, `"${where}(${a.name}:)"`);
    }
  };

  const checkDefault = (a: InputValueDefinition, where: string) => {
    if (!a.defaultValue) return;
    const target = types.get(namedType(a.type));
    const v = a.defaultValue;
    if (v.kind === 'Null' && a.type.kind === 'NonNull') errors.push(issue(msg('Default value null is not allowed for non-null {where}.'), a.loc, { where: where }));
    if (target?.kind === 'EnumTypeDefinition' && v.kind !== 'Null' && a.type.kind !== 'List' && !(a.type.kind === 'NonNull' && a.type.ofType.kind === 'List')) {
      if (v.kind !== 'Enum' || !target.values.some((x) => x.name === v.value)) {
        errors.push(issue(msg('Default value for {where} must be a value of enum "{name}".'), a.loc, { where: where, name: target.name }));
      }
    }
    if (target?.builtIn && a.type.kind !== 'List' && !(a.type.kind === 'NonNull' && a.type.ofType.kind === 'List') && v.kind !== 'Null') {
      const ok =
        // Int is a signed 32-bit integer (spec 3.5.1).
        (target.name === 'Int' && v.kind === 'Int' && Number(v.value) >= -2147483648 && Number(v.value) <= 2147483647) ||
        (target.name === 'Float' && (v.kind === 'Int' || v.kind === 'Float')) ||
        (target.name === 'String' && v.kind === 'String') ||
        (target.name === 'Boolean' && v.kind === 'Boolean') ||
        (target.name === 'ID' && (v.kind === 'String' || v.kind === 'Int'));
      if (!ok) errors.push(issue(msg('Default value for {where} is not a valid {name}.'), a.loc, { where: where, name: target.name }));
    }
  };

  for (const name of schema.order) {
    const t = types.get(name)!;
    checkName(name, t.loc, `type ${name}`);
    const def = doc.definitions.find((d) => 'name' in d && d.name === name && d.kind === t.kind && !('extend' in d && d.extend));
    if (def && 'directives' in def) checkDirectives(def.directives, `type "${name}"`, KIND_LOCATION[t.kind]);

    if (t.kind === 'ObjectTypeDefinition' || t.kind === 'InterfaceTypeDefinition') {
      if (t.fields.length === 0) errors.push(issue(msg('Type "{name}" must define one or more fields.'), t.loc, { name: name }));
      const seen = new Set<string>();
      for (const f of t.fields) {
        checkName(f.name, f.loc, `field ${name}.${f.name}`);
        if (seen.has(f.name)) errors.push(issue(msg('Field "{name}.{name2}" can only be defined once.'), f.loc, { name: name, name2: f.name }));
        seen.add(f.name);
        const ft = checkTypeExists(f.type, `field "${name}.${f.name}"`);
        if (ft && !isOutputKind(ft.kind)) errors.push(issue(msg('The type of "{name}.{name2}" must be an output type, but got input type "{type}". Input types can only be used for arguments and input fields.'), f.loc, { name: name, name2: f.name, type: printTypeRef(f.type) }));
        checkArgs(f.args, `${name}.${f.name}`);
        checkDirectives(f.directives, `field "${name}.${f.name}"`, 'FIELD_DEFINITION');
      }
      const seenIfaces = new Set<string>();
      for (const iName of t.interfaces) {
        const iface = types.get(iName);
        if (seenIfaces.has(iName)) { errors.push(issue(msg('Type "{name}" can only implement "{iName}" once.'), t.loc, { name: name, iName: iName })); continue; }
        seenIfaces.add(iName);
        if (!iface) { errors.push(issue(msg('Unknown type "{iName}" in the implements list of "{name}".'), t.loc, { iName: iName, name: name })); continue; }
        if (iface.kind !== 'InterfaceTypeDefinition') { errors.push(issue(msg('Type "{name}" must only implement interfaces; "{iName}" is a {kind} type.'), t.loc, { name: name, iName: iName, kind: kindLabel(iface.kind) })); continue; }
        if (iName === name) { errors.push(issue(msg('Type "{name}" cannot implement itself.'), t.loc, { name: name })); continue; }
        for (const transitive of iface.interfaces) {
          if (!t.interfaces.includes(transitive)) errors.push(issue(msg('Type "{name}" must implement "{transitive}" because it is implemented by "{iName}".'), t.loc, { name: name, transitive: transitive, iName: iName }));
        }
        for (const iField of iface.fields) {
          const own = t.fields.find((f) => f.name === iField.name);
          if (!own) { errors.push(issue(msg('Interface field "{iName}.{name}" expected but "{name2}" does not provide it.'), t.loc, { iName: iName, name: iField.name, name2: name })); continue; }
          if (!isSubType(schema, own.type, iField.type)) {
            errors.push(issue(msg('Interface field "{iName}.{name}" expects type "{type}" but "{name2}.{name3}" is type "{type2}".'), own.loc, { iName: iName, name: iField.name, type: printTypeRef(iField.type), name2: name, name3: own.name, type2: printTypeRef(own.type) }));
          }
          for (const iArg of iField.args) {
            const ownArg = own.args.find((a) => a.name === iArg.name);
            if (!ownArg) errors.push(issue(msg('Interface field argument "{iName}.{name}({name2}:)" expected but "{name3}.{name4}" does not provide it.'), own.loc, { iName: iName, name: iField.name, name2: iArg.name, name3: name, name4: own.name }));
            else if (!sameType(ownArg.type, iArg.type)) errors.push(issue(msg('Interface field argument "{iName}.{name}({name2}:)" expects type "{type}" but "{name3}.{name4}({name5}:)" is type "{type2}".'), ownArg.loc, { iName: iName, name: iField.name, name2: iArg.name, type: printTypeRef(iArg.type), name3: name, name4: own.name, name5: iArg.name, type2: printTypeRef(ownArg.type) }));
          }
          for (const ownArg of own.args) {
            if (!iField.args.some((a) => a.name === ownArg.name) && ownArg.type.kind === 'NonNull' && !ownArg.defaultValue) {
              errors.push(issue(msg('"{name}.{name2}({name3}:)" is a required argument that "{iName}.{name4}" does not define, so it must be optional.'), ownArg.loc, { name: name, name2: own.name, name3: ownArg.name, iName: iName, name4: iField.name }));
            }
          }
        }
      }
    }

    if (t.kind === 'InputObjectTypeDefinition') {
      if (t.inputFields.length === 0) errors.push(issue(msg('Input Object type "{name}" must define one or more fields.'), t.loc, { name: name }));
      const seen = new Set<string>();
      for (const f of t.inputFields) {
        checkName(f.name, f.loc, `input field ${name}.${f.name}`);
        if (seen.has(f.name)) errors.push(issue(msg('Input field "{name}.{name2}" can only be defined once.'), f.loc, { name: name, name2: f.name }));
        seen.add(f.name);
        const ft = checkTypeExists(f.type, `input field "${name}.${f.name}"`);
        if (ft && !isInputKind(ft.kind)) errors.push(issue(msg('The type of "{name}.{name2}" must be an input type, but got "{type}" ({kind}). Use an input type, scalar or enum here.'), f.loc, { name: name, name2: f.name, type: printTypeRef(f.type), kind: kindLabel(ft.kind) }));
        checkDirectives(f.directives, `input field "${name}.${f.name}"`, 'INPUT_FIELD_DEFINITION');
        checkDefault(f, `"${name}.${f.name}"`);
      }
      // A cycle of non-null, non-list input fields can never be satisfied.
      const cycle = findNonNullInputCycle(schema, name);
      if (cycle) errors.push(issue(msg('Input Object "{name}" references itself through non-null fields ({cycle}), so no finite value can satisfy it.'), t.loc, { name: name, cycle: cycle }));
    }

    if (t.kind === 'EnumTypeDefinition') {
      if (t.values.length === 0) errors.push(issue(msg('Enum type "{name}" must define one or more values.'), t.loc, { name: name }));
      const seen = new Set<string>();
      for (const v of t.values) {
        checkName(v.name, v.loc, `enum value ${name}.${v.name}`);
        if (seen.has(v.name)) errors.push(issue(msg('Enum value "{name}.{name2}" can only be defined once.'), v.loc, { name: name, name2: v.name }));
        seen.add(v.name);
        checkDirectives(v.directives, `enum value "${name}.${v.name}"`, 'ENUM_VALUE');
      }
    }

    if (t.kind === 'UnionTypeDefinition') {
      if (t.types.length === 0) errors.push(issue(msg('Union type "{name}" must define one or more member types.'), t.loc, { name: name }));
      const seen = new Set<string>();
      for (const m of t.types) {
        const mt = types.get(m);
        if (seen.has(m)) errors.push(issue(msg('Union type "{name}" can only include type "{member}" once.'), t.loc, { name: name, member: m }));
        seen.add(m);
        if (!mt) errors.push(issue(msg('Unknown type "{member}" in union "{name}".'), t.loc, { member: m, name: name }));
        else if (mt.kind !== 'ObjectTypeDefinition') errors.push(issue(msg('Union type "{name}" can only include object types; "{member}" is a {kind} type.'), t.loc, { name: name, member: m, kind: kindLabel(mt.kind) }));
      }
    }
  }

  for (const d of schema.directives.values()) {
    checkName(d.name, d.loc, `directive @${d.name}`);
    checkArgs(d.args, `@${d.name}`);
  }

  // Root operation types
  const sd = schema.schemaDefinition;
  if (sd) checkDirectives(sd.directives, 'schema', 'SCHEMA');
  if (!schema.roots.query) {
    errors.push(issue(sd ? msg('The schema definition must name a query root type, for example "schema { query: Query }".') : msg('Query root type must be provided. Define "type Query { ... }" or a "schema { query: ... }" block.'), sd?.loc));
  }
  for (const op of ['query', 'mutation', 'subscription'] as const) {
    const rootName = schema.roots[op];
    if (!rootName) continue;
    const rt = types.get(rootName);
    if (!rt) errors.push(issue(msg('Unknown type "{rootName}" used as the {op} root type.'), sd?.loc, { rootName: rootName, op: op }));
    else if (rt.kind !== 'ObjectTypeDefinition') errors.push(issue(msg('{op} root type must be an object type, but "{rootName}" is a {kind} type.'), rt.loc, { op: `${op[0].toUpperCase()}${op.slice(1)}`, rootName: rootName, kind: kindLabel(rt.kind) }));
  }

  if (errors.length === 0) {
    // Style notes only make sense for a schema that builds.
    const referenced = new Set<string>(Object.values(schema.roots).filter(Boolean) as string[]);
    for (const t of types.values()) {
      t.fields.forEach((f) => { referenced.add(namedType(f.type)); f.args.forEach((a) => referenced.add(namedType(a.type))); });
      t.inputFields.forEach((f) => referenced.add(namedType(f.type)));
      t.interfaces.forEach((i) => referenced.add(i));
      t.types.forEach((m) => referenced.add(m));
    }
    for (const d of schema.directives.values()) d.args.forEach((a) => referenced.add(namedType(a.type)));
    for (const name of schema.order) {
      const t = types.get(name)!;
      // Object types that implement a referenced interface are reachable through it.
      const viaInterface = t.interfaces.some((i) => referenced.has(i));
      if (!referenced.has(name) && !viaInterface) warnings.push(issue(msg('Type "{name}" is never referenced from the root types, so clients cannot reach it.'), t.loc, { name: name }));
    }
    for (const name of schema.order) {
      const t = types.get(name)!;
      if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) suggestions.push(issue(msg('Type names are usually PascalCase; consider renaming "{name}".'), t.loc, { name: name }));
      for (const f of t.fields) if (!/^[a-z_][A-Za-z0-9]*$/.test(f.name)) suggestions.push(issue(msg('Field names are usually camelCase; consider renaming "{name}.{name2}".'), f.loc, { name: name, name2: f.name }));
      for (const v of t.values) if (!/^[A-Z][A-Z0-9_]*$/.test(v.name)) suggestions.push(issue(msg('Enum values are usually SCREAMING_SNAKE_CASE; consider renaming "{name}.{name2}".'), v.loc, { name: name, name2: v.name }));
    }
    const undocumented = schema.order.filter((n) => !types.get(n)!.description);
    if (undocumented.length > 0 && undocumented.length === schema.order.length) {
      suggestions.push(issue(msg('No type has a description. Add """block string""" descriptions above types and fields; they show up in GraphiQL and in generated docs.')));
    }
  }

  const lines = source.split('\n');
  const longLine = lines.findIndex((l) => l.length > 120);
  if (longLine >= 0) suggestions.push(issue(msg('Some lines are longer than 120 characters. Run the schema through the GraphQL Schema Formatter to wrap it consistently.'), { line: longLine + 1, column: 121 }));

  return { isValid: errors.length === 0, errors, warnings, suggestions };
}

function findNonNullInputCycle(schema: MergedSchema, start: string): string | null {
  const path: string[] = [];
  const visit = (name: string, visited: Set<string>): boolean => {
    const t = schema.types.get(name);
    if (!t || t.kind !== 'InputObjectTypeDefinition') return false;
    for (const f of t.inputFields) {
      if (f.type.kind !== 'NonNull' || f.type.ofType.kind !== 'Named') continue;
      const next = f.type.ofType.name;
      path.push(`${name}.${f.name}`);
      if (next === start) return true;
      if (!visited.has(next)) {
        visited.add(next);
        if (visit(next, visited)) return true;
      }
      path.pop();
    }
    return false;
  };
  return visit(start, new Set([start])) ? path.join(' -> ') : null;
}
