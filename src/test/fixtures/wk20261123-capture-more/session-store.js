// Demo service for the Node heap snapshot capture guide (wk20261123-capture-more).
// Holds N sessions in a Map that never evicts, then waits. Each session has an
// email, a token and a 512-character base64 payload, so heap size scales with N.
//   node session-store.js <sessions> [mode]
// mode: wait (default; for --heapsnapshot-signal), write (v8.writeHeapSnapshot),
//       internals, numeric, inspector, leak (grow until the heap limit).
'use strict';
const v8 = require('node:v8');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { monitorEventLoopDelay } = require('node:perf_hooks');

class Session {
  constructor(i) {
    // Fields arrive as JSON, as they would from a request or a database driver,
    // so they are flat strings in the heap.
    const rec = JSON.parse(`{"email":"user${i}@example.com","token":"tok_${i.toString(36).padStart(8, '0')}_${(i * 2654435761 % 4294967296).toString(16)}"}`);
    this.id = i;
    this.email = rec.email;
    this.token = rec.token;
    this.payload = crypto.randomBytes(384).toString('base64'); // 512 distinct characters
    this.createdAt = Date.now();
  }
}

const sessions = new Map();
const n = Number(process.argv[2] || 10000);
const mode = process.argv[3] || 'wait';
for (let i = 0; i < n; i++) sessions.set(i, new Session(i));
globalThis.gc?.();
const mu = process.memoryUsage();
const MiB = 1024 * 1024;
const report = (o) => console.log(JSON.stringify(o));
const base = { node: process.version, sessions: n, heapUsedMiB: +(mu.heapUsed / MiB).toFixed(1), rssMiB: +(mu.rss / MiB).toFixed(1), maxRssBeforeMiB: +(process.resourceUsage().maxRSS / 1024).toFixed(1) };

function timed(fn) {
  const h = monitorEventLoopDelay({ resolution: 1 });
  h.enable();
  const t0 = performance.now();
  const r = fn();
  const ms = performance.now() - t0;
  h.disable();
  return { r, ms };
}

if (mode === 'write' || mode === 'internals' || mode === 'numeric') {
  const opts = mode === 'internals' ? { exposeInternals: true } : mode === 'numeric' ? { exposeNumericValues: true } : undefined;
  const { r: file, ms } = timed(() => v8.writeHeapSnapshot(undefined, opts));
  const size = fs.statSync(file).size;
  report({ ...base, mode, file, bytes: size, writeMs: Math.round(ms), maxRssAfterMiB: +(process.resourceUsage().maxRSS / 1024).toFixed(1) });
} else if (mode === 'inspector') {
  const { Session: InspectorSession } = require('node:inspector/promises');
  (async () => {
    const s = new InspectorSession();
    s.connect();
    const fd = fs.openSync('inspector.heapsnapshot', 'w');
    let chunks = 0;
    s.on('HeapProfiler.addHeapSnapshotChunk', (m) => { chunks++; fs.writeSync(fd, m.params.chunk); });
    const t0 = performance.now();
    await s.post('HeapProfiler.takeHeapSnapshot', null);
    const ms = performance.now() - t0;
    fs.closeSync(fd);
    s.disconnect();
    report({ ...base, mode, file: 'inspector.heapsnapshot', bytes: fs.statSync('inspector.heapsnapshot').size, chunks, writeMs: Math.round(ms), maxRssAfterMiB: +(process.resourceUsage().maxRSS / 1024).toFixed(1) });
  })();
} else if (mode === 'leak') {
  let i = n;
  setInterval(() => { for (let k = 0; k < Number(process.env.LEAK_PER_TICK || 2000); k++, i++) sessions.set(i, new Session(i)); }, 5);
} else {
  // wait: report, then keep the loop alive and measure how long the signal snapshot blocked it.
  report({ ...base, mode, pid: process.pid });
  let last = performance.now();
  let worst = 0;
  setInterval(() => {
    const now = performance.now();
    worst = Math.max(worst, now - last);
    last = now;
  }, 10);
  process.on('SIGTERM', () => { report({ worstLoopGapMs: Math.round(worst), maxRssAfterMiB: +(process.resourceUsage().maxRSS / 1024).toFixed(1) }); process.exit(0); });
}
