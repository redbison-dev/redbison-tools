import React, { useMemo, useState } from 'react';
import { Lock, Grid3x3, Wand2, ShieldHalf } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { WebPage, WebHeader, Panel, Segmented, Chip, CopyButton, CodeOut, ErrorNote, Stat, LocalNote, useWebAnalytics } from './webopsShared';
import {
  hasBit,
  setBit,
  toOctal,
  toSymbolic,
  parseOctal,
  parseSymbolic,
  applySymbolic,
  describeModeMsg,
  modeWarnings,
  umaskDefaults,
  toSymbolicArg,
  COMMON_MODES,
  SETUID,
  SETGID,
  STICKY,
  type Who,
  type Perm,
} from '@/lib/tools/w500/webops-chmod';
import CalculationSteps from '@/components/tools/shared/CalculationSteps';
import { REPORT_FORMULAS } from '@/lib/report/attrs';
import { chmodSteps } from '@/lib/tools/steps/s8';
import { msg, useT } from '@/i18n';

const WHO: { id: Who; label: string }[] = [
  { id: 'u', label: msg('Owner') },
  { id: 'g', label: msg('Group') },
  { id: 'o', label: msg('Others') },
];
const PERMS: { id: Perm; label: string }[] = [
  { id: 'r', label: msg('Read') },
  { id: 'w', label: msg('Write') },
  { id: 'x', label: msg('Execute') },
];
const SPECIAL_BITS: [number, string][] = [
  [SETUID, msg('Setuid (4)')],
  [SETGID, msg('Setgid (2)')],
  [STICKY, msg('Sticky (1)')],
];

export default function ChmodCalculator() {
  const { t, tr } = useT();
  const track = useWebAnalytics('chmod-calculator');
  const [mode, setMode] = useState(0o755);
  const [kind, setKind] = useState('file');
  const [octIn, setOctIn] = useState('755');
  const [symIn, setSymIn] = useState('rwxr-xr-x');
  const [inErr, setInErr] = useState<string | null>(null);
  const [path, setPath] = useState('deploy.sh');
  const [expr, setExpr] = useState('go-w,u+x');
  const [umask, setUmask] = useState('022');
  const isDir = kind === 'dir';

  const update = (m: number) => {
    setMode(m);
    setOctIn(toOctal(m));
    setSymIn(toSymbolic(m));
    setInErr(null);
  };

  const exprResult = useMemo(() => {
    try {
      const um = parseOctal(umask);
      return { mode: applySymbolic(mode, expr, { isDir, umask: um }), error: null as string | null };
    } catch (e) {
      return { mode: null, error: (e as Error).message };
    }
  }, [mode, expr, isDir, umask]);

  const um = useMemo(() => {
    try {
      return umaskDefaults(parseOctal(umask));
    } catch {
      return null;
    }
  }, [umask]);

  const quotedPath = /^[A-Za-z0-9_./-]+$/.test(path.trim()) ? path.trim() : `'${path.trim().replace(/'/g, `'\\''`)}'`;
  const command = `chmod ${toOctal(mode)} ${quotedPath || (isDir ? 'dir' : 'file')}`;
  const warnings = modeWarnings(mode, isDir);
  const steps = useMemo(() => chmodSteps(mode, isDir), [mode, isDir]);

  return (
    <WebPage>
      <WebHeader h1={t('Chmod Calculator')} icon={Lock} tagline={t('Tick permissions or type 755, rwxr-xr-x or u+x to convert between octal, symbolic and ls -l notation, with setuid, setgid, sticky bits and umask defaults explained.')} />
      <div className="grid gap-6 lg:grid-cols-2 mt-6">
        <div className="space-y-4 min-w-0">
          <Panel title={t('Permissions')} icon={Grid3x3}>
            <Segmented label={t('Applies to')} value={kind} onChange={setKind} options={[{ value: 'file', label: t('File') }, { value: 'dir', label: t('Directory') }]} />
            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm">
                <thead>
                  <tr className="text-left text-gray-600 dark:text-gray-300">
                    <th className="py-1 pr-1 sm:pr-2 font-medium">{t('Who')}</th>
                    {PERMS.map((p) => (
                      <th key={p.id} className="py-1 px-1 sm:px-2 font-medium text-center">
                        {t(p.label)}
                      </th>
                    ))}
                    <th className="py-1 pl-1 sm:pl-2 font-medium text-center">{t('Digit')}</th>
                  </tr>
                </thead>
                <tbody>
                  {WHO.map((w) => (
                    <tr key={w.id} className="border-t border-gray-200 dark:border-gray-700">
                      <td className="py-2 pr-1 sm:pr-2 text-black dark:text-white">{t(w.label)}</td>
                      {PERMS.map((p) => (
                        <td key={p.id} className="py-2 px-1 sm:px-2 text-center">
                          <Checkbox
                            aria-label={t('{who} {permission}', { who: t(w.label), permission: t(p.label) })}
                            checked={hasBit(mode, w.id, p.id)}
                            onCheckedChange={(c) => {
                              update(setBit(mode, w.id, p.id, c === true));
                              track('toggle_bit');
                            }}
                          />
                        </td>
                      ))}
                      <td className="py-2 pl-1 sm:pl-2 text-center font-mono font-bold text-black dark:text-white">{(mode >> (w.id === 'u' ? 6 : w.id === 'g' ? 3 : 0)) & 7}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              {SPECIAL_BITS.map(([bit, label]) => (
                <label key={label} className="flex items-center gap-2 text-gray-700 dark:text-gray-200">
                  <Checkbox checked={(mode & bit) !== 0} onCheckedChange={(c) => update(c === true ? mode | bit : mode & ~bit)} aria-label={t(label)} />
                  {t(label)}
                </label>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="oct" className="text-sm font-medium text-black dark:text-white">
                  {t('Octal')}
                </Label>
                <Input
                  id="oct"
                  value={octIn}
                  inputMode="numeric"
                  onChange={(e) => {
                    setOctIn(e.target.value);
                    try {
                      const m = parseOctal(e.target.value);
                      setMode(m);
                      setSymIn(toSymbolic(m));
                      setInErr(null);
                    } catch (er) {
                      setInErr((er as Error).message);
                    }
                  }}
                  className="mt-1 font-mono bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600"
                />
              </div>
              <div>
                <Label htmlFor="sym" className="text-sm font-medium text-black dark:text-white">
                  {t('Symbolic or ls -l')}
                </Label>
                <Input
                  id="sym"
                  value={symIn}
                  onChange={(e) => {
                    setSymIn(e.target.value);
                    try {
                      const r = parseSymbolic(e.target.value.replace(/[.@+]$/, ''));
                      setMode(r.mode);
                      setOctIn(toOctal(r.mode));
                      if (r.type === 'd') setKind('dir');
                      else if (r.type === '-') setKind('file');
                      setInErr(null);
                    } catch (er) {
                      setInErr((er as Error).message);
                    }
                  }}
                  className="mt-1 font-mono bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600"
                />
              </div>
            </div>
            {inErr && <ErrorNote>{inErr}</ErrorNote>}
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t('Common modes')}</p>
              <div className="flex flex-wrap gap-1.5">
                {COMMON_MODES.map((c) => (
                  <Chip key={c.octal} active={toOctal(mode) === c.octal} title={t(c.use)} onClick={() => update(parseOctal(c.octal))}>
                    {c.octal}
                  </Chip>
                ))}
              </div>
            </div>
          </Panel>
          <Panel title={t('Apply a symbolic change')} icon={Wand2}>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {tr('Starts from the current mode {mode}, the way chmod does.', { mode: <span className="font-mono">{toOctal(mode)}</span> })}
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Label htmlFor="expr" className="text-sm font-medium text-black dark:text-white">
                  {t('Expression')}
                </Label>
                <Input id="expr" value={expr} onChange={(e) => setExpr(e.target.value)} placeholder={t('u+x, go-w, a=rX')} className="mt-1 font-mono bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600" />
              </div>
              <div>
                <Label htmlFor="umask" className="text-sm font-medium text-black dark:text-white">
                  {t('umask')}
                </Label>
                <Input id="umask" value={umask} onChange={(e) => setUmask(e.target.value)} className="mt-1 font-mono bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600" />
              </div>
            </div>
            {exprResult.error ? (
              <ErrorNote>{exprResult.error}</ErrorNote>
            ) : (
              exprResult.mode !== null && (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-lg text-black dark:text-white" data-testid="expr-result">
                    {toOctal(mode)} → {toOctal(exprResult.mode)} ({toSymbolic(exprResult.mode)})
                  </span>
                  <button type="button" className="text-sm text-blue-700 dark:text-blue-300 underline" onClick={() => update(exprResult.mode!)}>
                    {t('Use this')}
                  </button>
                </div>
              )
            )}
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('The umask only matters when you leave out u, g, o or a: then bits set in the umask are not changed (POSIX). X adds execute only to directories or files that already have an execute bit.')}</p>
            {um && (
              <p className="text-sm text-gray-700 dark:text-gray-200">
                {t('With umask {value}, new files are created {value2} ({value3}) and new directories {value4} ({value5}).', { value: umask.trim(), value2: toOctal(um.file), value3: toSymbolic(um.file), value4: toOctal(um.dir), value5: toSymbolic(um.dir) })}
              </p>
            )}
          </Panel>
        </div>
        <div className="space-y-4 min-w-0">
          <Panel title={t('Result')} icon={ShieldHalf}>
            <div className="grid grid-cols-2 gap-2">
              <Stat label={t('Octal')} value={toOctal(mode)} tone="accent" />
              <Stat label={t('Symbolic')} value={toSymbolic(mode)} />
              <Stat label={t('ls -l')} value={(isDir ? 'd' : '-') + toSymbolic(mode)} />
              <Stat label={t('Four-digit')} value={toOctal(mode, true)} />
            </div>
            <ul className="text-sm text-gray-700 dark:text-gray-200 space-y-0.5" data-testid="chmod-description">
              {describeModeMsg(mode).map((d) => (
                <li key={d.text}>{t(d.text, d.perms === undefined ? undefined : { perms: t(d.perms) })}</li>
              ))}
            </ul>
            {warnings.map((w) => (
              <ErrorNote key={w}>{t(w)}</ErrorNote>
            ))}
            <CalculationSteps steps={steps} />
            <div className="text-sm text-gray-700 dark:text-gray-200">
              <p className="font-medium text-black dark:text-white">{t('Formulas used')}</p>
              <ul {...REPORT_FORMULAS} className="mt-1 list-disc pl-5 space-y-0.5">
                <li>{t('Each class digit (owner, group, others) = read 4 + write 2 + execute 1 for the bits that are set')}</li>
                <li>{t('Special digit = setuid 4 + setgid 2 + sticky 1, written first when not 0 (POSIX chmod)')}</li>
                <li>{t('umask defaults: new file = 666 AND NOT umask, new directory = 777 AND NOT umask')}</li>
              </ul>
            </div>
            <div>
              <Label htmlFor="path" className="text-sm font-medium text-black dark:text-white">
                {t('File or directory name')}
              </Label>
              <Input id="path" value={path} onChange={(e) => setPath(e.target.value)} className="mt-1 font-mono bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600" />
            </div>
            <CodeOut value={[command, `chmod ${toSymbolicArg(mode)} ${quotedPath || 'file'}`, ...(isDir ? [`find ${quotedPath || 'dir'} -type d -exec chmod ${toOctal(mode)} {} +`] : [])].join('\n')} label={t('Commands')} />
            <div className="flex flex-wrap gap-2">
              <CopyButton text={command} label={t('Copy chmod command')} onCopied={() => track('copy_command')} />
              <CopyButton text={toOctal(mode)} label={t('Copy octal')} />
            </div>
            <LocalNote />
          </Panel>
          <Panel title={t('Common modes and when to use them')}>
            <ul className="text-sm space-y-1">
              {COMMON_MODES.map((c) => (
                <li key={c.octal} className="flex gap-2">
                  <span className="font-mono font-bold w-12 shrink-0 text-black dark:text-white">{c.octal}</span>
                  <span className="text-gray-700 dark:text-gray-200">{t(c.use)}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </WebPage>
  );
}
