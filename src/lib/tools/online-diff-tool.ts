export interface DiffLine { content: string; type: 'context' | 'added' | 'removed'; oldLineNumber?: number; newLineNumber?: number }
export interface DiffHunk { oldStart: number; oldLines: number; newStart: number; newLines: number; lines: DiffLine[] }
export interface DiffResult { hunks: DiffHunk[]; additions: number; deletions: number; totalChanges: number }
export interface DiffOptions { ignoreWhitespace?: boolean; ignoreCase?: boolean; context?: number }
interface EditOperation { type: 'equal' | 'delete' | 'insert'; oldIndex: number; newIndex: number; content: string }

const normalizer = ({ ignoreWhitespace, ignoreCase }: DiffOptions) => (line: string) => {
  let out = line;
  if (ignoreWhitespace) out = out.replace(/\s+/g, ' ').trim();
  if (ignoreCase) out = out.toLowerCase();
  return out;
};

/** Myers O(ND) shortest edit script over lines. */
export function myersDiff(oldLines: string[], newLines: string[], options: DiffOptions = {}): EditOperation[] {
  const norm = normalizer(options);
  const a = oldLines.map(norm);
  const b = newLines.map(norm);
  const N = a.length, M = b.length;
  if (N === 0) return newLines.map((content, newIndex) => ({ type: 'insert', oldIndex: -1, newIndex, content }));
  if (M === 0) return oldLines.map((content, oldIndex) => ({ type: 'delete', oldIndex, newIndex: -1, content }));
  const v: Record<number, number> = { 1: 0 };
  const trace: Record<number, number>[] = [];
  for (let d = 0; d <= N + M; d++) {
    trace.push({ ...v });
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[k - 1] < v[k + 1]) ? v[k + 1] : v[k - 1] + 1;
      let y = x - k;
      while (x < N && y < M && a[x] === b[y]) { x++; y++; }
      v[k] = x;
      if (x >= N && y >= M) return backtrack(trace, oldLines, newLines, x, y, d);
    }
  }
  return [];
}

function backtrack(trace: Record<number, number>[], oldLines: string[], newLines: string[], x: number, y: number, d: number): EditOperation[] {
  const ops: EditOperation[] = [];
  for (let depth = d; depth >= 0; depth--) {
    const v = trace[depth];
    const k = x - y;
    const prevK = k === -depth || (k !== depth && (v[k - 1] ?? -1) < (v[k + 1] ?? -1)) ? k + 1 : k - 1;
    const prevX = depth === 0 ? 0 : v[prevK] ?? 0;
    const prevY = depth === 0 ? 0 : prevX - prevK;
    while (x > prevX && y > prevY) {
      ops.unshift({ type: 'equal', oldIndex: x - 1, newIndex: y - 1, content: oldLines[x - 1] });
      x--; y--;
    }
    if (depth > 0) {
      if (x > prevX) ops.unshift({ type: 'delete', oldIndex: x - 1, newIndex: -1, content: oldLines[x - 1] });
      else ops.unshift({ type: 'insert', oldIndex: -1, newIndex: y - 1, content: newLines[y - 1] });
      x = prevX; y = prevY;
    }
  }
  return ops;
}

/**
 * Groups an edit script into unified-diff hunks: each change gets up to
 * `context` lines either side, and changes whose context overlaps or touches
 * share one hunk (like `diff -U3` and `git diff`).
 */
export function buildHunks(ops: EditOperation[], context = 3): DiffHunk[] {
  const changes = ops.map((op, i) => (op.type === 'equal' ? -1 : i)).filter((i) => i >= 0);
  if (!changes.length) return [];
  const ranges: [number, number][] = [];
  for (const i of changes) {
    const start = Math.max(0, i - context);
    const end = Math.min(ops.length - 1, i + context);
    const last = ranges[ranges.length - 1];
    if (last && start <= last[1] + 1) last[1] = Math.max(last[1], end);
    else ranges.push([start, end]);
  }
  // Number of old/new lines consumed before each op index.
  const oldBefore: number[] = [], newBefore: number[] = [];
  let o = 0, n = 0;
  for (const op of ops) {
    oldBefore.push(o); newBefore.push(n);
    if (op.type !== 'insert') o++;
    if (op.type !== 'delete') n++;
  }
  return ranges.map(([s, e]) => {
    const lines: DiffLine[] = ops.slice(s, e + 1).map((op) =>
      op.type === 'equal'
        ? { content: op.content, type: 'context', oldLineNumber: op.oldIndex + 1, newLineNumber: op.newIndex + 1 }
        : op.type === 'delete'
          ? { content: op.content, type: 'removed', oldLineNumber: op.oldIndex + 1 }
          : { content: op.content, type: 'added', newLineNumber: op.newIndex + 1 },
    );
    const oldLines = lines.filter((l) => l.type !== 'added').length;
    const newLines = lines.filter((l) => l.type !== 'removed').length;
    return {
      oldStart: oldLines ? oldBefore[s] + 1 : oldBefore[s],
      oldLines,
      newStart: newLines ? newBefore[s] + 1 : newBefore[s],
      newLines,
      lines,
    };
  });
}

export function computeLineDiff(oldText: string, newText: string, options: DiffOptions = {}): DiffResult {
  if (!oldText && !newText) return { hunks: [], additions: 0, deletions: 0, totalChanges: 0 };
  const ops = myersDiff(oldText.split('\n'), newText.split('\n'), options);
  const additions = ops.filter((op) => op.type === 'insert').length;
  const deletions = ops.filter((op) => op.type === 'delete').length;
  return { hunks: buildHunks(ops, options.context ?? 3), additions, deletions, totalChanges: additions + deletions };
}
