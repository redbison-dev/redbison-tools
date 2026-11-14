
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Copy, Download, Code, Settings } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { useNavigate } from 'react-router-dom';
import { generateTypeScript } from '@/lib/tools/graphql-typescript-generator';
import { useSampleOverwriteConfirm, useInitialSnapshot } from '@/components/tools/shared/SampleOverwriteConfirm';
import { useT } from '@/i18n';

const GraphqlTypescriptGenerator = () => {
  const { t } = useT();
  const navigate = useNavigate();
  
  const handleToolSelect = (toolId: string) => {
    navigate(`/${toolId}`);
  };
  
  const [schema, setSchema] = useState('');
  const [generatedTypes, setGeneratedTypes] = useState('');
  const [options, setOptions] = useState({
    generateInterfaces: true,
    generateEnums: true,
    addComments: true,
    exportAll: true
  });
  const { toast } = useToast();
  const { trackAction } = useToolAnalytics();

  const sampleSchema = `type User {
  id: ID!
  name: String!
  email: String!
  age: Int
  posts: [Post!]!
  role: UserRole!
}

type Post {
  id: ID!
  title: String!
  content: String!
  author: User!
  createdAt: String!
  published: Boolean!
}

enum UserRole {
  ADMIN
  USER
  MODERATOR
}

input CreateUserInput {
  name: String!
  email: String!
  age: Int
  role: UserRole = USER
}`;

  const generateTypes = () => {
    if (!schema.trim()) {
      toast({
        title: t('Error'),
        description: t('Please enter a GraphQL schema to generate types'),
        variant: "destructive",
      });
      return;
    }

    trackAction('generate_types');

    let types: string;
    try {
      types = generateTypeScript(schema, options);
    } catch (e) {
      toast({
        title: t('Could not parse schema'),
        description: e instanceof Error ? e.message : t('The schema could not be parsed'),
        variant: "destructive",
      });
      return;
    }

    setGeneratedTypes(types);

    toast({
      title: t('Success'),
      description: t('TypeScript types generated successfully'),
    });
  };

  // Load Sample asks before replacing anything the user typed.
  const sampleState = { schema };
  const { requestSampleLoad, confirmDialog } = useSampleOverwriteConfirm(sampleState, useInitialSnapshot(sampleState));

  const loadSample = () => requestSampleLoad(() => {
    setSchema(sampleSchema);
    setGeneratedTypes('');
    trackAction('load_sample');
  });

  const copyTypes = () => {
    navigator.clipboard.writeText(generatedTypes);
    toast({
      title: t('Copied'),
      description: t('TypeScript types copied to clipboard'),
    });
    trackAction('copy_types');
  };

  const downloadTypes = () => {
    const blob = new Blob([generatedTypes], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'graphql-types.ts';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    trackAction('download_types');
  };

  const clearAll = () => {
    setSchema('');
    setGeneratedTypes('');
    trackAction('clear_all');
  };

  return (
    <div className="w-full max-w-6xl mx-auto p-4 space-y-6">

      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('GraphQL to TypeScript Generator')}</h1>
        <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
          {t('Generate TypeScript types, interfaces, and enums from your GraphQL schema definitions.')}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              {t('GraphQL Schema')}
              <Button variant="outline" size="sm" onClick={loadSample}>
                {t('Load Sample')}
              </Button>
            </CardTitle>
            <CardDescription>
              {t('Paste your GraphQL schema here')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder={t('Paste your GraphQL schema here...')}
              value={schema}
              onChange={(e) => setSchema(e.target.value)}
              className="min-h-[300px] font-mono text-sm"
            />
            
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center">
                  <Settings className="h-4 w-4 mr-2" />
                  {t('Generation Options')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm">{t('Generate Interfaces')}</label>
                  <Switch
                    checked={options.generateInterfaces}
                    onCheckedChange={(checked) => 
                      setOptions(prev => ({ ...prev, generateInterfaces: checked }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-sm">{t('Generate Enums (off: string unions)')}</label>
                  <Switch
                    checked={options.generateEnums}
                    onCheckedChange={(checked) => 
                      setOptions(prev => ({ ...prev, generateEnums: checked }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-sm">{t('Add Comments')}</label>
                  <Switch
                    checked={options.addComments}
                    onCheckedChange={(checked) => 
                      setOptions(prev => ({ ...prev, addComments: checked }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-sm">{t('Export All')}</label>
                  <Switch
                    checked={options.exportAll}
                    onCheckedChange={(checked) => 
                      setOptions(prev => ({ ...prev, exportAll: checked }))
                    }
                  />
                </div>
              </CardContent>
            </Card>

            <div className="flex space-x-2">
              <Button onClick={generateTypes} className="flex-1">
                <Code className="h-4 w-4 mr-2" />
                {t('Generate Types')}
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
              {t('TypeScript Types')}
              <div className="flex space-x-2">
                <Button variant="outline" size="sm" onClick={copyTypes} disabled={!generatedTypes}>
                  <Copy className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={downloadTypes} disabled={!generatedTypes}>
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </CardTitle>
            <CardDescription>
              {t('Generated TypeScript types')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {generatedTypes ? (
              <Textarea
                value={generatedTypes}
                readOnly
                className="min-h-[400px] font-mono text-sm bg-gray-50"
              />
            ) : (
              <div className="text-center py-12 text-gray-500">
                <Code className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>{t('Enter a GraphQL schema and click "Generate Types" to see TypeScript types')}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
      {confirmDialog}
    </div>
  );
};

export default GraphqlTypescriptGenerator;
