
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Code, FileCheck, AlertCircle, Zap, Upload } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
// avro-js has Node.js dependencies that don't work in browser
// import avro from 'avro-js';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { checkAvroSchema, describeType, generateAvroSample, inferAvroSchema, validateAvroDatum } from '@/lib/tools/avro-tools';
import { useNavigate } from 'react-router-dom';
import { useSampleOverwriteConfirm, useInitialSnapshot } from '@/components/tools/shared/SampleOverwriteConfirm';
import { useT } from '@/i18n';
import { translateBuilt } from '@/lib/msg';

const AvroTools = () => {
  const { t } = useT();
  const navigate = useNavigate();

  const handleToolSelect = (toolId: string) => {
    navigate(`/${toolId}`);
  };
  const [schema, setSchema] = useState('');
  const [data, setData] = useState('');
  const [validationResult, setValidationResult] = useState('');
  const [generatedData, setGeneratedData] = useState('');
  const [inferredSchema, setInferredSchema] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { toast } = useToast();

  const sampleSchema = `{
  "type": "record",
  "name": "User",
  "namespace": "com.example",
  "fields": [
    {"name": "id", "type": "long"},
    {"name": "username", "type": "string"},
    {"name": "email", "type": "string"},
    {"name": "age", "type": ["null", "int"], "default": null},
    {"name": "active", "type": "boolean", "default": true}
  ]
}`;

  const sampleData = `{
  "id": 12345,
  "username": "johndoe",
  "email": "john.doe@example.com",
  "age": 30,
  "active": true
}`;

  const inferSchemaFromData = (jsonData: unknown) => inferAvroSchema(jsonData);

  const handleAvroDataFile = async (arrayBuffer: ArrayBuffer) => {
    try {
      // Binary Avro parsing not supported in browser - fallback to JSON parsing
      const text = new TextDecoder().decode(arrayBuffer);
      
      try {
        // Try parsing as JSON (for JSON-serialized Avro data)
        const jsonData = JSON.parse(text);
        const schema = inferSchemaFromData(jsonData);
        
        if (schema) {
          setInferredSchema(JSON.stringify(schema, null, 2));
          setData(Array.isArray(jsonData) ? JSON.stringify(jsonData[0], null, 2) : JSON.stringify(jsonData, null, 2));
          
          toast({
            title: t('Schema Inferred'),
            description: t('Schema has been inferred from the JSON Avro data file'),
          });
        } else {
          throw new Error(t('Could not infer schema from data'));
        }
      } catch (jsonError) {
        setError(t('Please upload a JSON file with Avro data. Binary .avro files are not supported in the browser.'));
      }
    } catch (err) {
      setError(t('Failed to process Avro file: {error}', { error: err instanceof Error ? err.message : t('Unknown error') }));
      console.error('Avro file processing error:', err);
    }
  };

  const validateSchema = () => {
    if (!schema.trim()) {
      setError(t('Please provide an Avro schema'));
      return;
    }

    setLoading(true);
    setTimeout(() => {
      try {
        const parsedSchema = JSON.parse(schema);
        const { errors } = checkAvroSchema(parsedSchema);

        if (errors.length > 0) {
          setValidationResult(`❌ ${t('Invalid Avro schema')}\n\n${errors.map((e) => `- ${translateBuilt(t, e)}`).join('\n')}`);
          setError(t('Schema validation failed'));
        } else {
          const fields: any[] = Array.isArray(parsedSchema?.fields) ? parsedSchema.fields : [];
          setValidationResult(`✅ ${t('Valid Avro schema')}

${t('Schema Details:')}
- ${t('Name: {name}', { name: parsedSchema?.name ?? t('(unnamed)') })}
- ${t('Type: {type}', { type: describeType(parsedSchema?.type ?? parsedSchema) })}
- ${t('Namespace: {namespace}', { namespace: parsedSchema?.namespace || t('Not specified') })}
- ${t('Fields: {count}', { count: fields.length })}

${t('Field Details:')}
${fields.length ? fields.map((field: any) =>
  `- ${field.name}: ${describeType(field.type)}${field.default !== undefined ? ` ${t('(default: {value})', { value: JSON.stringify(field.default) })}` : ''}`
).join('\n') : t('No fields defined')}
`);
          setError('');
        }
      } catch (err) {
        setValidationResult(`❌ ${t('Invalid JSON format in schema')}`);
        setError(t('Schema parsing failed'));
      }
      setLoading(false);
    }, 800);
  };

  const validateData = () => {
    if (!schema.trim() || !data.trim()) {
      setError(t('Please provide both schema and data'));
      return;
    }

    setLoading(true);
    setTimeout(() => {
      try {
        const parsedSchema = JSON.parse(schema);
        const parsedData = JSON.parse(data);
        const { errors, warnings } = validateAvroDatum(parsedSchema, parsedData);

        let result = errors.length === 0 ? `✅ ${t('Data validation successful!')}\n\n` : `❌ ${t('Data validation failed!')}\n\n`;

        if (errors.length > 0) {
          result += `${t('Errors:')}\n` + errors.map((e) => `- ${translateBuilt(t, e)}`).join('\n') + '\n\n';
        }

        if (warnings.length > 0) {
          result += `${t('Warnings:')}\n` + warnings.map((w) => `- ${translateBuilt(t, w)}`).join('\n');
        }

        setValidationResult(result);
        setError('');
      } catch (err) {
        setValidationResult(`❌ ${t('Invalid JSON format in schema or data')}`);
        setError(t('Validation failed'));
      }
      setLoading(false);
    }, 1000);
  };

  const generateSampleData = () => {
    if (!schema.trim()) {
      setError(t('Please provide an Avro schema first'));
      return;
    }

    setLoading(true);
    setTimeout(() => {
      try {
        const parsedSchema = JSON.parse(schema);
        const sampleData = generateAvroSample(parsedSchema);

        setGeneratedData(JSON.stringify(sampleData, null, 2));
        setError('');
      } catch (err) {
        setError(t('Failed to generate sample data'));
      }
      setLoading(false);
    }, 500);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: t('Copied!'),
      description: t('Content copied to clipboard'),
    });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      setError(t('Please select a valid JSON schema file'));
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Handle JSON schema files
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        if (content) {
          try {
            const parsed = JSON.parse(content);
            
            // Check if it's a schema or data
            if (parsed.type && parsed.name) {
              // It's a schema
              setSchema(JSON.stringify(parsed, null, 2));
              toast({
                title: t('Schema Loaded'),
                description: t('Avro schema loaded successfully'),
              });
            } else {
              // It's data - infer schema
              const schema = inferSchemaFromData(parsed);
              if (schema) {
                setInferredSchema(JSON.stringify(schema, null, 2));
                setData(Array.isArray(parsed) ? JSON.stringify(parsed[0], null, 2) : JSON.stringify(parsed, null, 2));
                toast({
                  title: t('Schema Inferred'),
                  description: t('Schema has been inferred from the JSON data file'),
                });
              } else {
                setError(t('Could not infer schema from data'));
              }
            }
          } catch (err) {
            setSchema(content);
            toast({
              title: t('File Loaded'),
              description: t('File content loaded (please verify format)'),
            });
          }
        }
      };
      
      reader.onerror = () => {
        setError(t('Failed to read file'));
      };

      reader.readAsText(file);
    } catch (err) {
      setError(t('Failed to process file'));
    } finally {
      setLoading(false);
    }
  };

  const useInferredSchema = () => {
    if (inferredSchema) {
      setSchema(inferredSchema);
      toast({
        title: t('Schema Applied'),
        description: t('Inferred schema has been applied as the current schema'),
      });
    }
  };

  // Load Sample asks before replacing anything the user typed.
  const sampleState = { schema, data };
  const { requestSampleLoad, confirmDialog } = useSampleOverwriteConfirm(sampleState, useInitialSnapshot(sampleState));

  const loadSample = () => requestSampleLoad(() => {
    setSchema(sampleSchema);
    setData(sampleData);
  });

  return (
    <>
      
      <div className="tool-page bg-white min-h-screen">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 -mt-5 py-1 sm:py-2">
          <ToolBreadcrumb 
            category={{ label: t('Tech Tools'), href: '/tech-tools' }}
            subcategory={{ label: t('Data Formats'), href: '/tech-tools/data-formats' }}
            toolName="Avro Schema Tools"
          />
          
          <div className="tool-header mt-6">
            <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2">
                <h1 className="tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
                  <Code className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-purple-600" />
                  {t('Avro Schema Validator')}
                </h1>
                <p className="tool-description text-gray-600 text-sm sm:text-base ml-11 sm:ml-13">
                  {t('Validate Avro schemas, test data against schemas, and generate sample data')}
                </p>
              </div>
            </div>
          </div>

      <div className="space-y-6 mt-6 sm:mt-8">

      <div className="space-y-6">
        <Card className="tool-card">
          <CardHeader>
            <CardTitle className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <span>{t('Quick Start')}</span>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadSample}
                  className="tool-button-secondary w-full sm:w-auto"
                >
                  {t('Load Sample Schema & Data')}
                </Button>
              </div>
            </CardTitle>
            <CardDescription>
              {t('Load example schema and data to get started quickly, or upload your own Avro files')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="avro-file">{t('Upload Avro File')}</Label>
              <input
                id="avro-file"
                type="file"
                accept=".json"
                onChange={handleFileUpload}
                disabled={loading}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100 file:cursor-pointer cursor-pointer disabled:opacity-50"
              />
              <p className="text-xs text-gray-500">
                {t('Supports .json schema files and JSON-serialized Avro data files')}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Inferred Schema Section */}
        {inferredSchema && (
          <Card className="tool-card">
            <CardHeader>
              <CardTitle className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <span className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-green-500" />
                  {t('Inferred Schema')}
                </span>
                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={useInferredSchema}
                    className="tool-button-secondary w-full sm:w-auto"
                  >
                    {t('Use as Schema')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(inferredSchema)}
                    className="tool-button-secondary w-full sm:w-auto"
                  >
                    <Copy className="h-4 w-4" />
                    {t('Copy')}
                  </Button>
                </div>
              </CardTitle>
              <CardDescription>
                {t('Schema automatically inferred from uploaded Avro data file')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea 
                value={inferredSchema}
                readOnly
                className="min-h-[200px] font-mono text-sm bg-gray-50"
              />
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="tool-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCheck className="h-5 w-5 text-purple-500" />
                {t('Avro Schema')}
              </CardTitle>
              <CardDescription>
                {t('Define your Avro schema in JSON format')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="schema">{t('Schema (JSON)')}</Label>
                <Textarea
                  id="schema"
                  placeholder={t('Enter Avro schema...')}
                  value={schema}
                  onChange={(e) => setSchema(e.target.value)}
                  className="min-h-[200px] font-mono text-sm"
                />
              </div>
              <Button 
                onClick={validateSchema} 
                disabled={loading}
                className="w-full tool-button"
              >
                {loading ? t('Validating...') : t('Validate Schema')}
              </Button>
            </CardContent>
          </Card>

          <Card className="tool-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-purple-500" />
                {t('Test Data')}
              </CardTitle>
              <CardDescription>
                {t('Data to validate against the schema')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="data">{t('Data (JSON)')}</Label>
                <Textarea
                  id="data"
                  placeholder={t('Enter data to validate...')}
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                  className="min-h-[200px] font-mono text-sm"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Button 
                  onClick={validateData} 
                  disabled={loading}
                  className="w-full tool-button"
                >
                  {loading ? t('Validating...') : t('Validate Data')}
                </Button>
                <Button 
                  onClick={generateSampleData} 
                  disabled={loading}
                  variant="outline"
                  className="w-full tool-button-secondary"
                >
                  {t('Generate Sample')}
                </Button>
              </div>
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
            <TabsTrigger value="generated">{t('Generated Data')}</TabsTrigger>
          </TabsList>

          <TabsContent value="validation" className="mt-4">
            {validationResult && (
              <Card className="tool-card">
                <CardHeader>
                  <CardTitle className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <span>{t('Validation Results')}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(validationResult)}
                      className="tool-button-secondary w-full sm:w-auto"
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

          <TabsContent value="generated" className="mt-4">
            {generatedData && (
              <Card className="tool-card">
                <CardHeader>
                  <CardTitle className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <span>{t('Generated Sample Data')}</span>
                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setData(generatedData)}
                        className="tool-button-secondary w-full sm:w-auto"
                      >
                        {t('Use as Test Data')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(generatedData)}
                        className="tool-button-secondary w-full sm:w-auto"
                      >
                        <Copy className="h-4 w-4" />
                        {t('Copy')}
                      </Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea 
                    value={generatedData}
                    readOnly
                    className="min-h-[200px] font-mono text-sm bg-gray-50"
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

export default AvroTools;
