import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Copy, Download, FileText, Zap, Maximize, Minimize, CheckCircle, XCircle, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import { useIsMobile } from '@/hooks/use-mobile';
import { useNavigate } from 'react-router-dom';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { beautifyXml, minifyXml, parseXml } from '@/lib/tools/xml-beautify';
import { useSampleOverwriteConfirm, useInitialSnapshot } from '@/components/tools/shared/SampleOverwriteConfirm';
import { useToolResult } from '@/hooks/useToolResult';
import { useT } from '@/i18n';

const XmlBeautifier = () => {
  const { t, tr } = useT();
  const navigate = useNavigate();
  
  const handleToolSelect = (toolId: string) => {
    navigate(`/${toolId}`);
  };
  
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copyAnimation, setCopyAnimation] = useState(false);
  const [downloadAnimation, setDownloadAnimation] = useState(false);
  const [error, setError] = useState('');
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [xpathQuery, setXpathQuery] = useState('');
  const [queryResult, setQueryResult] = useState('');
  const isMobile = useIsMobile();
  const { trackAction } = useToolAnalytics();
  const { toast } = useToast();

  useEffect(() => {
    trackAction('tool_viewed', { tool: 'xml-beautifier' });
  }, [trackAction]);

  // Validate XML on input change
  useEffect(() => {
    if (!input.trim()) {
      setIsValid(null);
      setError('');
      return;
    }
    
    try {
      parseXml(input);
      setIsValid(true);
      setError('');
    } catch (err) {
      setIsValid(false);
      setError(err instanceof Error ? t('Invalid XML: {error}', { error: err.message }) : t('Invalid XML format'));
    }
  }, [input]);

  const beautifyXML = () => {
    try {
      setError('');
      const formatted = beautifyXml(input);
      setOutput(formatted);
      trackAction('xml_beautify', { inputLength: input.length, outputLength: formatted.length });
    } catch (err) {
      setError(err instanceof Error ? t('Invalid XML: {error}', { error: err.message }) : t('Failed to format XML'));
      setOutput('');
      trackAction('xml_beautify_error', { error: 'invalid_xml' });
    }
  };

  const minifyXML = () => {
    try {
      setError('');
      const minified = minifyXml(input);
      setOutput(minified);
      trackAction('xml_minify', { inputLength: input.length, outputLength: minified.length });
    } catch (err) {
      setError(err instanceof Error ? t('Invalid XML: {error}', { error: err.message }) : t('Failed to minify XML'));
      setOutput('');
      trackAction('xml_minify_error', { error: 'invalid_xml' });
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(output);
    setCopyAnimation(true);
    setTimeout(() => setCopyAnimation(false), 1000);
    trackAction('xml_copy', { outputLength: output.length });
  };

  const downloadXML = () => {
    const blob = new Blob([output], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'formatted.xml';
    a.click();
    URL.revokeObjectURL(url);
    setDownloadAnimation(true);
    setTimeout(() => setDownloadAnimation(false), 1000);
    trackAction('xml_download', { outputLength: output.length });
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const executeXPathQuery = () => {
    if (!input.trim() || !xpathQuery.trim()) {
      setQueryResult('');
      return;
    }
    
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(input, 'text/xml');
      
      // Check for parsing errors
      const parseError = xmlDoc.getElementsByTagName('parsererror');
      if (parseError.length > 0) {
        setQueryResult(t('Error: Invalid XML format'));
        return;
      }
      
      const result = xmlDoc.evaluate(
        xpathQuery,
        xmlDoc,
        null,
        XPathResult.ANY_TYPE,
        null
      );
      
      let output = '';
      let node;
      
      switch (result.resultType) {
        case XPathResult.STRING_TYPE:
          output = result.stringValue;
          break;
        case XPathResult.NUMBER_TYPE:
          output = result.numberValue.toString();
          break;
        case XPathResult.BOOLEAN_TYPE:
          output = result.booleanValue.toString();
          break;
        case XPathResult.UNORDERED_NODE_ITERATOR_TYPE:
        case XPathResult.ORDERED_NODE_ITERATOR_TYPE:
          const nodes = [];
          while ((node = result.iterateNext())) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              nodes.push(node.outerHTML || new XMLSerializer().serializeToString(node));
            } else {
              nodes.push(node.textContent || '');
            }
          }
          output = nodes.length > 0 ? nodes.join('\n') : t('No matches found');
          break;
        default:
          output = t('Query executed successfully');
      }
      
      setQueryResult(output);
      trackAction('xml_xpath_query', { queryLength: xpathQuery.length });
    } catch (err) {
      setQueryResult(t('Error: Invalid XPath expression'));
      trackAction('xml_xpath_error', { error: 'invalid_xpath' });
    }
  };
  // Load Sample asks before replacing anything the user typed.
  const sampleState = { input };
  const { requestSampleLoad, confirmDialog } = useSampleOverwriteConfirm(sampleState, useInitialSnapshot(sampleState));

  const loadSample = () => requestSampleLoad(() => {
    const sampleXML = `<?xml version="1.0" encoding="UTF-8"?>
<catalog>
  <book id="1">
    <title>The Great Gatsby</title>
    <author>F. Scott Fitzgerald</author>
    <genre>Fiction</genre>
    <price currency="USD">12.99</price>
    <published>1925</published>
  </book>
  <book id="2">
    <title>To Kill a Mockingbird</title>
    <author>Harper Lee</author>
    <genre>Fiction</genre>
    <price currency="USD">14.99</price>
    <published>1960</published>
  </book>
</catalog>`;
    setInput(sampleXML);
    trackAction('xml_load_sample');
  });

  // tool_result once the output settles; the key is compared, never sent.
  useToolResult('formatted', (output || queryResult) && `${output}\u0000${queryResult}`);

  return (
    <>

      <div className={`${isFullscreen ? 'fixed inset-0 z-50 bg-white overflow-auto' : ''}`}>
        <div className={`${isFullscreen ? 'min-h-screen p-4 sm:p-8' : 'tool-page bg-white min-h-screen'}`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-8 -mt-5 pb-1 sm:pb-2">
            {/* Breadcrumb */}
            <div className="!m-0 !p-0 !mt-0 !pt-0 -mt-2">
              <ToolBreadcrumb 
                category={{ label: t('Tech Tools'), href: "/category/development-tech" }}
                subcategory={{ label: t('Code Formatters'), href: "/category/development-tech/code-formatters" }}
                toolName="XML Beautifier"
              />
            </div>
            
            <div className="tool-header mt-3">
              <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                  <h1 className="tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
                    <FileText className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-blue-600" />
                    {t('XML Beautifier')}
                  </h1>
                  <p className="tool-description text-gray-600 text-sm sm:text-base ml-11 sm:ml-13">{t('Format and beautify XML files')}</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <Badge variant="outline" className="border-blue-500 text-blue-600 px-3 py-1 bg-blue-50 text-xs sm:text-sm">XML</Badge>
                  <Badge variant="outline" className="border-green-500 text-green-600 px-3 py-1 bg-green-50 text-xs sm:text-sm">{t('Formatter')}</Badge>
                  {isValid !== null && (
                    <Badge 
                      variant="outline" 
                      className={`px-3 py-1 text-xs sm:text-sm ${
                        isValid 
                          ? 'border-green-500 text-green-600 bg-green-50' 
                          : 'border-red-500 text-red-600 bg-red-50'
                      }`}
                    >
                      {isValid ? <CheckCircle className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                      {isValid ? t('Valid') : t('Invalid')}
                    </Badge>
                  )}
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
                  <CardTitle className="text-black text-lg sm:text-xl">{t('Input XML')}</CardTitle>
                  <CardDescription>{t('Paste your XML content here')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="&lt;?xml version=&quot;1.0&quot; encoding=&quot;UTF-8&quot;?&gt;&#10;&lt;root&gt;&#10;  &lt;element&gt;value&lt;/element&gt;&#10;&lt;/root&gt;"
                    className="min-h-[300px] sm:min-h-[400px] bg-gray-50 border-2 border-gray-300 text-gray-900 font-mono resize-none focus:border-blue-600"
                  />
                  <div className="flex flex-wrap space-x-2 mt-4">
                    <Button 
                      onClick={beautifyXML} 
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      <Zap className="h-4 w-4 mr-2" />
                      {t('Beautify')}
                    </Button>
                    <Button 
                      onClick={minifyXML} 
                      variant="outline"
                      className="border-2 border-gray-300"
                    >
                      {t('Minify')}
                    </Button>
                    <Button 
                      onClick={loadSample} 
                      variant="outline"
                      className="border-2 border-gray-300"
                    >
                      {t('Load Sample')}
                    </Button>
                  </div>
                  
                  {error && (
                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
                      <p className="text-red-700 text-sm">{error}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-white border-2 border-gray-200 rounded-2xl shadow-sm">
                <CardHeader>
                  <CardTitle className="text-black text-lg sm:text-xl flex items-center justify-between">
                    <span>{t('Formatted XML')}</span>
                    <div className="flex space-x-2">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={copyToClipboard} 
                        disabled={!output}
                        className={`transition-all duration-300 ${
                          copyAnimation ? 'bg-green-600 text-white scale-105' : 'border-2 border-gray-300'
                        }`}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={downloadXML} 
                        disabled={!output}
                        className={`transition-all duration-300 ${
                          downloadAnimation ? 'bg-green-600 text-white scale-105' : 'border-2 border-gray-300'
                        }`}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardTitle>
                  <CardDescription>{t('Beautifully formatted XML output')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={output}
                    readOnly
                    className="min-h-[300px] sm:min-h-[400px] bg-gray-50 border-2 border-gray-300 text-gray-900 font-mono resize-none"
                    placeholder={t('Formatted XML will appear here...')}
                  />
                </CardContent>
              </Card>
            </div>

            <div className="mt-6 sm:mt-8">
              <Card className="bg-white border-2 border-gray-200 rounded-2xl shadow-sm">
                <CardHeader>
                  <CardTitle className="text-black text-lg sm:text-xl">{t('XPath Query')}</CardTitle>
                  <CardDescription>{t('Query your XML data using XPath expressions')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1">
                      <input
                        type="text"
                        value={xpathQuery}
                        onChange={(e) => setXpathQuery(e.target.value)}
                        placeholder={t("//book[@id='1']/title | //author | count(//book)")}
                        className="w-full p-3 bg-gray-50 border-2 border-gray-300 rounded-md font-mono text-sm focus:border-blue-600 focus:outline-none"
                      />
                    </div>
                    <Button 
                      onClick={executeXPathQuery}
                      disabled={!input.trim() || !xpathQuery.trim()}
                      className="bg-purple-600 hover:bg-purple-700 text-white"
                    >
                      <Search className="h-4 w-4 mr-2" />
                      {t('Query')}
                    </Button>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">{t('Query Result:')}</label>
                    <Textarea
                      value={queryResult}
                      readOnly
                      className="min-h-[200px] bg-gray-50 border-2 border-gray-300 text-gray-900 font-mono resize-none"
                      placeholder={t('XPath query results will appear here...')}
                    />
                  </div>
                  
                  <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                    <p className="text-blue-700 text-sm font-medium mb-1">{t('XPath Examples:')}</p>
                    <ul className="text-blue-600 text-xs space-y-1">
                      <li>{tr('{code} - Select all book elements', { code: <code>//book</code> })}</li>
                      <li>{tr('{code} - Select book with id=1', { code: <code>//book[@id='1']</code> })}</li>
                      <li>{tr('{code} - Get all title text content', { code: <code>//title/text()</code> })}</li>
                      <li>{tr('{code} - Count number of books', { code: <code>count(//book)</code> })}</li>
                      <li>{tr('{code} - Select USD prices', { code: <code>//price[@currency='USD']</code> })}</li>
                    </ul>
                  </div>
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
  
  export default XmlBeautifier;