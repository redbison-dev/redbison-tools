import React, { useMemo, useState } from 'react';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useToolResult } from '@/hooks/useToolResult';
import ConverterShell from '../ConverterShell';
import { msg, useT } from '@/i18n';

const H1 = msg('XML to JSON Converter');
const TAGLINE = msg('Validate XML and turn it into JSON, with attributes kept under an @_ prefix.');

const SAMPLE = `<order id="A-17">\n  <customer>Ada</customer>\n  <items>\n    <item sku="X1" qty="2">Widget</item>\n    <item sku="Y9" qty="1">Gadget</item>\n  </items>\n</order>`;

/** /xml-to-json-converter. fast-xml-parser in the browser; nothing is uploaded. */
export default function XmlToJsonConverterPage() {
  const { t } = useT();
  const { toast } = useToast();
  const [xml, setXml] = useState(SAMPLE);
  const [keepAttrs, setKeepAttrs] = useState(true);

  const out = useMemo(() => {
    const valid = XMLValidator.validate(xml);
    if (valid !== true) return { ok: false as const, error: `${valid.err.msg} (line ${valid.err.line})` };
    try {
      const parser = new XMLParser({ ignoreAttributes: !keepAttrs, attributeNamePrefix: '@_', parseTagValue: true });
      return { ok: true as const, json: JSON.stringify(parser.parse(xml), null, 2) };
    } catch (e) {
      return { ok: false as const, error: String((e as Error).message ?? e) };
    }
  }, [xml, keepAttrs]);

  useToolResult('converted', out.ok ? out.json.slice(0, 120) : '');

  return (
    <ConverterShell
      category={{ label: t('Tech Tools'), href: '/category/development-tech' }}
      subcategory={{ label: t('Data Conversion'), href: '/category/development-tech/data-conversion' }}
      h1={H1}
      tagline={TAGLINE}
    >
      <div className="flex items-center gap-3">
        <Button variant={keepAttrs ? 'default' : 'outline'} size="sm" onClick={() => setKeepAttrs(!keepAttrs)}>
          {t('Keep attributes (@_ prefix)')}
        </Button>
        {out.ok && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(out.json);
              toast({ title: t('Result Copied'), description: t('The JSON is on your clipboard.') });
            }}
          >
            <Copy className="h-4 w-4 mr-1" aria-hidden="true" /> {t('Copy JSON')}
          </Button>
        )}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="x2j-in" className="font-semibold">XML</Label>
          <Textarea id="x2j-in" rows={14} value={xml} onChange={(e) => setXml(e.target.value)} className="font-mono text-sm" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="x2j-out" className="font-semibold">JSON</Label>
          {out.ok ? (
            <Textarea id="x2j-out" rows={14} readOnly value={out.json} className="font-mono text-sm bg-gray-50" onFocus={(e) => e.currentTarget.select()} />
          ) : (
            <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{out.error}</p>
          )}
        </div>
      </div>
      <p className="text-sm text-gray-600">
        {t('The document is validated first, so a stray angle bracket gives a line number instead of silent garbage. Repeated elements become arrays, attributes keep the @_ prefix, and everything runs in your browser.')}
      </p>
    </ConverterShell>
  );
}
