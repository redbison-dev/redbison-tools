import React, { useMemo, useState } from 'react';
import { GitBranch, Search, FileText, FlaskConical } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { WebPage, WebHeader, Panel, Chip, CopyButton, DownloadButton, CodeOut, LocalNote, useWebAnalytics } from './webopsShared';
import { GITIGNORE_TEMPLATES, findTemplates, buildGitignore, checkIgnored, type TemplateGroup } from '@/lib/tools/w500/webops-gitignore';
import { msg, useT } from '@/i18n';

const GROUPS: TemplateGroup[] = ['Language', 'Framework', 'Tool', 'IDE', 'OS'];
const GROUP_LABEL: Record<TemplateGroup, string> = { Language: msg('Languages'), Framework: msg('Frameworks'), Tool: msg('Tools'), IDE: msg('Editors and IDEs'), OS: msg('Operating systems') };
/** Templates named with a description rather than a product name (the names are msg()-marked in the lib). */
const DESCRIBED = new Set(['secrets']);

export default function GitignoreGenerator() {
  const { t: tx } = useT();
  const track = useWebAnalytics('gitignore-generator');
  const [selected, setSelected] = useState<string[]>(['node', 'macos', 'windows', 'vscode']);
  const [q, setQ] = useState('');
  const [extra, setExtra] = useState('');
  const [paths, setPaths] = useState('node_modules/react/index.js\n.env\n.env.example\n.vscode/settings.json\nsrc/index.ts\ndist/');

  const visible = useMemo(() => new Set(findTemplates(q).map((t) => t.id)), [q]);
  const built = useMemo(() => buildGitignore(selected, extra), [selected, extra]);
  const tests = useMemo(
    () =>
      paths
        .split(/\r?\n/)
        .map((p) => p.trim())
        .filter(Boolean)
        .slice(0, 50)
        .map((p) => ({ path: p, r: checkIgnored(built.content, p) })),
    [paths, built.content],
  );

  const patternSummary = (length: number, removed: number) =>
    !removed ? tx('{length} patterns', { length })
      : tx(msg.plural(removed, { one: '{length} patterns, {removed} duplicate removed', other: '{length} patterns, {removed} duplicates removed' }, 'removed'), { length, removed });

  const toggle = (id: string) => {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    track('toggle_template', { id });
  };

  return (
    <WebPage>
      <WebHeader h1={tx('.gitignore Generator')} icon={GitBranch} tagline={tx('Pick your languages, frameworks, editors and operating systems to build one clean .gitignore, then test real paths against it to see which rule ignores them.')} />
      <div className="grid gap-6 lg:grid-cols-2 mt-6">
        <div className="space-y-4 min-w-0">
          <Panel title={tx('Templates')} icon={Search}>
            <div>
              <Label htmlFor="tpl-q" className="text-sm font-medium text-black dark:text-white">
                {tx('Filter {length} templates', { length: GITIGNORE_TEMPLATES.length })}
              </Label>
              <Input id="tpl-q" value={q} placeholder={tx('python, unity, jetbrains...')} onChange={(e) => setQ(e.target.value)} className="mt-1 bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600" />
            </div>
            {GROUPS.map((g) => {
              const items = GITIGNORE_TEMPLATES.filter((t) => t.group === g && visible.has(t.id));
              if (!items.length) return null;
              return (
                <div key={g}>
                  <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">{tx(GROUP_LABEL[g])}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {items.map((t) => (
                      <Chip key={t.id} active={selected.includes(t.id)} onClick={() => toggle(t.id)}>
                        {DESCRIBED.has(t.id) ? tx(t.name) : t.name}
                      </Chip>
                    ))}
                  </div>
                </div>
              );
            })}
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-sm text-gray-600 dark:text-gray-300">{tx('{length} selected', { length: selected.length })}</span>
              {selected.length > 0 && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setSelected([])}>
                  {tx('Clear')}
                </Button>
              )}
            </div>
            <div>
              <Label htmlFor="extra" className="text-sm font-medium text-black dark:text-white">
                {tx('Your own lines (added at the end)')}
              </Label>
              <Textarea id="extra" value={extra} placeholder={tx('uploads/\n*.local.json\n!keep-me.txt')} onChange={(e) => setExtra(e.target.value)} rows={3} className="mt-1 font-mono text-xs sm:text-sm bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600" />
            </div>
          </Panel>
          <Panel title={tx('Test paths against this file')} icon={FlaskConical}>
            <Textarea aria-label={tx('Paths to test, one per line')} value={paths} onChange={(e) => setPaths(e.target.value)} rows={6} className="font-mono text-xs sm:text-sm bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600" />
            <p className="text-xs text-gray-500 dark:text-gray-400">{tx('Paths are relative to the repository root. End a path with / to test it as a directory.')}</p>
            <ul className="space-y-1 text-sm" data-testid="gitignore-tests">
              {tests.map(({ path, r }) => (
                <li key={path} className="flex flex-col sm:flex-row sm:gap-2">
                  <span className={`font-mono break-all ${r.ignored ? 'text-red-700 dark:text-red-300' : 'text-green-700 dark:text-green-300'}`}>
                    {r.ignored ? tx('ignored {path}', { path }) : tx('tracked {path}', { path })}
                  </span>
                  {r.rule && (
                    <span className="text-xs text-gray-500 dark:text-gray-400 break-all">
                      {r.via
                        ? tx('line {line}: {pattern} (parent {via} is excluded, so nothing inside can be re-included)', { line: r.rule.line, pattern: r.rule.pattern, via: r.via })
                        : tx('line {line}: {pattern}', { line: r.rule.line, pattern: r.rule.pattern })}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Panel>
        </div>
        <Panel title=".gitignore" icon={FileText}>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {patternSummary(built.content.split('\n').filter((l) => l.trim() && !l.startsWith('#')).length, built.duplicatesRemoved)}
          </p>
          <div data-testid="gitignore-output">
            <CodeOut value={built.content} label={tx('.gitignore content')} maxH="max-h-[40rem]" />
          </div>
          <div className="flex flex-wrap gap-2">
            <CopyButton text={built.content} label={tx('Copy')} onCopied={() => track('copy')} />
            <DownloadButton text={built.content} filename=".gitignore" label={tx('Download .gitignore')} onDone={() => track('download')} />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">{tx('Already committed files stay tracked. Run git rm -r --cached <path> once, then commit, to stop tracking them.')}</p>
          <LocalNote />
        </Panel>
      </div>
    </WebPage>
  );
}
