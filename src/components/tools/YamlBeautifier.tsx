
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Copy, Download, FileText, Zap, Maximize, Minimize } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import { useNavigate } from 'react-router-dom';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { beautifyYaml } from '@/lib/tools/yaml-beautify';
import { useT } from '@/i18n';

const YamlBeautifier = () => {
  const { t } = useT();
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
  const isMobile = useIsMobile();
  const { trackAction } = useToolAnalytics();

  const beautifyYAML = () => {
    try {
      setError('');
      const formatted = beautifyYaml(input);
      setOutput(formatted);
      trackAction('beautify_yaml');
    } catch (err) {
      setOutput('');
      setError(err instanceof Error ? t('Invalid YAML: {error}', { error: err.message }) : t('Failed to format YAML'));
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(output);
    setCopyAnimation(true);
    setTimeout(() => setCopyAnimation(false), 1000);
    trackAction('copy_formatted_yaml');
  };

  const downloadYAML = () => {
    const blob = new Blob([output], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'formatted.yaml';
    a.click();
    URL.revokeObjectURL(url);
    setDownloadAnimation(true);
    setTimeout(() => setDownloadAnimation(false), 1000);
    trackAction('download_formatted_yaml');
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

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
                toolName="YAML Beautifier"
              />
            </div>
            
            <div className="tool-header mt-3">
              <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                  <h1 className="tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
                    <FileText className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-purple-600" />
                    {t('YAML Beautifier')}
                  </h1>
                  <p className="tool-description text-gray-600 text-sm sm:text-base ml-11 sm:ml-13">{t('Format and beautify YAML files')}</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <Badge variant="outline" className="border-purple-500 text-purple-600 px-3 py-1 bg-purple-50 text-xs sm:text-sm">YAML</Badge>
                  <Badge variant="outline" className="border-green-500 text-green-600 px-3 py-1 bg-green-50 text-xs sm:text-sm">{t('Formatter')}</Badge>
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
                  <CardTitle className="text-black text-lg sm:text-xl">{t('Input YAML')}</CardTitle>
                  <CardDescription>{t('Paste your YAML content here')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="name: John Doe&#10;age: 30&#10;address:&#10;  street: 123 Main St&#10;  city: Anytown"
                    className="min-h-[300px] sm:min-h-[400px] bg-gray-50 border-2 border-gray-300 text-gray-900 font-mono resize-none focus:border-purple-600"
                  />
                  <div className="flex space-x-2 mt-4">
                    <Button 
                      onClick={beautifyYAML} 
                      className="bg-purple-600 hover:bg-purple-700 text-white"
                    >
                      <Zap className="h-4 w-4 mr-2" />
                      {t('Format YAML')}
                    </Button>
                  </div>
                  
                  {error && (
                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
                      <p className="text-red-700 text-sm whitespace-pre-wrap font-mono">{error}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-white border-2 border-gray-200 rounded-2xl shadow-sm">
                <CardHeader>
                  <CardTitle className="text-black text-lg sm:text-xl flex items-center justify-between">
                    <span>{t('Formatted YAML')}</span>
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
                        onClick={downloadYAML} 
                        disabled={!output}
                        className={`transition-all duration-300 ${
                          downloadAnimation ? 'bg-green-600 text-white scale-105' : 'border-2 border-gray-300'
                        }`}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardTitle>
                  <CardDescription>{t('Beautifully formatted YAML output')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={output}
                    readOnly
                    className="min-h-[300px] sm:min-h-[400px] bg-gray-50 border-2 border-gray-300 text-gray-900 font-mono resize-none"
                    placeholder={t('Formatted YAML will appear here...')}
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

export default YamlBeautifier;
