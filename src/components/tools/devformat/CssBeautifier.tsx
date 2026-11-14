import React, { useDeferredValue, useMemo, useState } from 'react';
import { Paintbrush, Settings2, FileCode2, ArrowLeftRight, Eraser } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCss, type CssSyntax } from '@/lib/tools/w500/dev-format-css';
import { sizeStats } from '@/lib/tools/w500/dev-format-js';
import { DevPage, DevHeader, Panel, PickField, Segmented, CodeArea, CopyDownload, Notice, Chip, CheckField, fmtBytes, useDevActions, PRIVACY_NOTE } from './shared';
import { useT } from '@/i18n';

const H1 = 'CSS Beautifier and Minifier';

const SAMPLE = `/* Sample: paste your own stylesheet */
.card,.card--wide{z-index:2;padding:16px 24px;border-top:4px solid #dc2626;border:1px solid #e5e7eb;display:flex;-webkit-box-shadow:0 1px 2px rgba(0,0,0,.08);box-shadow:0 1px 2px rgba(0,0,0,.08);background:#fff url("bg.svg") no-repeat}
.card>h2{margin:0 0 8px;font:600 1.25rem/1.3 system-ui,sans-serif}
@media (max-width:600px){.card{flex-direction:column;padding:12px}.card:hover .icon{transform:rotate(8deg)}}
`;

const EXT: Record<CssSyntax, string> = { css: 'css', scss: 'scss', less: 'less' };

const CssBeautifier = () => {
  const { t } = useT();
  const [input, setInput] = useState(SAMPLE);
  const [mode, setMode] = useState<'beautify' | 'minify'>('beautify');
  const [syntax, setSyntax] = useState<CssSyntax>('css');
  const [sort, setSort] = useState(false);
  const [indent, setIndent] = useState('2');
  const [selectorPerLine, setSelectorPerLine] = useState(true);
  const [blankBetween, setBlankBetween] = useState(true);
  const [keepLicense, setKeepLicense] = useState(true);
  const { copy, download, track } = useDevActions(H1);
  const deferred = useDeferredValue(input);

  const result = useMemo(() => {
    if (!deferred.trim()) return { code: '', warnings: [] as string[], moved: 0, error: '' };
    try {
      const r = formatCss(deferred, { mode, syntax, sort, indentSize: Number(indent), selectorPerLine, blankLineBetweenRules: blankBetween, keepLicense });
      return { ...r, error: '' };
    } catch (e) {
      return { code: '', warnings: [], moved: 0, error: (e as Error).message };
    }
  }, [deferred, mode, syntax, sort, indent, selectorPerLine, blankBetween, keepLicense]);

  const stats = sizeStats(deferred, result.code);

  return (
    <DevPage>
      <DevHeader h1={t(H1)} sub="code-formatters" icon={Paintbrush} tagline={t('Format CSS, SCSS and Less with one declaration per line, minify a stylesheet without touching its values, or sort properties alphabetically without breaking shorthand overrides.')} />
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
              id="css-syntax"
              label={t('Syntax')}
              value={syntax}
              onChange={(v) => setSyntax(v as CssSyntax)}
              options={[
                { value: 'css', label: 'CSS' },
                { value: 'scss', label: t('SCSS (Sass)') },
                { value: 'less', label: t('Less') },
              ]}
            />
            <CheckField id="css-sort" label={t('Sort properties A to Z (cascade-safe)')} checked={sort} onChange={setSort} />
            {mode === 'beautify' ? (
              <>
                <PickField
                  id="css-indent"
                  label={t('Indent')}
                  value={indent}
                  onChange={setIndent}
                  options={[
                    { value: '2', label: t('2 spaces') },
                    { value: '4', label: t('4 spaces') },
                    { value: '0', label: t('Tabs') },
                  ]}
                />
                <CheckField id="css-sel" label={t('Each selector in a list on its own line')} checked={selectorPerLine} onChange={setSelectorPerLine} />
                <CheckField id="css-blank" label={t('Blank line between rules')} checked={blankBetween} onChange={setBlankBetween} />
              </>
            ) : (
              <CheckField id="css-license" label={t('Keep /*! licence comments')} checked={keepLicense} onChange={setKeepLicense} />
            )}
            <p className="text-xs text-gray-500 dark:text-gray-400">{t(PRIVACY_NOTE)}</p>
          </Panel>
        </div>
        <div className="lg:col-span-2 space-y-4 min-w-0">
          <Panel title={mode === 'beautify' ? t('Beautify') : t('Minify')} icon={FileCode2}>
            <CodeArea
              id="css-input"
              label={t('Your stylesheet')}
              value={input}
              onChange={setInput}
              rows={10}
              placeholder={t('Paste CSS, SCSS or Less')}
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
              <Notice tone="error" title={t('Could not parse the stylesheet')} items={[result.error]} />
            ) : (
              <>
                <CodeArea
                  id="css-output"
                  label={mode === 'beautify' ? t('Formatted stylesheet') : t('Minified stylesheet')}
                  value={result.code}
                  readOnly
                  rows={14}
                  actions={
                    <>
                      <CopyDownload text={result.code} filename={`styles${mode === 'minify' ? '.min' : ''}.${EXT[syntax]}`} mime="text/css" onCopy={copy} onDownload={download} />
                      <Button type="button" variant="ghost" size="sm" disabled={!result.code} onClick={() => setInput(result.code)} title={t('Use the output as the new input')}>
                        <ArrowLeftRight className="h-4 w-4" />
                        <span className="sr-only">{t('Use output as input')}</span>
                      </Button>
                    </>
                  }
                />
                <div className="flex flex-wrap gap-2">
                  <Chip label={t('Input')} value={fmtBytes(stats.inputBytes)} />
                  <Chip label={t('Output')} value={fmtBytes(stats.outputBytes)} />
                  <Chip label={stats.savedPercent >= 0 ? t('Smaller by') : t('Larger by')} value={`${Math.abs(stats.savedPercent)}%`} />
                  {sort && <Chip label={t('Declarations moved')} value={String(result.moved)} />}
                </div>
                {result.warnings.length > 0 && <Notice tone="warn" title={t('Check the output')} items={result.warnings.map((w) => t(w))} />}
                {sort && (
                  <Notice tone="info" title={t('How sorting works')} items={[t('Properties are ordered A to Z with vendor-prefixed copies next to the standard one. A shorthand and its longhands (border and border-top, margin and margin-left, font and line-height) keep their original order, because swapping them changes which value wins. Custom properties, $variables, @include and nested rules stay where they are.')]} />
                )}
              </>
            )}
          </Panel>
        </div>
      </div>
    </DevPage>
  );
};

export default CssBeautifier;
