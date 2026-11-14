import React, { useState } from 'react';
import { Copy, RefreshCw, FileText, Type } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { convertEncoding, type TextEncodingId } from '@/lib/tools/text-encoding-converter';
import { useT } from '@/i18n';

const TextEncodingConverter = () => {
  const { t } = useT();
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [fromEncoding, setFromEncoding] = useState('utf8');
  const [toEncoding, setToEncoding] = useState('base64');
  const [isConverting, setIsConverting] = useState(false);
  const { toast } = useToast();
  const { trackAction } = useToolAnalytics();

  const encodings = [
    { value: 'utf8', label: 'UTF-8' },
    { value: 'ascii', label: 'ASCII' },
    { value: 'base64', label: t('Base64') },
    { value: 'hex', label: t('Hexadecimal') },
    { value: 'binary', label: t('Binary') },
    { value: 'url', label: t('URL Encoding') },
    { value: 'html', label: t('HTML Entities') },
    { value: 'unicode', label: t('Unicode Escape') }
  ];

  const convertText = () => {
    if (!inputText.trim()) {
      toast({
        title: t('Input Required'),
        description: t('Please enter text to convert'),
        variant: "destructive"
      });
      return;
    }

    setIsConverting(true);
    
    try {
      const result = convertEncoding(inputText, fromEncoding as TextEncodingId, toEncoding as TextEncodingId);

      setOutputText(result);
      trackAction('text-encoding-converter', { fromEncoding, toEncoding, textLength: inputText.length });
      
      toast({
        title: t('Conversion Successful'),
        description: t('Text converted from {value} to {value2}', { value: fromEncoding.toUpperCase(), value2: toEncoding.toUpperCase() })
      });
    } catch (error) {
      toast({
        title: t('Conversion Failed'),
        description: error instanceof Error ? t(error.message) : t('Invalid input for selected encoding'),
        variant: "destructive"
      });
    } finally {
      setIsConverting(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(outputText);
    toast({
      title: t('Copied!'),
      description: t('Converted text copied to clipboard')
    });
  };

  const swapEncodings = () => {
    const temp = fromEncoding;
    setFromEncoding(toEncoding);
    setToEncoding(temp);
    setInputText(outputText);
    setOutputText(inputText);
  };

  const clearAll = () => {
    setInputText('');
    setOutputText('');
  };

  return (
    <>

      <div className="tool-page bg-white min-h-screen">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 -mt-5 py-1 sm:py-2">
          <ToolBreadcrumb 
            category={{ label: t('Tech Tools'), href: '/tech-tools' }}
            subcategory={{ label: t('Data Formats'), href: '/tech-tools/data-formats' }}
            toolName={t('Text Encoding Converter')}
          />
          
          <div className="tool-header mt-6">
            <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2">
                <h1 className="tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
                  <Type className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-blue-600" />
                  {t('Text Encoding Converter')}
                </h1>
                <p className="tool-description text-gray-600 text-sm sm:text-base ml-11 sm:ml-13">{t('Convert text between different encoding formats')}</p>
              </div>
            </div>
          </div>

          <div className="space-y-6 mt-6 sm:mt-8">

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {t('Text Encoding Conversion')}
          </CardTitle>
          <CardDescription>
            {t('Convert text between UTF-8, Base64, Hex, Binary, URL encoding, HTML entities, and Unicode escape sequences')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('From Encoding')}</label>
              <Select value={fromEncoding} onValueChange={setFromEncoding}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {encodings.map((encoding) => (
                    <SelectItem key={encoding.value} value={encoding.value}>
                      {encoding.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{t('To Encoding')}</label>
              <Select value={toEncoding} onValueChange={setToEncoding}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {encodings.map((encoding) => (
                    <SelectItem key={encoding.value} value={encoding.value}>
                      {encoding.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-2">
            <Button 
              onClick={convertText} 
              disabled={isConverting || !inputText.trim()}
              className="flex-1"
            >
              {isConverting ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Type className="h-4 w-4 mr-2" />
              )}
              {t('Convert Text')}
            </Button>
            
            <Button variant="outline" onClick={swapEncodings}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            
            <Button variant="outline" onClick={clearAll}>
              {t('Clear')}
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('Input Text')}</label>
              <Textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={t('Enter text to convert...')}
                className="min-h-[200px] font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                {t('Characters: {count}', { count: inputText.length })}
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">{t('Output Text')}</label>
                {outputText && (
                  <Button variant="outline" size="sm" onClick={copyToClipboard}>
                    <Copy className="h-4 w-4 mr-2" />
                    {t('Copy')}
                  </Button>
                )}
              </div>
              <Textarea
                value={outputText}
                readOnly
                placeholder={t('Converted text will appear here...')}
                className="min-h-[200px] font-mono text-sm bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                {t('Characters: {count}', { count: outputText.length })}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

          </div>
        </div>
      </div>
    </>
  );
};

export default TextEncodingConverter;