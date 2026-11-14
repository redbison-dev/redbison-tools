
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TerminalTextarea } from '@/components/ui/terminal-textarea';
import { Badge } from '@/components/ui/badge';
import { Copy, Database, Wand2, Maximize, Minimize } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import { useIsMobile } from '@/hooks/use-mobile';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { formatSql } from '@/lib/tools/sql-beautify';
import { useNavigate } from 'react-router-dom';
import { useToolResult } from '@/hooks/useToolResult';
import { useT } from '@/i18n';

const SqlBeautifier = () => {
  const { t } = useT();
  const navigate = useNavigate();
  
  const handleToolSelect = (toolId: string) => {
    navigate(`/${toolId}`);
  };
  
  const [inputSql, setInputSql] = useState('');
  const [formattedSql, setFormattedSql] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copyAnimation, setCopyAnimation] = useState(false);
  const { toast } = useToast();
  const { trackAction } = useToolAnalytics();
  const isMobile = useIsMobile();

  const handleFormat = () => {
    if (!inputSql.trim()) {
      setError(t('Please enter SQL to format'));
      return;
    }

    const formatted = formatSql(inputSql);
    setFormattedSql(formatted);
    trackAction('format_sql');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopyAnimation(true);
    setTimeout(() => setCopyAnimation(false), 1000);
    trackAction('copy_formatted_sql');
  };

  const clearAll = () => {
    setInputSql('');
    setFormattedSql('');
    trackAction('clear_sql');
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const setError = (message: string) => {
    toast({
      title: t('Error'),
      description: message,
      variant: "destructive",
    });
  };

  // tool_result once the output settles; the key is compared, never sent.
  useToolResult('formatted', formattedSql);

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
                toolName={t('SQL Beautifier')}
              />
            </div>
            
            <div className="tool-header mt-3">
              <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                  <h1 className="tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
                    <Database className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-blue-600" />
                    {t('SQL Beautifier')}
                  </h1>
                  <p className="tool-description text-gray-600 text-sm sm:text-base ml-11 sm:ml-13">{t('Format and beautify SQL queries')}</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <Badge variant="outline" className="border-blue-500 text-blue-600 px-3 py-1 bg-blue-50 text-xs sm:text-sm">SQL</Badge>
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
                  <CardTitle className="text-black text-lg sm:text-xl flex items-center">
                    <Database className="h-6 w-6 mr-3" />
                    {t('Input SQL')}
                  </CardTitle>
                  <CardDescription className="text-gray-600">{t('Paste your SQL query here')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <TerminalTextarea
                    value={inputSql}
                    onChange={(e) => setInputSql(e.target.value)}
                    placeholder="SELECT * FROM users WHERE id = 1 AND status = 'active' ORDER BY created_at DESC;"
                    className="min-h-[300px] text-base bg-white border-2 border-gray-200 font-mono"
                  />
                  <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3 mt-6">
                    <Button 
                      onClick={handleFormat}
                      disabled={!inputSql.trim()}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3"
                    >
                      <Wand2 className="h-5 w-5 mr-2" />
                      {t('Format SQL')}
                    </Button>
                    <Button 
                      onClick={clearAll}
                      variant="outline"
                      className="border-2 border-gray-300 text-gray-700 hover:bg-gray-50"
                    >
                      {t('Clear All')}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white border-2 border-gray-200 rounded-2xl shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-6">
                  <div>
                    <CardTitle className="text-black text-lg sm:text-xl">{t('Formatted SQL')}</CardTitle>
                    <CardDescription className="text-gray-600">{t('Beautifully formatted SQL output')}</CardDescription>
                  </div>
                  {formattedSql && (
                    <Button
                      onClick={() => copyToClipboard(formattedSql)}
                      size="sm"
                      className={`transition-all duration-300 ${
                        copyAnimation ? 'bg-green-600 scale-105' : 'bg-black hover:bg-gray-800'
                      } text-white`}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      {copyAnimation ? t('Copied!') : t('Copy')}
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  <TerminalTextarea
                    value={formattedSql}
                    readOnly
                    placeholder={t('Formatted SQL will appear here...')}
                    className="min-h-[300px] text-base bg-gray-50 border-2 border-gray-200 font-mono"
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

export default SqlBeautifier;
