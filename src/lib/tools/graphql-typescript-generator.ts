import { parseGraphQL, type Directive, type TypeRef } from './graphql-language';
import { mergeSchema, type MergedType } from './graphql-schema-validator';

export type TsGeneratorOptions = {
  /** Emit object and interface types (as TypeScript interfaces). */
  generateInterfaces: boolean;
  /** Emit GraphQL enums as TypeScript enums; when false, as string-literal unions. */
  generateEnums: boolean;
  /** Emit a header and JSDoc comments from schema descriptions. */
  addComments: boolean;
  /** Prefix every declaration with `export`. */
  exportAll: boolean;
};

const SCALARS: Record<string, string> = {
  ID: 'string',
  String: 'string',
  Int: 'number',
  Float: 'number',
  Boolean: 'boolean',
};

function upperFirst(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Convert a GraphQL type reference to TypeScript. Nullability follows the
 * schema: `T!` is `T`, a bare `T` is `T | null`, `[T!]!` is `Array<T>`,
 * `[T]` is `Array<T | null> | null`.
 */
export function tsTypeFor(t: TypeRef, nullable = true): string {
  if (t.kind === 'NonNull') return tsTypeFor(t.ofType, false);
  const inner = t.kind === 'List' ? `Array<${tsTypeFor(t.ofType)}>` : SCALARS[t.name] ?? t.name;
  return nullable ? `${inner} | null` : inner;
}

function jsdoc(text: string | undefined, indent: string, on: boolean) {
  if (!on || !text) return '';
  const lines = text.split('\n');
  if (lines.length === 1) return `${indent}/** ${lines[0].replace(/\*\//g, '*\\/')} */\n`;
  return `${indent}/**\n${lines.map((l) => `${indent} * ${l.replace(/\*\//g, '*\\/')}`.trimEnd()).join('\n')}\n${indent} */\n`;
}

function deprecation(directives: Directive[]) {
  const d = directives.find((x) => x.name === 'deprecated');
  if (!d) return undefined;
  const reason = d.args.find((a) => a.name === 'reason')?.value;
  return reason?.kind === 'String' ? reason.value : 'No longer supported';
}

/**
 * Generate TypeScript declarations from GraphQL SDL. Throws a
 * GraphQLSyntaxError when the SDL does not parse.
 */
export function generateTypeScript(source: string, options: TsGeneratorOptions): string {
  const doc = parseGraphQL(source);
  const schema = mergeSchema(doc);
  const ex = options.exportAll ? 'export ' : '';
  const parts: string[] = [];

  if (options.addComments) parts.push('// TypeScript types generated from a GraphQL schema\n');

  const named = schema.order.map((n) => schema.types.get(n)!);
  const byKind = (k: MergedType['kind']) => named.filter((t) => t.kind === k);

  for (const t of byKind('ScalarTypeDefinition')) {
    parts.push(
      `${jsdoc(t.description ?? `Custom scalar ${t.name}. Replace unknown with the type your server serializes it to.`, '', options.addComments)}${ex}type ${t.name} = unknown;\n`,
    );
  }

  for (const t of byKind('EnumTypeDefinition')) {
    const doc = jsdoc(t.description, '', options.addComments);
    if (options.generateEnums) {
      const body = t.values.map((v) => `${jsdoc(v.description?.value, '  ', options.addComments)}  ${v.name} = '${v.name}',\n`).join('');
      parts.push(`${doc}${ex}enum ${t.name} {\n${body}}\n`);
    } else {
      parts.push(`${doc}${ex}type ${t.name} = ${t.values.map((v) => `'${v.name}'`).join(' | ') || 'never'};\n`);
    }
  }

  if (options.generateInterfaces) {
    for (const t of named.filter((x) => x.kind === 'InterfaceTypeDefinition' || x.kind === 'ObjectTypeDefinition')) {
      const isObject = t.kind === 'ObjectTypeDefinition';
      const typename = isObject
        ? `  __typename?: '${t.name}';\n`
        : `  __typename?: ${implementersOf(named, t.name).map((n) => `'${n}'`).join(' | ') || 'string'};\n`;
      const fields = t.fields
        .map((f) => {
          const dep = deprecation(f.directives);
          const text = [f.description?.value, dep ? `@deprecated ${dep}` : undefined].filter(Boolean).join('\n');
          return `${jsdoc(text || undefined, '  ', options.addComments)}  ${f.name}: ${tsTypeFor(f.type)};\n`;
        })
        .join('');
      parts.push(`${jsdoc(t.description, '', options.addComments)}${ex}interface ${t.name} {\n${typename}${fields}}\n`);

      for (const f of t.fields.filter((x) => x.args.length > 0)) {
        const argFields = f.args
          .map((a) => {
            const optional = a.type.kind !== 'NonNull' || a.defaultValue !== undefined;
            return `${jsdoc(a.description?.value, '  ', options.addComments)}  ${a.name}${optional ? '?' : ''}: ${tsTypeFor(a.type)};\n`;
          })
          .join('');
        parts.push(`${ex}interface ${t.name}${upperFirst(f.name)}Args {\n${argFields}}\n`);
      }
    }
    for (const u of byKind('UnionTypeDefinition')) {
      parts.push(`${jsdoc(u.description, '', options.addComments)}${ex}type ${u.name} = ${u.types.join(' | ') || 'never'};\n`);
    }
  }

  for (const t of byKind('InputObjectTypeDefinition')) {
    const fields = t.inputFields
      .map((f) => {
        // Nullable input fields may be omitted; a default value also makes a field optional.
        const optional = f.type.kind !== 'NonNull' || f.defaultValue !== undefined;
        return `${jsdoc(f.description?.value, '  ', options.addComments)}  ${f.name}${optional ? '?' : ''}: ${tsTypeFor(f.type)};\n`;
      })
      .join('');
    parts.push(`${jsdoc(t.description, '', options.addComments)}${ex}interface ${t.name} {\n${fields}}\n`);
  }

  return parts.join('\n');
}

function implementersOf(types: MergedType[], iface: string) {
  return types.filter((t) => t.kind === 'ObjectTypeDefinition' && t.interfaces.includes(iface)).map((t) => t.name);
}
