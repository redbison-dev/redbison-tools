import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeySquare, Loader2, RefreshCw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import { generateKeyPair, supportsEd25519, type EcCurve, type KeyPairOutput, type KeySpec, type KeyType, type RsaBits, type RsaUse } from '@/lib/tools/w500/security-keys';
import { SecurityShell, Panel, Pills, Field, OutputBlock, Notice, inputClass, selectClass } from './securityShared';
import { useT } from '@/i18n';

const sshFileBase = (t: KeyType) => (t === 'RSA' ? 'id_rsa' : t === 'ECDSA' ? 'id_ecdsa' : 'id_ed25519');

const RsaKeyGenerator = () => {
  const { t, tr } = useT();
  const { trackAction } = useToolAnalytics();
  const [type, setType] = useState<KeyType>('RSA');
  const [rsaBits, setRsaBits] = useState<RsaBits>(2048);
  const [rsaUse, setRsaUse] = useState<RsaUse>('RSASSA-PKCS1-v1_5');
  const [rsaHash, setRsaHash] = useState<'SHA-256' | 'SHA-384' | 'SHA-512'>('SHA-256');
  const [curve, setCurve] = useState<EcCurve>('P-256');
  const [comment, setComment] = useState('me@laptop');
  const [ed25519, setEd25519] = useState<boolean | null>(null);
  const [out, setOut] = useState<KeyPairOutput | null>(null);
  const [busy, setBusy] = useState(false);
  const [ms, setMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useRef(0);

  const generate = useCallback(async (spec: KeySpec, track: boolean) => {
    const id = ++run.current;
    setBusy(true);
    setError(null);
    const t0 = performance.now();
    try {
      const kp = await generateKeyPair(spec);
      if (id !== run.current) return;
      setOut(kp);
      setMs(performance.now() - t0);
      if (track) trackAction('key_pair_generated', { type: spec.type, bits: spec.rsaBits, curve: spec.curve });
    } catch (e) {
      if (id === run.current) { setError((e as Error).message); setOut(null); }
    } finally {
      if (id === run.current) setBusy(false);
    }
  }, [trackAction]);

  const spec: KeySpec = { type, rsaBits, rsaUse, rsaHash, curve, comment };

  useEffect(() => {
    supportsEd25519().then(setEd25519);
    generate({ type: 'RSA', rsaBits: 2048, rsaUse: 'RSASSA-PKCS1-v1_5', rsaHash: 'SHA-256', comment: 'me@laptop' }, false);
  }, [generate]);

  const base = out ? sshFileBase(out.type) : 'key';

  return (
    <SecurityShell h1={t('RSA and EC Key Pair Generator')} toolName="RSA & EC Key Pair Generator" icon={KeySquare}
      subtitle={t('Create RSA, ECDSA or Ed25519 key pairs in your browser and download them as PEM (PKCS#8 and SPKI), JWK, or OpenSSH files ready for ~/.ssh.')}>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <Panel title={t('Key type')} className="lg:col-span-2">
          <div className="space-y-4">
            <Pills<KeyType> label={t('Algorithm')} value={type} onChange={setType} options={[
              { id: 'RSA', label: 'RSA' },
              { id: 'ECDSA', label: 'ECDSA' },
              { id: 'Ed25519', label: t('Ed25519'), disabled: ed25519 === false },
            ]} />
            {ed25519 === false && <p className="text-xs text-amber-700 dark:text-amber-400">{t('This browser\'s Web Crypto has no Ed25519. Chrome 137+, Firefox 129+ and Safari 17+ support it.')}</p>}
            {type === 'RSA' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label={t('Modulus size')} htmlFor="rsa-bits" hint={rsaBits === 4096 ? t('4096-bit keys can take several seconds.') : undefined}>
                  <select id="rsa-bits" className={selectClass} value={rsaBits} onChange={(e) => setRsaBits(Number(e.target.value) as RsaBits)}>
                    <option value={2048}>{t('2048 bits (112-bit security)')}</option>
                    <option value={3072}>{t('3072 bits (128-bit security)')}</option>
                    <option value={4096}>{t('4096 bits')}</option>
                  </select>
                </Field>
                <Field label={t('Intended use')} htmlFor="rsa-use">
                  <select id="rsa-use" className={selectClass} value={rsaUse} onChange={(e) => setRsaUse(e.target.value as RsaUse)}>
                    <option value="RSASSA-PKCS1-v1_5">{t('Signing, PKCS#1 v1.5 (RS256, SSH)')}</option>
                    <option value="RSA-PSS">{t('Signing, PSS (PS256)')}</option>
                    <option value="RSA-OAEP">{t('Encryption, OAEP')}</option>
                  </select>
                </Field>
                <Field label={t('Hash (JWK alg)')} htmlFor="rsa-hash">
                  <select id="rsa-hash" className={selectClass} value={rsaHash} onChange={(e) => setRsaHash(e.target.value as typeof rsaHash)}>
                    <option value="SHA-256">SHA-256</option>
                    <option value="SHA-384">SHA-384</option>
                    <option value="SHA-512">SHA-512</option>
                  </select>
                </Field>
              </div>
            )}
            {type === 'ECDSA' && (
              <Field label={t('Curve')} htmlFor="ec-curve">
                <select id="ec-curve" className={selectClass} value={curve} onChange={(e) => setCurve(e.target.value as EcCurve)}>
                  <option value="P-256">{t('P-256 (secp256r1, ES256)')}</option>
                  <option value="P-384">{t('P-384 (secp384r1, ES384)')}</option>
                  <option value="P-521">{t('P-521 (secp521r1, ES512)')}</option>
                </select>
              </Field>
            )}
            <Field label={t('Comment (OpenSSH)')} htmlFor="key-comment" hint={t('Appended to the public key line, usually user@host.')}>
              <Input id="key-comment" value={comment} onChange={(e) => setComment(e.target.value)} className={inputClass} />
            </Field>
            <Button type="button" className="w-full bg-red-600 hover:bg-red-700 text-white" disabled={busy} onClick={() => generate(spec, true)}>
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              {t('Generate key pair')}
            </Button>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              {t('Keys come from crypto.subtle.generateKey, which uses the operating system\'s random number generator. The private key never leaves this tab unless you copy or download it.')}
            </p>
          </div>
        </Panel>

        <div className="lg:col-span-3 space-y-4 min-w-0">
          {error && <Notice tone="error">{error}</Notice>}
          {out && (
            <>
              <Panel>
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                  <div><span className="text-xs uppercase text-gray-500 block">{t('Key')}</span><span className="font-semibold text-gray-900 dark:text-white" data-testid="key-label">{out.label}</span></div>
                  <div><span className="text-xs uppercase text-gray-500 block">{t('Security strength')}</span><span className="font-semibold text-gray-900 dark:text-white">{t('{securityBits} bits', { securityBits: out.securityBits })}</span></div>
                  {ms !== null && <div><span className="text-xs uppercase text-gray-500 block">{t('Generated in')}</span><span className="font-semibold text-gray-900 dark:text-white">{ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`}</span></div>}
                </div>
                {out.sshFingerprint && <p className="mt-3 text-xs font-mono break-all text-gray-700 dark:text-gray-300">{t('{sshFingerprint} (ssh-keygen -l)', { sshFingerprint: out.sshFingerprint })}</p>}
                <p className="mt-1 text-xs font-mono break-all text-gray-700 dark:text-gray-300">{t('JWK thumbprint: {jwkThumbprint}', { jwkThumbprint: out.jwkThumbprint })}</p>
              </Panel>
              <Tabs defaultValue="pem" className="w-full">
                <TabsList className="grid grid-cols-3 w-full">
                  <TabsTrigger value="pem">PEM</TabsTrigger>
                  <TabsTrigger value="ssh" disabled={!out.sshPublic}>{t('OpenSSH')}</TabsTrigger>
                  <TabsTrigger value="jwk">JWK</TabsTrigger>
                </TabsList>
                <TabsContent value="pem">
                  <Panel>
                    <div className="space-y-4">
                      <OutputBlock label={t('Public key (SPKI)')} value={out.publicPem} filename="public.pem" testId="public-pem" onCopy={() => trackAction('key_copied', { part: 'public_pem' })} />
                      <OutputBlock label={t('Private key (PKCS#8, unencrypted)')} value={out.privatePem} filename="private.pem" rows={12} onCopy={() => trackAction('key_copied', { part: 'private_pem' })} />
                      <p className="text-xs text-gray-600 dark:text-gray-400">{tr('To add a passphrase: {command}', { command: <code className="break-all">openssl pkcs8 -topk8 -v2 aes-256-cbc -in private.pem -out private-enc.pem</code> })}</p>
                    </div>
                  </Panel>
                </TabsContent>
                <TabsContent value="ssh">
                  {out.sshPublic && out.sshPrivate && (
                    <Panel>
                      <div className="space-y-4">
                        <OutputBlock label={t('Public key (authorized_keys line)')} value={out.sshPublic} filename={`${base}.pub`} testId="ssh-public" onCopy={() => trackAction('key_copied', { part: 'ssh_public' })} />
                        <OutputBlock label={t('Private key (OpenSSH format)')} value={out.sshPrivate} filename={base} rows={12} onCopy={() => trackAction('key_copied', { part: 'ssh_private' })} />
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          {tr('Save as {path}, run {chmod}, then add a passphrase with {keygen}.', {
                            path: <code>~/.ssh/{base}</code>,
                            chmod: <code>chmod 600 ~/.ssh/{base}</code>,
                            keygen: <code>ssh-keygen -p -f ~/.ssh/{base}</code>,
                          })}
                        </p>
                      </div>
                    </Panel>
                  )}
                </TabsContent>
                <TabsContent value="jwk">
                  <Panel>
                    <div className="space-y-4">
                      <OutputBlock label={t('Public JWK')} value={JSON.stringify(out.publicJwk, null, 2)} filename="public.jwk.json" />
                      <OutputBlock label={t('Private JWK')} value={JSON.stringify(out.privateJwk, null, 2)} filename="private.jwk.json" rows={12} />
                    </div>
                  </Panel>
                </TabsContent>
              </Tabs>
              <Notice tone="warn">{t('Treat the private key like a password: store it encrypted, never commit it to a repository, and generate production keys for servers or certificate authorities on the machine that will use them when you can.')}</Notice>
            </>
          )}
        </div>
      </div>
    </SecurityShell>
  );
};

export default RsaKeyGenerator;
