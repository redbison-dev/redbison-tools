/**
 * Summarises a V8 heap snapshot (the .heapsnapshot JSON that Chrome
 * DevTools, node --heapsnapshot-signal and v8.writeHeapSnapshot() write):
 * totals, the histogram by node type and by constructor, the biggest single
 * nodes, duplicate strings and detached DOM nodes.
 *
 * The file is self-describing: snapshot.meta names the fields each flat
 * nodes[] row carries, so this reads the layout from the file rather than
 * assuming one, which is what keeps old Chrome and new Node snapshots both
 * working. Sizes are V8's self_size — what DevTools calls shallow size.
 * Retained sizes need the dominator tree over every edge; that is a full
 * graph computation this summary deliberately leaves out, and the output
 * says shallow so nobody mistakes which figure they are reading.
 *
 * Dependency-free on purpose: the CLI bundles it, and the site parses in
 * the browser so the snapshot never leaves the machine.
 */

export type V8TypeStat = { type: string; count: number; bytes: number };
export type V8CtorStat = { name: string; count: number; bytes: number };
export type V8BigNode = { name: string; type: string; bytes: number };
export type V8DupString = { preview: string; length: number; copies: number; wastedBytes: number };

export type V8HeapSummary = {
  nodeCount: number;
  edgeCount: number;
  totalBytes: number;
  types: V8TypeStat[];
  constructors: V8CtorStat[];
  biggest: V8BigNode[];
  duplicateStrings: V8DupString[];
  duplicateStringWastedBytes: number;
  detachedNodes: number;
};

type Snapshot = {
  snapshot: {
    meta: { node_fields: string[]; node_types: (string[] | string)[] };
    node_count: number;
    edge_count: number;
  };
  nodes: number[];
  strings: string[];
};

export function parseV8HeapSnapshot(json: string): V8HeapSummary {
  let s: Snapshot;
  try {
    s = JSON.parse(json) as Snapshot;
  } catch {
    throw new Error('Not valid JSON. A V8 heap snapshot is the .heapsnapshot file DevTools or v8.writeHeapSnapshot() saves.');
  }
  const meta = s.snapshot?.meta;
  if (!meta?.node_fields || !Array.isArray(s.nodes) || !Array.isArray(s.strings)) {
    throw new Error('Not a V8 heap snapshot: snapshot.meta.node_fields, nodes and strings are missing.');
  }
  const fields = meta.node_fields;
  const stride = fields.length;
  const iType = fields.indexOf('type');
  const iName = fields.indexOf('name');
  const iSize = fields.indexOf('self_size');
  const iDetached = fields.indexOf('detachedness');
  const typeNames = meta.node_types[iType] as string[];

  const types = new Map<string, { count: number; bytes: number }>();
  const ctors = new Map<string, { count: number; bytes: number }>();
  const dupes = new Map<string, { length: number; copies: number; bytes: number }>();
  const biggest: V8BigNode[] = [];
  let totalBytes = 0;
  let detachedNodes = 0;

  for (let o = 0; o < s.nodes.length; o += stride) {
    const type = typeNames[s.nodes[o + iType]] ?? `type#${s.nodes[o + iType]}`;
    const size = s.nodes[o + iSize];
    const nameIdx = s.nodes[o + iName];
    totalBytes += size;
    const t = types.get(type) ?? { count: 0, bytes: 0 };
    t.count += 1;
    t.bytes += size;
    types.set(type, t);

    if (iDetached !== -1 && s.nodes[o + iDetached] === 1) detachedNodes += 1;

    if (type === 'object' || type === 'closure' || type === 'regexp') {
      const name = s.strings[nameIdx] ?? '(unknown)';
      const c = ctors.get(name) ?? { count: 0, bytes: 0 };
      c.count += 1;
      c.bytes += size;
      ctors.set(name, c);
    }

    if (type === 'string') {
      const value = s.strings[nameIdx];
      if (value !== undefined && value.length >= 16) {
        const d = dupes.get(value) ?? { length: value.length, copies: 0, bytes: size };
        d.copies += 1;
        dupes.set(value, d);
      }
    }

    if (biggest.length < 10 || size > biggest[0].bytes) {
      const name = s.strings[nameIdx] ?? type;
      if (biggest.length >= 10) biggest.shift();
      biggest.push({ name: name.length > 60 ? `${name.slice(0, 60)}…` : name, type, bytes: size });
      biggest.sort((a, b) => a.bytes - b.bytes);
    }
  }

  const duplicateStrings = [...dupes.entries()]
    .filter(([, d]) => d.copies > 1)
    .map(([value, d]) => ({
      preview: value.length > 40 ? `${value.slice(0, 40)}…` : value,
      length: d.length,
      copies: d.copies,
      wastedBytes: (d.copies - 1) * d.bytes,
    }))
    .sort((a, b) => b.wastedBytes - a.wastedBytes)
    .slice(0, 10);

  return {
    nodeCount: s.snapshot.node_count,
    edgeCount: s.snapshot.edge_count,
    totalBytes,
    types: [...types.entries()].map(([type, t]) => ({ type, ...t })).sort((a, b) => b.bytes - a.bytes),
    constructors: [...ctors.entries()].map(([name, c]) => ({ name, ...c })).sort((a, b) => b.bytes - a.bytes).slice(0, 20),
    biggest: [...biggest].sort((a, b) => b.bytes - a.bytes),
    duplicateStrings,
    duplicateStringWastedBytes: duplicateStrings.reduce((sum, d) => sum + d.wastedBytes, 0),
    detachedNodes,
  };
}

const iec = (n: number): string => {
  if (n < 1024) return `${n} B`;
  const units = ['KiB', 'MiB', 'GiB'];
  let v = n;
  let u = -1;
  do { v /= 1024; u += 1; } while (v >= 1024 && u < units.length - 1);
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[u]}`;
};

/** The summary as terminal text. */
export function renderV8HeapSummary(h: V8HeapSummary): string {
  const lines = [
    `${h.nodeCount.toLocaleString('en-US')} nodes  ·  ${h.edgeCount.toLocaleString('en-US')} edges  ·  ${iec(h.totalBytes)} shallow`,
    '',
    'by node type',
  ];
  for (const t of h.types.slice(0, 8)) lines.push(`  ${iec(t.bytes).padStart(9)}  ${t.count.toLocaleString('en-US').padStart(10)} ×  ${t.type}`);
  lines.push('', 'top constructors (objects and closures, shallow)');
  for (const c of h.constructors.slice(0, 10)) lines.push(`  ${iec(c.bytes).padStart(9)}  ${c.count.toLocaleString('en-US').padStart(10)} ×  ${c.name}`);
  if (h.duplicateStrings.length) {
    lines.push('', `duplicate strings — ${iec(h.duplicateStringWastedBytes)} spent on repeat content`);
    for (const d of h.duplicateStrings.slice(0, 5)) {
      lines.push(`  ${d.copies.toLocaleString('en-US')} copies of "${d.preview}" (${d.length} chars, ${iec(d.wastedBytes)} beyond the first)`);
    }
  }
  if (h.detachedNodes) lines.push('', `detached DOM nodes: ${h.detachedNodes.toLocaleString('en-US')} — removed from the page but still referenced, the classic browser leak`);
  lines.push('', 'biggest single nodes');
  for (const b of h.biggest.slice(0, 5)) lines.push(`  ${iec(b.bytes).padStart(9)}  ${b.type}  ${b.name}`);
  return lines.join('\n');
}
