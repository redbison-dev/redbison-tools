import {
  parseGraphQL,
  printBlockString,
  printDirectives,
  printString,
  printTypeRef,
  printValue,
  type Definition,
  type Description,
  type EnumValueDefinition,
  type FieldDefinition,
  type InputValueDefinition,
  type Selection,
} from './graphql-language';

const INDENT = '  ';

function comments(list: string[] | undefined, indent: string) {
  return (list ?? []).map((c) => `${indent}#${c ? ` ${c}` : ''}\n`).join('');
}

function trailing(c: string | undefined) {
  return c ? ` # ${c}` : '';
}

function description(d: Description | undefined, indent: string) {
  if (!d) return '';
  // Keep the author's choice of "quoted" vs """block""" descriptions.
  return `${indent}${d.block ? printBlockString(d.value, indent) : printString(d.value)}\n`;
}

function inputValue(a: InputValueDefinition, indent: string) {
  const def = a.defaultValue ? ` = ${printValue(a.defaultValue)}` : '';
  return `${a.name}: ${printTypeRef(a.type)}${def}${printDirectives(a.directives)}`;
}

function args(list: InputValueDefinition[], indent: string) {
  if (list.length === 0) return '';
  const oneLine = `(${list.map((a) => inputValue(a, indent)).join(', ')})`;
  const needsBlock = list.some((a) => a.description || a.comments || a.trailingComment) || oneLine.length > 80;
  if (!needsBlock) return oneLine;
  const inner = indent + INDENT;
  return `(\n${list.map((a) => `${comments(a.comments, inner)}${description(a.description, inner)}${inner}${inputValue(a, inner)}${trailing(a.trailingComment)}\n`).join('')}${indent})`;
}

function field(f: FieldDefinition, indent: string) {
  return `${comments(f.comments, indent)}${description(f.description, indent)}${indent}${f.name}${args(f.args, indent)}: ${printTypeRef(f.type)}${printDirectives(f.directives)}${trailing(f.trailingComment)}\n`;
}

function enumValue(v: EnumValueDefinition, indent: string) {
  return `${comments(v.comments, indent)}${description(v.description, indent)}${indent}${v.name}${printDirectives(v.directives)}${trailing(v.trailingComment)}\n`;
}

function block(body: string, endComments: string[] | undefined) {
  return ` {\n${body}${comments(endComments, INDENT)}}`;
}

function selections(list: Selection[], indent: string): string {
  const inner = indent + INDENT;
  const lines = list.map((s) => {
    const lead = comments(s.comments, inner);
    if (s.kind === 'FragmentSpread') return `${lead}${inner}...${s.name}${printDirectives(s.directives)}${trailing(s.trailingComment)}\n`;
    if (s.kind === 'InlineFragment') {
      return `${lead}${inner}...${s.typeCondition ? ` on ${s.typeCondition}` : ''}${printDirectives(s.directives)} {\n${selections(s.selectionSet, inner)}${inner}}${trailing(s.trailingComment)}\n`;
    }
    const a = s.args.length ? `(${s.args.map((x) => `${x.name}: ${printValue(x.value)}`).join(', ')})` : '';
    const sub = s.selectionSet ? ` {\n${selections(s.selectionSet, inner)}${inner}}` : '';
    return `${lead}${inner}${s.alias ? `${s.alias}: ` : ''}${s.name}${a}${printDirectives(s.directives)}${sub}${trailing(s.trailingComment)}\n`;
  });
  return lines.join('');
}

function definition(def: Definition): string {
  const lead = comments(def.comments, '');
  const desc = 'description' in def ? description(def.description, '') : '';
  const ext = 'extend' in def && def.extend ? 'extend ' : '';
  const tail = trailing(def.trailingComment);
  switch (def.kind) {
    case 'SchemaDefinition': {
      const ops = def.operationTypes.map((o) => `${INDENT}${o.operation}: ${o.type}\n`).join('');
      return `${lead}${desc}${ext}schema${printDirectives(def.directives)}${ops ? ` {\n${ops}}` : ''}${tail}`;
    }
    case 'ScalarTypeDefinition':
      return `${lead}${desc}${ext}scalar ${def.name}${printDirectives(def.directives)}${tail}`;
    case 'ObjectTypeDefinition':
    case 'InterfaceTypeDefinition': {
      const kw = def.kind === 'ObjectTypeDefinition' ? 'type' : 'interface';
      const impl = def.interfaces.length ? ` implements ${def.interfaces.join(' & ')}` : '';
      const body = def.fields.length ? block(def.fields.map((f) => field(f, INDENT)).join(''), def.endComments) : '';
      return `${lead}${desc}${ext}${kw} ${def.name}${impl}${printDirectives(def.directives)}${body}${tail}`;
    }
    case 'UnionTypeDefinition':
      return `${lead}${desc}${ext}union ${def.name}${printDirectives(def.directives)}${def.types.length ? ` = ${def.types.join(' | ')}` : ''}${tail}`;
    case 'EnumTypeDefinition': {
      const body = def.values.length ? block(def.values.map((v) => enumValue(v, INDENT)).join(''), def.endComments) : '';
      return `${lead}${desc}${ext}enum ${def.name}${printDirectives(def.directives)}${body}${tail}`;
    }
    case 'InputObjectTypeDefinition': {
      const body = def.fields.length
        ? block(def.fields.map((f) => `${comments(f.comments, INDENT)}${description(f.description, INDENT)}${INDENT}${inputValue(f, INDENT)}${trailing(f.trailingComment)}\n`).join(''), def.endComments)
        : '';
      return `${lead}${desc}${ext}input ${def.name}${printDirectives(def.directives)}${body}${tail}`;
    }
    case 'DirectiveDefinition':
      return `${lead}${desc}directive @${def.name}${args(def.args, '')}${def.repeatable ? ' repeatable' : ''} on ${def.locations.join(' | ')}${tail}`;
    case 'OperationDefinition': {
      if (def.shorthand) return `${lead}{\n${selections(def.selectionSet, '')}}${tail}`;
      const vars = def.variableDefinitions.length
        ? `(${def.variableDefinitions.map((v) => `$${v.name}: ${printTypeRef(v.type)}${v.defaultValue ? ` = ${printValue(v.defaultValue)}` : ''}${printDirectives(v.directives)}`).join(', ')})`
        : '';
      return `${lead}${def.operation}${def.name ? ` ${def.name}` : ''}${vars}${printDirectives(def.directives)} {\n${selections(def.selectionSet, '')}}${tail}`;
    }
    case 'FragmentDefinition':
      return `${lead}fragment ${def.name} on ${def.typeCondition}${printDirectives(def.directives)} {\n${selections(def.selectionSet, '')}}${tail}`;
  }
}

/**
 * Pretty-print GraphQL SDL (or operations) with two-space indentation, one
 * field per line and a blank line between definitions. Descriptions and
 * `#` comments are kept. Throws GraphQLSyntaxError on invalid input rather
 * than producing mangled output.
 */
export function formatGraphQL(source: string): string {
  const doc = parseGraphQL(source);
  const out = doc.definitions.map(definition).join('\n\n');
  const end = doc.endComments ? `\n\n${comments(doc.endComments, '').trimEnd()}` : '';
  return `${out}${end}\n`;
}
