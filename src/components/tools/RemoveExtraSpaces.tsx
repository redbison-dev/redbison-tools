import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Copy, Space } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import { useNavigate } from 'react-router-dom';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { collapseSpaces } from '@/lib/tools/online-text-processor';
import { useT } from '@/i18n';

const RemoveExtraSpaces = () => {
  const { t } = useT();
  const navigate = useNavigate();
  
  const handleToolSelect = (toolId: string) => {
    navigate(`/${toolId}`);
  };
  
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const { toast } = useToast();
  const { trackAction } = useToolAnalytics();

  const removeExtraSpaces = () => {
    // Collapse runs of spaces, tabs and non-breaking spaces on each line; keep line breaks.
    const result = collapseSpaces(inputText);
    setOutputText(result);
    trackAction('remove_extra_spaces', { 
      originalLength: inputText.length, 
      cleanedLength: result.length 
    });
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(outputText);
    toast({ title: t('Copied!'), description: t('Cleaned text copied to clipboard') });
    trackAction('copy_cleaned_text');
  };

  const clearAll = () => {
    setInputText('');
    setOutputText('');
  };

  return (
    <>
      
      <div className={`${false ? 'fixed inset-0 z-50 bg-white overflow-auto' : ''}`}>
        <div className={`${false ? 'min-h-screen p-4 sm:p-8' : 'tool-page bg-white min-h-screen'}`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-8 -mt-5 pb-1 sm:pb-2">
            {/* Breadcrumb */}
            <div className="!m-0 !p-0 !mt-0 !pt-0 -mt-2">
              <ToolBreadcrumb 
                category={{ label: t('Tech Tools'), href: "/category/development-tech" }}
                subcategory={{ label: t('Text Processing'), href: "/category/development-tech/text-processing" }}
                toolName="Remove Extra Spaces"
              />
            </div>
            
            <div className="tool-header mt-3">
              <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                  <h1 className="tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
                    <Space className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-orange-600" />
                    {t('Remove Extra Spaces')}
                  </h1>
                  <p className="tool-description text-gray-600 text-sm sm:text-base ml-11 sm:ml-13">{t('Remove extra spaces and whitespace from your text')}</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <Badge variant="outline" className="border-orange-500 text-orange-600 px-3 py-1 bg-orange-50 text-xs sm:text-sm">{t('Space')}</Badge>
                  <Badge variant="outline" className="border-blue-500 text-blue-600 px-3 py-1 bg-blue-50 text-xs sm:text-sm">{t('Cleaner')}</Badge>
                </div>
              </div>
            </div>

            <div className="space-y-6 mt-6 sm:mt-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Input */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{t('Input Text')}</CardTitle>
                  <CardDescription>{t('Paste your text with extra spaces')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder={t('This   text    has     extra      spaces')}
                    className="min-h-[300px] font-mono text-sm"
                  />
                  <div className="flex space-x-2">
                    <Button onClick={removeExtraSpaces} disabled={!inputText}>
                      {t('Clean Spaces')}
                    </Button>
                    <Button variant="outline" onClick={clearAll}>
                      {t('Clear')}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Output */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{t('Output Text')}</CardTitle>
                  <CardDescription>{t('Text with normalized spaces')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    value={outputText}
                    readOnly
                    placeholder={t('Cleaned text will appear here...')}
                    className="min-h-[300px] font-mono text-sm bg-gray-50"
                  />
                  <Button 
                    onClick={copyToClipboard} 
                    disabled={!outputText}
                    className="w-full"
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    {t('Copy Result')}
                  </Button>
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

export default RemoveExtraSpaces;