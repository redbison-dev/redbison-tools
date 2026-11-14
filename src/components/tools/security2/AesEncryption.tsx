import React, { useEffect, useRef, useState } from 'react';
import { Lock, Unlock, ArrowDown, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import {
  decryptText, DEFAULT_PBKDF2_ITERATIONS, encryptText, generateKey, OPENSSL_DEFAULT_ITERATIONS,
  type AesMode, type EncryptResult, type KeySource, type OutputFormat,
} from '@/lib/tools/w500/security-aes';
import { bytesToBase64, bytesToHex } from '@/lib/tools/w500/security-encoding';
import { SecurityShell, Panel, Pills, Field, OutputBlock, Notice, inputClass } from './securityShared';
import { useT } from '@/i18n';

type Direction = 'encrypt' | 'decrypt';

const AesEncryption = () => {
  const { t } = useT();
  const { trackAction } = useToolAnalytics();
  const [direction, setDirection] = useState<Direction>('encrypt');
  const [source, setSource] = useState<KeySource>('password');
  const [mode, setMode] = useState<AesMode>('GCM');
  const [password, setPassword] = useState('correct horse battery staple');
  const [iterations, setIterations] = useState(String(DEFAULT_PBKDF2_ITERATIONS));
  const [key, setKey] = useState(() => bytesToHex(generateKey(256)));
  const [keyEncoding, setKeyEncoding] = useState<'hex' | 'base64'>('hex');
  const [format, setFormat] = useState<OutputFormat>('compact');
  const [plaintext, setPlaintext] = useState('Meet at the north gate at 6. Bring the blue folder.');
  const [cipherInput, setCipherInput] = useState('');
  const [enc, setEnc] = useState<EncryptResult | null>(null);
  const [dec, setDec] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = useRef(0);

  const iter = Math.floor(Number(iterations));
  const effMode: AesMode = source === 'openssl' ? 'CBC' : mode;

  const changeSource = (s: KeySource) => {
    setSource(s);
    if (s === 'openssl') setIterations(String(OPENSSL_DEFAULT_ITERATIONS));
    else if (s === 'password' && source === 'openssl') setIterations(String(DEFAULT_PBKDF2_ITERATIONS));
  };

  useEffect(() => {
    const id = ++run.current;
    const opts = { mode: effMode, source, password, key, keyEncoding, iterations: iter };
    if (source !== 'raw' && (!Number.isInteger(iter) || iter < 1)) { setError(t('Iterations must be a positive whole number.')); return; }
    if (direction === 'decrypt' && !cipherInput.trim()) { setDec(null); setError(null); return; }
    const timer = setTimeout(() => {
      setBusy(true);
      const job = direction === 'encrypt'
        ? encryptText(plaintext, { ...opts, format }).then((r) => { if (id === run.current) { setEnc(r); setError(null); } })
        : decryptText(cipherInput, opts).then((r) => { if (id === run.current) { setDec(r); setError(null); trackAction('aes_decrypted', { mode: effMode, source }); } });
      job.catch((e: Error) => {
        if (id !== run.current) return;
        setError(e.message);
        if (direction === 'encrypt') setEnc(null); else setDec(null);
      }).finally(() => { if (id === run.current) setBusy(false); });
    }, 350);
    return () => clearTimeout(timer);
    // trackAction is stable enough; leaving it out avoids re-running encryption.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [direction, source, effMode, password, key, keyEncoding, iter, format, plaintext, cipherInput]);

  const newKey = (bits: 128 | 256) => {
    const k = generateKey(bits);
    setKey(keyEncoding === 'hex' ? bytesToHex(k) : bytesToBase64(k));
    trackAction('aes_key_generated', { bits });
  };

  const sendToDecrypt = () => {
    if (!enc) return;
    setCipherInput(enc.output);
    setDirection('decrypt');
    trackAction('aes_round_trip');
  };

  const opensslCmd = source === 'openssl'
    ? direction === 'encrypt'
      ? `printf '%s' 'your text' | openssl enc -aes-256-cbc -pbkdf2 -iter ${iter} -a -A`
      : `echo 'U2FsdGVkX1...' | openssl enc -d -aes-256-cbc -pbkdf2 -iter ${iter} -a -A`
    : null;

  return (
    <SecurityShell h1={t('AES Encryption and Decryption Online')} toolName="AES Encrypt & Decrypt" icon={Lock}
      subtitle={t('Encrypt or decrypt text with AES-256-GCM or AES-CBC using a password (PBKDF2) or a raw key. Compatible with openssl enc -pbkdf2.')}>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <Panel title={t('Settings')} className="lg:col-span-2">
          <div className="space-y-4">
            <Pills<Direction> label={t('Direction')} value={direction} onChange={setDirection} options={[{ id: 'encrypt', label: t('Encrypt') }, { id: 'decrypt', label: t('Decrypt') }]} />
            <Field label={t('Key from')}>
              <Pills label={t('Key source')} value={source} onChange={changeSource} options={[
                { id: 'password', label: t('Password') },
                { id: 'raw', label: t('Raw key') },
                { id: 'openssl', label: t('OpenSSL enc') },
              ]} />
            </Field>
            <Field label={t('Cipher mode')} hint={effMode === 'GCM' ? t('GCM encrypts and authenticates: a wrong key or edited ciphertext is detected.') : t('CBC hides the text but cannot detect tampering. Prefer GCM unless you need CBC for compatibility.')}>
              <Pills<AesMode> label={t('Cipher mode')} value={effMode} onChange={setMode} options={[
                { id: 'GCM', label: 'AES-GCM', disabled: source === 'openssl' },
                { id: 'CBC', label: 'AES-CBC' },
              ]} />
            </Field>
            {source !== 'raw' ? (
              <>
                <Field label={t('Password')} htmlFor="aes-pw">
                  <Input id="aes-pw" type="text" value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputClass} font-mono`} autoComplete="off" spellCheck={false} />
                </Field>
                <Field label={t('PBKDF2-SHA256 iterations')} htmlFor="aes-iter"
                  hint={source === 'openssl' ? t('openssl enc -pbkdf2 uses 10,000 unless you pass -iter.') : t('OWASP recommends 600,000 for PBKDF2-HMAC-SHA256. Decryption must use the same number.')}>
                  <Input id="aes-iter" type="number" min={1} value={iterations} onChange={(e) => setIterations(e.target.value)} className={inputClass} />
                </Field>
              </>
            ) : (
              <Field label={t('Key (128, 192 or 256 bits)')} htmlFor="aes-key">
                <Input id="aes-key" value={key} onChange={(e) => setKey(e.target.value)} className={`${inputClass} font-mono text-xs`} autoComplete="off" spellCheck={false} />
                <div className="flex flex-wrap gap-2 items-center">
                  <Pills<'hex' | 'base64'> label={t('Key encoding')} value={keyEncoding} onChange={setKeyEncoding} options={[{ id: 'hex', label: t('Hex') }, { id: 'base64', label: t('Base64') }]} />
                  <Button type="button" size="sm" variant="outline" onClick={() => newKey(256)}>{t('New 256-bit')}</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => newKey(128)}>{t('New 128-bit')}</Button>
                </div>
              </Field>
            )}
            {source !== 'openssl' && direction === 'encrypt' && (
              <Field label={t('Output format')}>
                <Pills<OutputFormat> label={t('Output format')} value={format} onChange={setFormat} options={[{ id: 'compact', label: t('Compact Base64') }, { id: 'json', label: t('JSON bundle') }]} />
              </Field>
            )}
          </div>
        </Panel>

        <div className="lg:col-span-3 space-y-4 min-w-0">
          {direction === 'encrypt' ? (
            <Panel title={t('Plaintext')}>
              <Textarea aria-label={t('Text to encrypt')} rows={5} value={plaintext} onChange={(e) => setPlaintext(e.target.value)} className={`${inputClass} text-sm`} />
            </Panel>
          ) : (
            <Panel title={t('Encrypted text')}>
              <Textarea aria-label={t('Text to decrypt')} rows={5} value={cipherInput} onChange={(e) => setCipherInput(e.target.value)} placeholder={t('Paste Base64, a JSON bundle, or openssl enc -a output')} className={`${inputClass} font-mono text-xs`} spellCheck={false} />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{t('JSON bundles and OpenSSL "Salted__" output are detected automatically. Compact Base64 needs the same key source, mode and iterations used to encrypt.')}</p>
            </Panel>
          )}

          {busy && <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />{' '}{t('Deriving the key and running AES...')}</p>}
          {error && <Notice tone="error">{error}</Notice>}

          {direction === 'encrypt' && enc && !error && (
            <Panel title={t('AES-{keyBits}-{value} output', { keyBits: enc.keyBits, value: source === 'openssl' ? 'CBC' : effMode })}>
              <div className="space-y-4">
                <OutputBlock label={t('Encrypted')} value={enc.output} filename="encrypted.txt" testId="aes-output" onCopy={() => trackAction('aes_encrypted_copied', { mode: effMode, source })} />
                <Button type="button" variant="outline" size="sm" onClick={sendToDecrypt}><ArrowDown className="h-4 w-4 mr-1" />{' '}{t('Test decrypting it')}</Button>
                <p className="text-xs text-gray-600 dark:text-gray-400">{enc.saltHex
                  ? t('Layout: {layout}. A fresh random salt and IV are used every time, so the output changes even for the same text.', { layout: enc.layout })
                  : t('Layout: {layout}. A fresh random IV are used every time, so the output changes even for the same text.', { layout: enc.layout })}</p>
                <dl className="grid grid-cols-1 gap-2 text-xs font-mono break-all">
                  {enc.saltHex && <div><dt className="text-gray-500 font-sans">{t('Salt (hex)')}</dt><dd>{enc.saltHex}</dd></div>}
                  <div><dt className="text-gray-500 font-sans">{t('IV (hex)')}</dt><dd>{enc.ivHex}</dd></div>
                  <div><dt className="text-gray-500 font-sans">{t('Ciphertext (hex)')}</dt><dd>{enc.ciphertextHex.length > 512 ? `${enc.ciphertextHex.slice(0, 512)}...` : enc.ciphertextHex}</dd></div>
                  {enc.tagHex && <div><dt className="text-gray-500 font-sans">{t('GCM tag (hex)')}</dt><dd>{enc.tagHex}</dd></div>}
                </dl>
              </div>
            </Panel>
          )}

          {direction === 'decrypt' && dec !== null && !error && (
            <Panel title={t('Decrypted text')}>
              <p className="text-sm text-green-700 dark:text-green-400 flex items-center gap-1 mb-3"><Unlock className="h-4 w-4" />{' '}{t('Decrypted successfully.')}</p>
              <OutputBlock label={t('Plaintext')} value={dec} testId="aes-plaintext" />
            </Panel>
          )}

          {opensslCmd && (
            <Panel title={t('Same thing with OpenSSL')}>
              <OutputBlock label={t('Command')} value={opensslCmd} />
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">{t('OpenSSL 1.1.1 or later. -A keeps the Base64 on one line, matching this page. OpenSSL asks for the password.')}</p>
            </Panel>
          )}
        </div>
      </div>
    </SecurityShell>
  );
};

export default AesEncryption;
