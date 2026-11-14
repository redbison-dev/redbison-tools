
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Copy, Download, Upload, FileText, Table, Maximize, Minimize } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { useNavigate } from 'react-router-dom';
import { parseTsv as parseTsvText } from '@/lib/tools/tsv-parser';
import { useSampleOverwriteConfirm, useInitialSnapshot } from '@/components/tools/shared/SampleOverwriteConfirm';
import { useT } from '@/i18n';

const TsvParser = () => {
  const { t } = useT();
  const navigate = useNavigate();
  
  const handleToolSelect = (toolId: string) => {
    navigate(`/${toolId}`);
  };
  
  const [tsvData, setTsvData] = useState('');
  const [jsonOutput, setJsonOutput] = useState('');
  const [tableData, setTableData] = useState<string[][]>([]);
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [allowQuotes, setAllowQuotes] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copyAnimation, setCopyAnimation] = useState(false);
  const isMobile = useIsMobile();
  const { trackAction } = useToolAnalytics();

  const parseTsv = () => {
    if (!tsvData.trim()) {
      setError(t('Please enter TSV data'));
      return;
    }

    try {
      const { headers, rows, records, warnings: parseWarnings, warningMsgs } = parseTsvText(tsvData, { quotes: allowQuotes });
      if (headers.length === 0) {
        setError(t('No rows found in the input'));
        return;
      }

      setJsonOutput(JSON.stringify(records, null, 2));
      setTableData([headers, ...rows]);
      setWarnings(parseWarnings.map((w, i) => (warningMsgs?.[i] ? t(warningMsgs[i].text, warningMsgs[i].vars) : t(w))));
      setError('');
      trackAction('parse_tsv');
    } catch (err) {
      setError(t('Failed to parse TSV data. Please check the format.'));
      console.error('TSV parsing error:', err);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setTsvData(content);
      trackAction('upload_tsv_file');
    };
    reader.readAsText(file);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopyAnimation(true);
    setTimeout(() => setCopyAnimation(false), 1000);
    trackAction('copy_tsv_results');
  };

  const downloadJson = () => {
    if (!jsonOutput) return;

    const blob = new Blob([jsonOutput], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'converted-data.json';
    a.click();
    URL.revokeObjectURL(url);
    trackAction('download_json');
  };

  // Load Sample asks before replacing anything the user typed.
  const sampleState = { tsvData };
  const { requestSampleLoad, confirmDialog } = useSampleOverwriteConfirm(sampleState, useInitialSnapshot(sampleState));

  const generateSampleTsv = () => requestSampleLoad(() => {
    const sample = `Name	Email	Department	Salary
John Doe	john@example.com	Engineering	75000
Jane Smith	jane@example.com	Marketing	65000
Bob Johnson	bob@example.com	Sales	70000
Alice Brown	alice@example.com	HR	60000`;
    setTsvData(sample);
    trackAction('generate_sample_tsv');
  });

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  return (
    <>

      <div className={`${isFullscreen ? 'fixed inset-0 z-50 bg-white overflow-auto' : ''}`}>
        <div className={`${isFullscreen ? 'min-h-screen p-4 sm:p-8' : 'tool-page bg-white min-h-screen'}`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-8 -mt-5 py-1 sm:py-2">
            <ToolBreadcrumb 
              category={{ label: t('Tech Tools'), href: '/tech-tools' }}
              subcategory={{ label: t('Data Formats'), href: '/tech-tools/data-formats' }}
              toolName="TSV Parser & Converter"
            />
            
            <div className="tool-header mt-6">
              <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                  <h1 className="tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
                    <Table className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-blue-600" />
                    {t('TSV to JSON Converter')}
                  </h1>
                  <p className="tool-description text-gray-600 text-sm sm:text-base ml-11 sm:ml-13">{t('Parse Tab-Separated Values (TSV) files and convert to JSON or view as table')}</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <Badge variant="outline" className="border-blue-500 text-blue-600 px-3 py-1 bg-blue-50 text-xs sm:text-sm">{t('Parser')}</Badge>
                  <Badge variant="outline" className="border-green-500 text-green-600 px-3 py-1 bg-green-50 text-xs sm:text-sm">{t('Converter')}</Badge>
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
                  <CardTitle className="text-black text-lg sm:text-xl flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    {t('TSV Input')}
                  </CardTitle>
                  <CardDescription>
                    {t('Paste your TSV data or upload a file')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={() => document.getElementById('tsv-file')?.click()}
                      className="border-2 border-gray-300"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      {t('Upload File')}
                    </Button>
                    <Button variant="outline" onClick={generateSampleTsv} className="border-2 border-gray-300">
                      {t('Sample Data')}
                    </Button>
                    <Button onClick={parseTsv} className="bg-blue-600 hover:bg-blue-700 text-white">
                      {t('Parse TSV')}
                    </Button>
                  </div>

                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={allowQuotes}
                      onChange={(e) => setAllowQuotes(e.target.checked)}
                      className="h-4 w-4"
                    />
                    {t('Spreadsheet-style quotes (fields in "double quotes" may contain tabs and line breaks)')}
                  </label>

                  <input
                    id="tsv-file"
                    type="file"
                    accept=".tsv,.txt"
                    onChange={handleFileUpload}
                    className="hidden"
                  />

                  <Textarea
                    placeholder={t('Name	Email	Department\nJohn Doe	john@example.com	Engineering\nJane Smith	jane@example.com	Marketing')}
                    value={tsvData}
                    onChange={(e) => setTsvData(e.target.value)}
                    className="min-h-[300px] font-mono text-sm"
                  />

                  {error && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                      <p className="text-red-700 text-sm">{error}</p>
                    </div>
                  )}
                  {warnings.length > 0 && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-md space-y-1">
                      {warnings.slice(0, 10).map((w) => (
                        <p key={w} className="text-amber-800 text-sm">{w}</p>
                      ))}
                      {warnings.length > 10 && <p className="text-amber-800 text-sm">{t('…and {n} more', { n: warnings.length - 10 })}</p>}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-white border-2 border-gray-200 rounded-2xl shadow-sm">
                <CardHeader>
                  <CardTitle className="text-black text-lg sm:text-xl">{t('Output')}</CardTitle>
                  <CardDescription>
                    {t('Parsed data in JSON format or table view')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="json" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="json">JSON</TabsTrigger>
                      <TabsTrigger value="table">{t('Table')}</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="json" className="space-y-4">
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyToClipboard(jsonOutput)}
                          disabled={!jsonOutput}
                          className={`transition-all duration-300 ${
                            copyAnimation ? 'bg-green-600 text-white scale-105' : 'border-2 border-gray-300'
                          }`}
                        >
                          <Copy className="h-4 w-4 mr-2" />
                          {copyAnimation ? t('Copied!') : t('Copy JSON')}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={downloadJson}
                          disabled={!jsonOutput}
                          className="border-2 border-gray-300"
                        >
                          <Download className="h-4 w-4 mr-2" />
                          {t('Download')}
                        </Button>
                      </div>
                      
                      <Textarea
                        value={jsonOutput}
                        readOnly
                        className="min-h-[300px] font-mono text-sm"
                        placeholder={t('Parsed JSON will appear here...')}
                      />
                    </TabsContent>
                    
                    <TabsContent value="table" className="space-y-4">
                      {tableData.length > 0 ? (
                        <div className="overflow-auto max-h-[400px] border rounded-md">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50 sticky top-0">
                              <tr>
                                {tableData[0]?.map((header, index) => (
                                  <th key={index} className="px-3 py-2 text-left font-medium border-b">
                                    {header}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {tableData.slice(1).map((row, rowIndex) => (
                                <tr key={rowIndex} className="hover:bg-gray-50">
                                  {row.map((cell, cellIndex) => (
                                    <td key={cellIndex} className="px-3 py-2 border-b whitespace-pre-wrap">
                                      {cell}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="text-center py-8 text-gray-500">
                          {t('Parse TSV data to view table')}
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </div>
            
          </div>
        </div>
      </div>
      {confirmDialog}
    </>
  );
};

export default TsvParser;
