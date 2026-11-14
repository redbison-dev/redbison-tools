import { msg } from '../msg';

/** A translate function (the page's t); English by default. */
type Translate = (source: string, vars?: Record<string, string | number>) => string;
const english: Translate = (s, v) => s.replace(/\{(\w+)\}/g, (all, k: string) => (v?.[k] === undefined ? all : String(v[k])));

export interface ExecutionNode {
  id: string;
  operation: string;
  table?: string;
  index?: string;
  /** Planner's total cost estimate (arbitrary units, includes children). */
  cost: number;
  /** Planner's row estimate. */
  rows: number;
  /** Rows actually produced, from EXPLAIN ANALYZE (per loop times loops). */
  actualRows?: number;
  /** Actual total time in ms across all loops, from EXPLAIN ANALYZE. */
  time: number;
  loops: number;
  children: ExecutionNode[];
  details: string;
  type: 'scan' | 'join' | 'sort' | 'filter' | 'aggregate' | 'other';
}

export function getOperationType(nodeType: string): ExecutionNode['type'] {
  const type = nodeType.toLowerCase();
  if (type.includes('scan')) return 'scan';
  if (type.includes('join') || type.includes('loop')) return 'join';
  if (type.includes('sort')) return 'sort';
  if (type.includes('aggregate') || type.includes('group')) return 'aggregate';
  if (type.includes('filter') || type.includes('result')) return 'filter';
  return 'other';
}

type RawNode = Record<string, unknown>;

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};

/**
 * Parses PostgreSQL EXPLAIN (FORMAT JSON) output, with or without ANALYZE.
 * Accepts the array PostgreSQL prints, a single {"Plan": ...} object, or a
 * bare plan node. Returns null for anything else (for example MySQL's
 * EXPLAIN FORMAT=JSON, which uses a different structure).
 */
export function parseExplainPlan(planText: string): ExecutionNode | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(planText);
  } catch {
    return null;
  }
  if (Array.isArray(parsed)) parsed = parsed[0];
  if (!parsed || typeof parsed !== 'object') return null;
  const root = ((parsed as RawNode).Plan ?? parsed) as RawNode;
  if (!root || typeof root !== 'object' || typeof root['Node Type'] !== 'string') return null;

  const parseNode = (node: RawNode, id: string): ExecutionNode => {
    const operation = String(node['Node Type'] ?? 'Unknown');
    const loops = num(node['Actual Loops']) ?? 1;
    const perLoopTime = num(node['Actual Total Time']) ?? num(node['Actual Time']) ?? 0;
    const perLoopRows = num(node['Actual Rows']);
    const details = [node['Filter'], node['Join Filter'], node['Hash Cond'], node['Merge Cond'], node['Index Cond'], node['Sort Key']]
      .filter((d) => d !== undefined && d !== null && d !== '')
      .map((d) => (Array.isArray(d) ? d.join(', ') : String(d)))
      .join(' | ');
    const children = Array.isArray(node['Plans']) ? (node['Plans'] as RawNode[]) : [];
    return {
      id,
      operation,
      table: typeof node['Relation Name'] === 'string' ? node['Relation Name'] : undefined,
      index: typeof node['Index Name'] === 'string' ? node['Index Name'] : undefined,
      cost: num(node['Total Cost']) ?? 0,
      rows: Math.round(num(node['Plan Rows']) ?? 0),
      actualRows: perLoopRows === undefined ? undefined : Math.round(perLoopRows * loops),
      time: perLoopTime * loops,
      loops,
      details,
      type: getOperationType(operation),
      children: children.map((child, idx) => parseNode(child, `${id}_${idx}`)),
    };
  };

  return parseNode(root, '0');
}

/**
 * Planned vs actual rows, compared per loop: PostgreSQL reports both
 * "Plan Rows" and "Actual Rows" as per-execution averages.
 */
function rowEstimateRatio(node: ExecutionNode): number | undefined {
  if (node.actualRows === undefined || node.rows <= 0) return undefined;
  const perLoop = node.actualRows / Math.max(node.loops, 1);
  return Math.max(perLoop, 1) / Math.max(node.rows, 1);
}

export function analyzePerformance(node: ExecutionNode, t: Translate = english): string[] {
  const issues: string[] = [];
  if (node.cost > 1000) issues.push(t(msg('High cost operation: {operation} ({cost})'), { operation: node.operation, cost: node.cost.toFixed(2) }));
  if (node.operation.includes('Seq Scan') && node.rows > 10000) {
    issues.push(t(msg('Large sequential scan on {table} ({rows} estimated rows)'), { table: node.table ?? t(msg('a table')), rows: node.rows }));
  }
  if (node.time > 100) issues.push(t(msg('Slow node: {operation} took {time} ms'), { operation: node.operation, time: node.time.toFixed(3) }));
  const ratio = rowEstimateRatio(node);
  if (ratio !== undefined && (ratio >= 10 || ratio <= 0.1)) {
    const actual = node.loops > 1 ? Math.round(node.actualRows! / node.loops) : node.actualRows!;
    const vars = { factor: ratio >= 1 ? Math.round(ratio) : Math.round(1 / ratio), operation: node.table ? `${node.operation} (${node.table})` : node.operation, planned: node.rows, actual, loops: node.loops };
    issues.push(node.loops > 1
      ? t(msg('Row estimate off by {factor}x on {operation}: planned {planned}, actual {actual} per loop over {loops} loops'), vars)
      : t(msg('Row estimate off by {factor}x on {operation}: planned {planned}, actual {actual}'), vars));
  }
  node.children.forEach((child) => issues.push(...analyzePerformance(child, t)));
  return issues;
}

export function generateRecommendations(node: ExecutionNode, t: Translate = english): string[] {
  const recs: string[] = [];
  const table = node.table ?? t(msg('a table'));
  if (node.operation.includes('Seq Scan') && node.rows > 1000 && node.details) {
    recs.push(t(msg('Seq Scan on {table} applies "{details}": an index on the filtered column may help if the filter is selective'), { table, details: node.details }));
  } else if (node.operation.includes('Seq Scan') && node.rows > 1000) {
    recs.push(t(msg('Seq Scan on {table} reads every row; that is expected if the query needs most of the table'), { table }));
  }
  if (node.operation.includes('Nested Loop') && node.rows > 10000) {
    recs.push(t(msg('Nested Loop over many rows: check that the inner side uses an index, and that row estimates are accurate (run ANALYZE)')));
  }
  if (node.operation.includes('Sort') && node.cost > 500) {
    recs.push(t(msg('Expensive Sort: an index matching the ORDER BY columns can return rows already sorted')));
  }
  const ratio = rowEstimateRatio(node);
  if (ratio !== undefined && (ratio >= 10 || ratio <= 0.1)) {
    recs.push(t(msg('Refresh statistics with {command}; bad row estimates lead the planner to the wrong join type'), { command: node.table ? `ANALYZE ${node.table}` : 'ANALYZE' }));
  }
  node.children.forEach((child) => recs.push(...generateRecommendations(child, t)));
  return [...new Set(recs)];
}
