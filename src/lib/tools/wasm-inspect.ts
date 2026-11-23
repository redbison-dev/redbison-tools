/**
 * Inspects a WebAssembly module (.wasm): sections with sizes, imports and
 * exports by kind, function/memory/table/global counts, start function,
 * and the names custom section when present. Reads the binary format from
 * the WebAssembly Core Specification (magic \0asm, LEB128 sizes, section
 * ids 0-12); component-model binaries (layer 1) are recognised and named
 * rather than mis-read as core modules.
 *
 * Dependency-free on purpose: the CLI bundles it.
 */

export type WasmImport = { module: string; name: string; kind: string };
export type WasmExport = { name: string; kind: string };

export type WasmSummary = {
  version: number;
  fileBytes: number;
  sections: { name: string; bytes: number }[];
  functionCount: number;
  importCount: number;
  exportCount: number;
  imports: WasmImport[];
  exports: WasmExport[];
  memories: { initialPages: number; maxPages?: number; bytesMin: number }[];
  tables: number;
  globals: number;
  hasStart: boolean;
  customSections: string[];
  moduleName?: string;
};

const SECTIONS = ['custom', 'type', 'import', 'function', 'table', 'memory', 'global', 'export', 'start', 'element', 'code', 'data', 'data count'];
const KINDS = ['function', 'table', 'memory', 'global'];

class R {
  pos = 0;
  constructor(readonly b: Uint8Array) {}
  u8(): number {
    if (this.pos >= this.b.length) throw new Error('Truncated WebAssembly module.');
    return this.b[this.pos++];
  }
  leb(): number {
    let v = 0;
    let shift = 0;
    for (;;) {
      const byte = this.u8();
      v |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) return v >>> 0;
      shift += 7;
      if (shift > 35) throw new Error('LEB128 length too long.');
    }
  }
  name(): string {
    const n = this.leb();
    const s = new TextDecoder().decode(this.b.subarray(this.pos, this.pos + n));
    this.pos += n;
    return s;
  }
}

export function inspectWasm(bytes: Uint8Array): WasmSummary {
  if (bytes.length < 8 || bytes[0] !== 0 || bytes[1] !== 0x61 || bytes[2] !== 0x73 || bytes[3] !== 0x6d) {
    throw new Error('Not a WebAssembly module: the \\0asm magic is missing.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint32(4, true);
  if ((version & 0xffff0000) !== 0) {
    throw new Error('A component-model binary (layer ≠ 0), not a core module; this reads core modules.');
  }

  const s: WasmSummary = {
    version,
    fileBytes: bytes.length,
    sections: [],
    functionCount: 0,
    importCount: 0,
    exportCount: 0,
    imports: [],
    exports: [],
    memories: [],
    tables: 0,
    globals: 0,
    hasStart: false,
    customSections: [],
  };

  const r = new R(bytes);
  r.pos = 8;
  while (r.pos < bytes.length) {
    const id = r.u8();
    const size = r.leb();
    const end = r.pos + size;
    if (end > bytes.length) throw new Error(`Section ${SECTIONS[id] ?? id} of ${size} bytes runs past the end: truncated module.`);
    const name = SECTIONS[id] ?? `section#${id}`;
    const body = new R(bytes.subarray(r.pos, end));
    if (id === 0) {
      const cname = body.name();
      s.customSections.push(cname);
      s.sections.push({ name: `custom "${cname}"`, bytes: size });
      if (cname === 'name') {
        // name section: subsections; 0 = module name
        while (body.pos < body.b.length) {
          const sub = body.u8();
          const subLen = body.leb();
          if (sub === 0) {
            s.moduleName = body.name();
            break;
          }
          body.pos += subLen;
        }
      }
    } else {
      s.sections.push({ name, bytes: size });
      if (id === 2) {
        const n = body.leb();
        s.importCount = n;
        for (let i = 0; i < n; i++) {
          const module = body.name();
          const field = body.name();
          const kind = body.u8();
          s.imports.push({ module, name: field, kind: KINDS[kind] ?? `kind#${kind}` });
          // skip the type description
          if (kind === 0) body.leb();
          else if (kind === 1) { body.u8(); skipLimits(body); }
          else if (kind === 2) skipLimits(body);
          else if (kind === 3) { body.u8(); body.u8(); }
        }
      } else if (id === 3) {
        s.functionCount = body.leb();
      } else if (id === 4) {
        s.tables = body.leb();
      } else if (id === 5) {
        const n = body.leb();
        for (let i = 0; i < n; i++) {
          const flags = body.u8();
          const initial = body.leb();
          const max = flags & 1 ? body.leb() : undefined;
          s.memories.push({ initialPages: initial, maxPages: max, bytesMin: initial * 65536 });
        }
      } else if (id === 6) {
        s.globals = body.leb();
      } else if (id === 7) {
        const n = body.leb();
        s.exportCount = n;
        for (let i = 0; i < n; i++) {
          const field = body.name();
          const kind = body.u8();
          body.leb();
          s.exports.push({ name: field, kind: KINDS[kind] ?? `kind#${kind}` });
        }
      } else if (id === 8) {
        s.hasStart = true;
      }
    }
    r.pos = end;
  }
  return s;
}

function skipLimits(r: R): void {
  const flags = r.u8();
  r.leb();
  if (flags & 1) r.leb();
}

const iec = (n: number): string => {
  if (n < 1024) return `${n} B`;
  const units = ['KiB', 'MiB', 'GiB'];
  let v = n;
  let u = -1;
  do { v /= 1024; u += 1; } while (v >= 1024 && u < units.length - 1);
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[u]}`;
};

export function renderWasmSummary(s: WasmSummary): string {
  const lines = [
    `WebAssembly v${s.version}  ·  ${iec(s.fileBytes)}${s.moduleName ? `  ·  module "${s.moduleName}"` : ''}`,
    `${s.functionCount + s.imports.filter((i) => i.kind === 'function').length} functions (${s.importCount} imported)  ·  ${s.exportCount} exports  ·  ${s.tables} tables  ·  ${s.globals} globals${s.hasStart ? '  ·  has start' : ''}`,
  ];
  for (const m of s.memories) {
    lines.push(`memory: ${m.initialPages} pages (${iec(m.bytesMin)})${m.maxPages !== undefined ? ` up to ${m.maxPages} pages (${iec(m.maxPages * 65536)})` : ', no maximum'}`);
  }
  lines.push('', 'sections');
  for (const sec of [...s.sections].sort((a, b) => b.bytes - a.bytes)) lines.push(`  ${iec(sec.bytes).padStart(9)}  ${sec.name}`);
  if (s.imports.length) {
    lines.push('', `imports (${s.imports.length})`);
    const byModule = new Map<string, number>();
    for (const i of s.imports) byModule.set(i.module, (byModule.get(i.module) ?? 0) + 1);
    for (const [m, n] of byModule) lines.push(`  ${m}: ${n}`);
    for (const i of s.imports.slice(0, 10)) lines.push(`    ${i.kind.padEnd(8)}  ${i.module}.${i.name}`);
  }
  if (s.exports.length) {
    lines.push('', `exports (${s.exports.length})`);
    for (const e of s.exports.slice(0, 15)) lines.push(`  ${e.kind.padEnd(8)}  ${e.name}`);
  }
  return lines.join('\n');
}
