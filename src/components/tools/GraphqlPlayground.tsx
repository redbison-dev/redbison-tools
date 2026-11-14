
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Play, Copy, Download, Settings, FileText, Code2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { useNavigate } from 'react-router-dom';
import { networkErrorMessage, pickOperationName, readGraphqlResponse } from '@/lib/tools/graphql-playground';
import { useSampleOverwriteConfirm, useInitialSnapshot } from '@/components/tools/shared/SampleOverwriteConfirm';
import { msg, useT } from '@/i18n';

interface QueryResult {
  data?: any;
  errors?: any[];
  extensions?: any;
}

const GraphqlPlayground = () => {
  const { t } = useT();
  const navigate = useNavigate();

  const handleToolSelect = (toolId: string) => {
    navigate(`/${toolId}`);
  };
  const [endpoint, setEndpoint] = useState('');
  const [query, setQuery] = useState('');
  const [variables, setVariables] = useState('{}');
  const [headers, setHeaders] = useState('{}');
  const [result, setResult] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { trackAction } = useToolAnalytics();

  const sampleQuery = `query GetUsers($first: Int = 10) {
  users(first: $first) {
    edges {
      node {
        id
        name
        email
        createdAt
        profile {
          bio
          avatar
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}`;

  const sampleVariables = `{
  "first": 5
}`;

  const sampleHeaders = `{
  "Authorization": "Bearer your-token-here",
  "Content-Type": "application/json"
}`;

  const executeQuery = async () => {
    if (!endpoint.trim()) {
      toast({
        title: t('Error'),
        description: t('Please enter a GraphQL endpoint URL'),
        variant: "destructive",
      });
      return;
    }

    if (!query.trim()) {
      toast({
        title: t('Error'),
        description: t('Please enter a GraphQL query'),
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    trackAction('execute_query');

    try {
      let parsedVariables = {};
      let parsedHeaders = {};

      try {
        parsedVariables = JSON.parse(variables || '{}');
      } catch (e) {
        throw new Error(t('Invalid JSON in variables'));
      }

      try {
        parsedHeaders = JSON.parse(headers || '{}');
      } catch (e) {
        throw new Error(t('Invalid JSON in headers'));
      }

      let response: Response;
      try {
        const operationName = pickOperationName(query);
        response = await fetch(endpoint.trim(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/graphql-response+json, application/json',
            ...parsedHeaders,
          },
          body: JSON.stringify({
            query,
            variables: parsedVariables,
            ...(operationName ? { operationName } : {}),
          }),
        });
      } catch (networkError) {
        throw new Error(networkErrorMessage(networkError, endpoint.trim(), t));
      }

      const data = readGraphqlResponse(response.status, response.statusText, await response.text(), t);
      setResult(data);

      if (data.errors) {
        toast({
          title: t('Query executed with errors'),
          description: t('Found {length} error(s)', { length: data.errors.length }),
          variant: "destructive",
        });
      } else {
        toast({
          title: t('Success'),
          description: t('Query executed successfully'),
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t('Unknown error occurred');
      setResult({
        errors: [{ message: errorMessage }]
      });
      toast({
        title: t('Error'),
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Load Sample asks before replacing anything the user typed.
  const sampleState = { endpoint, query, variables, headers };
  const { requestSampleLoad, confirmDialog } = useSampleOverwriteConfirm(sampleState, useInitialSnapshot(sampleState));

  const loadSample = () => requestSampleLoad(() => {
    setQuery(sampleQuery);
    setVariables(sampleVariables);
    setHeaders(sampleHeaders);
    setEndpoint('https://api.example.com/graphql');
    trackAction('load_sample');
  });

  const copyQuery = () => {
    navigator.clipboard.writeText(query);
    toast({
      title: t('Copied'),
      description: t('Query copied to clipboard'),
    });
    trackAction('copy_query');
  };

  const copyResult = () => {
    if (result) {
      navigator.clipboard.writeText(JSON.stringify(result, null, 2));
      toast({
        title: t('Copied'),
        description: t('Result copied to clipboard'),
      });
      trackAction('copy_result');
    }
  };

  const downloadResult = () => {
    if (result) {
      const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'graphql-result.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      trackAction('download_result');
    }
  };

  const formatJson = (jsonString: string, setter: (value: string) => void) => {
    try {
      const parsed = JSON.parse(jsonString);
      setter(JSON.stringify(parsed, null, 2));
    } catch (e) {
      toast({
        title: t('Error'),
        description: t('Invalid JSON format'),
        variant: "destructive",
      });
    }
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
            toolName="GraphQL Playground"
          />
          </div>
          
          <div className="tool-header mt-3">
            <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2">
                <h1 className="tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
                  <Play className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-blue-600" />
                  {t('GraphQL Playground')}
                </h1>
                <p className="tool-description text-gray-600 text-sm sm:text-base ml-11 sm:ml-13">{t('Send GraphQL queries and mutations to any endpoint with variables and custom headers')}</p>
              </div>
              
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <Badge variant="outline" className="border-blue-500 text-blue-600 px-3 py-1 bg-blue-50 text-xs sm:text-sm">{t('GraphQL')}</Badge>
                <Badge variant="outline" className="border-purple-500 text-purple-600 px-3 py-1 bg-purple-50 text-xs sm:text-sm">IDE</Badge>
              </div>
            </div>
          </div>

          <div className="space-y-6 sm:space-y-8 mt-6 sm:mt-8">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Left Panel - Query Editor */}
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center">
                        <Settings className="h-5 w-5 mr-2" />
                        {t('Configuration')}
                      </div>
                      <Button variant="outline" size="sm" onClick={loadSample}>
                        {t('Load Sample')}
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm font-medium mb-1 block">{t('GraphQL Endpoint')}</label>
                        <Input
                          placeholder="https://api.example.com/graphql"
                          value={endpoint}
                          onChange={(e) => setEndpoint(e.target.value)}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="flex-1">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center">
                        <Code2 className="h-5 w-5 mr-2" />
                        {t('Query Editor')}
                      </div>
                      <div className="flex space-x-2">
                        <Button variant="outline" size="sm" onClick={copyQuery}>
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button onClick={executeQuery} disabled={loading} size="sm">
                          <Play className="h-4 w-4 mr-1" />
                          {loading ? t('Running...') : t(msg.ctx('action', 'Run'))}
                        </Button>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      placeholder={t('Enter your GraphQL query here...')}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      className="min-h-[300px] font-mono text-sm"
                    />
                  </CardContent>
                </Card>

                <Tabs defaultValue="variables" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="variables">{t('Variables')}</TabsTrigger>
                    <TabsTrigger value="headers">{t('Headers')}</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="variables">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between text-base">
                          {t('Query Variables')}
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => formatJson(variables, setVariables)}
                          >
                            {t('Format')}
                          </Button>
                        </CardTitle>
                        <CardDescription>{t('JSON object with query variables')}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Textarea
                          placeholder='{"userId": "123", "first": 10}'
                          value={variables}
                          onChange={(e) => setVariables(e.target.value)}
                          className="min-h-[120px] font-mono text-sm"
                        />
                      </CardContent>
                    </Card>
                  </TabsContent>
                  
                  <TabsContent value="headers">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between text-base">
                          {t('HTTP Headers')}
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => formatJson(headers, setHeaders)}
                          >
                            {t('Format')}
                          </Button>
                        </CardTitle>
                        <CardDescription>{t('Additional headers for the request')}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Textarea
                          placeholder='{"Authorization": "Bearer token", "X-API-Key": "key"}'
                          value={headers}
                          onChange={(e) => setHeaders(e.target.value)}
                          className="min-h-[120px] font-mono text-sm"
                        />
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              </div>

              {/* Right Panel - Results */}
              <div className="space-y-4">
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center">
                        <FileText className="h-5 w-5 mr-2" />
                        {t('Query Result')}
                        {result && (
                          <Badge variant="outline" className="ml-2">
                            {result.errors ? t('Error') : t('Success')}
                          </Badge>
                        )}
                      </div>
                      {result && (
                        <div className="flex space-x-2">
                          <Button variant="outline" size="sm" onClick={copyResult}>
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="sm" onClick={downloadResult}>
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {result ? (
                      <div className="space-y-4">
                        {result.data && (
                          <div>
                            <h4 className="font-semibold text-green-700 mb-2">{t('Data:')}</h4>
                            <Textarea
                              value={JSON.stringify(result.data, null, 2)}
                              readOnly
                              className="min-h-[200px] font-mono text-sm bg-green-50"
                            />
                          </div>
                        )}
                        
                        {result.errors && (
                          <div>
                            <h4 className="font-semibold text-red-700 mb-2">{t('Errors:')}</h4>
                            <Textarea
                              value={JSON.stringify(result.errors, null, 2)}
                              readOnly
                              className="min-h-[150px] font-mono text-sm bg-red-50"
                            />
                          </div>
                        )}
                        
                        {result.extensions && (
                          <div>
                            <h4 className="font-semibold text-blue-700 mb-2">{t('Extensions:')}</h4>
                            <Textarea
                              value={JSON.stringify(result.extensions, null, 2)}
                              readOnly
                              className="min-h-[100px] font-mono text-sm bg-blue-50"
                            />
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-[400px] text-gray-500">
                        <div className="text-center">
                          <Play className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p>{t('Execute a query to see results here')}</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Usage Guide */}
            <Card>
              <CardHeader>
                <CardTitle>{t('How to use GraphQL Playground')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <h4 className="font-semibold mb-2">{t('Getting Started:')}</h4>
                    <ul className="space-y-1 text-gray-600">
                      <li>{t('• Enter your GraphQL endpoint URL')}</li>
                      <li>{t('• Write your query in the editor')}</li>
                      <li>{t('• Add variables and headers as needed')}</li>
                      <li>{t('• Click "Run" to execute the query')}</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">{t('Features:')}</h4>
                    <ul className="space-y-1 text-gray-600">
                      <li>{t('• Syntax highlighting and formatting')}</li>
                      <li>{t('• Variables and headers support')}</li>
                      <li>{t('• Copy and download results')}</li>
                      <li>{t('• Error handling and display')}</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          
        </div>
      </div>
      {confirmDialog}
    </>
  );
};

export default GraphqlPlayground;
