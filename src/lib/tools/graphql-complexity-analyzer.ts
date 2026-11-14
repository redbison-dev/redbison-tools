import {
  GraphQLSyntaxError,
  parseGraphQL,
  type Argument,
  type DocumentNode,
  type FragmentDefinition,
  type OperationDefinition,
  type Selection,
  type Value,
} from './graphql-language';
import { msg } from '../msg';

export type ComplexityLevel = 'Low' | 'Medium' | 'High' | 'Critical';
/** Display names of the levels, for translation where they are shown. */
export const COMPLEXITY_LEVEL_TEXT: Record<ComplexityLevel, string> = { Low: msg('Low'), Medium: msg('Medium'), High: msg('High'), Critical: msg('Critical') };

/** An issue or suggestion as an English template and its values; `{name}` placeholders. */
export type ComplexityMsg = { text: string; vars?: Record<string, string | number> };
const fill = (m: ComplexityMsg) => m.text.replace(/\{(\w+)\}/g, (all, k: string) => (m.vars?.[k] === undefined ? all : String(m.vars[k])));

export type ComplexityResult = {
  /** Estimated number of field resolutions, with list sizes multiplied through. */
  score: number;
  /** 0 to 100, on a log scale where 10,000 fills the bar. */
  percent: number;
  /** Deepest field nesting; a root field is depth 1. */
  depth: number;
  /** Field selections in the document, counting fragment fields once per use. */
  fieldCount: number;
  complexity: ComplexityLevel;
  issues: string[];
  suggestions: string[];
  /** The same issues and suggestions as messages ({ text, vars }), for pages that translate them. */
  issueMsgs: ComplexityMsg[];
  suggestionMsgs: ComplexityMsg[];
  breakdown: { queries: number; mutations: number; subscriptions: number; fragments: number; nestedLevels: number };
};

/** Arguments that usually cap how many list items a field returns. */
export const PAGINATION_ARGS = ['first', 'last', 'limit', 'take', 'top', 'pageSize', 'perPage', 'count'];

export type ComplexityOptions = {
  /** Multiplier assumed when a pagination argument is a variable with no default. */
  assumedListSize?: number;
  /** Depth above which a query is flagged. */
  maxDepth?: number;
  /** Largest pagination value before it is flagged. */
  maxPageSize?: number;
};

function levelFor(score: number): ComplexityLevel {
  if (score < 100) return 'Low';
  if (score < 1000) return 'Medium';
  if (score < 10000) return 'High';
  return 'Critical';
}

/**
 * Estimate the cost of a GraphQL operation without a schema. Each field
 * costs 1, multiplied by the page size of every paginated ancestor
 * (first: 10 under first: 5 means 50 resolutions per field). This is the
 * same idea GitHub uses for its node limit, and it is why a query with few
 * lines can still be expensive.
 */
export function analyzeComplexity(query: string, options: ComplexityOptions = {}): ComplexityResult {
  const assumed = options.assumedListSize ?? 10;
  const maxDepthAllowed = options.maxDepth ?? 7;
  const maxPage = options.maxPageSize ?? 100;
  let doc: DocumentNode;
  try {
    doc = parseGraphQL(query);
  } catch (e) {
    if (e instanceof GraphQLSyntaxError) {
      return {
        score: 0, percent: 0, depth: 0, fieldCount: 0, complexity: 'Low',
        issues: [e.message], suggestions: ['Fix the syntax error first; the estimate needs a query that parses.'],
        issueMsgs: [{ text: e.message }], suggestionMsgs: [{ text: msg('Fix the syntax error first; the estimate needs a query that parses.') }],
        breakdown: { queries: 0, mutations: 0, subscriptions: 0, fragments: 0, nestedLevels: 0 },
      };
    }
    throw e;
  }

  const ops = doc.definitions.filter((d): d is OperationDefinition => d.kind === 'OperationDefinition');
  const fragments = new Map<string, FragmentDefinition>();
  const issueMsgs: ComplexityMsg[] = [];
  const suggestionMsgs: ComplexityMsg[] = [];
  const issues = { push: (text: string, vars?: ComplexityMsg['vars']) => issueMsgs.push({ text, vars }) };
  const suggestions = { push: (text: string, vars?: ComplexityMsg['vars']) => suggestionMsgs.push({ text, vars }) };

  for (const d of doc.definitions) {
    if (d.kind === 'FragmentDefinition') {
      if (fragments.has(d.name)) issues.push(msg('There can be only one fragment named "{name}".'), { name: d.name });
      fragments.set(d.name, d);
    } else if (d.kind !== 'OperationDefinition') {
      issues.push(msg('Found a {kind} definition. This analyzer expects queries, mutations, subscriptions and fragments, not schema SDL.'), { kind: d.kind.replace('Definition', '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase() });
    }
  }

  if (ops.length > 1 && ops.some((o) => !o.name)) issues.push(msg('An anonymous operation must be the only operation in the document.'));
  const opNames = ops.map((o) => o.name).filter(Boolean);
  for (const n of new Set(opNames)) if (opNames.filter((x) => x === n).length > 1) issues.push(msg('There can be only one operation named "{name}".'), { name: String(n) });

  let score = 0;
  let fieldCount = 0;
  let depth = 0;
  const largePages = new Set<string>();
  const usedFragments = new Set<string>();
  const literalArgs = new Set<string>();
  let cycleReported = false;

  const pageSize = (args: Argument[], vars: Map<string, Value | undefined>, path: string): number => {
    for (const a of args) {
      if (!PAGINATION_ARGS.includes(a.name)) continue;
      let v: Value | undefined = a.value;
      if (v.kind === 'Variable') {
        v = vars.get(v.name);
        if (!v) return assumed;
      }
      if (v.kind === 'Int') {
        const n = Number(v.value);
        if (n > maxPage) largePages.add(`${path}(${a.name}: ${n})`);
        return Math.max(n, 1);
      }
    }
    return 1;
  };

  const walk = (
    sels: Selection[], multiplier: number, level: number, vars: Map<string, Value | undefined>, stack: string[], path: string,
  ) => {
    for (const s of sels) {
      if (s.kind === 'Field') {
        if (s.name === '__typename') { fieldCount++; continue; }
        fieldCount++;
        score += multiplier;
        depth = Math.max(depth, level);
        for (const a of s.args) if (a.value.kind !== 'Variable' && !PAGINATION_ARGS.includes(a.name)) literalArgs.add(`${s.name}(${a.name}:)`);
        if (s.selectionSet) {
          const fieldPath = path ? `${path}.${s.name}` : s.name;
          walk(s.selectionSet, multiplier * pageSize(s.args, vars, fieldPath), level + 1, vars, stack, fieldPath);
        }
      } else if (s.kind === 'InlineFragment') {
        walk(s.selectionSet, multiplier, level, vars, stack, path);
      } else {
        usedFragments.add(s.name);
        const f = fragments.get(s.name);
        if (!f) { issues.push(msg('Unknown fragment "{name}".'), { name: s.name }); continue; }
        if (stack.includes(s.name)) {
          if (!cycleReported) issues.push(msg('Fragment "{name}" spreads itself ({path}). Servers reject fragment cycles.'), { name: s.name, path: [...stack, s.name].join(' -> ') });
          cycleReported = true;
          continue;
        }
        walk(f.selectionSet, multiplier, level, vars, [...stack, s.name], path);
      }
    }
  };

  for (const op of ops) {
    const vars = new Map<string, Value | undefined>(op.variableDefinitions.map((v) => [v.name, v.defaultValue]));
    walk(op.selectionSet, 1, 1, vars, [], '');
    const used = new Set<string>();
    const collect = (v: Value) => {
      if (v.kind === 'Variable') used.add(v.name);
      if (v.kind === 'List') v.values.forEach(collect);
      if (v.kind === 'Object') v.fields.forEach((f) => collect(f.value));
    };
    const visit = (sels: Selection[], seen: Set<string>) => {
      for (const s of sels) {
        s.directives.forEach((d) => d.args.forEach((a) => collect(a.value)));
        if (s.kind === 'Field') { s.args.forEach((a) => collect(a.value)); if (s.selectionSet) visit(s.selectionSet, seen); }
        else if (s.kind === 'InlineFragment') visit(s.selectionSet, seen);
        else if (!seen.has(s.name) && fragments.get(s.name)) { seen.add(s.name); visit(fragments.get(s.name)!.selectionSet, seen); }
      }
    };
    visit(op.selectionSet, new Set());
    for (const name of used) if (!vars.has(name)) {
      if (op.name) issues.push(msg('Variable "${name}" is used in "{op}" but not declared.'), { name, op: op.name });
      else issues.push(msg('Variable "${name}" is used in the anonymous operation but not declared.'), { name });
    }
    for (const name of vars.keys()) if (!used.has(name)) {
      if (op.name) issues.push(msg('Variable "${name}" is declared in "{op}" but never used.'), { name, op: op.name });
      else issues.push(msg('Variable "${name}" is declared in the anonymous operation but never used.'), { name });
    }
  }

  for (const name of fragments.keys()) if (!usedFragments.has(name)) issues.push(msg('Fragment "{name}" is never used.'), { name });

  if (depth > maxDepthAllowed) {
    issues.push(msg('Query depth is {depth}, above {max}. Many servers enforce a depth limit, and deep nesting multiplies resolver calls.'), { depth, max: maxDepthAllowed });
    suggestions.push(msg('Flatten the query: fetch the deep branch in a second request, or ask for IDs and resolve details separately.'));
  }
  for (const p of largePages) issues.push(msg('Large page size at {where}. Many APIs cap page sizes at {max} (GitHub requires first or last between 1 and 100).'), { where: p, max: maxPage });
  if (score >= 10000) {
    issues.push(msg('Estimated {score} field resolutions. A single request this large can time out or hit rate limits.'), { score: score.toLocaleString('en-US') });
    suggestions.push(msg('Reduce first/last values on outer connections; they multiply everything below them.'));
  } else if (score >= 1000) {
    suggestions.push(msg('Most of the cost comes from nested lists. Halving the outermost page size halves the estimate.'));
  }
  if (literalArgs.size > 0 && ops.length > 0) {
    suggestions.push(msg('Hard-coded argument values ({args}) make each request a different document. Use variables so persisted queries and caches can reuse it.'), { args: [...literalArgs].slice(0, 3).join(', ') });
  }
  if (ops.some((o) => o.operation === 'subscription' && o.selectionSet.length > 1)) {
    issues.push(msg('A subscription operation must select exactly one root field.'));
  }

  const queries = ops.filter((o) => o.operation === 'query').length;
  const mutations = ops.filter((o) => o.operation === 'mutation').length;
  const subscriptions = ops.filter((o) => o.operation === 'subscription').length;
  if (ops.length === 0) issues.push(msg('No operation found. Add a query, mutation or subscription that uses your fragments.'));

  return {
    score,
    percent: Math.min(100, Math.round((Math.log10(score + 1) / 4) * 100)),
    depth,
    fieldCount,
    complexity: levelFor(score),
    issues: issueMsgs.map(fill),
    suggestions: suggestionMsgs.map(fill),
    issueMsgs,
    suggestionMsgs,
    breakdown: { queries, mutations, subscriptions, fragments: fragments.size, nestedLevels: depth },
  };
}
