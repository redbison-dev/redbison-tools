
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Copy, Download, Wand2, RotateCcw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { useNavigate } from 'react-router-dom';
import { formatGraphQL } from '@/lib/tools/graphql-schema-formatter';
import { useSampleOverwriteConfirm, useInitialSnapshot } from '@/components/tools/shared/SampleOverwriteConfirm';
import { useT } from '@/i18n';

const GraphqlSchemaFormatter = () => {
  const { t } = useT();
  const navigate = useNavigate();

  const handleToolSelect = (toolId: string) => {
    navigate(`/${toolId}`);
  };
  const [inputSchema, setInputSchema] = useState('');
  const [formattedSchema, setFormattedSchema] = useState('');
  const { toast } = useToast();
  const { trackAction } = useToolAnalytics();

  const sampleSchema = `type User{id:ID! name:String! email:String! posts:[Post!]!}type Post{id:ID! title:String! content:String! author:User! createdAt:String!}type Query{users:[User!]! user(id:ID!):User posts:[Post!]! post(id:ID!):Post}type Mutation{createUser(name:String! email:String!):User! createPost(title:String! content:String! authorId:ID!):Post!}`;

  const formatSchema = () => {
    if (!inputSchema.trim()) {
      toast({
        title: t('Error'),
        description: t('Please enter a GraphQL schema to format'),
        variant: "destructive",
      });
      return;
    }

    trackAction('format_schema');

    let formatted: string;
    try {
      formatted = formatGraphQL(inputSchema);
    } catch (e) {
      toast({
        title: t('Could not format'),
        description: e instanceof Error ? e.message : t('The schema could not be parsed'),
        variant: "destructive",
      });
      return;
    }

    setFormattedSchema(formatted);

    toast({
      title: t('Success'),
      description: t('Schema formatted successfully'),
    });
  };

  // Load Sample asks before replacing anything the user typed.
  const sampleState = { inputSchema };
  const { requestSampleLoad, confirmDialog } = useSampleOverwriteConfirm(sampleState, useInitialSnapshot(sampleState));

  const loadSample = () => requestSampleLoad(() => {
    setInputSchema(sampleSchema);
    setFormattedSchema('');
    trackAction('load_sample');
  });

  const copyFormatted = () => {
    navigator.clipboard.writeText(formattedSchema);
    toast({
      title: t('Copied'),
      description: t('Formatted schema copied to clipboard'),
    });
    trackAction('copy_formatted');
  };

  const downloadFormatted = () => {
    const blob = new Blob([formattedSchema], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'formatted-schema.graphql';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    trackAction('download_formatted');
  };

  const clearAll = () => {
    setInputSchema('');
    setFormattedSchema('');
    trackAction('clear_all');
  };

  return (
    <>

      <div className="tool-page bg-white min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 -mt-5 pb-1 sm:pb-2">
          {/* Breadcrumb */}
          <div className="!m-0 !p-0 !mt-0 !pt-0 -mt-2">
          <ToolBreadcrumb 
            category={{ label: t('Tech Tools'), href: "/category/development-tech" }}
            subcategory={{ label: t('API Tools'), href: "/category/development-tech/api-tools" }}
            toolName="GraphQL Schema Formatter"
          />
          </div>
          
          <div className="tool-header mt-3">
            <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2">
                <h1 className="tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
                  <Wand2 className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-blue-600" />
                  {t('GraphQL Schema Formatter')}
                </h1>
                <p className="tool-description text-gray-600 text-sm sm:text-base ml-11 sm:ml-13">{t('Format & beautify GraphQL schema definitions with proper indentation')}</p>
              </div>
              
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <Badge variant="outline" className="border-blue-500 text-blue-600 px-3 py-1 bg-blue-50 text-xs sm:text-sm">{t('GraphQL')}</Badge>
                <Badge variant="outline" className="border-green-500 text-green-600 px-3 py-1 bg-green-50 text-xs sm:text-sm">{t('Formatter')}</Badge>
              </div>
            </div>
          </div>

          <div className="space-y-6 sm:space-y-8 mt-6 sm:mt-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    {t('Input Schema')}
                    <Button variant="outline" size="sm" onClick={loadSample}>
                      {t('Load Sample')}
                    </Button>
                  </CardTitle>
                  <CardDescription>
                    {t('Paste your unformatted GraphQL schema here')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    placeholder={t('Paste your unformatted GraphQL schema here...')}
                    value={inputSchema}
                    onChange={(e) => setInputSchema(e.target.value)}
                    className="min-h-[400px] font-mono text-sm"
                  />
                  <div className="flex space-x-2">
                    <Button onClick={formatSchema} className="flex-1">
                      <Wand2 className="h-4 w-4 mr-2" />
                      {t('Format Schema')}
                    </Button>
                    <Button variant="outline" onClick={clearAll}>
                      <RotateCcw className="h-4 w-4 mr-2" />
                      {t('Clear')}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    {t('Formatted Schema')}
                    <div className="flex space-x-2">
                      <Button variant="outline" size="sm" onClick={copyFormatted} disabled={!formattedSchema}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={downloadFormatted} disabled={!formattedSchema}>
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardTitle>
                  <CardDescription>
                    {t('Your beautifully formatted schema')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {formattedSchema ? (
                    <Textarea
                      value={formattedSchema}
                      readOnly
                      className="min-h-[400px] font-mono text-sm bg-gray-50"
                    />
                  ) : (
                    <div className="text-center py-12 text-gray-500">
                      <Wand2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>{t('Enter a GraphQL schema and click "Format Schema" to see the formatted result')}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
          
        </div>
      </div>
      {confirmDialog}
    </>
  );
};

export default GraphqlSchemaFormatter;
