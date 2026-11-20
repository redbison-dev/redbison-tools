
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TerminalTextarea } from '@/components/ui/terminal-textarea';
import { Badge } from '@/components/ui/badge';
import { Copy, ArrowLeftRight, FileSpreadsheet, Maximize2, Minimize2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { useNavigate } from 'react-router-dom';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';

import { csvToRecords, recordsToCsv } from '@/lib/tools/textConversions';
import { useToolResult } from '@/hooks/useToolResult';
import { useT } from '@/i18n';

const CsvJsonConverter = () => {
  const { t } = useT();
  const navigate = useNavigate();

  const handleToolSelect = (toolId: string) => {
    navigate(`/${toolId}`);
  };
  const [inputData, setInputData] = useState('');
  const [outputData, setOutputData] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const csvToJson = () => {
    try {
      const jsonArray = csvToRecords(inputData);

      setOutputData(JSON.stringify(jsonArray, null, 2));
      toast({
        title: t('Converted to JSON'),
        description: t('CSV successfully converted to JSON format'),
      });
    } catch (error) {
      toast({
        title: t('Conversion Error'),
        description: t('Invalid CSV format. Please check your input.'),
        variant: "destructive",
      });
    }
  };

  const jsonToCsv = () => {
    try {
      setOutputData(recordsToCsv(JSON.parse(inputData)));
      toast({
        title: t('Converted to CSV'),
        description: t('JSON successfully converted to CSV format'),
      });
    } catch (error) {
      toast({
        title: t('Conversion Error'),
        description: t('Invalid JSON format. Please check your input.'),
        variant: "destructive",
      });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: t('Copied!'),
      description: t('Output copied to clipboard'),
    });
  };

  const clearAll = () => {
    setInputData('');
    setOutputData('');
    toast({
      title: t('Cleared'),
      description: t('All content has been cleared'),
    });
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  // tool_result once the output settles; the key is compared, never sent.
  useToolResult('converted', outputData);

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 bg-white z-50 flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-4">
            <FileSpreadsheet className="h-8 w-8 text-black" />
            <h1 className="text-3xl font-bold text-black">{t('CSV to JSON Converter')}</h1>
          </div>
          <Button onClick={toggleFullscreen} variant="outline" size="lg" className="border-2 border-gray-300">
            <Minimize2 className="h-5 w-5 mr-2" />
            {t('Exit Fullscreen')}
          </Button>
        </div>
        
        <div className="flex-1 p-8 space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">
            <Card className="bg-white border-2 border-gray-200 shadow-sm flex flex-col">
              <CardHeader className="pb-4">
                <CardTitle className="text-black text-xl flex items-center">
                  <FileSpreadsheet className="h-6 w-6 mr-3" />
                  {t('Input Data')}
                </CardTitle>
                <CardDescription className="text-gray-600">{t('Paste your CSV or JSON data here')}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <TerminalTextarea
                  value={inputData}
                  onChange={(e) => setInputData(e.target.value)}
                  placeholder="CSV: name,age&#10;John,30&#10;Jane,25&#10;&#10;JSON: [{'name':'John','age':'30'}]"
                  className="flex-1 min-h-[400px] text-base bg-white border-2 border-gray-200 font-mono"
                />
              </CardContent>
            </Card>

            <Card className="bg-white border-2 border-gray-200 shadow-sm flex flex-col">
              <CardHeader className="pb-4 flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-black text-xl">{t('Output')}</CardTitle>
                  <CardDescription className="text-gray-600">{t('Converted data output')}</CardDescription>
                </div>
                {outputData && (
                  <Button
                    onClick={() => copyToClipboard(outputData)}
                    size="sm"
                    className="bg-black hover:bg-gray-800 text-white"
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    {t('Copy')}
                  </Button>
                )}
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <TerminalTextarea
                  value={outputData}
                  readOnly
                  placeholder={t('Converted data will appear here...')}
                  className="flex-1 min-h-[400px] text-base bg-gray-50 border-2 border-gray-200 font-mono"
                />
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-center space-x-4">
            <Button 
              onClick={csvToJson}
              disabled={!inputData.trim()}
              size="lg"
              className="bg-green-600 hover:bg-green-700 text-white px-8 py-3"
            >
              <ArrowLeftRight className="h-5 w-5 mr-3" />
              {t('CSV to JSON')}
            </Button>
            <Button 
              onClick={jsonToCsv}
              disabled={!inputData.trim()}
              size="lg"
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3"
            >
              <ArrowLeftRight className="h-5 w-5 mr-3" />
              {t('JSON to CSV')}
            </Button>
            <Button 
              onClick={clearAll}
              variant="outline"
              size="lg"
              className="border-2 border-gray-300 text-gray-700 hover:bg-gray-50 px-8 py-3"
            >
              {t('Clear All')}
            </Button>
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
                subcategory={{ label: t('Data Conversion'), href: "/category/development-tech/data-conversion" }}
                toolName="CSV JSON Converter"
              />
            </div>
            
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-8 pt-3 pb-6 sm:pb-8 space-y-3">
      <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <h1 className="tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold">{t('CSV to JSON Converter')}</h1>
          <p className="tool-description text-gray-600 text-sm sm:text-base">{t('Convert between CSV and JSON formats')}</p>
        </div>
        <div className="flex flex-col space-y-3 sm:space-y-0 sm:flex-row sm:items-center sm:space-x-3">
          {!isMobile && (
            <Button onClick={toggleFullscreen} variant="outline" className="border-2 border-gray-300">
              <Maximize2 className="h-4 w-4 mr-2" />
              {t('Fullscreen')}
            </Button>
          )}
          <div className="flex flex-wrap gap-2 sm:gap-3">
            <Badge variant="outline" className="border-green-500 text-green-600 bg-green-50">CSV</Badge>
            <Badge variant="outline" className="border-blue-500 text-blue-600 bg-blue-50">JSON</Badge>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
        <Card className="bg-white border-2 border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-black text-lg sm:text-xl flex items-center">
              <FileSpreadsheet className="h-5 w-5 sm:h-6 sm:w-6 mr-2 sm:mr-3" />
              {t('Input Data')}
            </CardTitle>
            <CardDescription className="text-gray-600 text-sm sm:text-base">{t('Paste your CSV or JSON data here')}</CardDescription>
          </CardHeader>
          <CardContent>
            <TerminalTextarea
              value={inputData}
              onChange={(e) => setInputData(e.target.value)}
              placeholder="CSV: name,age&#10;John,30&#10;Jane,25&#10;&#10;JSON: [{'name':'John','age':'30'}]"
              className="min-h-[250px] sm:min-h-[300px] text-sm sm:text-base bg-white border-2 border-gray-200 font-mono"
            />
            <div className="flex flex-col sm:flex-row gap-3 mt-6">
              <Button 
                onClick={csvToJson}
                disabled={!inputData.trim()}
                className="w-full sm:flex-1 bg-green-600 hover:bg-green-700 text-white py-3"
              >
                <ArrowLeftRight className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                {t('CSV to JSON')}
              </Button>
              <Button 
                onClick={jsonToCsv}
                disabled={!inputData.trim()}
                className="w-full sm:flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3"
              >
                <ArrowLeftRight className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                {t('JSON to CSV')}
              </Button>
              <Button 
                onClick={clearAll}
                variant="outline"
                className="w-full sm:w-auto border-2 border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                {t('Clear All')}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-2 border-gray-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-6">
            <div>
              <CardTitle className="text-black text-lg sm:text-xl">{t('Output')}</CardTitle>
              <CardDescription className="text-gray-600 text-sm sm:text-base">{t('Converted data output')}</CardDescription>
            </div>
            {outputData && (
              <Button
                onClick={() => copyToClipboard(outputData)}
                size="sm"
                className="bg-black hover:bg-gray-800 text-white"
              >
                <Copy className="h-4 w-4 mr-2" />
                {t('Copy')}
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <TerminalTextarea
              value={outputData}
              readOnly
              placeholder={t('Converted data will appear here...')}
              className="min-h-[250px] sm:min-h-[300px] text-sm sm:text-base bg-gray-50 border-2 border-gray-200 font-mono"
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

export default CsvJsonConverter;
