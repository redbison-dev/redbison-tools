import React, { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Copy, Type } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import { useNavigate } from 'react-router-dom';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { convertCases } from '@/lib/tools/case-converter';
import { useToolResult } from '@/hooks/useToolResult';
import { useT } from '@/i18n';

const CaseConverter = () => {
  const { t } = useT();
  const navigate = useNavigate();

  const handleToolSelect = (toolId: string) => {
    navigate(`/${toolId}`);
  };
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [caseType, setCaseType] = useState('');
  const { toast } = useToast();
  const { trackAction } = useToolAnalytics();

  // Memoized case conversion functions for better performance
  const convertedTexts = useMemo(() => {
    if (!inputText) return {};
    return convertCases(inputText);
  }, [inputText]);

  const convertCase = useCallback((type: string) => {
    const result = convertedTexts[type as keyof typeof convertedTexts] || inputText;
    
    setOutputText(result);
    setCaseType(type);
    trackAction('convert_case', { caseType: type, textLength: inputText.length });
  }, [convertedTexts, inputText, trackAction]);

  const copyToClipboard = useCallback(() => {
    navigator.clipboard.writeText(outputText);
    toast({ title: t('Copied!'), description: t('Converted text copied to clipboard') });
    trackAction('copy_case_result');
  }, [outputText, toast, trackAction]);

  const clearAll = () => {
    setInputText('');
    setOutputText('');
    setCaseType('');
  };

  // tool_result once the output settles; the key is compared, never sent.
  useToolResult('converted', outputText ? `${caseType}:${outputText}` : '');

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
                toolName="Case Converter"
              />
            </div>
            
            <div className="tool-header mt-3">
            <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2">
                <h1 className="tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
                  <Type className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-purple-600" />
                  {t('Case Converter')}
                </h1>
                <p className="tool-description text-gray-600 text-sm sm:text-base ml-11 sm:ml-13">
                  {t('Convert text to different case formats')}
                </p>
              </div>
              
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <Badge variant="outline" className="border-purple-500 text-purple-600 px-3 py-1 bg-purple-50 text-xs sm:text-sm">
                  {t('Case Converter')}
                </Badge>
                <Badge variant="outline" className="border-blue-500 text-blue-600 px-3 py-1 bg-blue-50 text-xs sm:text-sm">
                  {t('Text Processing')}
                </Badge>
              </div>
            </div>
          </div>

          <div className="space-y-6 mt-6 sm:mt-8">
            {/* Input */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('Input Text')}</CardTitle>
                <CardDescription>{t('Enter your text to convert')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={t('Hello World Example Text')}
                  className="min-h-[150px] font-mono text-sm"
                />
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                  <Button onClick={() => convertCase('upper')} disabled={!inputText} size="sm">
                    {t('UPPER')}
                  </Button>
                  <Button onClick={() => convertCase('lower')} disabled={!inputText} size="sm">
                    {t('lower')}
                  </Button>
                  <Button onClick={() => convertCase('title')} disabled={!inputText} size="sm">
                    {t('Title')}
                  </Button>
                  <Button onClick={() => convertCase('camel')} disabled={!inputText} size="sm">
                    {t('camelCase')}
                  </Button>
                  <Button onClick={() => convertCase('pascal')} disabled={!inputText} size="sm">
                    {t('PascalCase')}
                  </Button>
                  <Button onClick={() => convertCase('snake')} disabled={!inputText} size="sm">
                    {t('snake_case')}
                  </Button>
                  <Button onClick={() => convertCase('kebab')} disabled={!inputText} size="sm">
                    {t('kebab-case')}
                  </Button>
                </div>
                <Button variant="outline" onClick={clearAll}>
                  {t('Clear')}
                </Button>
              </CardContent>
            </Card>

            {/* Output */}
            {outputText && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">
                    {t('Output Text -')}{' '}{caseType === 'upper' ? t('UPPERCASE') :
                                   caseType === 'lower' ? t('lowercase') :
                                   caseType === 'title' ? t('Title Case') :
                                   caseType === 'camel' ? t('camelCase') :
                                   caseType === 'pascal' ? t('PascalCase') :
                                   caseType === 'snake' ? t('snake_case') :
                                   caseType === 'kebab' ? t('kebab-case') : ''}
                  </CardTitle>
                  <CardDescription>{t('Converted text')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    value={outputText}
                    readOnly
                    className="min-h-[150px] font-mono text-sm bg-gray-50"
                  />
                  <Button 
                    onClick={copyToClipboard} 
                    className="w-full"
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    {t('Copy Result')}
                  </Button>
                </CardContent>
              </Card>
            )}
           </div>
           
           </div>
         </div>
       </div>
     </>
   );
 };
 
 export default CaseConverter;