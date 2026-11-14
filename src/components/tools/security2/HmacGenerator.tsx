import React, { useEffect, useRef, useState } from 'react';
import { KeyRound, CheckCircle2, XCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import { computeHmac, HMAC_ALGORITHMS, HMAC_PRESETS, HMAC_SIZES, type HmacAlgorithm, type HmacPreset, type HmacResult } from '@/lib/tools/w500/security-hmac';
import { bytesToHex, randomBytes, type ByteEncoding } from '@/lib/tools/w500/security-encoding';
import { SecurityShell, Panel, Pills, Field, OutputBlock, Notice, inputClass, selectClass } from './securityShared';
import { msg, useT } from '@/i18n';

const ENCODINGS: { id: ByteEncoding; label: string }[] = [
  { id: 'utf8', label: msg('Text (UTF-8)') },
  { id: 'hex', label: msg('Hex') },
  { id: 'base64', label: msg('Base64') },
];

const HmacGenerator = () => {
  const { t } = useT();
  const { trackAction } = useToolAnalytics();
  const [preset, setPreset] = useState<HmacPreset>('plain');
  const [algorithm, setAlgorithm] = useState<HmacAlgorithm>('SHA-256');
  const [key, setKey] = useState('secret');
  const [keyEncoding, setKeyEncoding] = useState<ByteEncoding>('utf8');
  const [message, setMessage] = useState('The quick brown fox jumps over the lazy dog');
  const [messageEncoding, setMessageEncoding] = useState<ByteEncoding>('utf8');
  const [timestamp, setTimestamp] = useState(() => String(Math.floor(Date.now() / 1000)));
  const [expected, setExpected] = useState('');
  const [result, setResult] = useState<HmacResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useRef(0);
  const tracked = useRef(false);

  useEffect(() => {
    const id = ++run.current;
    computeHmac({ algorithm, key, keyEncoding, message, messageEncoding, preset, timestamp, expected })
      .then((r) => {
        if (id !== run.current) return;
        setResult(r);
        setError(null);
      })
      .catch((e: Error) => {
        if (id !== run.current) return;
        setResult(null);
        setError(e.message);
      });
  }, [algorithm, key, keyEncoding, message, messageEncoding, preset, timestamp, expected]);

  useEffect(() => {
    if (!result || tracked.current) return;
    const timer = setTimeout(() => { tracked.current = true; trackAction('hmac_computed', { algorithm: result.algorithm, preset }); }, 1500);
    return () => clearTimeout(timer);
  }, [result, preset, trackAction]);

  const presetInfo = HMAC_PRESETS.find((p) => p.id === preset)!;
  const effectiveAlg = preset === 'plain' ? algorithm : 'SHA-256';
  const encodings = ENCODINGS.map((e) => ({ id: e.id, label: t(e.label) }));

  return (
    <SecurityShell h1={t('HMAC Generator')} toolName="HMAC Generator" icon={KeyRound}
      subtitle={t('Sign a message with a secret key using HMAC-SHA256, SHA-1, SHA-384 or SHA-512, check a signature you received, or rebuild a GitHub, Stripe or Slack webhook signature.')}>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <Panel title={t('Key and message')} className="lg:col-span-2">
          <div className="space-y-4">
            <Field label={t('What are you signing?')}>
              <Pills<HmacPreset> label={t('Signature recipe')} value={preset} onChange={setPreset} options={HMAC_PRESETS.map((p) => ({ id: p.id, label: t(p.label) }))} />
              <p className="text-xs text-gray-600 dark:text-gray-400">{t(presetInfo.note)}</p>
            </Field>
            <Field label={t('Hash function')} htmlFor="hmac-alg" hint={preset === 'plain' ? undefined : t('Webhook recipes always use SHA-256.')}>
              <select id="hmac-alg" className={selectClass} value={effectiveAlg} disabled={preset !== 'plain'} onChange={(e) => setAlgorithm(e.target.value as HmacAlgorithm)}>
                {HMAC_ALGORITHMS.map((a) => <option key={a} value={a}>{t('HMAC-{a} ({bits} bits)', { a, bits: HMAC_SIZES[a].outBytes * 8 })}</option>)}
              </select>
            </Field>
            <Field label={t('Secret key')} htmlFor="hmac-key">
              <div className="flex gap-2">
                <Input id="hmac-key" value={key} onChange={(e) => setKey(e.target.value)} className={`${inputClass} font-mono`} autoComplete="off" spellCheck={false} />
                <Button type="button" variant="outline" size="sm" className="h-10 shrink-0"
                  onClick={() => { setKey(bytesToHex(randomBytes(32))); setKeyEncoding('hex'); trackAction('hmac_key_generated'); }}>
                  {t('Random')}
                </Button>
              </div>
              <Pills<ByteEncoding> label={t('Key encoding')} value={keyEncoding} onChange={setKeyEncoding} options={encodings} />
            </Field>
            <Field label={preset === 'plain' ? t('Message') : t('Raw request body')} htmlFor="hmac-msg"
              hint={preset === 'plain' ? undefined : t('Paste the body byte for byte, before any JSON parsing. Re-serialised JSON gives a different signature.')}>
              <Textarea id="hmac-msg" rows={5} value={message} onChange={(e) => setMessage(e.target.value)} className={`${inputClass} font-mono text-sm`} spellCheck={false} />
              {preset === 'plain' && <Pills<ByteEncoding> label={t('Message encoding')} value={messageEncoding} onChange={setMessageEncoding} options={encodings} />}
            </Field>
            {(preset === 'stripe' || preset === 'slack') && (
              <Field label={t('Timestamp (Unix seconds)')} htmlFor="hmac-ts" hint={preset === 'stripe' ? t('The t= value from the Stripe-Signature header.') : t('The X-Slack-Request-Timestamp header.')}>
                <div className="flex gap-2">
                  <Input id="hmac-ts" inputMode="numeric" value={timestamp} onChange={(e) => setTimestamp(e.target.value)} className={`${inputClass} font-mono`} />
                  <Button type="button" variant="outline" size="sm" className="h-10 shrink-0" onClick={() => setTimestamp(String(Math.floor(Date.now() / 1000)))}>{t('Now')}</Button>
                </div>
              </Field>
            )}
            <Field label={t('Signature to verify (optional)')} htmlFor="hmac-expected" hint={t('Hex or Base64. Prefixes such as sha256=, v0= and a full Stripe header are accepted.')}>
              <Input id="hmac-expected" value={expected} onChange={(e) => setExpected(e.target.value)} className={`${inputClass} font-mono`} placeholder={t('sha256=...')} autoComplete="off" spellCheck={false} />
            </Field>
          </div>
        </Panel>

        <div className="lg:col-span-3 space-y-4 min-w-0">
          {error && <Notice tone="error">{error}</Notice>}
          {result && (
            <>
              {result.match !== null && (
                <Notice tone={result.match ? 'ok' : 'error'}>
                  <span className="flex items-center gap-2 font-semibold">
                    {result.match ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    {result.match ? t('Signature matches') : t('Signature does not match')}
                  </span>
                  {!result.match && (
                    <span className="block mt-1 text-xs">
                      {result.expectedFormat === 'unreadable' ? t('The value is neither hex nor Base64.') : t('Check the key, the hash function, and that the message is the exact raw bytes that were signed (whitespace and line endings count).')}
                    </span>
                  )}
                </Notice>
              )}
              <Panel title={`HMAC-${result.algorithm}`}>
                <div className="space-y-4">
                  <OutputBlock label={t('Hex')} value={result.hex} testId="hmac-hex" onCopy={() => trackAction('hmac_copied', { format: 'hex' })} />
                  <OutputBlock label={t('Base64')} value={result.base64} onCopy={() => trackAction('hmac_copied', { format: 'base64' })} />
                  <OutputBlock label={t('Base64url (no padding)')} value={result.base64url} />
                  {result.header && <OutputBlock label={t('HTTP header')} value={result.header} />}
                  {result.signedString !== undefined && <OutputBlock label={t('Exact string that was signed')} value={result.signedString} rows={6} />}
                </div>
              </Panel>
              <Panel>
                <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div><dt className="text-xs uppercase text-gray-500">{t('Output')}</dt><dd className="font-semibold text-gray-900 dark:text-white">{t('{bits} bits', { bits: result.bits })}</dd></div>
                  <div><dt className="text-xs uppercase text-gray-500">{t('Key')}</dt><dd className="font-semibold text-gray-900 dark:text-white">{t('{keyBytes} bytes', { keyBytes: result.keyBytes })}</dd></div>
                  <div><dt className="text-xs uppercase text-gray-500">{t('Message')}</dt><dd className="font-semibold text-gray-900 dark:text-white">{t('{messageBytes} bytes', { messageBytes: result.messageBytes })}</dd></div>
                  <div><dt className="text-xs uppercase text-gray-500">{t('Block size')}</dt><dd className="font-semibold text-gray-900 dark:text-white">{t('{blockBytes} bytes', { blockBytes: HMAC_SIZES[result.algorithm].blockBytes })}</dd></div>
                </dl>
                <ul className="mt-3 text-xs text-gray-600 dark:text-gray-400 list-disc pl-5 space-y-1">
                  {result.keyBytes < HMAC_SIZES[result.algorithm].outBytes && <li>{t('The key is shorter than the {outBytes}-byte hash output. RFC 2104 discourages keys shorter than the output length; use a random key of at least that size.', { outBytes: HMAC_SIZES[result.algorithm].outBytes })}</li>}
                  {result.keyHashed && <li>{t('The key is longer than the {blockBytes}-byte block, so HMAC hashes it first (RFC 2104). That is normal.', { blockBytes: HMAC_SIZES[result.algorithm].blockBytes })}</li>}
                  {result.algorithm === 'SHA-1' && <li>{t('HMAC-SHA1 is still secure as a MAC, but use SHA-256 for new designs.')}</li>}
                  <li>{t('Compare signatures in constant time on your server (crypto.timingSafeEqual, hmac.compare_digest, hash_equals), not with ==.')}</li>
                </ul>
              </Panel>
            </>
          )}
        </div>
      </div>
    </SecurityShell>
  );
};

export default HmacGenerator;
