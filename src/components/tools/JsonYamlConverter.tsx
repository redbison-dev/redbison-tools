import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TerminalTextarea } from '@/components/ui/terminal-textarea';
import { Badge } from '@/components/ui/badge';
import { Copy, ArrowLeftRight, FileCode, Maximize2, Minimize2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import { useNavigate } from 'react-router-dom';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';

import { jsonToYamlValue, yamlToJsonValue } from '@/lib/tools/textConversions';
import { useToolResult } from '@/hooks/useToolResult';
import { useT } from '@/i18n';

const JsonYamlConverter = () => {
  const { t } = useT();
  const navigate = useNavigate();
  
  const handleToolSelect = (toolId: string) => {
    navigate(`/${toolId}`);
  };
  
  const [inputData, setInputData] = useState('');
  const [outputData, setOutputData] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { toast } = useToast();
  const { trackAction } = useToolAnalytics();

  const jsonToYaml = () => {
    try {
      const jsonData = JSON.parse(inputData);
      const yamlString = jsonToYamlValue(jsonData);
      setOutputData(yamlString);
      trackAction('convert_json_to_yaml');
      toast({
        title: t('Converted to YAML'),
        description: t('JSON successfully converted to YAML format'),
      });
    } catch (error) {
      toast({
        title: t('Conversion Error'),
        description: t('Invalid JSON format. Please check your input.'),
        variant: "destructive",
      });
    }
  };

  const yamlToJson = () => {
    try {
      const jsonData = yamlToJsonValue(inputData);
      const jsonString = JSON.stringify(jsonData, null, 2);
      setOutputData(jsonString);
      trackAction('convert_yaml_to_json');
      toast({
        title: t('Converted to JSON'),
        description: t('YAML successfully converted to JSON format'),
      });
    } catch (error) {
      toast({
        title: t('Conversion Error'),
        description: t('Invalid YAML format. Please check your input.'),
        variant: "destructive",
      });
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(outputData);
    trackAction('copy_converted_data');
    toast({
      title: t('Copied!'),
      description: t('Converted data copied to clipboard'),
    });
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  // tool_result once the output settles; the key is compared, never sent.
  useToolResult('converted', outputData);

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 bg-white z-50 overflow-auto">
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <h1 className="text-4xl font-bold text-black">{t('JSON to YAML Converter')}</h1>
              <p className="text-gray-600 text-lg">{t('Convert between JSON and YAML formats')}</p>
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
                  <FileCode className="h-6 w-6 mr-3" />
                  {t('Input')}
                </CardTitle>
                <CardDescription>{t('Paste your JSON or YAML content here')}</CardDescription>
              </CardHeader>
              <CardContent>
                <TerminalTextarea
                  value={inputData}
                  onChange={(e) => setInputData(e.target.value)}
                  placeholder='{"name": "example", "value": 123} or name: example\nvalue: 123'
                  className="min-h-[400px] bg-gray-50 border-gray-300 text-gray-900 font-mono text-base"
                />
                <div className="flex space-x-2 mt-4">
                  <Button onClick={jsonToYaml} className="bg-black hover:bg-gray-800 text-white">
                    <ArrowLeftRight className="h-4 w-4 mr-2" />
                    JSON → YAML
                  </Button>
                  <Button onClick={yamlToJson} variant="outline" className="border-gray-300">
                    <ArrowLeftRight className="h-4 w-4 mr-2" />
                    YAML → JSON
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white border-2 border-gray-200">
              <CardHeader>
                <CardTitle className="text-black flex items-center justify-between text-xl">
                  <span className="flex items-center">
                    <FileCode className="h-6 w-6 mr-3" />
                    {t('Output')}
                  </span>
                  {outputData && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={copyToClipboard}
                      className="border-gray-300"
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      {t('Copy')}
                    </Button>
                  )}
                </CardTitle>
                <CardDescription>{t('Converted output will appear here')}</CardDescription>
              </CardHeader>
              <CardContent>
                <TerminalTextarea
                  value={outputData}
                  readOnly
                  placeholder={t('Converted data will appear here...')}
                  className="min-h-[400px] text-base bg-gray-50 border-2 border-gray-200 font-mono"
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
                subcategory={{ label: t('Data Conversion'), href: "/category/development-tech/data-conversion" }}
                toolName={t('JSON to YAML Converter')}
              />
            </div>
            
      <div className="w-full px-4 sm:px-6 py-6 sm:py-8 space-y-6 sm:space-y-8 mt-3">
        <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <h1 className="tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold">{t('JSON to YAML Converter')}</h1>
            <p className="tool-description text-gray-600 text-sm sm:text-base">{t('Convert between JSON and YAML formats')}</p>
          </div>
          <div className="flex flex-col space-y-3 sm:space-y-0 sm:flex-row sm:items-center sm:space-x-3">
            <Button onClick={toggleFullscreen} variant="outline" className="border-2 border-gray-300">
              <Maximize2 className="h-4 w-4 mr-2" />
              {t('Fullscreen')}
            </Button>
            <div className="flex flex-wrap gap-2 sm:gap-3">
              <Badge variant="outline" className="border-emerald-500 text-emerald-600 bg-emerald-50">JSON</Badge>
              <Badge variant="outline" className="border-blue-500 text-blue-600 bg-blue-50">YAML</Badge>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
          <Card className="bg-white border-2 border-gray-200 shadow-sm">
            <CardHeader className="pb-6">
              <CardTitle className="text-black flex items-center text-lg sm:text-xl">
                <FileCode className="h-5 w-5 sm:h-6 sm:w-6 mr-2 sm:mr-3" />
                {t('Input')}
              </CardTitle>
              <CardDescription className="text-gray-600 text-sm sm:text-base">{t('Paste your JSON or YAML content here')}</CardDescription>
            </CardHeader>
            <CardContent>
              <TerminalTextarea
                value={inputData}
                onChange={(e) => setInputData(e.target.value)}
                placeholder='{"name": "example", "value": 123} or name: example\nvalue: 123'
                className="min-h-[300px] sm:min-h-[350px] bg-gray-50 border-gray-300 text-gray-900 font-mono text-sm sm:text-base"
              />
              <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 mt-4">
                <Button onClick={jsonToYaml} className="w-full sm:w-auto bg-black hover:bg-gray-800 text-white">
                  <ArrowLeftRight className="h-4 w-4 mr-2" />
                  JSON → YAML
                </Button>
                <Button onClick={yamlToJson} variant="outline" className="w-full sm:w-auto border-gray-300">
                  <ArrowLeftRight className="h-4 w-4 mr-2" />
                  YAML → JSON
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-2 border-gray-200 shadow-sm">
            <CardHeader className="pb-6">
              <CardTitle className="text-black flex items-center justify-between text-lg sm:text-xl">
                <span className="flex items-center">
                  <FileCode className="h-5 w-5 sm:h-6 sm:w-6 mr-2 sm:mr-3" />
                  {t('Output')}
                </span>
                {outputData && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={copyToClipboard}
                    className="border-gray-300"
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    {t('Copy')}
                  </Button>
                )}
              </CardTitle>
              <CardDescription className="text-gray-600 text-sm sm:text-base">{t('Converted output will appear here')}</CardDescription>
            </CardHeader>
            <CardContent>
              <TerminalTextarea
                value={outputData}
                readOnly
                placeholder={t('Converted data will appear here...')}
                className="min-h-[300px] sm:min-h-[350px] text-base bg-gray-50 border-2 border-gray-200 font-mono"
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

export default JsonYamlConverter;