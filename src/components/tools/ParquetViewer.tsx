
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Upload, Download, FileText, Database, AlertCircle, Table } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { useNavigate } from 'react-router-dom';
import { convertParquetSummary, readParquetMetadata } from '@/lib/tools/parquet-viewer';
import { msg, useFormat, useT } from '@/i18n';

/** Placeholder values the summary JSON carries when the footer has none. */
const NOT_RECORDED = msg('not recorded');
const NONE_RECORDED = msg('none recorded');

const ParquetViewer = () => {
  const { t } = useT();
  const fmt = useFormat();
  /** Summary values as shown on the page: the placeholders above in the page's language. */
  const shown = (v: string) => (v === NOT_RECORDED || v === NONE_RECORDED ? t(v) : v);
  const navigate = useNavigate();
  
  const handleToolSelect = (toolId: string) => {
    navigate(`/${toolId}`);
  };
  
  const [inputData, setInputData] = useState('');
  const [outputData, setOutputData] = useState('');
  const [outputFormat, setOutputFormat] = useState('json');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { toast } = useToast();
  const { trackAction } = useToolAnalytics();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.parquet')) {
      setError(t('Please upload a valid .parquet file'));
      setUploadedFile(null);
      return;
    }
    setUploadedFile(file);
    setLoading(true);
    trackAction('upload_parquet_file');
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const meta = readParquetMetadata(bytes);
      const summary = {
        metadata: {
          file_name: file.name,
          file_size_bytes: file.size,
          created_by: meta.createdBy ?? NOT_RECORDED,
          format_version: meta.formatVersion,
          ...(Object.keys(meta.keyValueMetadata).length ? { key_value_metadata_keys: Object.keys(meta.keyValueMetadata) } : {}),
        },
        schema: {
          fields: meta.columns.map((c) => ({
            name: c.name,
            type: c.logicalType ? `${c.physicalType} (${c.logicalType})` : c.physicalType,
            repetition: c.repetition,
            nullable: c.nullable,
          })),
          encoding: meta.encodings.join(', ') || NONE_RECORDED,
          compression: meta.codecs.join(', ') || NONE_RECORDED,
        },
        statistics: {
          total_rows: meta.numRows,
          total_columns: meta.columns.length,
          row_groups: meta.rowGroups.length,
        },
      };
      setParsedData(summary);
      setInputData(JSON.stringify(summary, null, 2));
      setOutputData(JSON.stringify(summary, null, 2));
      setError('');
      toast({
        title: t('Footer read'),
        description: t('{rows} rows, {columns} columns in {groups} row group(s)', { rows: fmt.number(meta.numRows), columns: meta.columns.length, groups: meta.rowGroups.length }),
      });
    } catch (err) {
      setParsedData(null);
      setError(t('Could not read {name}: {error}', { name: file.name, error: err instanceof Error ? err.message : String(err) }));
    } finally {
      setLoading(false);
    }
  };

  const convertToFormat = () => {
    // The manual box holds the uploaded summary too, so edits made there win.
    let dataToConvert: any = parsedData;
    if (inputData.trim()) {
      try {
        dataToConvert = JSON.parse(inputData);
      } catch (err) {
        setError(t('Manual data is not valid JSON: {error}', { error: err instanceof Error ? err.message : String(err) }));
        return;
      }
    }
    
    if (!dataToConvert) {
      setError(t('Please provide input data or upload a file'));
      return;
    }

    setLoading(true);
    trackAction('convert_parquet_data', { format: outputFormat });
    try {
      setOutputData(convertParquetSummary(dataToConvert, outputFormat as 'json' | 'csv' | 'yaml'));
      setError('');
      toast({
        title: t('Conversion Complete'),
        description: t('Data converted to {value} format', { value: outputFormat.toUpperCase() }),
      });
    } catch (err) {
      setError(t('Invalid data format for conversion'));
      console.error('Conversion error:', err);
    }
    setLoading(false);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    trackAction('copy_parquet_data');
    toast({
      title: t('Copied!'),
      description: t('Content copied to clipboard'),
    });
  };

  const downloadFile = () => {
    if (!outputData) return;
    
    const extension = outputFormat === 'yaml' ? 'yml' : outputFormat;
    const blob = new Blob([outputData], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `parquet_converted.${extension}`;
    a.click();
    URL.revokeObjectURL(url);
    trackAction('download_parquet_data', { format: outputFormat });
  };

  const triggerFileUpload = () => {
    document.getElementById('parquet-file')?.click();
  };

  return (
    <>
      
      <div className="tool-page bg-white min-h-screen">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 -mt-5 py-1 sm:py-2">
          <ToolBreadcrumb 
            category={{ label: t('Tech Tools'), href: '/tech-tools' }}
            subcategory={{ label: t('Data Formats'), href: '/tech-tools/data-formats' }}
            toolName="Parquet Viewer"
          />
          
          <div className="tool-header mt-6">
            <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2">
                <h1 className="tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
                  <Database className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-blue-600" />
                  {t('Parquet File Viewer')}
                </h1>
                <p className="tool-description text-gray-600 text-sm sm:text-base ml-11 sm:ml-13">{t('Inspect, analyze, and convert Parquet files to various formats')}</p>
              </div>
            </div>
          </div>

      <div className="space-y-6 mt-6 sm:mt-8">
        <Tabs defaultValue="upload" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="upload">{t('Upload File')}</TabsTrigger>
            <TabsTrigger value="manual">{t('Manual Data')}</TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="space-y-4">
            <Card className="tool-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5 text-blue-500" />
                  {t('Upload Parquet File')}
                </CardTitle>
                <CardDescription>
                  {t('Select a .parquet file. Its footer is read in your browser to show the schema, row count and codecs.')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="parquet-file">{t('Parquet File')}</Label>
                  <div className="flex flex-col gap-3">
                    <Input
                      id="parquet-file"
                      type="file"
                      accept=".parquet"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <Button
                      onClick={triggerFileUpload}
                      variant="outline"
                      className="w-full h-12 border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 transition-colors"
                    >
                      <Upload className="h-5 w-5 mr-2" />
                      {uploadedFile ? uploadedFile.name : t('Choose Parquet File')}
                    </Button>
                    {uploadedFile && (
                      <div className="text-sm text-gray-600 bg-green-50 p-2 rounded border">
                        {t('✓ File selected: {name} ({value} KB)', { name: uploadedFile.name, value: fmt.number(uploadedFile.size / 1024, { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }) })}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="manual" className="space-y-4">
            <Card className="tool-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-500" />
                  {t('Manual Data Input')}
                </CardTitle>
                <CardDescription>
                  {t('Paste JSON (an array of row objects, or a summary from an upload) to convert it to CSV or YAML')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="input-data">{t('JSON Data')}</Label>
                  <Textarea
                    id="input-data"
                    placeholder='[{"id": 1, "name": "Ada"}, {"id": 2, "name": "Linus"}]'
                    value={inputData}
                    onChange={(e) => setInputData(e.target.value)}
                    className="min-h-[120px] font-mono text-sm"
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Schema Display */}
        {parsedData && parsedData.schema && (
          <Card className="tool-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Table className="h-5 w-5 text-green-500" />
                {t('Schema Information')}
              </CardTitle>
              <CardDescription>
                {t('Structure and data types of the Parquet file')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium text-gray-700">{t('Encoding')}</Label>
                    <p className="text-sm text-gray-600">{shown(parsedData.schema.encoding)}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-700">{t('Compression')}</Label>
                    <p className="text-sm text-gray-600">{shown(parsedData.schema.compression)}</p>
                  </div>
                  {parsedData.statistics && (
                    <div>
                      <Label className="text-sm font-medium text-gray-700">{t('Rows')}</Label>
                      <p className="text-sm text-gray-600">
                        {t('{rows} in {row_groups} row group(s)', { rows: fmt.number(Number(parsedData.statistics.total_rows)), row_groups: parsedData.statistics.row_groups })}
                      </p>
                    </div>
                  )}
                  {parsedData.metadata?.created_by && (
                    <div>
                      <Label className="text-sm font-medium text-gray-700">{t('Created by')}</Label>
                      <p className="text-sm text-gray-600 break-all">{shown(parsedData.metadata.created_by)}</p>
                    </div>
                  )}
                </div>
                
                <div>
                  <Label className="text-sm font-medium text-gray-700 mb-2 block">{t('Fields')}</Label>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium text-gray-700">{t('Field Name')}</th>
                          <th className="px-4 py-2 text-left font-medium text-gray-700">{t('Data Type')}</th>
                          <th className="px-4 py-2 text-left font-medium text-gray-700">{t('Nullable')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {parsedData.schema.fields.map((field: any, index: number) => (
                          <tr key={index} className="hover:bg-gray-50">
                            <td className="px-4 py-2 font-mono text-blue-600">{field.name}</td>
                            <td className="px-4 py-2 font-mono text-green-600">{field.type}</td>
                            <td className="px-4 py-2">
                              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs ${
                                field.nullable 
                                  ? 'bg-yellow-100 text-yellow-800' 
                                  : 'bg-green-100 text-green-800'
                              }`}>
                                {field.nullable ? t('Yes') : t('No')}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="tool-card">
          <CardHeader>
            <CardTitle>{t('Conversion Settings')}</CardTitle>
            <CardDescription>
              {t('Choose the output format for conversion')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="output-format">{t('Output Format')}</Label>
                <Select value={outputFormat} onValueChange={setOutputFormat}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('Select format')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="json">JSON</SelectItem>
                    <SelectItem value="csv">CSV</SelectItem>
                    <SelectItem value="yaml">YAML</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button 
                  onClick={convertToFormat} 
                  disabled={loading || (!parsedData && !inputData.trim())}
                  className="w-full tool-button"
                >
                  {loading ? t('Converting...') : t('Convert Data')}
                </Button>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  <p className="text-red-700 text-sm">{error}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {outputData && (
          <Card className="tool-card">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{t('Converted Output ({value})', { value: outputFormat.toUpperCase() })}</span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(outputData)}
                    className="tool-button-secondary"
                  >
                    <Copy className="h-4 w-4" />
                    {t('Copy')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={downloadFile}
                    className="tool-button-secondary"
                  >
                    <Download className="h-4 w-4" />
                    {t('Download')}
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea 
                value={outputData}
                readOnly
                className="min-h-[300px] font-mono text-sm bg-gray-50"
              />
            </CardContent>
          </Card>
        )}
        
        </div>
        </div>
      </div>
    </>
  );
};

export default ParquetViewer;
