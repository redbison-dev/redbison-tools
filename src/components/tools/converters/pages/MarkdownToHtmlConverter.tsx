import React, { useMemo, useState } from 'react';
import { marked } from 'marked';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useToolResult } from '@/hooks/useToolResult';
import ConverterShell from '../ConverterShell';
import { msg, useT } from '@/i18n';

const H1 = msg('Markdown to HTML Converter');
const TAGLINE = msg('Paste Markdown, get clean HTML with a live preview. GitHub-style line breaks optional.');

const SAMPLE = `# Release notes\n\nShipping **v2.1** today.\n\n- Faster exports\n- [Docs](https://example.com)\n\n> Thanks for the reports!`;

/** /markdown-to-html-converter. marked in the browser; nothing is uploaded. */
export default function MarkdownToHtmlConverterPage() {
  const { t } = useT();
  const { toast } = useToast();
  const [md, setMd] = useState(SAMPLE);
  const [breaks, setBreaks] = useState(true);

  const html = useMemo(() => {
    try {
      return String(marked.parse(md, { async: false, gfm: true, breaks }));
    } catch {
      return '';
    }
  }, [md, breaks]);

  useToolResult('converted', html.slice(0, 120));

  return (
    <ConverterShell
      category={{ label: t('Tech Tools'), href: '/category/development-tech' }}
      subcategory={{ label: t('Data Conversion'), href: '/category/development-tech/data-conversion' }}
      h1={H1}
      tagline={TAGLINE}
    >
      <div className="flex items-center gap-3">
        <Button variant={breaks ? 'default' : 'outline'} size="sm" onClick={() => setBreaks(!breaks)}>
          {t('Single newline = <br> (GitHub style)')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            navigator.clipboard.writeText(html);
            toast({ title: t('Result Copied'), description: t('The HTML is on your clipboard.') });
          }}
        >
          <Copy className="h-4 w-4 mr-1" aria-hidden="true" /> {t('Copy HTML')}
        </Button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="md-in" className="font-semibold">{t('Markdown')}</Label>
          <Textarea id="md-in" rows={14} value={md} onChange={(e) => setMd(e.target.value)} className="font-mono text-sm" />
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="md-out" className="font-semibold">{t('HTML')}</Label>
            <Textarea id="md-out" rows={7} readOnly value={html} className="font-mono text-sm bg-gray-50" onFocus={(e) => e.currentTarget.select()} />
          </div>
          <div className="space-y-2">
            <Label className="font-semibold">{t('Preview (sandboxed)')}</Label>
            <iframe
              title={t('Rendered preview of the HTML')}
              sandbox=""
              srcDoc={`<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;margin:12px">${html}</body>`}
              className="h-56 w-full rounded-lg border border-gray-200 bg-white"
            />
          </div>
        </div>
      </div>
      <p className="text-sm text-gray-600">
        {t('CommonMark plus GitHub tables, strikethrough and task lists. The preview runs in a sandboxed frame with scripts disabled, and your text never leaves the browser.')}
      </p>
    </ConverterShell>
  );
}
