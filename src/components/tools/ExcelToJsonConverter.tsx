import React, { useState, useCallback } from 'react';
import { Upload, Download, FileSpreadsheet, Code, Trash2, Eye, EyeOff } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { useNavigate } from 'react-router-dom';
import { readWorkbook, sheetToJson } from '@/lib/tools/excel-to-json-converter';
import { useT } from '@/i18n';

interface ConversionOptions {
  includeHeaders: boolean;
  sheetIndex: number;
  outputFormat: 'array' | 'object';
  prettyPrint: boolean;
}

const ExcelToJsonConverter = () => {
  const { t } = useT();
  const navigate = useNavigate();
  
  const handleToolSelect = (toolId: string) => {
    navigate(`/${toolId}`);
  };
  
  const [file, setFile] = useState<File | null>(null);
  const [jsonOutput, setJsonOutput] = useState('');
  const [isConverting, setIsConverting] = useState(false);
  const [sheets, setSheets] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [options, setOptions] = useState<ConversionOptions>({
    includeHeaders: true,
    sheetIndex: 0,
    outputFormat: 'object',
    prettyPrint: true
  });
  const { toast } = useToast();
  const { trackAction } = useToolAnalytics();

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    e.target.value = '';
    if (!uploadedFile) return;

    const validTypes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv'
    ];

    if (!validTypes.includes(uploadedFile.type) && !uploadedFile.name.match(/\.(xlsx?|csv)$/i)) {
      toast({
        title: t('Invalid File Type'),
        description: t('Please upload an Excel file (.xlsx, .xls) or CSV file'),
        variant: "destructive"
      });
      return;
    }

    if (uploadedFile.size > 10 * 1024 * 1024) { // 10MB limit
      toast({
        title: t('File Too Large'),
        description: t('Please upload a file smaller than 10MB'),
        variant: "destructive"
      });
      return;
    }

    setFile(uploadedFile);
    setJsonOutput('');
    readSheetNames(uploadedFile);
  }, [toast]);

  const readSheetNames = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const workbook = readWorkbook(e.target?.result as ArrayBuffer);
        setSheets(workbook.SheetNames);
        setOptions(prev => ({ ...prev, sheetIndex: 0 }));
      } catch (error) {
        console.error('Error reading sheet names:', error);
        toast({
          title: t('Error Reading File'),
          description: t('Unable to read the uploaded file'),
          variant: "destructive"
        });
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const convertToJson = () => {
    if (!file) {
      toast({
        title: t('No File Selected'),
        description: t('Please upload an Excel or CSV file first'),
        variant: "destructive"
      });
      return;
    }

    setIsConverting(true);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const workbook = readWorkbook(e.target?.result as ArrayBuffer);
        const sheetName = sheets[options.sheetIndex] || workbook.SheetNames[0];
        const jsonData = sheetToJson(workbook, sheetName, options);

        const jsonString = options.prettyPrint 
          ? JSON.stringify(jsonData, null, 2)
          : JSON.stringify(jsonData);
        
        setJsonOutput(jsonString);
        trackAction('excel-to-json-converter', { 
          fileType: file.type,
          fileSize: file.size,
          sheetCount: sheets.length,
          outputFormat: options.outputFormat 
        });
        
        toast({
          title: t('Conversion Successful'),
          description: t('Converted {sheetName} to JSON format', { sheetName })
        });
      } catch (error) {
        console.error('Conversion error:', error);
        toast({
          title: t('Conversion Failed'),
          description: error instanceof Error ? error.message : t('Unable to convert file'),
          variant: "destructive"
        });
      } finally {
        setIsConverting(false);
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const downloadJson = () => {
    if (!jsonOutput) return;

    const blob = new Blob([jsonOutput], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${file?.name.replace(/\.[^/.]+$/, '') || 'converted'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: t('Download Started'),
      description: t('JSON file is being downloaded')
    });
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(jsonOutput);
    toast({
      title: t('Copied!'),
      description: t('JSON output copied to clipboard')
    });
  };

  const clearAll = () => {
    setFile(null);
    setJsonOutput('');
    setSheets([]);
    setOptions({
      includeHeaders: true,
      sheetIndex: 0,
      outputFormat: 'object',
      prettyPrint: true
    });
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
                subcategory={{ label: t('Data Conversion'), href: "/category/development-tech/data-conversion" }}
                toolName="Excel to JSON Converter"
              />
            </div>

    <div className="container mx-auto p-6 space-y-8 mt-3">
      <div className="text-center">
        <div className="flex items-center justify-center gap-3 mb-4">
          <FileSpreadsheet className="h-8 w-8 text-primary" />
          <h1 className="tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold">{t('Excel to JSON Converter')}</h1>
        </div>
        <p className="tool-description text-gray-600 text-sm sm:text-base">
          {t('Convert Excel (.xlsx, .xls) and CSV files to JSON format instantly')}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            {t('File Upload & Conversion')}
          </CardTitle>
          <CardDescription>
            {t('Upload your Excel or CSV file and configure conversion options')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              className="hidden"
              id="file-upload"
            />
            <label htmlFor="file-upload" className="cursor-pointer">
              <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-lg font-medium mb-2">
                {file ? file.name : t('Click to upload Excel or CSV file')}
              </p>
              <p className="text-sm text-muted-foreground">
                {t('Supports .xlsx, .xls, and .csv files (max 10MB)')}
              </p>
            </label>
          </div>

          {file && sheets.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('Sheet')}</label>
                <Select 
                  value={options.sheetIndex.toString()} 
                  onValueChange={(value) => setOptions(prev => ({ ...prev, sheetIndex: parseInt(value) }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sheets.map((sheet, index) => (
                      <SelectItem key={index} value={index.toString()}>
                        {sheet}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">{t('Output Format')}</label>
                <Select 
                  value={options.outputFormat} 
                  onValueChange={(value: 'array' | 'object') => setOptions(prev => ({ ...prev, outputFormat: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="object">{t('Array of Objects')}</SelectItem>
                    <SelectItem value="array">{t('Array of Arrays')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <label className="text-sm font-medium">{t('Options')}</label>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="include-headers"
                      checked={options.includeHeaders}
                      onCheckedChange={(checked) => 
                        setOptions(prev => ({ ...prev, includeHeaders: checked as boolean }))
                      }
                    />
                    <label htmlFor="include-headers" className="text-sm">
                      {t('Include Headers')}
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="pretty-print"
                      checked={options.prettyPrint}
                      onCheckedChange={(checked) => 
                        setOptions(prev => ({ ...prev, prettyPrint: checked as boolean }))
                      }
                    />
                    <label htmlFor="pretty-print" className="text-sm">
                      {t('Pretty Print')}
                    </label>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">{t('Actions')}</label>
                <div className="flex flex-col gap-2">
                  <Button 
                    onClick={convertToJson} 
                    disabled={isConverting || !file}
                    className="w-full"
                  >
                    <Code className="h-4 w-4 mr-2" />
                    {t('Convert to JSON')}
                  </Button>
                  <Button variant="outline" onClick={clearAll} className="w-full">
                    <Trash2 className="h-4 w-4 mr-2" />
                    {t('Clear All')}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {jsonOutput && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">{t('JSON Output')}</h3>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowPreview(!showPreview)}
                  >
                    {showPreview ? (
                      <EyeOff className="h-4 w-4 mr-2" />
                    ) : (
                      <Eye className="h-4 w-4 mr-2" />
                    )}
                    {showPreview ? t('Hide Preview') : t('Show Preview')}
                  </Button>
                  <Button variant="outline" size="sm" onClick={copyToClipboard}>
                    <Code className="h-4 w-4 mr-2" />
                    {t('Copy')}
                  </Button>
                  <Button variant="outline" size="sm" onClick={downloadJson}>
                    <Download className="h-4 w-4 mr-2" />
                    {t('Download')}
                  </Button>
                </div>
              </div>

              {showPreview && (
                <Textarea
                  value={jsonOutput}
                  readOnly
                  className="min-h-[400px] font-mono text-sm"
                />
              )}

              <div className="text-sm text-muted-foreground">
                {t('JSON size: {value} KB', { value: (new Blob([jsonOutput]).size / 1024).toFixed(2) })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

    </div>
    </div>
  </div>
</div>
</>
  );
};

export default ExcelToJsonConverter;