import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Smartphone, RefreshCw, CheckCircle2, XCircle, Download } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import {
  buildOtpauthUri, codeWindow, verifyMessage, DEFAULT_OTP, generateSecret, normalizeSecret, OTP_ALGORITHMS, parseOtpauthUri, secondsRemaining, secretBits, verifyCode,
  type CodeRow, type OtpAlgorithm, type OtpConfig, type VerifyResult,
} from '@/lib/tools/w500/security-totp';
import { SecurityShell, Panel, Pills, Field, OutputBlock, Notice, inputClass, selectClass, useCopy } from './securityShared';
import { useFormat, useT } from '@/i18n';

const TIME_OPTS: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit' };
const groupCode = (c: string) => (c.length === 6 ? `${c.slice(0, 3)} ${c.slice(3)}` : c.length === 8 ? `${c.slice(0, 4)} ${c.slice(4)}` : c);

const TotpGenerator = () => {
  const { t: tx } = useT();
  const format = useFormat();
  const fmtTime = (unix: number) => format.date(new Date(unix * 1000), TIME_OPTS);
  const { trackAction } = useToolAnalytics();
  const copy = useCopy();
  const [cfg, setCfg] = useState<OtpConfig>(DEFAULT_OTP);
  const [uriInput, setUriInput] = useState('');
  const [uriError, setUriError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now() / 1000);
  const [skew, setSkew] = useState('0');
  const [rows, setRows] = useState<CodeRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [check, setCheck] = useState('');
  const [windowSteps, setWindowSteps] = useState('1');
  const [verify, setVerify] = useState<VerifyResult | null>(null);
  const tracked = useRef(false);

  const update = (patch: Partial<OtpConfig>) => setCfg((c) => ({ ...c, ...patch }));
  const t = now + (Number(skew) || 0);
  const step = cfg.type === 'totp' ? Math.floor(t / cfg.period) : cfg.counter;

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let live = true;
    codeWindow(cfg, t, 1)
      .then((r) => { if (live) { setRows(r); setError(null); } })
      .catch((e: Error) => { if (live) { setRows([]); setError(e.message); } });
    return () => { live = false; };
    // Recompute only when the step or the settings change, not every second.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg, step]);

  const uri = useMemo(() => {
    try { return buildOtpauthUri(cfg); } catch { return ''; }
  }, [cfg]);

  useEffect(() => {
    let live = true;
    if (!uri || error) { setQr(null); return; }
    import('qrcode').then((m) => m.default.toDataURL(uri, { margin: 1, width: 240, errorCorrectionLevel: 'M' }))
      .then((url) => { if (live) setQr(url); })
      .catch(() => { if (live) setQr(null); });
    return () => { live = false; };
  }, [uri, error]);

  useEffect(() => {
    if (!check.trim()) { setVerify(null); return; }
    let live = true;
    verifyCode(cfg, check, t, Math.max(0, Math.min(10, Number(windowSteps) || 0)))
      .then((v) => { if (live) setVerify(v); })
      .catch((e: Error) => { if (live) setVerify({ valid: false, offset: null, step: null, message: e.message }); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [check, cfg, step, windowSteps]);

  useEffect(() => {
    if (tracked.current || !rows.length) return;
    const id = setTimeout(() => { tracked.current = true; trackAction('totp_generated', { algorithm: cfg.algorithm, digits: cfg.digits }); }, 2000);
    return () => clearTimeout(id);
  }, [rows, cfg.algorithm, cfg.digits, trackAction]);

  const loadUri = (value: string) => {
    setUriInput(value);
    if (!value.trim()) { setUriError(null); return; }
    try {
      setCfg(parseOtpauthUri(value));
      setUriError(null);
      trackAction('otpauth_uri_parsed');
    } catch (e) {
      setUriError((e as Error).message);
    }
  };

  const verifyText = (v: VerifyResult) => {
    const m = verifyMessage(v);
    return m ? tx(m.text, m.vars) : v.message;
  };
  const current = rows.find((r) => r.offset === 0);
  const remaining = secondsRemaining(t, cfg.period);
  const bits = secretBits(cfg.secret);

  return (
    <SecurityShell h1={tx('TOTP Generator and 2FA Code Checker')} toolName="TOTP / 2FA Code Generator" icon={Smartphone}
      subtitle={tx('See the current six-digit code for any authenticator secret or otpauth:// link, check a code against the clock, and create a new secret with a QR code to scan.')}>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <Panel title={tx('Secret and settings')} className="lg:col-span-2">
          <div className="space-y-4">
            <Field label={tx('Paste an otpauth:// URI (optional)')} htmlFor="otp-uri" hint={tx('The text inside a 2FA QR code. Fills in every setting below.')}>
              <Input id="otp-uri" value={uriInput} onChange={(e) => loadUri(e.target.value)} placeholder={tx('otpauth://totp/Issuer:you?secret=...')} className={`${inputClass} font-mono text-xs`} autoComplete="off" spellCheck={false} />
              {uriError && <p className="text-xs text-red-600 dark:text-red-400">{uriError}</p>}
            </Field>
            <Field label={tx('Base32 secret')} htmlFor="otp-secret" hint={bits ? tx('{bits}-bit key. RFC 4226 asks for at least 128 bits; 160 is recommended.', { bits }) : undefined}>
              <div className="flex gap-2">
                <Input id="otp-secret" value={cfg.secret} onChange={(e) => update({ secret: e.target.value })} className={`${inputClass} font-mono`} autoComplete="off" spellCheck={false} />
                <Button type="button" variant="outline" size="sm" className="h-10 shrink-0" onClick={() => { update({ secret: generateSecret(20) }); setUriInput(''); trackAction('totp_secret_generated'); }}>
                  <RefreshCw className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">{tx('New')}</span>
                </Button>
              </div>
            </Field>
            <Field label={tx('Type')}>
              <Pills label={tx('OTP type')} value={cfg.type} onChange={(v) => update({ type: v })} options={[{ id: 'totp', label: tx('TOTP (time-based)') }, { id: 'hotp', label: tx('HOTP (counter)') }]} />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label={tx('Algorithm')} htmlFor="otp-alg">
                <select id="otp-alg" className={selectClass} value={cfg.algorithm} onChange={(e) => update({ algorithm: e.target.value as OtpAlgorithm })}>
                  {OTP_ALGORITHMS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </Field>
              <Field label={tx('Digits')} htmlFor="otp-digits">
                <select id="otp-digits" className={selectClass} value={cfg.digits} onChange={(e) => update({ digits: Number(e.target.value) })}>
                  {[6, 7, 8].map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </Field>
              {cfg.type === 'totp' ? (
                <Field label={tx('Period (s)')} htmlFor="otp-period">
                  <Input id="otp-period" type="number" min={1} value={cfg.period} onChange={(e) => update({ period: Math.max(1, Math.floor(Number(e.target.value) || 30)) })} className={inputClass} />
                </Field>
              ) : (
                <Field label={tx('Counter')} htmlFor="otp-counter">
                  <Input id="otp-counter" type="number" min={0} value={cfg.counter} onChange={(e) => update({ counter: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} className={inputClass} />
                </Field>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={tx('Issuer')} htmlFor="otp-issuer"><Input id="otp-issuer" value={cfg.issuer} onChange={(e) => update({ issuer: e.target.value })} className={inputClass} /></Field>
              <Field label={tx('Account')} htmlFor="otp-account"><Input id="otp-account" value={cfg.account} onChange={(e) => update({ account: e.target.value })} className={inputClass} /></Field>
            </div>
            {cfg.type === 'totp' && (
              <Field label={tx('Clock offset (seconds)')} htmlFor="otp-skew" hint={tx('Simulate a phone or server clock that runs fast (+) or slow (-).')}>
                <Input id="otp-skew" type="number" value={skew} onChange={(e) => setSkew(e.target.value)} className={inputClass} />
              </Field>
            )}
          </div>
        </Panel>

        <div className="lg:col-span-3 space-y-4 min-w-0">
          {error && <Notice tone="error">{error}</Notice>}
          {current && (
            <Panel>
              <div className="text-center space-y-2">
                <div className="text-xs uppercase tracking-wide text-gray-500">{cfg.issuer || tx('Current code')}{cfg.account ? ` · ${cfg.account}` : ''}</div>
                <button type="button" onClick={() => { copy(current.code, tx('Code')); trackAction('totp_code_copied'); }}
                  className="font-mono font-bold text-4xl sm:text-5xl tracking-widest text-red-700 dark:text-red-300 tabular-nums" data-testid="totp-code" aria-label={tx('Copy current code')}>
                  {groupCode(current.code)}
                </button>
                {cfg.type === 'totp' ? (
                  <>
                    <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden" aria-hidden="true">
                      <div className={`h-full transition-all ${remaining <= 5 ? 'bg-amber-500' : 'bg-red-600'}`} style={{ width: `${(remaining / cfg.period) * 100}%` }} />
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{tx('Changes in {remaining} s · time step {step} · valid {value} to {value2}', { remaining, step: current.step, value: fmtTime(current.validFrom), value2: fmtTime(current.validTo) })}</p>
                  </>
                ) : (
                  <div className="flex justify-center gap-2 items-center">
                    <p className="text-sm text-gray-600 dark:text-gray-400">{tx('Counter {counter}', { counter: cfg.counter })}</p>
                    <Button type="button" size="sm" variant="outline" onClick={() => update({ counter: cfg.counter + 1 })}>{tx('Next counter')}</Button>
                  </div>
                )}
              </div>
              <table className="w-full mt-4 text-sm">
                <thead><tr className="text-left text-xs uppercase text-gray-500"><th className="py-1">{cfg.type === 'totp' ? tx('Step') : tx('Counter')}</th><th>{tx('Code')}</th><th className="text-right">{cfg.type === 'totp' ? tx('Valid from') : ''}</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.step} className={`border-t border-gray-200 dark:border-gray-700 ${r.offset === 0 ? 'font-semibold' : 'text-gray-600 dark:text-gray-400'}`}>
                      <td className="py-1">{cfg.type === 'totp' ? (r.offset === 0 ? tx('Now') : r.offset < 0 ? tx('Previous') : tx('Next')) : r.step}</td>
                      <td className="font-mono tabular-nums">{r.code}</td>
                      <td className="text-right tabular-nums">{cfg.type === 'totp' ? fmtTime(r.validFrom) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}

          <Panel title={tx('Check a code')}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <Field label={tx('Code from your app or server')} htmlFor="otp-check">
                  <Input id="otp-check" inputMode="numeric" value={check} onChange={(e) => setCheck(e.target.value)} placeholder={'0'.repeat(cfg.digits)} className={`${inputClass} font-mono`} autoComplete="one-time-code" />
                </Field>
              </div>
              <Field label={cfg.type === 'totp' ? tx('Steps either side') : tx('Look-ahead')} htmlFor="otp-window">
                <Input id="otp-window" type="number" min={0} max={10} value={windowSteps} onChange={(e) => setWindowSteps(e.target.value)} className={inputClass} />
              </Field>
            </div>
            {verify && (
              <div className="mt-3">
                <Notice tone={verify.valid ? 'ok' : 'error'}>
                  <span className="flex items-center gap-2">{verify.valid ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}{verifyText(verify)}</span>
                </Notice>
              </div>
            )}
          </Panel>

          {uri && !error && (
            <Panel title={tx('Set up an authenticator')}>
              <div className="flex flex-col sm:flex-row gap-4 items-start">
                {qr && (
                  <div className="shrink-0 mx-auto sm:mx-0 text-center space-y-2">
                    <img src={qr} alt={cfg.issuer ? tx('QR code for {issuer} {type} secret', { issuer: cfg.issuer, type: cfg.type.toUpperCase() }) : tx('QR code for this {type} secret', { type: cfg.type.toUpperCase() })} width={200} height={200} className="rounded-lg border border-gray-200 bg-white p-1" />
                    <a href={qr} download={`${(cfg.issuer || 'totp').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-qr.png`} className="inline-flex items-center gap-1 text-xs text-red-700 dark:text-red-300 underline">
                      <Download className="h-3 w-3" /> PNG
                    </a>
                  </div>
                )}
                <div className="flex-1 min-w-0 space-y-3">
                  <OutputBlock label={tx('otpauth URI')} value={uri} onCopy={() => trackAction('otpauth_uri_copied')} />
                  <OutputBlock label={tx('Secret for manual entry')} value={normalizeSecret(cfg.secret).replace(/(.{4})/g, '$1 ').trim()} />
                  {(cfg.algorithm !== 'SHA-1' || cfg.digits !== 6 || cfg.period !== 30) && (
                    <Notice tone="warn">{tx('Some authenticator apps (the Key URI Format notes say this of Google Authenticator) ignore non-default algorithm, digits or period values and fall back to SHA-1, 6 digits and 30 seconds. Compare the app\'s first code with the one above before relying on it.')}</Notice>
                  )}
                </div>
              </div>
            </Panel>
          )}
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {tx('A 2FA secret is as sensitive as a password. Codes are computed on this device, but for a real account prefer your authenticator app, and never paste a secret into a site you do not trust.')}
          </p>
        </div>
      </div>
    </SecurityShell>
  );
};

export default TotpGenerator;
