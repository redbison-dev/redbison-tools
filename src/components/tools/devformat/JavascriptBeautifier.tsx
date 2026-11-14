import React, { useDeferredValue, useMemo, useState } from 'react';
import { Braces, Settings2, FileCode2, ArrowLeftRight, Eraser } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { beautifyJs, minifyJs, sizeStats, type BraceStyle, type JsLanguage } from '@/lib/tools/w500/dev-format-js';
import { DevPage, DevHeader, Panel, PickField, Segmented, CodeArea, CopyDownload, Notice, Chip, CheckField, fmtBytes, useDevActions, PRIVACY_NOTE } from './shared';
import { useT } from '@/i18n';

const H1 = 'JavaScript Beautifier and Minifier';

const SAMPLE = `// Sample: paste your own code here
const api="https://api.example.com";async function loadUsers(ids,{retries=2}={}){const out=[];for(const id of ids){let res;for(let i=0;i<=retries;i++){res=await fetch(\`\${api}/users/\${id}\`);if(res.ok)break}if(!res.ok)throw new Error("HTTP "+res.status);out.push(await res.json())}return out.filter(u=>u.active).map(u=>({id:u.id,name:u.name.trim()}))}
export default loadUsers;
`;

const JavascriptBeautifier = () => {
  const { t } = useT();
  const [input, setInput] = useState(SAMPLE);
  const [mode, setMode] = useState<'beautify' | 'minify'>('beautify');
  const [language, setLanguage] = useState<JsLanguage>('javascript');
  const [indent, setIndent] = useState('2');
  const [brace, setBrace] = useState<BraceStyle>('collapse');
  const [chained, setChained] = useState(false);
  const [blankLines, setBlankLines] = useState('1');
  const [keepLicense, setKeepLicense] = useState(true);
  const { copy, download, track } = useDevActions(H1);
  const deferred = useDeferredValue(input);

  const result = useMemo(() => {
    if (!deferred.trim()) return { code: '', warnings: [] as string[], error: '' };
    try {
      if (mode === 'minify') {
        if (language === 'jsx') return { code: '', warnings: [], error: t('JSX has to be compiled to JavaScript before it can be minified here. Switch to Beautify, or paste the compiled output.') };
        return { code: minifyJs(deferred, { keepLicense }).code, warnings: [], error: '' };
      }
      const r = beautifyJs(deferred, { language, indentSize: Number(indent), braceStyle: brace, breakChainedMethods: chained, maxBlankLines: Number(blankLines) });
      return { ...r, error: '' };
    } catch (e) {
      return { code: '', warnings: [], error: (e as Error).message };
    }
  }, [deferred, mode, language, indent, brace, chained, blankLines, keepLicense]);

  const stats = sizeStats(deferred, result.code);
  const ext = language === 'typescript' ? 'ts' : language === 'jsx' ? 'jsx' : 'js';

  return (
    <DevPage>
      <DevHeader h1={t(H1)} sub="code-formatters" icon={Braces} tagline={t('Pretty-print messy or minified JavaScript, TypeScript and JSX with consistent indentation, or strip comments and whitespace to shrink a script. Every result is checked token by token against your input.')} />
      <div className="grid lg:grid-cols-3 gap-6 mt-6">
        <div className="space-y-6 min-w-0">
          <Panel title={t('Options')} icon={Settings2}>
            <Segmented
              label={t('Mode')}
              value={mode}
              onChange={(v) => {
                setMode(v as 'beautify' | 'minify');
                track('mode', { mode: v });
              }}
              options={[
                { value: 'beautify', label: t('Beautify') },
                { value: 'minify', label: t('Minify') },
              ]}
            />
            <PickField
              id="js-lang"
              label={t('Language')}
              value={language}
              onChange={(v) => setLanguage(v as JsLanguage)}
              options={[
                { value: 'javascript', label: t('JavaScript') },
                { value: 'typescript', label: t('TypeScript') },
                { value: 'jsx', label: t('JSX / TSX (beautify only)') },
              ]}
            />
            {mode === 'beautify' ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <PickField
                    id="js-indent"
                    label={t('Indent')}
                    value={indent}
                    onChange={setIndent}
                    options={[
                      { value: '2', label: t('2 spaces') },
                      { value: '4', label: t('4 spaces') },
                      { value: '0', label: t('Tabs') },
                    ]}
                  />
                  <PickField
                    id="js-blank"
                    label={t('Blank lines kept')}
                    value={blankLines}
                    onChange={setBlankLines}
                    options={[
                      { value: '0', label: t('None') },
                      { value: '1', label: t('Up to 1') },
                      { value: '2', label: t('Up to 2') },
                    ]}
                  />
                </div>
                <PickField
                  id="js-brace"
                  label={t('Brace style')}
                  value={brace}
                  onChange={(v) => setBrace(v as BraceStyle)}
                  options={[
                    { value: 'collapse', label: t('Same line (K&R, 1TBS)') },
                    { value: 'expand', label: t('Own line (Allman)') },
                    { value: 'end-expand', label: t('Else and catch on own line') },
                    { value: 'collapse,preserve-inline', label: t('Same line, keep short blocks inline') },
                  ]}
                />
                <CheckField id="js-chain" label={t('Break chained method calls onto new lines')} checked={chained} onChange={setChained} />
              </>
            ) : (
              <CheckField id="js-license" label={t('Keep /*! licence comments')} checked={keepLicense} onChange={setKeepLicense} />
            )}
            <p className="text-xs text-gray-500 dark:text-gray-400">{t(PRIVACY_NOTE)}</p>
          </Panel>
        </div>

        <div className="lg:col-span-2 space-y-4 min-w-0">
          <Panel title={mode === 'beautify' ? t('Beautify') : t('Minify')} icon={FileCode2}>
            <CodeArea
              id="js-input"
              label={t('Your code')}
              value={input}
              onChange={setInput}
              rows={10}
              placeholder={t('Paste JavaScript or TypeScript')}
              actions={
                <>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setInput(SAMPLE)}>
                    {t('Sample')}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setInput('')}>
                    <Eraser className="h-4 w-4 mr-1" />{' '}{t('Clear')}
                  </Button>
                </>
              }
            />
            {result.error ? (
              <Notice tone="error" title={t('Could not process the code')} items={[result.error]} />
            ) : (
              <>
                <CodeArea
                  id="js-output"
                  label={mode === 'beautify' ? t('Formatted code') : t('Minified code')}
                  value={result.code}
                  readOnly
                  rows={14}
                  actions={
                    <>
                      <CopyDownload text={result.code} filename={`${mode === 'minify' ? 'script.min' : 'script'}.${ext}`} mime="text/javascript" onCopy={copy} onDownload={download} />
                      <Button type="button" variant="ghost" size="sm" disabled={!result.code} onClick={() => setInput(result.code)} title={t('Use the output as the new input')}>
                        <ArrowLeftRight className="h-4 w-4" />
                        <span className="sr-only">{t('Use output as input')}</span>
                      </Button>
                    </>
                  }
                />
                <div className="flex flex-wrap gap-2" data-testid="js-stats">
                  <Chip label={t('Input')} value={fmtBytes(stats.inputBytes)} />
                  <Chip label={t('Output')} value={fmtBytes(stats.outputBytes)} />
                  <Chip label={stats.savedPercent >= 0 ? t('Smaller by') : t('Larger by')} value={`${Math.abs(stats.savedPercent)}%`} />
                  <Chip label={t('Lines')} value={String(result.code ? result.code.split('\n').length : 0)} />
                </div>
                {result.warnings.length > 0 && <Notice tone="warn" title={t('Check the output')} items={result.warnings.map((w) => t(w))} />}
                {mode === 'minify' && result.code && (
                  <Notice tone="info" title={t('Whitespace and comment removal only')} items={[t('Names are not shortened and dead code is not removed, so the result is safe for any input but larger than terser or esbuild output. Use those in a build step for production bundles.')]} />
                )}
              </>
            )}
          </Panel>
        </div>
      </div>
    </DevPage>
  );
};

export default JavascriptBeautifier;
