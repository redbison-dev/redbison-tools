import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Copy, Download, FileText, Zap, Maximize2, Minimize2, Search, CheckCircle, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import { JSONPath } from 'jsonpath-plus';
import { useNavigate } from 'react-router-dom';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { useToolResult } from '@/hooks/useToolResult';
import { msg, useT } from '@/i18n';

const JsonBeautifier = () => {
  const { t } = useT();
  const navigate = useNavigate();
  
  const handleToolSelect = (toolId: string) => {
    navigate(`/${toolId}`);
  };
  
  const { trackAction } = useToolAnalytics();
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [queryPath, setQueryPath] = useState('');
  const [queryResult, setQueryResult] = useState('');
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    trackAction('tool_viewed', { tool: 'json-beautify-validate-query' });
  }, [trackAction]);

  // Validate JSON on input change
  useEffect(() => {
    if (!input.trim()) {
      setIsValid(null);
      return;
    }
    
    try {
      JSON.parse(input);
      setIsValid(true);
      setError('');
    } catch (err) {
      setIsValid(false);
      setError(msg('Invalid JSON format'));
    }
  }, [input]);

  const queryJSON = () => {
    if (!queryPath.trim()) {
      toast({
        title: t('Error'),
        description: t('Please enter a JSONPath query'),
        variant: "destructive",
      });
      return;
    }

    try {
      const parsed = JSON.parse(input);
      const result = JSONPath({ path: queryPath, json: parsed });
      setQueryResult(JSON.stringify(result, null, 2));
      trackAction('json_query', { queryPath, resultLength: result.length });
      toast({
        title: t('Success'),
        description: t('JSON query executed successfully!'),
      });
    } catch (err) {
      setQueryResult('');
      toast({
        title: t('Error'),
        description: t('Invalid JSONPath query or JSON format'),
        variant: "destructive",
      });
      trackAction('json_query_error', { error: 'invalid_query' });
    }
  };

  const beautifyJSON = () => {
    try {
      const parsed = JSON.parse(input);
      const formatted = JSON.stringify(parsed, null, 2);
      setOutput(formatted);
      setError('');
      trackAction('json_beautify', { inputLength: input.length, outputLength: formatted.length });
      toast({
        title: t('Success'),
        description: t('JSON formatted successfully!'),
      });
    } catch (err) {
      setError(msg('Invalid JSON format'));
      setOutput('');
      trackAction('json_beautify_error', { error: 'invalid_json' });
    }
  };

  const minifyJSON = () => {
    try {
      const parsed = JSON.parse(input);
      const minified = JSON.stringify(parsed);
      setOutput(minified);
      setError('');
      trackAction('json_minify', { inputLength: input.length, outputLength: minified.length });
      toast({
        title: t('Success'),
        description: t('JSON minified successfully!'),
      });
    } catch (err) {
      setError(msg('Invalid JSON format'));
      setOutput('');
      trackAction('json_minify_error', { error: 'invalid_json' });
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(output);
    trackAction('json_copy', { outputLength: output.length });
    toast({
      title: t('Copied'),
      description: t('JSON copied to clipboard!'),
    });
  };

  const downloadJSON = () => {
    const blob = new Blob([output], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'formatted.json';
    a.click();
    URL.revokeObjectURL(url);
    trackAction('json_download', { outputLength: output.length });
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  // Handle ESC key for fullscreen exit
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };

    if (isFullscreen) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullscreen]);

  // tool_result once the output settles; the key is compared, never sent.
  useToolResult('formatted', (output || queryResult) && `${output}\u0000${queryResult}`);

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 bg-white dark:bg-gray-900 z-50 overflow-auto">
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
            <h1 className="text-4xl font-bold text-black dark:text-white">{t('JSON Formatter and Validator')}</h1>
            <p className="text-gray-600 dark:text-gray-400 text-lg">{t('Format, minify, validate, and query JSON documents with JSONPath')}</p>
            </div>
            <Button onClick={toggleFullscreen} variant="outline" size="lg" className="border-2 border-gray-300 dark:border-gray-600">
              <Minimize2 className="h-5 w-5 mr-2" />
              {t('Exit Fullscreen')}
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="text-black dark:text-white text-xl flex items-center justify-between">
                  <span className="flex items-center">
                    <FileText className="h-6 w-6 mr-3" />
                    {t('Input JSON')}
                  </span>
                  {isValid !== null && (
                    <div className="flex items-center">
                      {isValid ? (
                        <Badge variant="outline" className="border-green-500 text-green-600 bg-green-50">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          {t('Valid')}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-red-500 text-red-600 bg-red-50">
                          <XCircle className="h-3 w-3 mr-1" />
                          {t('Invalid')}
                        </Badge>
                      )}
                    </div>
                  )}
                </CardTitle>
                <CardDescription>{t('Paste and validate your JSON data')}</CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder='{"name": "John", "age": 30, "hobbies": ["reading", "coding"]}'
                  className="min-h-[400px] bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white font-mono"
                />
                <div className="flex space-x-3 mt-4">
                  <Button onClick={beautifyJSON} disabled={!isValid} className="bg-black dark:bg-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200">
                    <Zap className="h-4 w-4 mr-2" />
                    {t('Beautify')}
                  </Button>
                  <Button onClick={minifyJSON} disabled={!isValid} variant="outline" className="border-gray-300 dark:border-gray-600">
                    {t('Minify')}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="text-black dark:text-white flex items-center justify-between text-xl">
                  <span className="flex items-center">
                    <FileText className="h-6 w-6 mr-3" />
                    {t('Output')}
                  </span>
                  <div className="flex space-x-2">
                    <Button size="sm" variant="outline" onClick={copyToClipboard} disabled={!output}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={downloadJSON} disabled={!output}>
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </CardTitle>
                <CardDescription>{t('Formatted JSON output')}</CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={output}
                  readOnly
                  className="min-h-[400px] bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white font-mono"
                  placeholder={t('Formatted JSON will appear here...')}
                />
                {error && (
                  <div className="mt-2 text-red-500 dark:text-red-400 text-sm">
                    {t(error)}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="text-black dark:text-white text-xl flex items-center">
                  <Search className="h-6 w-6 mr-3" />
                  {t('JSONPath Query')}
                </CardTitle>
                <CardDescription>{t('Query JSON using JSONPath expressions')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Input
                    value={queryPath}
                    onChange={(e) => setQueryPath(e.target.value)}
                    placeholder={t('{first} or {second}', { first: '$.name', second: '$..hobbies[*]' })}
                    className="bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white font-mono"
                  />
                  <Button onClick={queryJSON} disabled={!isValid || !queryPath.trim()} className="w-full">
                    <Search className="h-4 w-4 mr-2" />
                    {t('Execute Query')}
                  </Button>
                </div>
                <Textarea
                  value={queryResult}
                  readOnly
                  className="min-h-[300px] bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white font-mono text-sm"
                  placeholder={t('Query results will appear here...')}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      
      <div className={`${false ? 'fixed inset-0 z-50 bg-white overflow-auto' : ''}`}>
        <div className={`${false ? 'min-h-screen p-4 sm:p-8' : 'tool-page bg-white min-h-screen'}`}>
          <div className="max-w-full xl:max-w-[2800px] mx-auto px-1.5 sm:px-3 -mt-5 pb-1 sm:pb-2">
            {/* Breadcrumb */}
            <div className="!m-0 !p-0 !mt-0 !pt-0 -mt-2">
              <ToolBreadcrumb 
                category={{ label: t('Tech Tools'), href: "/category/development-tech" }}
                subcategory={{ label: t('Data Conversion'), href: "/category/development-tech/data-conversion" }}
                toolName="JSON Formatter"
              />
            </div>
            
            <div className="tool-header mt-6">
              <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                  <h1 className="tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
                    <FileText className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-blue-600" />
                    {t('JSON Formatter and Validator')}
                  </h1>
                  <p className="tool-description text-gray-600 text-sm sm:text-base ml-11 sm:ml-13">{t('Format, minify, validate, and query JSON documents with JSONPath')}</p>
                  <div className="flex space-x-3 ml-11 sm:ml-13">
                    <Badge variant="outline" className="border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950">JSON</Badge>
                    <Badge variant="outline" className="border-green-500 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950">{t(msg.ctx('beautify', 'Format'))}</Badge>
                    <Badge variant="outline" className="border-purple-500 text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950">{t('Validate')}</Badge>
                    <Badge variant="outline" className="border-orange-500 text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950">{t('Query')}</Badge>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <Button onClick={toggleFullscreen} variant="outline" className="border-2 border-gray-300 dark:border-gray-600">
                    <Maximize2 className="h-4 w-4 mr-2" />
                    {t('Fullscreen')}
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
              <Card className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 shadow-sm">
                <CardHeader className="pb-6">
                  <CardTitle className="text-black dark:text-white text-xl flex items-center justify-between">
                    <span className="flex items-center">
                      <FileText className="h-5 w-5 mr-3" />
                      {t('Input JSON')}
                    </span>
                    {isValid !== null && (
                      <div className="flex items-center">
                        {isValid ? (
                          <Badge variant="outline" className="border-green-500 text-green-600 bg-green-50">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            {t('Valid')}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-red-500 text-red-600 bg-red-50">
                            <XCircle className="h-3 w-3 mr-1" />
                            {t('Invalid')}
                          </Badge>
                        )}
                      </div>
                    )}
                  </CardTitle>
                  <CardDescription className="text-gray-600 dark:text-gray-400">{t('Paste and validate your JSON data')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder='{"name": "John", "age": 30, "hobbies": ["reading", "coding"]}'
                    className="min-h-[300px] bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white font-mono"
                  />
                  <div className="flex space-x-3 mt-4">
                    <Button onClick={beautifyJSON} disabled={!isValid} className="bg-black dark:bg-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200">
                      <Zap className="h-4 w-4 mr-2" />
                      {t('Beautify')}
                    </Button>
                    <Button onClick={minifyJSON} disabled={!isValid} variant="outline" className="border-gray-300 dark:border-gray-600">
                      {t('Minify')}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 shadow-sm">
                <CardHeader className="pb-6">
                  <CardTitle className="text-black dark:text-white flex items-center justify-between text-xl">
                    <span className="flex items-center">
                      <FileText className="h-5 w-5 mr-3" />
                      {t('Output')}
                    </span>
                    <div className="flex space-x-2">
                      <Button size="sm" variant="outline" onClick={copyToClipboard} disabled={!output}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={downloadJSON} disabled={!output}>
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardTitle>
                  <CardDescription className="text-gray-600 dark:text-gray-400">{t('Formatted JSON output')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={output}
                    readOnly
                    className="min-h-[300px] bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white font-mono"
                    placeholder={t('Formatted JSON will appear here...')}
                  />
                  {error && (
                    <div className="mt-2 text-red-500 dark:text-red-400 text-sm">
                      {t(error)}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 shadow-sm">
                <CardHeader className="pb-6">
                  <CardTitle className="text-black dark:text-white text-xl flex items-center">
                    <Search className="h-5 w-5 mr-3" />
                    {t('JSONPath Query')}
                  </CardTitle>
                  <CardDescription className="text-gray-600 dark:text-gray-400">{t('Query JSON using JSONPath expressions')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Input
                      value={queryPath}
                      onChange={(e) => setQueryPath(e.target.value)}
                      placeholder={t('{first} or {second}', { first: '$.name', second: '$..hobbies[*]' })}
                      className="bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white font-mono"
                    />
                    <Button onClick={queryJSON} disabled={!isValid || !queryPath.trim()} className="w-full">
                      <Search className="h-4 w-4 mr-2" />
                      {t('Execute Query')}
                    </Button>
                  </div>
                  <Textarea
                    value={queryResult}
                    readOnly
                    className="min-h-[250px] bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white font-mono text-sm"
                    placeholder={t('Query results will appear here...')}
                  />
                </CardContent>
              </Card>
            </div>
            
          </div>
        </div>
      </div>
    </>
  );
};

export default JsonBeautifier;