/**
 * Reads the headers of the three executable formats a developer actually
 * meets — ELF (Linux), Mach-O including universal/fat binaries (macOS),
 * and PE/COFF (Windows) — and answers the questions people open a hex
 * editor for: what format and architecture, 32 or 64 bit, executable or
 * library, which libraries it links, and the segment/section shape.
 *
 * Headers only, by design: no disassembly, no symbols. References: the
 * ELF spec (SysV gABI §4), Apple's mach-o/loader.h and fat.h, and the
 * Microsoft PE/COFF specification. Dependency-free on purpose: the CLI
 * bundles it.
 */

export type BinaryKind = 'ELF' | 'Mach-O' | 'Mach-O universal' | 'PE';

export type BinarySlice = {
  arch: string;
  bits: 32 | 64;
  endian: 'little' | 'big';
  fileType: string;
  libraries: string[];
  segments: { name: string; bytes: number }[];
  entryPoint?: string;
  interpreter?: string;
  minOsVersion?: string;
  stripped?: boolean;
};

export type BinarySummary = {
  kind: BinaryKind;
  fileBytes: number;
  slices: BinarySlice[];
};

const ELF_MACHINES: Record<number, string> = { 3: 'x86', 8: 'MIPS', 20: 'PowerPC', 40: 'ARM', 62: 'x86_64', 183: 'ARM64', 243: 'RISC-V', 21: 'PowerPC64', 22: 'S390' };
const ELF_TYPES: Record<number, string> = { 1: 'relocatable object', 2: 'executable', 3: 'shared object (or PIE executable)', 4: 'core dump' };
const MACHO_CPU: Record<number, string> = { 7: 'x86', 0x01000007: 'x86_64', 12: 'ARM', 0x0100000c: 'arm64', 0x0200000c: 'arm64e' };
const MACHO_TYPES: Record<number, string> = { 1: 'object', 2: 'executable', 6: 'dylib', 7: 'dynamic linker', 8: 'bundle', 10: 'dSYM', 11: 'kext' };
const PE_MACHINES: Record<number, string> = { 0x014c: 'x86', 0x8664: 'x86_64', 0x01c0: 'ARM', 0xaa64: 'ARM64', 0x0200: 'Itanium' };

export function inspectBinary(bytes: Uint8Array): BinarySummary {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 64) throw new Error('Too short to be an executable: no recognisable header fits in this file.');
  const m = v.getUint32(0);
  if (m === 0x7f454c46) return { kind: 'ELF', fileBytes: bytes.length, slices: [elf(bytes, v)] };
  if (m === 0xcafebabe || m === 0xcafebabf) {
    // Fat binary (big-endian header). 0xcafebabe is also the Java class
    // magic: a class file has u16 minor+major next, where major 45..70 —
    // a fat binary has an arch count there instead, always tiny.
    const count = v.getUint32(4);
    if (count > 0 && count < 30) {
      const slices: BinarySlice[] = [];
      for (let i = 0; i < count; i++) {
        const off = 8 + i * 20;
        const sliceOff = v.getUint32(off + 8);
        const sliceSize = v.getUint32(off + 12);
        slices.push(macho(bytes.subarray(sliceOff, sliceOff + sliceSize)));
      }
      return { kind: 'Mach-O universal', fileBytes: bytes.length, slices };
    }
    throw new Error('This is a Java class file (same CAFEBABE magic as a fat binary, but with a version where the arch count would be).');
  }
  if (m === 0xfeedface || m === 0xfeedfacf || m === 0xcefaedfe || m === 0xcffaedfe) {
    return { kind: 'Mach-O', fileBytes: bytes.length, slices: [macho(bytes)] };
  }
  if (bytes[0] === 0x4d && bytes[1] === 0x5a) {
    return { kind: 'PE', fileBytes: bytes.length, slices: [pe(bytes, v)] };
  }
  throw new Error('Not ELF (\\x7fELF), Mach-O (FEEDFACE/CAFEBABE) or PE (MZ): the magic matches none of them.');
}

function elf(b: Uint8Array, v: DataView): BinarySlice {
  const is64 = b[4] === 2;
  const le = b[5] === 1;
  const u16 = (o: number) => v.getUint16(o, le);
  const u32 = (o: number) => v.getUint32(o, le);
  const u64 = (o: number) => Number(v.getBigUint64(o, le));
  const type = ELF_TYPES[u16(16)] ?? `type#${u16(16)}`;
  const machine = ELF_MACHINES[u16(18)] ?? `machine#${u16(18)}`;
  const entry = is64 ? u64(24) : u32(24);
  const phoff = is64 ? u64(32) : u32(28);
  const phentsize = u16(is64 ? 54 : 42);
  const phnum = u16(is64 ? 56 : 44);
  const shoff = is64 ? u64(40) : u32(32);
  const shentsize = u16(is64 ? 58 : 46);
  const shnum = u16(is64 ? 60 : 48);
  const shstrndx = u16(is64 ? 62 : 50);

  const segments: BinarySlice['segments'] = [];
  let interpreter: string | undefined;
  let dynOff = -1;
  let dynSize = 0;
  const PT: Record<number, string> = { 1: 'LOAD', 2: 'DYNAMIC', 3: 'INTERP', 4: 'NOTE', 6: 'PHDR', 7: 'TLS', 0x6474e550: 'GNU_EH_FRAME', 0x6474e551: 'GNU_STACK', 0x6474e552: 'GNU_RELRO' };
  for (let i = 0; i < phnum; i++) {
    const o = phoff + i * phentsize;
    const type = u32(o);
    const offset = is64 ? u64(o + 8) : u32(o + 4);
    const filesz = is64 ? u64(o + 32) : u32(o + 16);
    segments.push({ name: PT[type] ?? `PT#${type.toString(16)}`, bytes: filesz });
    if (type === 3) interpreter = new TextDecoder().decode(b.subarray(offset, offset + filesz)).replace(/\0.*$/, '');
    if (type === 2) {
      dynOff = offset;
      dynSize = filesz;
    }
  }

  // DT_NEEDED entries name the libraries; strings live in DT_STRTAB. The
  // string table's virtual address must be mapped back through the LOAD
  // segments to a file offset.
  const libraries: string[] = [];
  let stripped: boolean | undefined;
  if (dynOff >= 0) {
    const needed: number[] = [];
    let strtabVaddr = -1;
    const step = is64 ? 16 : 8;
    for (let o = dynOff; o + step <= dynOff + dynSize; o += step) {
      const tag = is64 ? u64(o) : u32(o);
      const val = is64 ? u64(o + 8) : u32(o + 4);
      if (tag === 0) break;
      if (tag === 1) needed.push(val);
      if (tag === 5) strtabVaddr = val;
    }
    if (strtabVaddr >= 0) {
      let strtabOff = -1;
      for (let i = 0; i < phnum; i++) {
        const o = phoff + i * phentsize;
        if (u32(o) !== 1) continue;
        const vaddr = is64 ? u64(o + 16) : u32(o + 8);
        const offset = is64 ? u64(o + 8) : u32(o + 4);
        const filesz = is64 ? u64(o + 32) : u32(o + 16);
        if (strtabVaddr >= vaddr && strtabVaddr < vaddr + filesz) strtabOff = offset + (strtabVaddr - vaddr);
      }
      if (strtabOff >= 0) {
        for (const n of needed) {
          const end = b.indexOf(0, strtabOff + n);
          libraries.push(new TextDecoder().decode(b.subarray(strtabOff + n, end)));
        }
      }
    }
  }
  // Stripped = no .symtab section (sh_type 2).
  if (shoff && shnum) {
    stripped = true;
    for (let i = 0; i < shnum; i++) {
      if (u32(shoff + i * shentsize + 4) === 2) stripped = false;
    }
    void shstrndx;
  }

  return {
    arch: machine,
    bits: is64 ? 64 : 32,
    endian: le ? 'little' : 'big',
    fileType: type,
    libraries,
    segments,
    entryPoint: `0x${entry.toString(16)}`,
    interpreter,
    stripped,
  };
}

function macho(b: Uint8Array): BinarySlice {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  // The magic answers both questions at once: read as little-endian,
  // FEEDFACE/FEEDFACF means a little-endian 32/64-bit file; read as
  // big-endian they mean a big-endian file (PowerPC-era).
  const asLE = v.getUint32(0, true);
  const asBE = v.getUint32(0, false);
  let little: boolean;
  let is64: boolean;
  if (asLE === 0xfeedface || asLE === 0xfeedfacf) {
    little = true;
    is64 = asLE === 0xfeedfacf;
  } else if (asBE === 0xfeedface || asBE === 0xfeedfacf) {
    little = false;
    is64 = asBE === 0xfeedfacf;
  } else {
    throw new Error('Fat binary slice without a Mach-O magic: the file is corrupt.');
  }
  const u32 = (o: number) => v.getUint32(o, little);
  const cpu = u32(4);
  // arm64e is arm64 (cputype 0x0100000c) with cpusubtype 2, the way
  // `file` reports it; the pointer-authentication ABI matters to people.
  const subtype = u32(8) & 0x00ffffff;
  const fileType = MACHO_TYPES[u32(12)] ?? `type#${u32(12)}`;
  const ncmds = u32(16);
  const headerSize = is64 ? 32 : 28;
  const libraries: string[] = [];
  const segments: BinarySlice['segments'] = [];
  let minOs: string | undefined;
  let entry: string | undefined;
  let o = headerSize;
  for (let i = 0; i < ncmds; i++) {
    const cmd = u32(o);
    const cmdsize = u32(o + 4);
    const plain = cmd & 0x7fffffff;
    if (plain === 0x0c || plain === 0x18 || plain === 0x1f) {
      // LC_LOAD_DYLIB / LC_LOAD_WEAK_DYLIB / LC_REEXPORT_DYLIB
      const nameOff = u32(o + 8);
      const end = b.indexOf(0, o + nameOff);
      libraries.push(new TextDecoder().decode(b.subarray(o + nameOff, end)));
    } else if (plain === 0x19 || plain === 0x01) {
      // LC_SEGMENT_64 / LC_SEGMENT
      const name = new TextDecoder().decode(b.subarray(o + 8, o + 24)).replace(/\0+$/, '');
      const filesize = is64 ? Number(v.getBigUint64(o + 48, little)) : u32(o + 36);
      segments.push({ name, bytes: filesize });
    } else if (plain === 0x32) {
      // LC_BUILD_VERSION: platform u32, minos u32 (xxxx.yy.zz nibbles)
      const minos = u32(o + 12);
      minOs = `${minos >> 16}.${(minos >> 8) & 0xff}.${minos & 0xff}`;
    } else if (plain === 0x28) {
      // LC_MAIN
      entry = `0x${Number(v.getBigUint64(o + 8, little)).toString(16)}`;
    }
    o += cmdsize;
  }
  return {
    arch: cpu === 0x0100000c && subtype === 2 ? 'arm64e' : MACHO_CPU[cpu] ?? `cpu#${cpu.toString(16)}`,
    bits: is64 ? 64 : 32,
    endian: little ? 'little' : 'big',
    fileType,
    libraries,
    segments,
    entryPoint: entry,
    minOsVersion: minOs,
  };
}

function pe(b: Uint8Array, v: DataView): BinarySlice {
  const peOff = v.getUint32(0x3c, true);
  if (peOff + 24 > b.length || v.getUint32(peOff, true) !== 0x00004550) {
    throw new Error('MZ header found but no PE signature: a DOS-era executable or a corrupt file.');
  }
  const machine = v.getUint16(peOff + 4, true);
  const numSections = v.getUint16(peOff + 6, true);
  const characteristics = v.getUint16(peOff + 22, true);
  const optSize = v.getUint16(peOff + 20, true);
  const opt = peOff + 24;
  const magic = v.getUint16(opt, true);
  const is64 = magic === 0x20b;
  const entry = v.getUint32(opt + 16, true);
  const subsystemOff = opt + (is64 ? 68 : 68);
  const subsystem = optSize >= 70 ? v.getUint16(subsystemOff, true) : 0;
  const SUBSYS: Record<number, string> = { 2: 'GUI', 3: 'console', 10: 'EFI application' };
  const dll = (characteristics & 0x2000) !== 0;

  const segments: BinarySlice['segments'] = [];
  const secTable = opt + optSize;
  for (let i = 0; i < numSections; i++) {
    const so = secTable + i * 40;
    const name = new TextDecoder().decode(b.subarray(so, so + 8)).replace(/\0+$/, '');
    segments.push({ name, bytes: v.getUint32(so + 16, true) });
  }

  // Imported DLLs via the import directory (optional header data dir #1).
  const libraries: string[] = [];
  const ddOff = opt + (is64 ? 112 : 96) + 8; // second entry: import table RVA
  if (optSize > (is64 ? 120 : 104)) {
    const importRva = v.getUint32(ddOff, true);
    if (importRva) {
      const toOff = (rva: number): number => {
        for (let i = 0; i < numSections; i++) {
          const so = secTable + i * 40;
          const va = v.getUint32(so + 12, true);
          const sz = v.getUint32(so + 8, true);
          if (rva >= va && rva < va + sz) return v.getUint32(so + 20, true) + (rva - va);
        }
        return -1;
      };
      let d = toOff(importRva);
      while (d >= 0 && d + 20 <= b.length) {
        const nameRva = v.getUint32(d + 12, true);
        if (!nameRva) break;
        const no = toOff(nameRva);
        if (no < 0) break;
        const end = b.indexOf(0, no);
        libraries.push(new TextDecoder().decode(b.subarray(no, end)));
        d += 20;
      }
    }
  }

  return {
    arch: PE_MACHINES[machine] ?? `machine#${machine.toString(16)}`,
    bits: is64 ? 64 : 32,
    endian: 'little',
    fileType: dll ? 'DLL' : `executable${SUBSYS[subsystem] ? ` (${SUBSYS[subsystem]})` : ''}`,
    libraries,
    segments,
    entryPoint: `0x${entry.toString(16)}`,
  };
}

const iec = (n: number): string => {
  if (n < 1024) return `${n} B`;
  const units = ['KiB', 'MiB', 'GiB'];
  let x = n;
  let u = -1;
  do { x /= 1024; u += 1; } while (x >= 1024 && u < units.length - 1);
  return `${x >= 100 ? Math.round(x) : x.toFixed(1)} ${units[u]}`;
};

export function renderBinarySummary(s: BinarySummary): string {
  const lines = [`${s.kind}  ·  ${iec(s.fileBytes)}${s.slices.length > 1 ? `  ·  ${s.slices.length} architectures` : ''}`];
  for (const sl of s.slices) {
    lines.push('', `${sl.arch}  ·  ${sl.bits}-bit ${sl.endian}-endian  ·  ${sl.fileType}${sl.minOsVersion ? `  ·  min OS ${sl.minOsVersion}` : ''}${sl.stripped !== undefined ? sl.stripped ? '  ·  stripped' : '  ·  has symbols' : ''}`);
    if (sl.interpreter) lines.push(`  interpreter: ${sl.interpreter}`);
    if (sl.entryPoint) lines.push(`  entry: ${sl.entryPoint}`);
    if (sl.libraries.length) {
      lines.push(`  links ${sl.libraries.length} librar${sl.libraries.length === 1 ? 'y' : 'ies'}:`);
      for (const l of sl.libraries.slice(0, 12)) lines.push(`    ${l}`);
      if (sl.libraries.length > 12) lines.push(`    … and ${sl.libraries.length - 12} more`);
    }
    const segs = sl.segments.filter((x) => x.bytes > 0).sort((a, b) => b.bytes - a.bytes).slice(0, 8);
    if (segs.length) {
      lines.push('  segments:');
      for (const seg of segs) lines.push(`    ${iec(seg.bytes).padStart(9)}  ${seg.name}`);
    }
  }
  return lines.join('\n');
}
