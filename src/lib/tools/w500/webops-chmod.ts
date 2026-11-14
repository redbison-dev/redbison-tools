/**
 * Unix permission maths: octal <-> symbolic <-> bits, special bits (setuid,
 * setgid, sticky), symbolic chmod expressions ("u+x,go-w", "a=rX") as defined
 * by POSIX chmod and GNU coreutils, ls -l strings and umask defaults.
 */
import { msg } from '../../msg';

export type Who = 'u' | 'g' | 'o';
export type Perm = 'r' | 'w' | 'x';

export const SETUID = 0o4000;
export const SETGID = 0o2000;
export const STICKY = 0o1000;

const SHIFT: Record<Who, number> = { u: 6, g: 3, o: 0 };
const BIT: Record<Perm, number> = { r: 4, w: 2, x: 1 };

export function hasBit(mode: number, who: Who, p: Perm): boolean {
  return (mode & (BIT[p] << SHIFT[who])) !== 0;
}

export function setBit(mode: number, who: Who, p: Perm, on: boolean): number {
  const b = BIT[p] << SHIFT[who];
  return on ? mode | b : mode & ~b;
}

/** "755", "0755", "4755", "0o755" -> number. Throws on anything else. */
export function parseOctal(input: string): number {
  const s = input.trim().replace(/^0o/i, '');
  if (!/^[0-7]{1,4}$/.test(s)) throw new Error('Enter 1 to 4 octal digits (0-7), for example 755 or 4755.');
  return parseInt(s, 8);
}

/** Three digits, or four when a special bit is set (or `always4`). */
export function toOctal(mode: number, always4 = false): string {
  const special = (mode >> 9) & 7;
  const base = (mode & 0o777).toString(8).padStart(3, '0');
  return special || always4 ? `${special}${base}` : base;
}

/** rwxr-xr-x with s/S, t/T for special bits. */
export function toSymbolic(mode: number): string {
  const tri = (who: Who, special: boolean, ch: 's' | 't') => {
    const r = hasBit(mode, who, 'r') ? 'r' : '-';
    const w = hasBit(mode, who, 'w') ? 'w' : '-';
    const x = hasBit(mode, who, 'x');
    const xc = special ? (x ? ch : ch.toUpperCase()) : x ? 'x' : '-';
    return r + w + xc;
  };
  return tri('u', !!(mode & SETUID), 's') + tri('g', !!(mode & SETGID), 's') + tri('o', !!(mode & STICKY), 't');
}

export type FileType = '-' | 'd' | 'l' | 'c' | 'b' | 'p' | 's';

/** Parse "rwxr-xr-x" or an ls -l string such as "-rwsr-xr-x." / "drwxrwxrwt@". */
export function parseSymbolic(input: string): { mode: number; type?: FileType } {
  let s = input.trim().split(/\s+/)[0];
  let type: FileType | undefined;
  if (s.length >= 10 && /^[-dlcbps]/.test(s)) {
    type = s[0] as FileType;
    s = s.slice(1);
  }
  s = s.slice(0, 9);
  if (!/^[r-][w-][xsS-][r-][w-][xsS-][r-][w-][xtT-]$/.test(s)) throw new Error('Expected nine characters like rwxr-xr-x (optionally with a leading file type such as -, d or l).');
  let mode = 0;
  const whos: Who[] = ['u', 'g', 'o'];
  whos.forEach((who, k) => {
    const t = s.slice(k * 3, k * 3 + 3);
    if (t[0] === 'r') mode = setBit(mode, who, 'r', true);
    if (t[1] === 'w') mode = setBit(mode, who, 'w', true);
    if ('xst'.includes(t[2])) mode = setBit(mode, who, 'x', true);
    if ('sS'.includes(t[2])) mode |= who === 'u' ? SETUID : SETGID;
    if ('tT'.includes(t[2])) mode |= STICKY;
  });
  return { mode, type };
}

/**
 * Apply a symbolic mode such as "u+x", "go-w", "a=rX", "u=rw,g=r,o=", "g+s",
 * "o=u" or "+t" to a starting mode, the way chmod(1) does.
 * When no who is given, the change applies to all but bits set in `umask`
 * are left alone (POSIX). X adds execute only for directories or when some
 * execute bit is already set.
 */
export function applySymbolic(start: number, expr: string, opts: { isDir?: boolean; umask?: number } = {}): number {
  const umask = opts.umask ?? 0o022;
  let mode = start & 0o7777;
  const clauses = expr.trim().split(',');
  if (!expr.trim()) throw new Error('Enter a symbolic mode such as u+x or go-w.');
  for (const clause of clauses) {
    const m = clause.match(/^([ugoa]*)((?:[-+=](?:[ugo](?![rwxXst])|[rwxXst]*))+)$/);
    if (!m) throw new Error(`"${clause}" is not a valid symbolic mode. Use [ugoa][+-=][rwxXst], for example u+x.`);
    const whoStr = m[1];
    const whoAll = !whoStr || whoStr.includes('a');
    const whos: Who[] = whoAll ? ['u', 'g', 'o'] : (['u', 'g', 'o'] as Who[]).filter((w) => whoStr.includes(w));
    const ops = m[2].match(/[-+=](?:[ugo](?![rwxXst])|[rwxXst]*)/g) ?? [];
    for (const op of ops) {
      const action = op[0];
      const permStr = op.slice(1);
      // Build the bit mask this op talks about.
      let bits = 0;
      if (/^[ugo]$/.test(permStr)) {
        const src = permStr as Who;
        const v = (mode >> SHIFT[src]) & 7;
        for (const w of whos) bits |= v << SHIFT[w];
      } else {
        const anyX = (mode & 0o111) !== 0;
        for (const ch of permStr) {
          for (const w of whos) {
            if (ch === 'r' || ch === 'w' || ch === 'x') bits |= BIT[ch] << SHIFT[w];
            if (ch === 'X' && (opts.isDir || anyX)) bits |= 1 << SHIFT[w];
          }
          if (ch === 's') {
            if (whos.includes('u')) bits |= SETUID;
            if (whos.includes('g')) bits |= SETGID;
          }
          if (ch === 't' && (whoAll || whos.includes('o'))) bits |= STICKY;
        }
      }
      const masked = !whoStr ? bits & ~(umask & 0o777) : bits;
      if (action === '+') mode |= masked;
      else if (action === '-') mode &= ~masked;
      else {
        // "=" clears the permission bits of the named classes, then sets.
        let clear = 0;
        for (const w of whos) clear |= 7 << SHIFT[w];
        if (whos.includes('u')) clear |= SETUID;
        if (whos.includes('g')) clear |= SETGID;
        if (whoAll || whos.includes('o')) clear |= STICKY;
        if (!whoStr) clear &= ~(umask & 0o777);
        // GNU chmod keeps setuid/setgid on directories unless named explicitly.
        if (opts.isDir) clear &= ~(SETUID | SETGID) | (bits & (SETUID | SETGID));
        mode = (mode & ~clear) | masked;
      }
    }
  }
  return mode;
}

/** Default permissions for new files and directories under a umask. */
export function umaskDefaults(umask: number): { file: number; dir: number } {
  return { file: 0o666 & ~umask, dir: 0o777 & ~umask };
}

export function describeMode(mode: number): string[] {
  return describeModeMsg(mode).map((d) => (d.perms === undefined ? d.text : d.text.replace('{perms}', d.perms)));
}

/** The access a class digit (r 4, w 2, x 1) gives, as describeMode words it. */
const PERM_TEXT = [
  msg('no access'), msg('execute'), msg('write'), msg('write, execute'),
  msg('read'), msg('read, execute'), msg('read, write'), msg('read, write, execute'),
];

/** describeMode as interface messages: `text` with an optional {perms} filled by `perms` (itself a message). */
export function describeModeMsg(mode: number): { text: string; perms?: string }[] {
  const names: Record<Who, string> = { u: msg('Owner: {perms}'), g: msg('Group: {perms}'), o: msg('Others: {perms}') };
  const out: { text: string; perms?: string }[] = [];
  for (const w of ['u', 'g', 'o'] as Who[]) {
    const digit = (hasBit(mode, w, 'r') ? 4 : 0) + (hasBit(mode, w, 'w') ? 2 : 0) + (hasBit(mode, w, 'x') ? 1 : 0);
    out.push({ text: names[w], perms: PERM_TEXT[digit] });
  }
  if (mode & SETUID) out.push({ text: msg("Setuid: runs as the file's owner.") });
  if (mode & SETGID) out.push({ text: msg("Setgid: runs as the file's group; on a directory, new files inherit the directory's group.") });
  if (mode & STICKY) out.push({ text: msg("Sticky: in a directory, only a file's owner (or root) can delete or rename it.") });
  return out;
}

/** Plain-English warnings for risky modes. */
export function modeWarnings(mode: number, isDir = false): string[] {
  const w: string[] = [];
  if (mode & 0o002) w.push(isDir && mode & STICKY ? msg('World-writable directory with the sticky bit (like /tmp): users can only delete their own files.') : msg('World-writable: any user on the system can change this. Avoid on anything but shared scratch directories.'));
  if (mode & SETUID && !(mode & 0o100)) w.push(msg('Setuid without owner execute shows as "S" and has no effect.'));
  if (mode & SETGID && !(mode & 0o010) && !isDir) w.push(msg('Setgid without group execute shows as "S"; on Linux this marks mandatory locking on old kernels and otherwise does nothing.'));
  if (mode & SETUID && mode & 0o022) w.push(msg('Setuid together with group or world write is dangerous: someone else could replace the program that runs as the owner.'));
  if (mode & STICKY && !isDir) w.push(msg('The sticky bit on a regular file is ignored by Linux.'));
  if (isDir && (mode & 0o444) && !(mode & 0o111)) w.push(msg('A directory with read but no execute lets people list names but not open anything inside.'));
  if (!(mode & 0o400)) w.push(msg('The owner cannot read this. Even the owner will need chmod to fix it.'));
  return w;
}

export type ChmodConversion = {
  octal: string;
  symbolic: string;
  ls: string;
  description: string[];
  warnings: string[];
  command: string;
};

/** Convert from octal ("755"), symbolic ("rwxr-xr-x", "-rwxr-xr-x") or a chmod expression applied to `start`. */
export function convertChmod(input: string, opts: { isDir?: boolean; start?: string; umask?: string; path?: string } = {}): ChmodConversion {
  const s = input.trim();
  let mode: number;
  if (/^(0o)?[0-7]{1,4}$/i.test(s)) mode = parseOctal(s);
  else if (/^[-dlcbps]?[r-][w-]/.test(s) && s.replace(/[.@+]$/, '').length >= 9) mode = parseSymbolic(s.replace(/[.@+]$/, '')).mode;
  else mode = applySymbolic(parseOctal(opts.start ?? (opts.isDir ? '755' : '644')), s, { isDir: opts.isDir, umask: opts.umask ? parseOctal(opts.umask) : undefined });
  const path = opts.path?.trim() || (opts.isDir ? 'directory' : 'file');
  return {
    octal: toOctal(mode),
    symbolic: toSymbolic(mode),
    ls: (opts.isDir ? 'd' : '-') + toSymbolic(mode),
    description: describeMode(mode),
    warnings: modeWarnings(mode, opts.isDir),
    command: `chmod ${toOctal(mode)} ${path}`,
  };
}

export const COMMON_MODES: { octal: string; use: string }[] = [
  { octal: '644', use: msg('Regular files: owner edits, everyone reads (web pages, configs).') },
  { octal: '755', use: msg('Directories and scripts/programs everyone may run.') },
  { octal: '600', use: msg('Private files: SSH private keys, .env, credentials.') },
  { octal: '700', use: msg('Private directories such as ~/.ssh.') },
  { octal: '640', use: msg('Files the owner edits and one group reads (logs, app configs).') },
  { octal: '750', use: msg('Directories for the owner and one group only.') },
  { octal: '775', use: msg('Shared project directories where the group also writes.') },
  { octal: '664', use: msg('Shared files the group can edit.') },
  { octal: '400', use: msg('Read-only for the owner, such as AWS .pem keys.') },
  { octal: '1777', use: msg('Shared scratch directories like /tmp (sticky bit).') },
  { octal: '2775', use: msg('Team directories where new files keep the group (setgid).') },
  { octal: '4755', use: msg('Setuid programs such as /usr/bin/passwd.') },
];

/** The symbolic chmod argument that sets exactly this mode, e.g. 4755 -> "u=rwxs,g=rx,o=rx". */
export function toSymbolicArg(mode: number): string {
  const sym = toSymbolic(mode);
  return (['u', 'g', 'o'] as Who[])
    .map((w, k) => {
      const t = sym.slice(k * 3, k * 3 + 3);
      let s = (t[0] === 'r' ? 'r' : '') + (t[1] === 'w' ? 'w' : '');
      if ('xst'.includes(t[2])) s += 'x';
      if ('sS'.includes(t[2])) s += 's';
      if ('tT'.includes(t[2])) s += 't';
      return `${w}=${s}`;
    })
    .join(',');
}
