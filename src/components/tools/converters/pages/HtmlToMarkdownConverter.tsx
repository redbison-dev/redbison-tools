import React, { useMemo, useState } from 'react';
import TurndownService from 'turndown';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useToolResult } from '@/hooks/useToolResult';
import ConverterShell from '../ConverterShell';
import { msg, useT } from '@/i18n';

const H1 = msg('HTML to Markdown Converter');
const TAGLINE = msg('Paste HTML from a page or a CMS and get tidy Markdown for READMEs, docs and notes.');

const SAMPLE = `<h2>Welcome</h2>\n<p>This page has <strong>bold</strong>, <em>italics</em> and a <a href="https://example.com">link</a>.</p>\n<ul><li>First</li><li>Second</li></ul>`;

/** /html-to-markdown-converter. Turndown in the browser; nothing is uploaded. */
export default function HtmlToMarkdownConverterPage() {
  const { t } = useT();
  const { toast } = useToast();
  const [html, setHtml] = useState(SAMPLE);
  const [fenced, setFenced] = useState(true);

  const md = useMemo(() => {
    try {
      const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: fenced ? 'fenced' : 'indented', bulletListMarker: '-' });
      return td.turndown(html);
    } catch {
      return '';
    }
  }, [html, fenced]);

  useToolResult('converted', md.slice(0, 120));

  return (
    <ConverterShell
      category={{ label: t('Tech Tools'), href: '/category/development-tech' }}
      subcategory={{ label: t('Data Conversion'), href: '/category/development-tech/data-conversion' }}
      h1={H1}
      tagline={TAGLINE}
    >
      <div className="flex items-center gap-3">
        <Button variant={fenced ? 'default' : 'outline'} size="sm" onClick={() => setFenced(!fenced)}>
          {t('Fenced code blocks (```)')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            navigator.clipboard.writeText(md);
            toast({ title: t('Result Copied'), description: t('The Markdown is on your clipboard.') });
          }}
        >
          <Copy className="h-4 w-4 mr-1" aria-hidden="true" /> {t('Copy Markdown')}
        </Button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="h2m-in" className="font-semibold">HTML</Label>
          <Textarea id="h2m-in" rows={14} value={html} onChange={(e) => setHtml(e.target.value)} className="font-mono text-sm" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="h2m-out" className="font-semibold">Markdown</Label>
          <Textarea id="h2m-out" rows={14} readOnly value={md} className="font-mono text-sm bg-gray-50" onFocus={(e) => e.currentTarget.select()} />
        </div>
      </div>
      <p className="text-sm text-gray-600">
        {t('Headings become #, lists keep their nesting, links and images keep their targets, and tags Markdown cannot express are dropped rather than left as markup. Conversion happens in your browser only.')}
      </p>
    </ConverterShell>
  );
}
