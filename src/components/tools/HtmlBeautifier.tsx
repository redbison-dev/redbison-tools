
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Copy, Download, Code, Zap, Maximize2, Minimize2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import { useNavigate } from 'react-router-dom';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { beautifyHtml } from '@/lib/tools/html-beautify';
import { useToolResult } from '@/hooks/useToolResult';
import { useT } from '@/i18n';

const HtmlBeautifier = () => {
  const { t } = useT();
  const navigate = useNavigate();
  
  const handleToolSelect = (toolId: string) => {
    navigate(`/${toolId}`);
  };
  
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { trackAction } = useToolAnalytics();

  const beautifyHTML = () => {
    try {
      const formatted = beautifyHtml(input);
      setOutput(formatted);
      trackAction('beautify_html');
      toast({
        title: t('Success'),
        description: t('HTML formatted successfully!'),
      });
    } catch (err) {
      toast({
        title: t('Error'),
        description: t('Failed to format HTML'),
        variant: "destructive",
      });
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(output);
    trackAction('copy_html');
    toast({
      title: t('Copied'),
      description: t('Formatted HTML copied to clipboard!'),
    });
  };

  const downloadHTML = () => {
    const blob = new Blob([output], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'formatted.html';
    a.click();
    URL.revokeObjectURL(url);
    trackAction('download_html');
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  // tool_result once the output settles; the key is compared, never sent.
  useToolResult('formatted', output);

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 bg-white z-50 overflow-auto">
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <h1 className="text-4xl font-bold text-black">{t('HTML Beautifier')}</h1>
              <p className="text-gray-600 text-lg">{t('Format and beautify HTML code')}</p>
            </div>
            <Button onClick={toggleFullscreen} variant="outline" size="lg" className="border-2 border-gray-300">
              <Minimize2 className="h-5 w-5 mr-2" />
              {t('Exit Fullscreen')}
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="bg-white border-2 border-gray-200">
              <CardHeader>
                <CardTitle className="text-black flex items-center text-xl">
                  <Code className="h-6 w-6 mr-3" />
                  {t('Input HTML')}
                </CardTitle>
                <CardDescription>{t('Paste your HTML content here')}</CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="<div><h1>Hello World</h1><p>This is a paragraph.</p></div>"
                  className="min-h-[400px] bg-gray-50 border-gray-300 text-gray-900 font-mono"
                />
                <div className="flex space-x-2 mt-4">
                  <Button onClick={beautifyHTML} className="bg-black hover:bg-gray-800 text-white">
                    <Zap className="h-4 w-4 mr-2" />
                    {t('Format HTML')}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white border-2 border-gray-200">
              <CardHeader>
                <CardTitle className="text-black flex items-center justify-between text-xl">
                  <span className="flex items-center">
                    <Code className="h-6 w-6 mr-3" />
                    {t('Formatted HTML')}
                  </span>
                  <div className="flex space-x-2">
                    <Button size="sm" variant="outline" onClick={copyToClipboard} disabled={!output}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={downloadHTML} disabled={!output}>
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </CardTitle>
                <CardDescription>{t('Beautifully formatted HTML output')}</CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={output}
                  readOnly
                  className="min-h-[400px] bg-gray-50 border-gray-300 text-gray-900 font-mono"
                  placeholder={t('Formatted HTML will appear here...')}
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
          <div className="max-w-7xl mx-auto px-4 sm:px-8 -mt-5 pb-1 sm:pb-2">
            {/* Breadcrumb */}
            <div className="!m-0 !p-0 !mt-0 !pt-0 -mt-2">
              <ToolBreadcrumb 
                category={{ label: t('Tech Tools'), href: "/category/development-tech" }}
                subcategory={{ label: t('Code Formatters'), href: "/category/development-tech/code-formatters" }}
                toolName="HTML Beautifier"
              />
            </div>
            
      <div className="w-full px-4 sm:px-6 py-6 sm:py-8 space-y-6 sm:space-y-8 mt-3">
      <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <h1 className="tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold">{t('HTML Beautifier')}</h1>
          <p className="tool-description text-gray-600 text-sm sm:text-base">{t('Format and beautify HTML code')}</p>
        </div>
        <div className="flex flex-col space-y-3 sm:space-y-0 sm:flex-row sm:items-center sm:space-x-3">
          {!isMobile && (
            <Button onClick={toggleFullscreen} variant="outline" className="border-2 border-gray-300">
              <Maximize2 className="h-4 w-4 mr-2" />
              {t('Fullscreen')}
            </Button>
          )}
          <div className="flex flex-wrap gap-2 sm:gap-3">
            <Badge variant="outline" className="border-orange-500 text-orange-600 bg-orange-50">HTML</Badge>
            <Badge variant="outline" className="border-green-500 text-green-600 bg-green-50">{t('Formatter')}</Badge>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
        <Card className="bg-white border-2 border-gray-200 shadow-sm">
          <CardHeader className="pb-6">
            <CardTitle className="text-black flex items-center text-lg sm:text-xl">
              <Code className="h-5 w-5 sm:h-6 sm:w-6 mr-2 sm:mr-3" />
              {t('Input HTML')}
            </CardTitle>
            <CardDescription className="text-gray-600 text-sm sm:text-base">{t('Paste your HTML content here')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="<div><h1>Hello World</h1><p>This is a paragraph.</p></div>"
              className="min-h-[250px] sm:min-h-[300px] bg-gray-50 border-gray-300 text-gray-900 font-mono text-sm sm:text-base"
            />
            <div className="flex space-x-2 mt-4">
              <Button onClick={beautifyHTML} className="w-full sm:w-auto bg-black hover:bg-gray-800 text-white py-3">
                <Zap className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                {t('Format HTML')}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-2 border-gray-200 shadow-sm">
          <CardHeader className="pb-6">
            <CardTitle className="text-black flex items-center justify-between text-lg sm:text-xl">
              <span className="flex items-center">
                <Code className="h-5 w-5 sm:h-6 sm:w-6 mr-2 sm:mr-3" />
                {t('Formatted HTML')}
              </span>
              <div className="flex space-x-2">
                <Button size="sm" variant="outline" onClick={copyToClipboard} disabled={!output}>
                  <Copy className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="outline" onClick={downloadHTML} disabled={!output}>
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </CardTitle>
            <CardDescription className="text-gray-600 text-sm sm:text-base">{t('Beautifully formatted HTML output')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={output}
              readOnly
              className="min-h-[250px] sm:min-h-[300px] bg-gray-50 border-gray-300 text-gray-900 font-mono text-sm sm:text-base"
              placeholder={t('Formatted HTML will appear here...')}
            />
          </CardContent>
        </Card>
      </div>
      
    </div>
    </div>
  </div>
</div>
    </>
  );
};

export default HtmlBeautifier;
