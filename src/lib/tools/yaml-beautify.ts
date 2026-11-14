import { parseAllDocuments } from 'yaml';

/**
 * Re-indents YAML by parsing it with the `yaml` library (YAML 1.2) and
 * printing it back. Comments, anchors, aliases, merge keys, block scalars and
 * multiple documents survive; long strings are not re-folded. Throws with the
 * parser's line/column message on invalid YAML, including duplicate keys.
 */
export function beautifyYaml(input: string, indent = 2): string {
  if (!input.trim()) return '';
  const docs = parseAllDocuments(input, { prettyErrors: true, uniqueKeys: true });
  if (!Array.isArray(docs)) return '';
  for (const doc of docs) {
    if (doc.errors.length) throw new Error(doc.errors[0].message);
  }
  return docs.map((doc) => doc.toString({ indent, lineWidth: 0 })).join('');
}
