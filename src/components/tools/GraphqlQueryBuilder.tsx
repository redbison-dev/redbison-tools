
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Play, Download, Plus, Minus, Code, Maximize, Minimize } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import { useIsMobile } from '@/hooks/use-mobile';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { useNavigate } from 'react-router-dom';
import { buildGraphqlQuery } from '@/lib/tools/graphql-query-builder';
import { useT } from '@/i18n';

interface Field {
  name: string;
  selected: boolean;
  args?: { [key: string]: string };
}

interface QueryType {
  name: string;
  fields: Field[];
}

const GraphqlQueryBuilder = () => {
  const { t } = useT();
  const navigate = useNavigate();

  const handleToolSelect = (toolId: string) => {
    navigate(`/${toolId}`);
  };
  const [activeTab, setActiveTab] = useState('query');
  const [queryName, setQueryName] = useState('');
  const [variables, setVariables] = useState('');
  const [builtQuery, setBuiltQuery] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copyAnimation, setCopyAnimation] = useState(false);
  const [downloadAnimation, setDownloadAnimation] = useState(false);
  const { toast } = useToast();
  const { trackAction } = useToolAnalytics();
  const isMobile = useIsMobile();

  const [queryTypes] = useState<QueryType[]>([
    {
      name: 'User',
      fields: [
        { name: 'id', selected: false },
        { name: 'name', selected: false },
        { name: 'email', selected: false },
        { name: 'posts', selected: false }
      ]
    },
    {
      name: 'Post',
      fields: [
        { name: 'id', selected: false },
        { name: 'title', selected: false },
        { name: 'content', selected: false },
        { name: 'author', selected: false },
        { name: 'createdAt', selected: false }
      ]
    }
  ]);

  const [selectedFields, setSelectedFields] = useState<{ [key: string]: boolean }>({});
  const [fieldArgs, setFieldArgs] = useState<{ [key: string]: string }>({});

  const toggleField = (typeName: string, fieldName: string) => {
    const key = `${typeName}.${fieldName}`;
    setSelectedFields(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const updateFieldArgs = (typeName: string, fieldName: string, args: string) => {
    const key = `${typeName}.${fieldName}`;
    setFieldArgs(prev => ({
      ...prev,
      [key]: args
    }));
  };

  const buildQuery = () => {
    const selectedEntries = Object.entries(selectedFields).filter(([_, selected]) => selected);
    
    if (selectedEntries.length === 0) {
      toast({
        title: t('No fields selected'),
        description: t('Please select at least one field to build a query'),
        variant: "destructive",
      });
      return;
    }

    const query = buildGraphqlQuery({
      operation: activeTab === 'mutation' ? 'mutation' : 'query',
      name: queryName,
      variables,
      selected: selectedFields,
      args: fieldArgs,
    });

    setBuiltQuery(query);
    trackAction('build_query');
  };

  const copyQuery = () => {
    navigator.clipboard.writeText(builtQuery);
    setCopyAnimation(true);
    setTimeout(() => setCopyAnimation(false), 1000);
    trackAction('copy_query');
  };

  const downloadQuery = () => {
    const blob = new Blob([builtQuery], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'query.graphql';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setDownloadAnimation(true);
    setTimeout(() => setDownloadAnimation(false), 1000);
    trackAction('download_query');
  };

  const clearAll = () => {
    setSelectedFields({});
    setFieldArgs({});
    setBuiltQuery('');
    setQueryName('');
    setVariables('');
    trackAction('clear_all');
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  return (
    <>

      <div className={`${isFullscreen ? 'fixed inset-0 z-50 bg-white overflow-auto' : ''}`}>
        <div className={`${isFullscreen ? 'min-h-screen p-4 sm:p-8' : 'tool-page bg-white min-h-screen'}`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-8 py-1 sm:py-2">
            <div className="tool-header">
              <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                  <h1 className="tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
                    <Code className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-pink-600" />
                    {t('GraphQL Query Builder')}
                  </h1>
                  <p className="tool-description text-gray-600 text-sm sm:text-base ml-11 sm:ml-13">{t('Build GraphQL queries and mutations visually')}</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <Badge variant="outline" className="border-pink-500 text-pink-600 px-3 py-1 bg-pink-50 text-xs sm:text-sm">{t('GraphQL')}</Badge>
                  <Badge variant="outline" className="border-purple-500 text-purple-600 px-3 py-1 bg-purple-50 text-xs sm:text-sm">{t('Query Builder')}</Badge>
                  {!isMobile && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={toggleFullscreen}
                      className="border-gray-300 text-gray-600 hover:bg-gray-100"
                    >
                      {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 mt-6 sm:mt-8">
              <Card className="bg-white border-2 border-gray-200 rounded-2xl shadow-sm">
                <CardHeader>
                  <CardTitle className="text-black text-lg sm:text-xl">{t('Query Builder')}</CardTitle>
                  <CardDescription>
                    {t('Select fields and configure your GraphQL query')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="query">{t('Query')}</TabsTrigger>
                      <TabsTrigger value="mutation">{t('Mutation')}</TabsTrigger>
                    </TabsList>
                  </Tabs>

                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium mb-2 block">{t('Query Name (optional)')}</label>
                      <Input
                        placeholder={t('e.g., GetUsers')}
                        value={queryName}
                        onChange={(e) => setQueryName(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium mb-2 block">{t('Variables (optional)')}</label>
                      <Input
                        placeholder={t('e.g., $id: ID!, $limit: Int')}
                        value={variables}
                        onChange={(e) => setVariables(e.target.value)}
                      />
                    </div>

                    <div className="space-y-4">
                      <h3 className="text-sm font-medium">{t('Available Fields')}</h3>
                      {queryTypes.map((type) => (
                        <div key={type.name} className="border rounded-lg p-4 space-y-3">
                          <h4 className="font-medium text-sm text-pink-600">{type.name}</h4>
                          <div className="space-y-2">
                            {type.fields.map((field) => {
                              const fieldKey = `${type.name}.${field.name}`;
                              const isSelected = selectedFields[fieldKey] || false;
                              return (
                                <div key={field.name} className="space-y-2">
                                  <div className="flex items-center space-x-2">
                                    <button
                                      onClick={() => toggleField(type.name, field.name)}
                                      className={`flex items-center space-x-2 p-2 rounded border transition-colors w-full ${
                                        isSelected 
                                          ? 'bg-pink-50 border-pink-200' 
                                          : 'hover:bg-gray-50'
                                      }`}
                                    >
                                      {isSelected ? (
                                        <Minus className="h-4 w-4 text-pink-600" />
                                      ) : (
                                        <Plus className="h-4 w-4 text-gray-500" />
                                      )}
                                      <span className="text-sm font-mono">{field.name}</span>
                                    </button>
                                  </div>
                                  {isSelected && (
                                    <Input
                                      placeholder={t('Field arguments (optional)')}
                                      value={fieldArgs[fieldKey] || ''}
                                      onChange={(e) => updateFieldArgs(type.name, field.name, e.target.value)}
                                      className="ml-6 text-sm"
                                    />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
                      <Button onClick={buildQuery} className="flex-1 bg-pink-600 hover:bg-pink-700 text-white">
                        <Play className="h-4 w-4 mr-2" />
                        {t('Build Query')}
                      </Button>
                      <Button variant="outline" onClick={clearAll} className="sm:w-auto">
                        {t('Clear All')}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white border-2 border-gray-200 rounded-2xl shadow-sm">
                <CardHeader>
                  <CardTitle className="text-black text-lg sm:text-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <span>{t('Generated Query')}</span>
                    <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 w-full sm:w-auto">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={copyQuery} 
                        disabled={!builtQuery}
                        className={`transition-all duration-300 ${
                          copyAnimation ? 'bg-green-50 border-green-500 text-green-600 scale-105' : ''
                        }`}
                      >
                        <Copy className="h-4 w-4 mr-1" />
                        {copyAnimation ? t('Copied!') : t('Copy')}
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={downloadQuery} 
                        disabled={!builtQuery}
                        className={`transition-all duration-300 ${
                          downloadAnimation ? 'bg-green-50 border-green-500 text-green-600 scale-105' : ''
                        }`}
                      >
                        <Download className="h-4 w-4 mr-1" />
                        {downloadAnimation ? t('Downloaded!') : t('Download')}
                      </Button>
                    </div>
                  </CardTitle>
                  <CardDescription>
                    {t('Your GraphQL query will appear here')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {builtQuery ? (
                    <Textarea
                      value={builtQuery}
                      readOnly
                      className="min-h-[400px] font-mono text-sm bg-gray-50"
                    />
                  ) : (
                    <div className="text-center py-12 text-gray-500">
                      <Play className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>{t('Select fields and click "Build Query" to generate your GraphQL query')}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
          
        </div>
      </div>
    </>
  );
};

export default GraphqlQueryBuilder;
