
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Shield, FileCode, AlertCircle, Play } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { formatProtoSummary, generateTypeScript, parseProto, validateProtoJson } from '@/lib/tools/protobuf-tools';
import { useNavigate } from 'react-router-dom';
import { useSampleOverwriteConfirm, useInitialSnapshot } from '@/components/tools/shared/SampleOverwriteConfirm';
import { useT } from '@/i18n';

const ProtobufTools = () => {
  const { t } = useT();
  const navigate = useNavigate();
  
  const handleToolSelect = (toolId: string) => {
    navigate(`/${toolId}`);
  };
  
  const [protoDefinition, setProtoDefinition] = useState('');
  const [jsonData, setJsonData] = useState('');
  const [compiledOutput, setCompiledOutput] = useState('');
  const [validationResult, setValidationResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { toast } = useToast();
  const { trackAction } = useToolAnalytics();

  const sampleProto = `syntax = "proto3";

package example;

message User {
  int64 id = 1;
  string name = 2;
  string email = 3;
  repeated string tags = 4;
  bool active = 5;
  
  message Address {
    string street = 1;
    string city = 2;
    string country = 3;
    int32 postal_code = 4;
  }
  
  Address address = 6;
}

message UserList {
  repeated User users = 1;
  int32 total_count = 2;
}`;

  const sampleJson = `{
  "id": "12345",
  "name": "John Doe",
  "email": "john.doe@example.com",
  "tags": ["developer", "golang", "protobuf"],
  "active": true,
  "address": {
    "street": "123 Main St",
    "city": "San Francisco",
    "country": "USA",
    "postal_code": 94102
  }
}`;

  const validateProto = () => {
    if (!protoDefinition.trim()) {
      setError(t('Please provide a Protocol Buffer definition'));
      return;
    }

    setLoading(true);
    trackAction('validate_protobuf');
    setTimeout(() => {
      try {
        const { summary } = parseProto(protoDefinition);
        setValidationResult(`${t('✅ Protocol Buffer definition parsed and all types resolved')}\n\n${formatProtoSummary(summary, t)}`);
        setError('');
      } catch (err) {
        setValidationResult(`${t('❌ Invalid Protocol Buffer definition')}\n\n${err instanceof Error ? err.message : String(err)}`);
        setError(t('Validation failed'));
      }
      setLoading(false);
    }, 300);
  };

  const compileProto = () => {
    if (!protoDefinition.trim()) {
      setError(t('Please provide a Protocol Buffer definition'));
      return;
    }

    setLoading(true);
    trackAction('compile_protobuf');
    setTimeout(() => {
      try {
        const { root } = parseProto(protoDefinition);
        setCompiledOutput(generateTypeScript(root));
        setError('');
      } catch (err) {
        setCompiledOutput('');
        setError(t('Cannot generate types: {error}', { error: err instanceof Error ? err.message : String(err) }));
      }
      setLoading(false);
    }, 300);
  };

  const validateJson = () => {
    if (!protoDefinition.trim() || !jsonData.trim()) {
      setError(t('Please provide both Protocol Buffer definition and JSON data'));
      return;
    }

    setLoading(true);
    trackAction('validate_json_against_proto');
    setTimeout(() => {
      try {
        const data = JSON.parse(jsonData);
        let parsed;
        try {
          parsed = parseProto(protoDefinition);
        } catch (err) {
          setValidationResult(`${t('❌ Fix the .proto definition first')}\n\n${err instanceof Error ? err.message : String(err)}`);
          setError(t('Proto definition is invalid'));
          setLoading(false);
          return;
        }
        if (!parsed.firstMessage) {
          setValidationResult(t('❌ The definition has no message type to validate against'));
          setError(t('No message type found'));
          setLoading(false);
          return;
        }
        const { valid, messageName, errors, warnings, encodedBytes } = validateProtoJson(parsed.firstMessage, data, t);

        let result = valid
          ? `${t('✅ JSON is valid for message {messageName}', { messageName })}\n\n`
          : `${t('❌ JSON does not match message {messageName}', { messageName })}\n\n`;

        if (errors.length > 0) {
          result += t('Errors:') + '\n' + errors.map(e => `- ${e}`).join('\n') + '\n\n';
        }

        if (warnings.length > 0) {
          result += t('Notes:') + '\n' + warnings.map(w => `- ${w}`).join('\n') + '\n\n';
        }

        if (encodedBytes) {
          const jsonSize = new TextEncoder().encode(JSON.stringify(data)).length;
          const hex = Array.from(encodedBytes.slice(0, 64), (b) => b.toString(16).padStart(2, '0')).join(' ');
          result += `${t('Binary encoding: {bytes} bytes (minified JSON: {jsonSize} bytes)', { bytes: encodedBytes.length, jsonSize })}\n${hex}${encodedBytes.length > 64 ? ' …' : ''}`;
        }

        setValidationResult(result.trimEnd());
        setError('');
      } catch (err) {
        setValidationResult(t('❌ Invalid JSON format'));
        setError(t('JSON parsing failed'));
      }
      setLoading(false);
    }, 300);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    trackAction('copy_protobuf_data');
    toast({
      title: t('Copied!'),
      description: t('Content copied to clipboard'),
    });
  };

  // Load Sample asks before replacing anything the user typed.
  const sampleState = { protoDefinition, jsonData };
  const { requestSampleLoad, confirmDialog } = useSampleOverwriteConfirm(sampleState, useInitialSnapshot(sampleState));

  const loadSample = () => requestSampleLoad(() => {
    setProtoDefinition(sampleProto);
    setJsonData(sampleJson);
  });

  return (
    <>
      
      <div className="tool-page bg-white min-h-screen">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 -mt-5 py-1 sm:py-2">
          <ToolBreadcrumb 
            category={{ label: t('Tech Tools'), href: '/tech-tools' }}
            subcategory={{ label: t('Data Formats'), href: '/tech-tools/data-formats' }}
            toolName={t('Protocol Buffer Tools')}
          />
          
          <div className="tool-header mt-6">
            <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2">
                <h1 className="tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
                  <Shield className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-green-600" />
                  {t('Protobuf Schema Validator')}
                </h1>
                <p className="tool-description text-gray-600 text-sm sm:text-base ml-11 sm:ml-13">
                  {t('Parse .proto files, generate TypeScript types, and check JSON against the first message')}
                </p>
              </div>
            </div>
          </div>

      <div className="space-y-6 mt-6 sm:mt-8">

      <div className="space-y-6">
        <Card className="tool-card">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{t('Quick Start')}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={loadSample}
                className="tool-button-secondary"
              >
                {t('Load Sample Proto & Data')}
              </Button>
            </CardTitle>
            <CardDescription>
              {t('Load example Protocol Buffer definition and JSON data')}
            </CardDescription>
          </CardHeader>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="tool-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCode className="h-5 w-5 text-green-500" />
                {t('Protocol Buffer Definition')}
              </CardTitle>
              <CardDescription>
                {t('Define your .proto file content')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="proto">{t('Proto Definition')}</Label>
                <Textarea
                  id="proto"
                  placeholder={t('Enter Protocol Buffer definition...')}
                  value={protoDefinition}
                  onChange={(e) => setProtoDefinition(e.target.value)}
                  className="min-h-[250px] font-mono text-sm"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Button 
                  onClick={validateProto} 
                  disabled={loading}
                  className="tool-button"
                >
                  {loading ? t('Validating...') : t('Validate Proto')}
                </Button>
                <Button 
                  onClick={compileProto} 
                  disabled={loading}
                  variant="outline"
                  className="tool-button-secondary"
                >
                  <Play className="h-4 w-4 mr-2" />
                  {t('Generate TS Types')}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="tool-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCode className="h-5 w-5 text-green-500" />
                {t('Test JSON Data')}
              </CardTitle>
              <CardDescription>
                {t('JSON checked against the first message in the definition')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="json-data">{t('JSON Data')}</Label>
                <Textarea
                  id="json-data"
                  placeholder={t('Enter JSON data to validate...')}
                  value={jsonData}
                  onChange={(e) => setJsonData(e.target.value)}
                  className="min-h-[250px] font-mono text-sm"
                />
              </div>
              <Button 
                onClick={validateJson} 
                disabled={loading}
                className="w-full tool-button"
              >
                {loading ? t('Validating...') : t('Validate JSON')}
              </Button>
            </CardContent>
          </Card>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-500" />
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          </div>
        )}

        <Tabs defaultValue="validation" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="validation">{t('Validation Results')}</TabsTrigger>
            <TabsTrigger value="compiled">{t('TypeScript Types')}</TabsTrigger>
          </TabsList>

          <TabsContent value="validation" className="mt-4">
            {validationResult && (
              <Card className="tool-card">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>{t('Validation Results')}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(validationResult)}
                      className="tool-button-secondary"
                    >
                      <Copy className="h-4 w-4" />
                      {t('Copy')}
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="whitespace-pre-wrap text-sm bg-gray-50 p-4 rounded-md font-mono">
                    {validationResult}
                  </pre>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="compiled" className="mt-4">
            {compiledOutput && (
              <Card className="tool-card">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>{t('Generated TypeScript Types')}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(compiledOutput)}
                      className="tool-button-secondary"
                    >
                      <Copy className="h-4 w-4" />
                      {t('Copy')}
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea 
                    value={compiledOutput}
                    readOnly
                    className="min-h-[400px] font-mono text-sm bg-gray-50"
                  />
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
        
        </div>
        </div>
        </div>
      </div>
      {confirmDialog}
    </>
  );
};

export default ProtobufTools;
