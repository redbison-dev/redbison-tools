export type BuilderField = {
  name: string;
  /** Object fields need their own selection set; these subfields are used. */
  subfields?: string[];
};

export type BuilderType = { name: string; rootField: string; fields: BuilderField[] };

/** The sample schema the builder offers. Object-typed fields carry default subfields. */
export const BUILDER_TYPES: BuilderType[] = [
  {
    name: 'User',
    rootField: 'user',
    fields: [{ name: 'id' }, { name: 'name' }, { name: 'email' }, { name: 'posts', subfields: ['id', 'title'] }],
  },
  {
    name: 'Post',
    rootField: 'post',
    fields: [{ name: 'id' }, { name: 'title' }, { name: 'content' }, { name: 'author', subfields: ['id', 'name'] }, { name: 'createdAt' }],
  },
];

export type BuildQueryInput = {
  operation: 'query' | 'mutation';
  name?: string;
  /** e.g. "$id: ID!, $limit: Int" (parentheses optional). */
  variables?: string;
  /** Keys are "Type.field". */
  selected: Record<string, boolean>;
  /** Keys are "Type.field"; values like "first: 10" (parentheses optional). */
  args?: Record<string, string>;
  types?: BuilderType[];
};

const stripParens = (s: string) => s.trim().replace(/^\((.*)\)$/s, '$1').trim();

/**
 * Build a GraphQL document from the selected fields. Object fields such as
 * User.posts get a default sub-selection, because a field that returns an
 * object type is invalid without one.
 */
export function buildGraphqlQuery(input: BuildQueryInput): string {
  const types = input.types ?? BUILDER_TYPES;
  let query = input.operation;
  const name = input.name?.trim();
  if (name) query += ` ${name.replace(/\s+/g, '')}`;
  const vars = input.variables ? stripParens(input.variables) : '';
  if (vars) query += `(${vars})`;
  query += ' {\n';

  for (const type of types) {
    const fields = type.fields.filter((f) => input.selected[`${type.name}.${f.name}`]);
    if (fields.length === 0) continue;
    query += `  ${type.rootField} {\n`;
    for (const f of fields) {
      const rawArgs = input.args?.[`${type.name}.${f.name}`];
      const args = rawArgs && stripParens(rawArgs) ? `(${stripParens(rawArgs)})` : '';
      if (f.subfields?.length) {
        query += `    ${f.name}${args} {\n${f.subfields.map((s) => `      ${s}\n`).join('')}    }\n`;
      } else {
        query += `    ${f.name}${args}\n`;
      }
    }
    query += '  }\n';
  }
  return `${query}}`;
}
