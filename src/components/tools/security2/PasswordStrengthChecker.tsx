import React, { useEffect, useRef, useState } from 'react';
import { ShieldAlert, Eye, EyeOff, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import { useToolResult } from '@/hooks/useToolResult';
import type { PasswordAnalysis } from '@/lib/tools/w500/security-password';
import { SecurityShell, Panel, Field, Notice, inputClass } from './securityShared';
import { msg, useT } from '@/i18n';

type Analyzer = typeof import('@/lib/tools/w500/security-password');

const SCORE_COLORS = ['bg-red-600', 'bg-orange-500', 'bg-amber-400', 'bg-lime-500', 'bg-green-600'];
const PATTERN_COLORS: Record<string, string> = {
  dictionary: 'bg-red-100 dark:bg-red-900/40 border-red-400',
  spatial: 'bg-purple-100 dark:bg-purple-900/40 border-purple-400',
  repeat: 'bg-orange-100 dark:bg-orange-900/40 border-orange-400',
  sequence: 'bg-amber-100 dark:bg-amber-900/40 border-amber-400',
  regex: 'bg-blue-100 dark:bg-blue-900/40 border-blue-400',
  date: 'bg-blue-100 dark:bg-blue-900/40 border-blue-400',
  separator: 'bg-gray-100 dark:bg-gray-800 border-gray-400',
  bruteforce: 'bg-green-100 dark:bg-green-900/40 border-green-500',
};

const CLASS_LABELS: Record<string, string> = { lower: 'a-z', upper: 'A-Z', digit: '0-9', symbol: msg('symbols'), space: msg('space'), other: msg('other Unicode') };

const PasswordStrengthChecker = () => {
  const { t, tr } = useT();
  const { trackAction } = useToolAnalytics();
  const [password, setPassword] = useState('Tr0ub4dor&3');
  const [show, setShow] = useState(true);
  const [personal, setPersonal] = useState('');
  const [customRate, setCustomRate] = useState('');
  const [analyzer, setAnalyzer] = useState<Analyzer | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [a, setA] = useState<PasswordAnalysis | null>(null);
  const tracked = useRef(false);

  useEffect(() => {
    import('@/lib/tools/w500/security-password').then(setAnalyzer).catch(() => setLoadError(msg('The password dictionaries failed to load. Check your connection and reload the page.')));
  }, []);

  useEffect(() => {
    if (!analyzer) return;
    const rate = Number(customRate);
    const id = setTimeout(() => {
      setA(analyzer.analyzePassword(password.slice(0, analyzer.MAX_ANALYZED_LENGTH), {
        userInputs: personal.split(/[,\n]/),
        customRate: Number.isFinite(rate) && rate > 0 ? rate : undefined,
      }));
    }, 120);
    return () => clearTimeout(id);
  }, [analyzer, password, personal, customRate]);

  useEffect(() => {
    if (!a || tracked.current || !password) return;
    // Only the score is recorded, never the password.
    const id = setTimeout(() => { tracked.current = true; trackAction('password_checked', { score: a.score }); }, 2000);
    return () => clearTimeout(id);
  }, [a, password, trackAction]);

  const empty = password.length === 0;
  // A shown verdict is the result. The key only detects a change; it is never sent.
  useToolResult('validated', a && !empty ? `${a.score}:${password.length}:${a.guessesLog10}` : '');

  return (
    <SecurityShell h1={t('Password Strength Checker')} toolName="Password Strength Checker" icon={ShieldAlert}
      privacyNote={t('Runs entirely in your browser. The password is never uploaded, logged or stored.')}
      subtitle={t('See how guessable a password really is: the patterns an attacker would try first, estimated guesses and entropy, crack time for online and offline attacks, and the NIST length rules.')}>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <Panel title={t('Password')} className="lg:col-span-2">
          <div className="space-y-4">
            <Field label={t('Password to test')} htmlFor="pw-input">
              <div className="flex gap-2">
                <Input id="pw-input" type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                  className={`${inputClass} font-mono`} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} maxLength={256} />
                <Button type="button" variant="outline" size="sm" className="h-10 shrink-0" onClick={() => setShow((s) => !s)} aria-label={show ? t('Hide password') : t('Show password')}>
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </Field>
            <Field label={t('Words about you (optional)')} htmlFor="pw-personal" hint={t('Name, username, pet, company or site name, comma separated. Passwords built from them score lower, as they would against a targeted attack.')}>
              <Input id="pw-personal" value={personal} onChange={(e) => setPersonal(e.target.value)} className={inputClass} placeholder={t('alice, smith, acme')} autoComplete="off" />
            </Field>
            <Field label={t('Your own attack speed (guesses per second, optional)')} htmlFor="pw-rate" hint={t('For example 1e12 for a large GPU cluster against a fast hash.')}>
              <Input id="pw-rate" inputMode="decimal" value={customRate} onChange={(e) => setCustomRate(e.target.value)} className={inputClass} placeholder="1e12" />
            </Field>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              {t('The check runs on this device with the zxcvbn-ts library and its built-in word lists. The password is not sent, logged or stored, and the page makes no network request when you type.')}
            </p>
          </div>
        </Panel>

        <div className="lg:col-span-3 space-y-4 min-w-0">
          {loadError && <Notice tone="error">{t(loadError)}</Notice>}
          {!a && !loadError && <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />{' '}{t('Loading the word lists...')}</p>}
          {a && empty && <Notice>{t('Type a password to see its strength.')}</Notice>}
          {a && !empty && (
            <>
              <Panel>
                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                  <span className="text-2xl font-bold text-gray-900 dark:text-white" data-testid="pw-label">{t(a.label)}</span>
                  <span className="text-sm text-gray-600 dark:text-gray-400">{t('score {score} of 4', { score: a.score })}</span>
                </div>
                <div className="grid grid-cols-5 gap-1 mt-3" aria-hidden="true">
                  {[0, 1, 2, 3, 4].map((i) => <div key={i} className={`h-2.5 rounded-full ${i <= a.score ? SCORE_COLORS[a.score] : 'bg-gray-200 dark:bg-gray-700'}`} />)}
                </div>
                <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-sm">
                  <div><dt className="text-xs uppercase text-gray-500">{t('Length')}</dt><dd className="font-semibold text-gray-900 dark:text-white">{a.length}</dd></div>
                  <div><dt className="text-xs uppercase text-gray-500">{t('Guesses')}</dt><dd className="font-semibold text-gray-900 dark:text-white">10<sup>{a.guessesLog10.toFixed(1)}</sup></dd></div>
                  <div><dt className="text-xs uppercase text-gray-500">{t('Realistic entropy')}</dt><dd className="font-semibold text-gray-900 dark:text-white">{t('{value} bits', { value: a.guessEntropyBits.toFixed(1) })}</dd></div>
                  <div><dt className="text-xs uppercase text-gray-500">{t('Naive entropy')}</dt><dd className="font-semibold text-gray-900 dark:text-white">{t('{value} bits', { value: a.poolEntropyBits.toFixed(1) })}</dd></div>
                </dl>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                  {t('Naive entropy is length × log2({poolSize}) for the character sets used ({classes}). It assumes every character was picked at random. Realistic entropy is log2 of the guesses a pattern-aware attacker needs.', { poolSize: a.poolSize, classes: a.classes.map((c) => t(CLASS_LABELS[c])).join(', ') || t('none') })}
                </p>
                {(a.warning || a.suggestions.length > 0) && (
                  <div className="mt-4 space-y-2">
                    {a.warning && <Notice tone="warn">{a.warning}</Notice>}
                    {a.suggestions.length > 0 && <ul className="list-disc pl-5 text-sm text-gray-700 dark:text-gray-300 space-y-1">{a.suggestions.map((s) => <li key={s}>{s}</li>)}</ul>}
                  </div>
                )}
              </Panel>

              <Panel title={t('Time to crack')}>
                <table className="w-full text-sm">
                  <tbody>
                    {a.crackTimes.map((c) => (
                      <tr key={c.id} className="border-t first:border-t-0 border-gray-200 dark:border-gray-700">
                        <td className="py-2 pr-2 text-gray-700 dark:text-gray-300">{t(c.labelMsg.text, c.labelMsg.vars)}</td>
                        <td className="py-2 text-right font-semibold text-gray-900 dark:text-white whitespace-nowrap" data-testid={`crack-${c.id}`}>{t(c.displayMsg.text, c.displayMsg.vars)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">{t('Time to make the estimated number of guesses at each speed. Real speed depends on how the site stores passwords: a slow hash like bcrypt or Argon2 protects a leaked database far better than plain SHA-1.')}</p>
              </Panel>

              {a.patterns.length > 0 && (
                <Panel title={t('What an attacker sees')}>
                  <div className="flex flex-wrap gap-1 font-mono text-sm break-all" aria-label={t('Password split into patterns')}>
                    {a.patterns.map((p) => (
                      <span key={`${p.i}-${p.j}`} className={`px-1.5 py-0.5 rounded border ${PATTERN_COLORS[p.pattern] ?? PATTERN_COLORS.bruteforce} text-gray-900 dark:text-gray-100`}>
                        {show ? password.slice(p.i, p.j + 1) : '•'.repeat(p.length)}
                      </span>
                    ))}
                  </div>
                  <ul className="mt-3 space-y-1 text-sm text-gray-700 dark:text-gray-300">
                    {a.patterns.map((p) => (
                      <li key={`d-${p.i}-${p.j}`}>
                        <span className="font-mono text-xs text-gray-500">{t('chars {from}-{to}', { from: p.i + 1, to: p.j + 1 })}</span>{tr(': {description}, about {power} guesses', {
                          description: [t(p.descriptionMsg.text, p.descriptionMsg.vars), ...p.descriptionExtras.map((x) => t(x))].join(', '),
                          power: <>10<sup>{p.guessesLog10.toFixed(1)}</sup></>,
                        })}
                      </li>
                    ))}
                  </ul>
                </Panel>
              )}

              <Panel title={t('NIST SP 800-63B-4 checks')}>
                <ul className="space-y-2 text-sm">
                  {[
                    { ok: a.nist.singleFactorLength, text: t('At least 15 characters (required when the password is the only factor)') },
                    { ok: a.nist.mfaLength, text: t('At least 8 characters (minimum when used with a second factor)') },
                    { ok: !a.nist.commonPassword, text: t('Not on the common-password list (or a near variant of an entry)') },
                  ].map((c) => (
                    <li key={c.text} className="flex items-start gap-2">
                      {c.ok ? <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" /> : <XCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />}
                      <span className="text-gray-800 dark:text-gray-200">{c.text}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">{t('NIST no longer asks for mixed character types or regular changes. Length and avoiding known passwords matter more.')}</p>
              </Panel>
            </>
          )}
        </div>
      </div>
    </SecurityShell>
  );
};

export default PasswordStrengthChecker;
