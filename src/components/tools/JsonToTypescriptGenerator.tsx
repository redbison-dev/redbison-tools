import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Copy, Download, Code, Settings } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import { useNavigate } from 'react-router-dom';
import { generateTypescript, pascalCase, type JsonToTsOptions } from '@/lib/tools/json-to-typescript-generator';
import { useSampleOverwriteConfirm, useInitialSnapshot } from '@/components/tools/shared/SampleOverwriteConfirm';
import { useT } from '@/i18n';

type Options = JsonToTsOptions;

const SAMPLE = `{
  "id": 42,
  "name": "Ada Lovelace",
  "isActive": true,
  "email": null,
  "roles": ["admin", "editor"],
  "profile": {
    "bio": "Mathematician",
    "twitter": "@ada"
  },
  "posts": [
    { "id": 1, "title": "Analytical Engine", "views": 1200 },
    { "id": 2, "title": "Notes", "views": 800, "draft": true }
  ]
}`;

const JsonToTypescriptGenerator = () => {
  const { t } = useT();
  const navigate = useNavigate();
  const handleToolSelect = (toolId: string) => navigate(`/${toolId}`);

  const [jsonInput, setJsonInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<Options>({
    rootName: 'Root',
    useInterfaces: true,
    exportAll: true,
    optionalNulls: true,
    readonlyFields: false,
  });
  const { toast } = useToast();
  const { trackAction } = useToolAnalytics();

  const generate = () => {
    if (!jsonInput.trim()) {
      setError(t('Please paste a JSON payload to generate types.'));
      setOutput('');
      return;
    }
    try {
      const result = generateTypescript(jsonInput, options);
      setOutput(result);
      setError(null);
      trackAction('generate_types');
      toast({ title: t('Success'), description: t('TypeScript interfaces generated.') });
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('Invalid JSON');
      setError(msg);
      setOutput('');
    }
  };

  // Load Sample asks before replacing anything the user typed.
  const sampleState = { jsonInput };
  const { requestSampleLoad, confirmDialog } = useSampleOverwriteConfirm(sampleState, useInitialSnapshot(sampleState));

  const loadSample = () => requestSampleLoad(() => {
    setJsonInput(SAMPLE);
    setOutput('');
    setError(null);
    trackAction('load_sample');
  });

  const copyOutput = () => {
    if (!output) return;
    navigator.clipboard.writeText(output);
    toast({ title: t('Copied'), description: t('TypeScript types copied to clipboard.') });
    trackAction('copy_types');
  };

  const downloadOutput = () => {
    if (!output) return;
    const blob = new Blob([output], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${pascalCase(options.rootName || 'Root')}.ts`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    trackAction('download_types');
  };

  const clearAll = () => {
    setJsonInput('');
    setOutput('');
    setError(null);
    trackAction('clear_all');
  };

  return (
    <div className="w-full max-w-6xl mx-auto p-4 space-y-6">

      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          {t('JSON to TypeScript Generator')}
        </h1>
        <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
          {t('Paste any JSON payload and get TypeScript interfaces, with nested objects, arrays, unions and optional fields inferred automatically.')}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              {t('JSON Input')}
              <Button variant="outline" size="sm" onClick={loadSample}>
                {t('Load Sample')}
              </Button>
            </CardTitle>
            <CardDescription>{t('Paste your JSON payload here')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder='{"id": 1, "name": "example"}'
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              className="min-h-[300px] font-mono text-sm"
              aria-label={t('JSON input')}
            />
            {error && (
              <div className="text-sm text-destructive" role="alert">
                {error}
              </div>
            )}

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center">
                  <Settings className="h-4 w-4 mr-2" />
                  {t('Options')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-sm" htmlFor="root-name">{t('Root type name')}</label>
                  <Input
                    id="root-name"
                    value={options.rootName}
                    onChange={(e) =>
                      setOptions((p) => ({ ...p, rootName: e.target.value }))
                    }
                    className="max-w-[200px]"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-sm">{t('Use interfaces (vs. type aliases)')}</label>
                  <Switch
                    checked={options.useInterfaces}
                    onCheckedChange={(checked) =>
                      setOptions((p) => ({ ...p, useInterfaces: checked }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-sm">{t('Export all')}</label>
                  <Switch
                    checked={options.exportAll}
                    onCheckedChange={(checked) =>
                      setOptions((p) => ({ ...p, exportAll: checked }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-sm">{t('Treat nulls as optional (?)')}</label>
                  <Switch
                    checked={options.optionalNulls}
                    onCheckedChange={(checked) =>
                      setOptions((p) => ({ ...p, optionalNulls: checked }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-sm">{t('Readonly fields')}</label>
                  <Switch
                    checked={options.readonlyFields}
                    onCheckedChange={(checked) =>
                      setOptions((p) => ({ ...p, readonlyFields: checked }))
                    }
                  />
                </div>
              </CardContent>
            </Card>

            <div className="flex space-x-2">
              <Button onClick={generate} className="flex-1">
                <Code className="h-4 w-4 mr-2" />
                {t('Generate TypeScript')}
              </Button>
              <Button variant="outline" onClick={clearAll}>
                {t('Clear')}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              {t('TypeScript Output')}
              <div className="flex space-x-2">
                <Button variant="outline" size="sm" onClick={copyOutput} disabled={!output} aria-label={t('Copy TypeScript')}>
                  <Copy className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={downloadOutput} disabled={!output} aria-label={t('Download TypeScript')}>
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </CardTitle>
            <CardDescription>{t('Generated TypeScript interfaces')}</CardDescription>
          </CardHeader>
          <CardContent>
            {output ? (
              <Textarea
                value={output}
                readOnly
                className="min-h-[400px] font-mono text-sm bg-muted"
                aria-label={t('Generated TypeScript')}
              />
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Code className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>{t('Paste JSON and click "Generate TypeScript" to see the inferred interfaces.')}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {confirmDialog}
    </div>
  );
};

export default JsonToTypescriptGenerator;
