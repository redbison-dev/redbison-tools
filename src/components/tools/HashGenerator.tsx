import React, { useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Copy, Hash, Maximize, Minimize, Upload, CheckCircle, XCircle, Loader2, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';

// hashing.ts loads hash-wasm with dynamic import(); only the algorithm table is static.
import { HASH_ALGORITHMS, hashBlob, hashText, type HashAlgorithm, type HashFamily } from '@/lib/tools/hashing';
import { useToolResult } from '@/hooks/useToolResult';
import { useT } from '@/i18n';

const FAMILIES: HashFamily[] = ['Common', 'SHA-3 and Keccak', 'Modern and regional', 'Checksums (not cryptographic)', 'Legacy'];

interface Result {
  algorithm: HashAlgorithm;
  hex: string;
}

const formatSize = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);

const HashGenerator = () => {
  const { t } = useT();
  const [mode, setMode] = useState<'text' | 'file'>('text');
  const [input, setInput] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [hashType, setHashType] = useState<HashAlgorithm>('SHA-256');
  const [allAlgorithms, setAllAlgorithms] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [expected, setExpected] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { trackAction } = useToolAnalytics();

  const selected = allAlgorithms ? HASH_ALGORITHMS.map((a) => a.value) : [hashType];
  const selectedAlgorithm = HASH_ALGORITHMS.find((alg) => alg.value === hashType);

  const generateHash = async () => {
    setError('');
    if (mode === 'text' && !input) {
      setError(t('Enter text to hash. Spaces and line breaks count as input.'));
      return;
    }
    if (mode === 'file' && !file) {
      setError(t('Choose or drop a file to hash.'));
      return;
    }
    setBusy(true);
    setProgress(0);
    try {
      let out: Result[];
      if (mode === 'text') {
        out = await Promise.all(selected.map(async (a) => ({ algorithm: a, hex: await hashText(input, a) })));
      } else {
        const digests = await hashBlob(file!, selected, setProgress);
        out = selected.map((a) => ({ algorithm: a, hex: digests[a] }));
      }
      setResults(out);
      trackAction('hash_generate', { algorithm: allAlgorithms ? 'all' : hashType, input: mode, bytes: mode === 'file' ? file!.size : undefined });
    } catch (e) {
      setResults([]);
      setError(e instanceof Error ? t('Failed to generate hash: {error}', { error: e.message }) : t('Failed to generate hash.'));
    } finally {
      setBusy(false);
    }
  };

  const pickFile = (f: File | undefined | null) => {
    if (!f) return;
    setFile(f);
    setResults([]);
    setError('');
  };

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard?.writeText(text);
    toast({ title: t('Copied!'), description: t('{type} copied to clipboard', { type }) });
    trackAction('hash_copy', { algorithm: type });
  };

  const expectedClean = expected.trim().toLowerCase().replace(/^0x/, '').replace(/\s+/g, '');
  const matchFor = (hex: string) => (expectedClean ? hex === expectedClean : null);
  const anyMatch = expectedClean ? results.find((r) => r.hex === expectedClean) : undefined;

  // tool_result once the output settles; the key is compared, never sent.
  useToolResult('generated', results.map((r) => `${r.algorithm}:${r.hex}`).join(','));

  return (
    <div className={isFullscreen ? 'fixed inset-0 z-50 bg-white overflow-auto' : ''}>
      <div className={isFullscreen ? 'min-h-screen p-4 sm:p-8' : 'tool-page bg-white min-h-screen'}>
        <div className="max-w-7xl mx-auto px-4 sm:px-8 -mt-5 pb-1 sm:pb-2">
          {!isFullscreen && (
            <div className="!m-0 !p-0 !mt-0 !pt-0 -mt-2">
              <ToolBreadcrumb
                category={{ label: t('Tech Tools'), href: '/category/development-tech' }}
                subcategory={{ label: t('Security Tools'), href: '/category/development-tech/security-tools' }}
                toolName="Hash Generator"
              />
            </div>
          )}

          <div className="tool-header mt-3">
            <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2">
                <h1 className="tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
                  <Hash className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-blue-600" />
                  {t('Hash Generator')}
                </h1>
                <p className="tool-description text-gray-600 text-sm sm:text-base ml-11 sm:ml-13">
                  {t('Hash text or files with {length} algorithms: SHA-2, SHA-3, BLAKE, MD5, CRC and xxHash', { length: HASH_ALGORITHMS.length })}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <Badge variant="outline" className="border-purple-500 text-purple-600 px-3 py-1 bg-purple-50 text-xs sm:text-sm">{t('Security')}</Badge>
                <Badge variant="outline" className="border-blue-500 text-blue-600 px-3 py-1 bg-blue-50 text-xs sm:text-sm">{t('Cryptography')}</Badge>
                {!isMobile && (
                  <Button size="sm" variant="outline" onClick={() => setIsFullscreen(!isFullscreen)} className="border-gray-300 text-gray-600 hover:bg-gray-100" aria-label={isFullscreen ? t('Exit fullscreen') : t('Fullscreen')}>
                    {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6 sm:space-y-8 mt-6 sm:mt-8">
            <Card className="bg-white border-2 border-gray-200 rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle className="text-black text-lg sm:text-xl flex items-center">
                  <Hash className="h-5 w-5 sm:h-6 sm:w-6 mr-2 sm:mr-3" />
                  {t('Generate a hash')}
                </CardTitle>
                <CardDescription className="text-gray-600 text-sm sm:text-base">
                  {t('Text is hashed as UTF-8 bytes. Files are read in 4 MB slices inside your browser and never uploaded.')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor="hash-algorithm">{t('Hash Algorithm')}</label>
                    <Select value={hashType} onValueChange={(v) => setHashType(v as HashAlgorithm)} disabled={allAlgorithms}>
                      <SelectTrigger id="hash-algorithm" className="bg-gray-50 border-2 border-gray-200">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FAMILIES.map((family) => (
                          <SelectGroup key={family}>
                            <SelectLabel>{t(family)}</SelectLabel>
                            {HASH_ALGORITHMS.filter((a) => a.family === family).map((alg) => (
                              <SelectItem key={alg.value} value={alg.value}>{alg.label} <span className="text-xs text-gray-500">{t('({bits}-bit)', { bits: alg.bits })}</span></SelectItem>
                            ))}
                          </SelectGroup>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedAlgorithm && !allAlgorithms && <p className="text-xs text-gray-500 mt-1">{t(selectedAlgorithm.description)}</p>}
                  </div>
                  <div className="flex items-center gap-3 md:pt-7">
                    <Switch id="hash-all" checked={allAlgorithms} onCheckedChange={setAllAlgorithms} />
                    <Label htmlFor="hash-all">{t('Compute all {length} algorithms at once', { length: HASH_ALGORITHMS.length })}</Label>
                  </div>
                </div>

                <Tabs value={mode} onValueChange={(v) => { setMode(v as 'text' | 'file'); setResults([]); setError(''); }}>
                  <TabsList>
                    <TabsTrigger value="text"><FileText className="h-4 w-4 mr-1" />{t('Text')}</TabsTrigger>
                    <TabsTrigger value="file"><Upload className="h-4 w-4 mr-1" />{t('File')}</TabsTrigger>
                  </TabsList>
                  <TabsContent value="text" className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor="hash-input">{t('Input Text')}</label>
                    <Textarea
                      id="hash-input"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder={t('Enter text to hash...')}
                      className="bg-gray-50 border-2 border-gray-200 font-mono min-h-[90px]"
                    />
                    <p className="text-xs text-gray-500 mt-1">{t('{length} bytes. A trailing newline changes the hash.', { length: new TextEncoder().encode(input).length })}</p>
                  </TabsContent>
                  <TabsContent value="file" className="mt-4">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => fileInput.current?.click()}
                      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileInput.current?.click()}
                      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={(e) => { e.preventDefault(); setDragOver(false); pickFile(e.dataTransfer.files?.[0]); }}
                      className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}`}
                    >
                      <Upload className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                      {file ? (
                        <p className="text-sm"><span className="font-medium">{file.name}</span> ({formatSize(file.size)})</p>
                      ) : (
                        <p className="text-sm text-gray-600">{t('Drop a file here or click to choose one. Any size your device can read.')}</p>
                      )}
                      <input ref={fileInput} type="file" className="hidden" data-testid="hash-file-input" onChange={(e) => pickFile(e.target.files?.[0])} />
                    </div>
                  </TabsContent>
                </Tabs>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor="hash-expected">{t('Expected hash (optional)')}</label>
                  <Input
                    id="hash-expected"
                    value={expected}
                    onChange={(e) => setExpected(e.target.value)}
                    placeholder={t('Paste a published checksum to compare')}
                    className="bg-gray-50 border-2 border-gray-200 font-mono"
                  />
                </div>

                <Button onClick={generateHash} disabled={busy} className="w-full bg-black hover:bg-gray-800 text-white py-3">
                  {busy ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <Hash className="h-5 w-5 mr-2" />}
                  {t('Generate Hash')}
                </Button>
                {busy && mode === 'file' && <Progress value={progress * 100} aria-label={t('Hashing progress')} />}
                {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

                {results.length > 0 && (
                  <div className="bg-gray-50 p-4 rounded-xl border-2 border-gray-200 space-y-2" data-testid="hash-results">
                    <div className="text-sm font-medium text-gray-700">
                      {mode === 'file' && file
                        ? results.length > 1 ? t('Generated Hashes of {name}', { name: file.name }) : t('Generated Hash of {name}', { name: file.name })
                        : results.length > 1 ? t('Generated Hashes') : t('Generated Hash')}
                    </div>
                    {expectedClean && (
                      <div className={`flex items-center gap-2 text-sm font-medium ${anyMatch ? 'text-green-700' : 'text-red-700'}`}>
                        {anyMatch ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                        {anyMatch ? t('Matches the expected value ({algorithm})', { algorithm: anyMatch.algorithm }) : t('No result matches the expected value')}
                      </div>
                    )}
                    <div className="divide-y divide-gray-200">
                      {results.map((r) => {
                        const m = matchFor(r.hex);
                        return (
                          <div key={r.algorithm} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 py-2" data-algorithm={r.algorithm}>
                            <span className="text-xs font-semibold text-gray-600 sm:w-28 shrink-0">{r.algorithm}</span>
                            <code className={`flex-1 font-mono text-xs sm:text-sm break-all ${m === true ? 'text-green-700' : 'text-black'}`}>{r.hex}</code>
                            <Button size="sm" variant="ghost" onClick={() => copyToClipboard(r.hex, r.algorithm)} aria-label={t('Copy {algorithm}', { algorithm: r.algorithm })}>
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="bg-blue-50 p-4 rounded-xl border-2 border-blue-200">
                  <h2 className="font-semibold text-blue-700 mb-2 text-sm sm:text-base">{t('Hash Algorithms')}</h2>
                  <ul className="text-xs sm:text-sm text-blue-600 grid gap-1 md:grid-cols-2">
                    {HASH_ALGORITHMS.map((alg) => (
                      <li key={alg.value}>• <strong>{t('{name}:', { name: alg.label })}</strong> {t(alg.description)}</li>
                    ))}
                  </ul>
                  <p className="text-xs text-blue-600 mt-2">
                    {t('Not included: Tiger, Snefru, GOST R 34.11-94 and HAVAL, which have no maintained browser implementation. None of these hashes is suitable for storing passwords; use bcrypt or Argon2.')}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HashGenerator;
