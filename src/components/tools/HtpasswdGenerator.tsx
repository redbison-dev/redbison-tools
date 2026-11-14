import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { KeyRound, Copy, Download, Plus, Trash2, CheckCircle, XCircle, HelpCircle, Dices, Loader2, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
// htpasswd.ts loads bcryptjs and hash-wasm with dynamic import(), so this static import stays light.
import { apacheSnippet, nginxSnippet, type HtpasswdScheme, type VerifyResult } from '@/lib/tools/htpasswd';
import { msg, useFormat, useT } from '@/i18n';

interface UserRow {
  id: number;
  user: string;
  password: string;
}

const SCHEMES: { value: HtpasswdScheme; label: string; note: string }[] = [
  { value: 'bcrypt', label: msg('bcrypt ($2y$), recommended'), note: msg('Salted and deliberately slow. Apache 2.4 reads it everywhere; nginx only where the system crypt() supports bcrypt.') },
  { value: 'apr1', label: msg('APR1-MD5 ($apr1$)'), note: msg('Apache\'s default before bcrypt. Salted, 1,000 MD5 rounds: far too fast for today\'s GPUs, but read by both Apache and nginx on every platform.') },
  { value: 'sha1', label: msg('SHA-1 ({SHA}), insecure'), note: msg('Unsalted single SHA-1. Identical passwords give identical hashes. Only for legacy migrations.') },
];

const PW_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/** 20 characters from a 57-symbol set (about 117 bits), without modulo bias. */
function randomPassword(length = 20): string {
  const out: string[] = [];
  const limit = 256 - (256 % PW_CHARS.length);
  while (out.length < length) {
    const buf = new Uint8Array(32);
    crypto.getRandomValues(buf);
    for (const b of buf) if (b < limit && out.length < length) out.push(PW_CHARS[b % PW_CHARS.length]);
  }
  return out.join('');
}

let rowId = 1;
const newRow = (user = '', password = ''): UserRow => ({ id: rowId++, user, password });

const HtpasswdGenerator = () => {
  const { t } = useT();
  const format = useFormat();
  const { toast } = useToast();
  const { trackAction } = useToolAnalytics();
  const [rows, setRows] = useState<UserRow[]>(() => [newRow('admin')]);
  const [scheme, setScheme] = useState<HtpasswdScheme>('bcrypt');
  const [cost, setCost] = useState(10);
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);

  const [verifyLine, setVerifyLine] = useState('');
  const [verifyPw, setVerifyPw] = useState('');
  const [verifyResult, setVerifyResult] = useState<(VerifyResult & { label: string; user?: string }) | null>(null);
  const [verifyError, setVerifyError] = useState('');
  const [verifying, setVerifying] = useState(false);

  const [realm, setRealm] = useState(() => t('Restricted area'));
  const [filePath, setFilePath] = useState('/etc/apache2/.htpasswd');
  const [location, setLocation] = useState('/admin');
  const snippets = useMemo(() => ({ apache: apacheSnippet({ realm, file: filePath, location }), nginx: nginxSnippet({ realm, file: filePath, location }) }), [realm, filePath, location]);

  const schemeInfo = SCHEMES.find((s) => s.value === scheme)!;

  const updateRow = (id: number, patch: Partial<UserRow>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const copy = (text: string, what: string) => {
    navigator.clipboard?.writeText(text);
    toast({ title: t('Copied'), description: t('{what} copied to the clipboard.', { what }) });
    trackAction('htpasswd_copy', { what });
  };

  const generate = async () => {
    setError('');
    setWarnings([]);
    setOutput('');
    const filled = rows.filter((r) => r.user || r.password);
    if (!filled.length) { setError(t('Add at least one user name and password.')); return; }
    setBusy(true);
    try {
      const lib = await import('@/lib/tools/htpasswd');
      const seen = new Set<string>();
      const warn: string[] = [];
      const lines: string[] = [];
      for (const r of filled) {
        const problem = lib.validateUsername(r.user);
        if (problem) throw new Error(t('{user}: {problem}', { user: r.user || t('(blank)'), problem: t(problem) }));
        if (!r.password) throw new Error(t('{user}: enter a password or click the dice for a random one.', { user: r.user }));
        if (seen.has(r.user)) throw new Error(t('{user} appears twice. Apache uses the first matching line, so keep user names unique.', { user: r.user }));
        seen.add(r.user);
        if (scheme === 'bcrypt' && lib.bcryptTruncates(r.password)) warn.push(t('{user}: bcrypt only uses the first 72 bytes of the password.', { user: r.user }));
        if (r.password.length < 12) warn.push(t('{user}: passwords under 12 characters are weak for an internet-facing login.', { user: r.user }));
        lines.push(await lib.htpasswdLine(r.user, r.password, scheme, cost));
      }
      setOutput(lines.join('\n') + '\n');
      setWarnings(warn);
      trackAction('htpasswd_generate', { scheme, cost: scheme === 'bcrypt' ? cost : undefined, users: lines.length });
    } catch (e) {
      setOutput('');
      setError(e instanceof Error ? e.message : t('Could not generate the file.'));
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    const blob = new Blob([output], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '.htpasswd';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    trackAction('htpasswd_download', { scheme });
  };

  const verify = async () => {
    setVerifyError('');
    setVerifyResult(null);
    if (!verifyLine.trim()) { setVerifyError(t('Paste a line such as {example} or just the hash.', { example: 'alice:$apr1$...' })); return; }
    setVerifying(true);
    try {
      const lib = await import('@/lib/tools/htpasswd');
      const line = verifyLine.trim().split(/\r?\n/).find((l) => l.trim() && !l.trim().startsWith('#')) ?? '';
      const parsed = lib.parseHtpasswdLine(line);
      // A bare hash has no "user:" prefix; a colon inside {SHA}/$..$ values never comes first.
      const bare = !parsed || /^(\$|\{)/.test(line);
      const hash = bare ? line : parsed!.hash;
      const result = await lib.verifyHtpasswd(verifyPw, hash);
      setVerifyResult({ ...result, label: lib.SCHEME_LABELS[result.scheme], user: bare ? undefined : parsed!.user });
      trackAction('htpasswd_verify', { scheme: result.scheme, match: result.match });
    } catch (e) {
      setVerifyError(e instanceof Error ? e.message : t('Could not check this line.'));
    } finally {
      setVerifying(false);
    }
  };

  const costHint = useMemo(() => {
    if (cost <= 5) return t('Fast. 5 is the htpasswd -B default, kept low because Apache rehashes on every request.');
    if (cost <= 9) return t('Moderate.');
    if (cost <= 12) return t('Good balance for Basic auth: each request costs tens to hundreds of milliseconds of server CPU.');
    return t('Slow. Every Basic-auth request re-runs bcrypt, so high costs add visible latency and CPU load.');
  }, [cost, t]);

  return (
    <div className="tool-page bg-white min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 -mt-5 pb-1 sm:pb-2">
        <div className="!m-0 !p-0 !mt-0 !pt-0 -mt-2">
          <ToolBreadcrumb
            category={{ label: t('Tech Tools'), href: '/category/development-tech' }}
            subcategory={{ label: t('Security Tools'), href: '/category/development-tech/security-tools' }}
            toolName="Htpasswd Generator"
          />
        </div>

        <div className="tool-header mt-3">
          <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <h1 className="tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
                <KeyRound className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-blue-600" />
                {t('Htpasswd Generator')}
              </h1>
              <p className="tool-description text-gray-600 text-sm sm:text-base ml-11 sm:ml-13">
                {t('Build .htpasswd lines for Apache and nginx Basic auth, and check a password against an existing line')}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <Badge variant="outline" className="border-blue-500 text-blue-600 px-3 py-1 bg-blue-50 text-xs sm:text-sm">{t('bcrypt / APR1 / SHA')}</Badge>
              <Badge variant="outline" className="border-green-500 text-green-600 px-3 py-1 bg-green-50 text-xs sm:text-sm">{t('Runs in your browser')}</Badge>
            </div>
          </div>
        </div>

        <div className="space-y-6 mt-6 sm:mt-8">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('Users and hash format')}</CardTitle>
                <CardDescription>{t('One line per user. Passwords never leave this tab.')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  {rows.map((r, i) => (
                    <div key={r.id} className="flex flex-col sm:flex-row gap-2">
                      <Input
                        aria-label={t('User name {value}', { value: i + 1 })}
                        placeholder={t('user name')}
                        value={r.user}
                        onChange={(e) => updateRow(r.id, { user: e.target.value })}
                        className="sm:w-40"
                        autoComplete="off"
                      />
                      <div className="flex flex-1 gap-2">
                        <Input
                          aria-label={t('Password {value}', { value: i + 1 })}
                          placeholder={t('password')}
                          type="text"
                          value={r.password}
                          onChange={(e) => updateRow(r.id, { password: e.target.value })}
                          className="font-mono"
                          autoComplete="off"
                          spellCheck={false}
                        />
                        <Button type="button" variant="outline" size="icon" title={t('Random 20-character password')} aria-label={t('Random password for row {value}', { value: i + 1 })} onClick={() => updateRow(r.id, { password: randomPassword() })}>
                          <Dices className="h-4 w-4" />
                        </Button>
                        <Button type="button" variant="outline" size="icon" title={t('Remove user')} aria-label={t('Remove row {value}', { value: i + 1 })} disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={() => setRows((rs) => [...rs, newRow()])}>
                    <Plus className="h-4 w-4 mr-1" />{' '}{t('Add user')}
                  </Button>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="htpasswd-scheme">{t('Hash format')}</Label>
                    <Select value={scheme} onValueChange={(v) => setScheme(v as HtpasswdScheme)}>
                      <SelectTrigger id="htpasswd-scheme"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SCHEMES.map((s) => <SelectItem key={s.value} value={s.value}>{t(s.label)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {scheme === 'bcrypt' && (
                    <div className="space-y-2">
                      <Label htmlFor="htpasswd-cost">{t('bcrypt cost (htpasswd -C)')}</Label>
                      <Select value={String(cost)} onValueChange={(v) => setCost(Number(v))}>
                        <SelectTrigger id="htpasswd-cost"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 14 }, (_, i) => i + 4).map((c) => (
                            <SelectItem key={c} value={String(c)}>{t('{c} ({value} rounds)', { c, value: format.number(2 ** c) })}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <p className="text-sm text-gray-600">{t(schemeInfo.note)}{scheme === 'bcrypt' ? ` ${costHint}` : ''}</p>
                <p className="text-xs text-gray-500">
                  {t('Not offered: DES crypt (htpasswd -d) keeps only the first 8 characters, and plain text (-p) is accepted by Apache only on Windows and NetWare.')}
                </p>

                <Button onClick={generate} disabled={busy} className="w-full bg-black hover:bg-gray-800 text-white">
                  {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <KeyRound className="h-4 w-4 mr-2" />}
                  {t('Generate .htpasswd')}
                </Button>
                {error && (
                  <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('.htpasswd output')}</CardTitle>
                <CardDescription>{t('Paste into your password file, or download it.')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  aria-label={t('htpasswd output')}
                  readOnly
                  value={output}
                  placeholder={t('Generated lines appear here, for example admin:$2y$10$...')}
                  className="font-mono text-xs sm:text-sm min-h-[140px]"
                />
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" disabled={!output} onClick={() => copy(output, t('.htpasswd lines'))}><Copy className="h-4 w-4 mr-2" />{t('Copy')}</Button>
                  <Button variant="outline" disabled={!output} onClick={download}><Download className="h-4 w-4 mr-2" />{t('Download .htpasswd')}</Button>
                </div>
                {warnings.length > 0 && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      <ul className="list-disc pl-4 space-y-1">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
                    </AlertDescription>
                  </Alert>
                )}
                <p className="text-xs text-gray-500">
                  {t('bcrypt and APR1 use a fresh random salt each time, so the same password gives a different line on every run. That is expected.')}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('Verify a password')}</CardTitle>
                <CardDescription>{t('Checks bcrypt, $apr1$, $1$, {sha}, {ssha} and plain entries.', { sha: '{SHA}', ssha: '{SSHA}' })}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="verify-line">{t('Line or hash')}</Label>
                  <Input id="verify-line" className="font-mono" placeholder="alice:$apr1$DKWq33Wr$VJYQEVQQ.dQXN8cE4auWr0" value={verifyLine} onChange={(e) => setVerifyLine(e.target.value)} spellCheck={false} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="verify-pw">{t('Password to test')}</Label>
                  <Input id="verify-pw" type="text" className="font-mono" value={verifyPw} onChange={(e) => setVerifyPw(e.target.value)} autoComplete="off" spellCheck={false} onKeyDown={(e) => e.key === 'Enter' && verify()} />
                </div>
                <Button onClick={verify} disabled={verifying} variant="outline" className="w-full">
                  {verifying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                  {t('Verify')}
                </Button>
                {verifyError && <Alert variant="destructive"><AlertDescription>{verifyError}</AlertDescription></Alert>}
                {verifyResult && (
                  <div
                    data-testid="verify-result"
                    className={`rounded-lg border-2 p-3 text-sm ${verifyResult.match === true ? 'border-green-300 bg-green-50 text-green-800' : verifyResult.match === false ? 'border-red-300 bg-red-50 text-red-800' : 'border-amber-300 bg-amber-50 text-amber-800'}`}
                  >
                    <div className="flex items-center gap-2 font-semibold">
                      {verifyResult.match === true ? <CheckCircle className="h-4 w-4" /> : verifyResult.match === false ? <XCircle className="h-4 w-4" /> : <HelpCircle className="h-4 w-4" />}
                      {verifyResult.match === true ? t('Password matches') : verifyResult.match === false ? t('Password does not match') : t('Cannot check this format here')}
                    </div>
                    <div className="mt-1">{verifyResult.user ? t('Format: {label}, user {user}', { label: t(verifyResult.label), user: verifyResult.user }) : t('Format: {label}', { label: t(verifyResult.label) })}</div>
                    {verifyResult.note && <div className="mt-1">{verifyResult.noteMsg ? t(verifyResult.noteMsg.text, { label: t(verifyResult.noteMsg.vars.label) }) : t(verifyResult.note)}</div>}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('Server configuration')}</CardTitle>
                <CardDescription>{t('Use an absolute path outside the web root so the file can never be downloaded.')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label htmlFor="cfg-realm">{t('Realm')}</Label>
                    <Input id="cfg-realm" value={realm} onChange={(e) => setRealm(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="cfg-file">{t('Password file')}</Label>
                    <Input id="cfg-file" value={filePath} onChange={(e) => setFilePath(e.target.value)} className="font-mono" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="cfg-loc">{t('Protected path')}</Label>
                    <Input id="cfg-loc" value={location} onChange={(e) => setLocation(e.target.value)} className="font-mono" />
                  </div>
                </div>
                <div className="space-y-3">
                    {([['Apache', snippets.apache], ['nginx', snippets.nginx]] as const).map(([name, text]) => (
                      <div key={name}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium">{name}</span>
                          <Button size="sm" variant="ghost" onClick={() => copy(text, t('{name} snippet', { name }))}><Copy className="h-3 w-3 mr-1" />{t('Copy')}</Button>
                        </div>
                        <pre className="bg-gray-50 border rounded-md p-3 text-xs overflow-x-auto whitespace-pre">{text}</pre>
                      </div>
                    ))}
                </div>
                <p className="text-xs text-gray-500">{t('Basic auth sends the password with every request, base64-encoded but not encrypted. Serve protected paths over HTTPS only.')}</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HtpasswdGenerator;
