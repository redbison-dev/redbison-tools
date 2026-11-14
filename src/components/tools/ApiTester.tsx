import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Copy, Send, Globe, AlertCircle, Clock, CheckCircle, XCircle, Plus, X, Terminal, FileText, Import } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { useNavigate } from 'react-router-dom';
import {
  buildCurlCommand,
  buildFetchPlan,
  CurlCommandError,
  formatResponseBody,
  headerPairsToObject,
  headersToObject,
  parseCurlCommand as parseCurl,
} from '@/lib/tools/api-tester';
import { useSampleOverwriteConfirm, useInitialSnapshot } from '@/components/tools/shared/SampleOverwriteConfirm';
import { useT } from '@/i18n';

interface HeaderItem {
  key: string;
  value: string;
}

const COMMON_HEADERS = [
  'Accept',
  'Authorization',
  'Content-Type',
  'User-Agent',
  'Accept-Language',
  'Accept-Encoding',
  'Cache-Control',
  'Connection',
  'Cookie',
  'Host',
  'Origin',
  'Referer',
  'X-Requested-With',
  'X-Forwarded-For',
  'X-Real-IP',
  'X-API-Key',
  'X-Auth-Token',
  'If-Modified-Since',
  'If-None-Match'
];

const COMMON_CONTENT_TYPES = [
  'application/json',
  'application/xml',
  'application/x-www-form-urlencoded',
  'multipart/form-data',
  'text/plain',
  'text/html',
  'text/csv',
  'application/octet-stream'
];

const ApiTester = () => {
  const { t } = useT();
  const navigate = useNavigate();

  const handleToolSelect = (toolId: string) => {
    navigate(`/${toolId}`);
  };
  const [url, setUrl] = useState('');
  const [method, setMethod] = useState('GET');
  const [headerMode, setHeaderMode] = useState<'form' | 'json'>('form');
  const [headersJson, setHeadersJson] = useState('{\n  "Content-Type": "application/json",\n  "Accept": "application/json"\n}');
  const [headersForm, setHeadersForm] = useState<HeaderItem[]>([
    { key: 'Content-Type', value: 'application/json' },
    { key: 'Accept', value: 'application/json' }
  ]);
  const [body, setBody] = useState('');
  const [response, setResponse] = useState('');
  const [responseHeaders, setResponseHeaders] = useState('');
  const [statusCode, setStatusCode] = useState<number | null>(null);
  const [responseTime, setResponseTime] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [curlCommand, setCurlCommand] = useState('');
  const [curlInput, setCurlInput] = useState('');
  const [showCurlImport, setShowCurlImport] = useState(false);
  const { toast } = useToast();

  const addHeader = () => {
    setHeadersForm([...headersForm, { key: '', value: '' }]);
  };

  const removeHeader = (index: number) => {
    setHeadersForm(headersForm.filter((_, i) => i !== index));
  };

  const updateHeader = (index: number, field: 'key' | 'value', value: string) => {
    const updated = [...headersForm];
    updated[index][field] = value;
    setHeadersForm(updated);
  };

  const getCurrentHeaders = () => {
    if (headerMode === 'json') {
      try {
        return JSON.parse(headersJson);
      } catch {
        return {};
      }
    } else {
      return headerPairsToObject(headersForm);
    }
  };

  const generateCurlCommand = () =>
    buildCurlCommand({ method, url, headers: getCurrentHeaders(), body });

  const parseCurlCommand = (curl: string) => {
    try {
      const parsed = parseCurl(curl);
      setMethod(parsed.method);
      setUrl(parsed.url);
      setBody(parsed.body);
      if (parsed.headers.length > 0) {
        // The form only offers the common header names, so use canonical casing
        // and fall back to the JSON editor when a custom header is present.
        const canonical = parsed.headers.map((h) => ({
          key: COMMON_HEADERS.find((c) => c.toLowerCase() === h.key.toLowerCase()) ?? h.key,
          value: h.value,
        }));
        if (canonical.every((h) => COMMON_HEADERS.includes(h.key))) {
          setHeadersForm(canonical);
          setHeaderMode('form');
        } else {
          setHeadersJson(JSON.stringify(Object.fromEntries(canonical.map((h) => [h.key, h.value])), null, 2));
          setHeaderMode('json');
        }
      }

      setCurlInput('');
      setShowCurlImport(false);
      toast({
        title: t('cURL imported!'),
        description: t('Command has been parsed and loaded into the form.'),
      });
    } catch (err) {
      toast({
        title: t('Error'),
        description: err instanceof CurlCommandError ? t(err.source, err.vars) : err instanceof Error ? err.message : t('Failed to parse cURL command. Please check the format.'),
        variant: "destructive"
      });
    }
  };

  const sendRequest = async () => {
    if (!url.trim()) {
      setError(t('Please provide a URL'));
      return;
    }
    let target: URL;
    try {
      target = new URL(url.trim());
      if (target.protocol !== 'http:' && target.protocol !== 'https:') throw new Error('protocol');
    } catch {
      setError(t('Enter a full http:// or https:// URL, for example {url}', { url: 'https://jsonplaceholder.typicode.com/users' }));
      return;
    }
    if (headerMode === 'json') {
      try {
        JSON.parse(headersJson);
      } catch {
        setError(t('The headers JSON is not valid JSON.'));
        return;
      }
    }

    setLoading(true);
    setError('');
    setNotice('');
    setCurlCommand(generateCurlCommand());

    const plan = buildFetchPlan({ method, url: target.toString(), headers: getCurrentHeaders(), body });
    const notes: string[] = [];
    if (plan.bodyDropped) notes.push(t('Browsers do not allow a body on {method} requests, so the body was not sent (the cURL command omits it too).', { method }));
    if (plan.ignoredHeaders.length) notes.push(plan.ignoredHeaders.length === 1
      ? t('Browsers do not let web pages set {headers}; it was left out. Use the cURL command to send it.', { headers: plan.ignoredHeaders.join(', ') })
      : t('Browsers do not let web pages set {headers}; they were left out. Use the cURL command to send them.', { headers: plan.ignoredHeaders.join(', ') }));
    setNotice(notes.join(' '));

    const startTime = performance.now();
    try {
      const res = await fetch(target.toString(), { ...plan.init, redirect: 'follow' });
      const text = method === 'HEAD' ? '' : await res.text();
      setResponseTime(Math.round(performance.now() - startTime));
      setStatusCode(res.status);
      setResponse(formatResponseBody(text, res.headers.get('content-type')) || (res.status === 204 || method === 'HEAD' ? t('(no body)') : ''));
      setResponseHeaders(JSON.stringify(headersToObject(res.headers), null, 2));
    } catch (err) {
      setStatusCode(null);
      setResponse('');
      setResponseHeaders('');
      setResponseTime(null);
      const mixed = window.location.protocol === 'https:' && target.protocol === 'http:';
      setError(
        `${t('{error}: the browser could not complete the request.', { error: err instanceof Error ? err.message : t('Request failed') })} ` +
        (mixed
          ? `${t('This page is served over HTTPS and the URL is plain HTTP, which browsers block as mixed content.')} `
          : `${t('Most often the API does not send CORS headers (Access-Control-Allow-Origin) for this site, or the preflight for your headers was rejected.')} `) +
        t('Copy the cURL command and run it in a terminal to test without browser restrictions.')
      );
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: t('Copied!'),
      description: t('Content copied to clipboard'),
    });
  };

  const getStatusColor = (status: number | null) => {
    if (!status) return 'text-gray-500';
    if (status >= 200 && status < 300) return 'text-green-500';
    if (status >= 300 && status < 400) return 'text-yellow-500';
    if (status >= 400 && status < 500) return 'text-orange-500';
    return 'text-red-500';
  };

  const getStatusIcon = (status: number | null) => {
    if (!status) return null;
    if (status >= 200 && status < 300) return <CheckCircle className="h-4 w-4 text-green-500" />;
    if (status >= 400) return <XCircle className="h-4 w-4 text-red-500" />;
    return <AlertCircle className="h-4 w-4 text-yellow-500" />;
  };

  // Load Sample asks before replacing anything the user typed.
  const sampleState = { url, method, headersJson, headersForm, body };
  const { requestSampleLoad, confirmDialog } = useSampleOverwriteConfirm(sampleState, useInitialSnapshot(sampleState));

  const loadSampleRequest = () => requestSampleLoad(() => {
    setUrl('https://jsonplaceholder.typicode.com/users');
    setMethod('GET');
    setHeaderMode('form');
    setHeadersForm([
      { key: 'Content-Type', value: 'application/json' },
      { key: 'Accept', value: 'application/json' },
      { key: 'User-Agent', value: 'API-Tester/1.0' }
    ]);
    setBody('');
  });

  return (
    <>
      
      <div className="tool-page bg-white min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 -mt-5 pb-1 sm:pb-2">
          {/* Breadcrumb */}
          <div className="!m-0 !p-0 !mt-0 !pt-0 -mt-2">
          <ToolBreadcrumb 
            category={{ label: t('Tech Tools'), href: "/category/development-tech" }}
            subcategory={{ label: t('API Tools'), href: "/category/development-tech/api-tools" }}
            toolName="API Tester"
          />
          </div>
          
          <div className="tool-header mt-3">
            <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2">
                <h1 className="tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
                  <Terminal className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-blue-600" />
                  {t('REST API Tester')}
                </h1>
                <p className="tool-description text-gray-600 text-sm sm:text-base ml-11 sm:ml-13">{t('Send real HTTP requests from your browser, inspect the response and copy the request as cURL')}</p>
              </div>
              
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <Badge variant="outline" className="border-blue-500 text-blue-600 px-3 py-1 bg-blue-50 text-xs sm:text-sm">API</Badge>
                <Badge variant="outline" className="border-green-500 text-green-600 px-3 py-1 bg-green-50 text-xs sm:text-sm">{t('Testing')}</Badge>
              </div>
            </div>
          </div>

          <div className="space-y-6 sm:space-y-8 mt-6 sm:mt-8">
        <Card className="tool-card">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{t('Request Configuration')}</span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCurlImport(!showCurlImport)}
                  className="tool-button-secondary"
                >
                  <Import className="h-4 w-4 mr-2" />
                  {t('Import cURL')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(generateCurlCommand())}
                  className="tool-button-secondary"
                >
                  <Terminal className="h-4 w-4 mr-2" />
                  {t('Copy as cURL')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadSampleRequest}
                  className="tool-button-secondary"
                >
                  {t('Load Sample')}
                </Button>
              </div>
            </CardTitle>
            <CardDescription>
              {t('Configure your HTTP request parameters')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="method">{t('Method')}</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GET">GET</SelectItem>
                    <SelectItem value="POST">POST</SelectItem>
                    <SelectItem value="PUT">PUT</SelectItem>
                    <SelectItem value="PATCH">PATCH</SelectItem>
                    <SelectItem value="DELETE">DELETE</SelectItem>
                    <SelectItem value="HEAD">HEAD</SelectItem>
                    <SelectItem value="OPTIONS">{t('OPTIONS')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-3">
                <Label htmlFor="url">URL</Label>
                <Input
                  id="url"
                  placeholder={t('https://api.example.com/endpoint')}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </div>
            </div>

            {/* cURL Import Section */}
            {showCurlImport && (
              <div className="space-y-2 p-4 bg-gray-50 rounded-lg border">
                <Label htmlFor="curl-import">{t('Import from cURL Command')}</Label>
                <div className="space-y-2">
                  <Textarea
                    id="curl-import"
                    placeholder={t('Paste your cURL command here...')}
                    value={curlInput}
                    onChange={(e) => setCurlInput(e.target.value)}
                    className="min-h-[100px] font-mono text-sm"
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowCurlImport(false)}
                    >
                      {t('Cancel')}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => parseCurlCommand(curlInput)}
                      disabled={!curlInput.trim()}
                      className="tool-button"
                    >
                      <FileText className="h-4 w-4 mr-1" />
                      {t('Import')}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Headers Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t('Headers')}</Label>
                <Tabs value={headerMode} onValueChange={(value) => setHeaderMode(value as 'form' | 'json')}>
                  <TabsList className="grid w-32 grid-cols-2">
                    <TabsTrigger value="form" className="text-xs">{t('Form')}</TabsTrigger>
                    <TabsTrigger value="json" className="text-xs">JSON</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {headerMode === 'form' ? (
                <div className="space-y-2">
                  {headersForm.map((header, index) => (
                    <div key={index} className="grid grid-cols-5 gap-2">
                      <div className="col-span-2">
                        <Select value={header.key} onValueChange={(value) => updateHeader(index, 'key', value)}>
                          <SelectTrigger>
                            <SelectValue placeholder={t('Header name')} />
                          </SelectTrigger>
                          <SelectContent>
                            {COMMON_HEADERS.map(headerName => (
                              <SelectItem key={headerName} value={headerName}>{headerName}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2">
                        {header.key === 'Content-Type' ? (
                          <Select value={header.value} onValueChange={(value) => updateHeader(index, 'value', value)}>
                            <SelectTrigger>
                              <SelectValue placeholder={t('Content type')} />
                            </SelectTrigger>
                            <SelectContent>
                              {COMMON_CONTENT_TYPES.map(contentType => (
                                <SelectItem key={contentType} value={contentType}>{contentType}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            placeholder={t('Header value')}
                            value={header.value}
                            onChange={(e) => updateHeader(index, 'value', e.target.value)}
                          />
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => removeHeader(index)}
                        className="px-2"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addHeader}
                    className="w-full"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    {t('Add Header')}
                  </Button>
                </div>
              ) : (
                <Textarea
                  placeholder={t('Enter request headers as JSON...')}
                  value={headersJson}
                  onChange={(e) => setHeadersJson(e.target.value)}
                  className="min-h-[120px] font-mono text-sm"
                />
              )}
            </div>

            {/* Request Body */}
            <div className="space-y-2">
              <Label htmlFor="body">{t('Request Body')}</Label>
              <Textarea
                id="body"
                placeholder={t('Enter request body (JSON, XML, or plain text)...')}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="min-h-[120px] font-mono text-sm"
              />
              <p className="text-xs text-gray-500">
                {t('GET and HEAD requests are sent without a body, because browsers do not allow one.')}
              </p>
            </div>

            <Button 
              onClick={sendRequest} 
              disabled={loading}
              className="w-full tool-button"
            >
              <Send className="h-4 w-4 mr-2" />
              {loading ? t('Sending Request...') : t('Send Request')}
            </Button>

            {notice && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
                <p className="text-amber-800 text-sm">{notice}</p>
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  <p className="text-red-700 text-sm">{error}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* cURL Command Display */}
        {curlCommand && (
          <Card className="tool-card">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Terminal className="h-5 w-5 text-green-600" />
                  <span>{t('Generated cURL Command')}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(curlCommand)}
                  className="tool-button-secondary"
                >
                  <Copy className="h-4 w-4" />
                  {t('Copy')}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="bg-gray-100 p-4 rounded-lg overflow-x-auto text-sm font-mono whitespace-pre-wrap">
                {curlCommand}
              </pre>
            </CardContent>
          </Card>
        )}

        {/* Response Section */}
        {(response || statusCode) && (
          <Card className="tool-card">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span>{t('Response')}</span>
                  {statusCode && (
                    <div className="flex items-center gap-2">
                      {getStatusIcon(statusCode)}
                      <span className={`font-mono ${getStatusColor(statusCode)}`}>
                        {statusCode}
                      </span>
                    </div>
                  )}
                  {responseTime !== null && (
                    <div className="flex items-center gap-1 text-sm text-gray-500">
                      <Clock className="h-3 w-3" />
                      <span>{responseTime}ms</span>
                    </div>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="response" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="response">{t('Response Body')}</TabsTrigger>
                  <TabsTrigger value="headers">{t('Response Headers')}</TabsTrigger>
                </TabsList>

                <TabsContent value="response" className="mt-4">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label>{t('Response Body')}</Label>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(response)}
                        className="tool-button-secondary"
                      >
                        <Copy className="h-4 w-4" />
                        {t('Copy')}
                      </Button>
                    </div>
                    <Textarea 
                      value={response}
                      readOnly
                      className="min-h-[300px] font-mono text-sm bg-gray-50"
                    />
                  </div>
                </TabsContent>

                <TabsContent value="headers" className="mt-4">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label>{t('Response Headers')}</Label>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(responseHeaders)}
                        className="tool-button-secondary"
                      >
                        <Copy className="h-4 w-4" />
                        {t('Copy')}
                      </Button>
                    </div>
                    <Textarea 
                      value={responseHeaders}
                      readOnly
                      className="min-h-[200px] font-mono text-sm bg-gray-50"
                    />
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}
        
        </div>
      </div>
      </div>
      {confirmDialog}
    </>
  );
};

export default ApiTester;
