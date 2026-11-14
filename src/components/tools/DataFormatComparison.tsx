import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileCode, Zap, HardDrive, Clock, Info } from 'lucide-react';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { compareFormats } from '@/lib/tools/formatBenchmark';
import { useToast } from '@/hooks/use-toast';
import { useFormat, useT } from '@/i18n';

interface FormatResult {
  format: string;
  size: number;
  serializationTime: number;
  deserializationTime: number;
  data: string;
  readability: string;
  schemaSupport: boolean;
  humanReadable: boolean;
}

const DataFormatComparison = () => {
  const { t } = useT();
  const fmt = useFormat();
  const { trackAction } = useToolAnalytics();
  const { toast } = useToast();
  const [testData, setTestData] = useState({
    users: [
      { id: 1, name: "John Doe", email: "john@example.com", age: 30, active: true },
      { id: 2, name: "Jane Smith", email: "jane@example.com", age: 25, active: false },
      { id: 3, name: "Bob Johnson", email: "bob@example.com", age: 35, active: true }
    ],
    metadata: {
      total: 3,
      timestamp: new Date().toISOString(),
      version: "1.0"
    }
  });
  const [customData, setCustomData] = useState('');
  const [results, setResults] = useState<FormatResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [iterations, setIterations] = useState(10);
  const [statisticType, setStatisticType] = useState<'average' | 'p50' | 'p95' | 'p99'>('average');

  const generateTestData = () => {
    const users = Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      name: `User ${i + 1}`,
      email: `user${i + 1}@example.com`,
      age: Math.floor(Math.random() * 50) + 18,
      active: Math.random() > 0.5,
      createdAt: new Date(Date.now() - Math.random() * 31536000000).toISOString(),
      profile: {
        bio: `This is the bio for user ${i + 1}`,
        skills: ['JavaScript', 'React', 'Node.js'].slice(0, Math.floor(Math.random() * 3) + 1),
        score: Math.floor(Math.random() * 1000)
      }
    }));

    return {
      users,
      metadata: {
        total: users.length,
        timestamp: new Date().toISOString(),
        version: "2.0",
        generatedBy: "DataFormatComparison Tool"
      }
    };
  };

  const performComparison = async () => {
    setIsLoading(true);
    trackAction('data_format_comparison_performed', { iterations, statistic: statisticType });
    try {
      const dataToTest = customData.trim() ? JSON.parse(customData) : testData;
      const measured = await compareFormats(dataToTest, iterations, statisticType);
      setResults(measured);
      setHasRun(true);
    } catch (error) {
      setHasRun(false);
      setResults([]);
      toast({ title: t('Comparison failed'), description: error instanceof Error ? t(error.message) : t('Please check your JSON input.'), variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return `0 ${t('Bytes')}`;
    const k = 1024;
    const sizes = [t('Bytes'), 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return fmt.number(bytes / Math.pow(k, i), { maximumFractionDigits: 2, useGrouping: false }) + ' ' + sizes[i];
  };

  const formatTime = (ms: number) => {
    if (ms < 1) return `${fmt.number(ms * 1000, { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false })}μs`;
    return `${fmt.number(ms, { minimumFractionDigits: 3, maximumFractionDigits: 3, useGrouping: false })}ms`;
  };


  const getBestFormat = (metric: keyof FormatResult) => {
    if (results.length === 0) return '';
    
    if (metric === 'size') {
      return results.reduce((min, current) => 
        current.size < min.size ? current : min
      ).format;
    }
    
    if (metric === 'serializationTime' || metric === 'deserializationTime') {
      return results.reduce((min, current) => 
        current[metric] < min[metric] ? current : min
      ).format;
    }
    
    return '';
  };

  return (
    <>
      
      <div className="tool-page bg-white min-h-screen">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 -mt-5 py-1 sm:py-2">
          <ToolBreadcrumb 
            category={{ label: t('Tech Tools'), href: '/tech-tools' }}
            subcategory={{ label: t('Data Formats'), href: '/tech-tools/data-formats' }}
            toolName="Data Format Comparison"
          />
          
          <div className="tool-header mt-6">
            <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2">
                <h1 className="tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
                  <FileCode className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-blue-600" />
                  {t('Data Format Comparison')}
                </h1>
                <p className="tool-description text-gray-600 text-sm sm:text-base ml-11 sm:ml-13">{t('Compare JSON, XML, and Protocol Buffers performance and characteristics')}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <Badge variant="outline" className="border-blue-500 text-blue-600 px-3 py-1 bg-blue-50 text-xs sm:text-sm">{t('Data Format')}</Badge>
                <Badge variant="outline" className="border-green-500 text-green-600 px-3 py-1 bg-green-50 text-xs sm:text-sm">{t('Performance')}</Badge>
              </div>
            </div>
          </div>

          <div className="space-y-8">
            <Card className="bg-white border-2 border-gray-200 rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Info className="h-5 w-5 text-blue-600" />
                  <span>{t('Test Configuration')}</span>
                </CardTitle>
                <CardDescription>
                  {t('Configure your test data or use the default dataset for comparison')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-3 block">{t('Dataset Options')}</label>
                      <div className="grid grid-cols-1 gap-3">
                        <Button 
                          onClick={() => {
                            setTestData(generateTestData());
                            setCustomData('');
                            setHasRun(false);
                          }}
                          variant="outline"
                          className="w-full justify-start"
                        >
                          {t('Generate Large Dataset (100 users)')}
                        </Button>
                        <Button 
                          onClick={() => {
                            setTestData({
                              users: [
                                { id: 1, name: "John Doe", email: "john@example.com", age: 30, active: true },
                                { id: 2, name: "Jane Smith", email: "jane@example.com", age: 25, active: false },
                                { id: 3, name: "Bob Johnson", email: "bob@example.com", age: 35, active: true }
                              ],
                              metadata: { total: 3, timestamp: new Date().toISOString(), version: "1.0" }
                            });
                            setCustomData('');
                            setHasRun(false);
                          }}
                          variant="outline"
                          className="w-full justify-start"
                        >
                          {t('Use Small Dataset (3 users)')}
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">{t('Iterations')}</label>
                        <Select value={iterations.toString()} onValueChange={(value) => setIterations(parseInt(value))}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">{t('1 run')}</SelectItem>
                            <SelectItem value="5">{t('5 runs')}</SelectItem>
                            <SelectItem value="10">{t('10 runs')}</SelectItem>
                            <SelectItem value="25">{t('25 runs')}</SelectItem>
                            <SelectItem value="50">{t('50 runs')}</SelectItem>
                            <SelectItem value="100">{t('100 runs')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">{t('Statistical Metric')}</label>
                        <Select value={statisticType} onValueChange={(value: any) => setStatisticType(value)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="average">{t('Average')}</SelectItem>
                            <SelectItem value="p50">{t('P50 (Median)')}</SelectItem>
                            <SelectItem value="p95">P95</SelectItem>
                            <SelectItem value="p99">P99</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700">{t('Current Test Data')}</label>
                      <Textarea
                        value={customData || JSON.stringify(testData, null, 2)}
                        onChange={(e) => setCustomData(e.target.value)}
                        placeholder={t('Enter your custom JSON data here...')}
                        className="min-h-[200px] font-mono text-xs resize-none"
                      />
                      <div className="text-xs text-gray-500">
                        {customData ? t('Using custom data') : t('Using default test data (editable)')}
                        {` • ${formatBytes(new Blob([customData || JSON.stringify(testData)]).size)}`}
                      </div>
                    </div>
                  </div>
                </div>

                <Button 
                  onClick={performComparison} 
                  disabled={isLoading}
                  className={`w-full transition-all duration-300 ${
                    hasRun && !isLoading 
                      ? 'bg-green-600 hover:bg-green-700 text-white' 
                      : ''
                  }`}
                >
                  {isLoading ? t('Running Comparison... ({iterations} runs)', { iterations }) : hasRun ? t('Run Again') : t('Run Comparison')}
                </Button>
              </CardContent>
            </Card>

            {results.length > 0 && (
              <>
                <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-2xl">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Zap className="h-5 w-5 text-blue-600" />
                      <span>{t('Performance Summary')}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-white/80 rounded-lg p-4 border border-blue-200">
                        <div className="flex items-center space-x-2 mb-2">
                          <HardDrive className="h-4 w-4 text-green-600" />
                          <span className="font-semibold text-green-800">{t('Smallest Size')}</span>
                        </div>
                        <div className="text-2xl font-bold text-green-600">{t(getBestFormat('size'))}</div>
                        <div className="text-xs text-gray-600">{t('Most space efficient')}</div>
                      </div>
                      
                      <div className="bg-white/80 rounded-lg p-4 border border-blue-200">
                        <div className="flex items-center space-x-2 mb-2">
                          <Clock className="h-4 w-4 text-blue-600" />
                          <span className="font-semibold text-blue-800">{t('Fastest Serialization')}</span>
                        </div>
                        <div className="text-2xl font-bold text-blue-600">{t(getBestFormat('serializationTime'))}</div>
                        <div className="text-xs text-gray-600">{t('Quickest to encode')}</div>
                      </div>
                      
                      <div className="bg-white/80 rounded-lg p-4 border border-blue-200">
                        <div className="flex items-center space-x-2 mb-2">
                          <Clock className="h-4 w-4 text-purple-600" />
                          <span className="font-semibold text-purple-800">{t('Fastest Deserialization')}</span>
                        </div>
                        <div className="text-2xl font-bold text-purple-600">{t(getBestFormat('deserializationTime'))}</div>
                        <div className="text-xs text-gray-600">{t('Quickest to decode')}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-white border-2 border-gray-200 rounded-2xl shadow-sm">
                  <CardHeader>
                    <CardTitle>{t('Detailed Comparison Results')}</CardTitle>
                    <CardDescription>
                      {t('Performance metrics and characteristics for each data format')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200">
                            <th className="text-left py-2 font-medium text-gray-700">{t('Format')}</th>
                            <th className="text-right py-2 font-medium text-gray-700">{t('Size')}</th>
                            <th className="text-right py-2 font-medium text-gray-700">{t('Serialize Time')}</th>
                            <th className="text-right py-2 font-medium text-gray-700">{t('Deserialize Time')}</th>
                            <th className="text-center py-2 font-medium text-gray-700">{t('Human Readable')}</th>
                            <th className="text-center py-2 font-medium text-gray-700">{t('Schema Support')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {results.map((result) => (
                            <tr key={result.format} className="border-b border-gray-100">
                              <td className="py-3 font-medium text-black">{t(result.format)}</td>
                              <td className="py-3 text-right">
                                <span className={getBestFormat('size') === result.format ? 'font-bold text-green-600' : 'text-gray-700'}>
                                  {formatBytes(result.size)}
                                </span>
                              </td>
                              <td className="py-3 text-right">
                                <span className={getBestFormat('serializationTime') === result.format ? 'font-bold text-blue-600' : 'text-gray-700'}>
                                  {formatTime(result.serializationTime)}
                                </span>
                              </td>
                              <td className="py-3 text-right">
                                <span className={getBestFormat('deserializationTime') === result.format ? 'font-bold text-purple-600' : 'text-gray-700'}>
                                  {formatTime(result.deserializationTime)}
                                </span>
                              </td>
                              <td className="py-3 text-center">
                                <Badge variant={result.humanReadable ? "default" : "secondary"}>
                                  {result.humanReadable ? t('Yes') : t('No')}
                                </Badge>
                              </td>
                              <td className="py-3 text-center">
                                <Badge variant={result.schemaSupport ? "default" : "secondary"}>
                                  {result.schemaSupport ? t('Yes') : t('No')}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-white border-2 border-gray-200 rounded-2xl shadow-sm">
                  <CardHeader>
                    <CardTitle>{t('Format Samples')}</CardTitle>
                    <CardDescription>
                      {t('View how the same data is represented in each format')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Tabs defaultValue={results[0]?.format.toLowerCase().replace(' ', '-')} className="w-full">
                      <TabsList className="grid w-full grid-cols-3">
                        {results.map((result) => (
                          <TabsTrigger key={result.format} value={result.format.toLowerCase().replace(' ', '-')}>
                            {t(result.format)}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                      {results.map((result) => (
                        <TabsContent key={result.format} value={result.format.toLowerCase().replace(' ', '-')}>
                          <div className="bg-gray-50 rounded-lg p-4 border">
                            <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono overflow-auto max-h-64">
                              {result.data}
                            </pre>
                          </div>
                        </TabsContent>
                      ))}
                    </Tabs>
                  </CardContent>
                </Card>
              </>
            )}

            <Card className="bg-gradient-to-br from-slate-50 to-gray-50 border-2 border-slate-200 rounded-2xl">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <FileCode className="h-5 w-5 text-slate-600" />
                  <span>{t('Testing Methodology & Code Snippets')}</span>
                </CardTitle>
                <CardDescription>
                  {t('JavaScript implementation details for data format testing with statistical analysis')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="bg-white rounded-lg p-4 border border-slate-200">
                      <h4 className="font-semibold text-slate-800 mb-3 flex items-center">
                        <span className="w-3 h-3 bg-blue-500 rounded-full mr-2"></span>
                        {t('JSON Serialization')}
                      </h4>
                      <pre className="text-xs bg-slate-100 p-3 rounded border overflow-x-auto">
{`// JSON serialization and parsing
const jsonStart = performance.now();
const jsonString = JSON.stringify(dataToTest, null, 2);
const jsonSerializeTime = performance.now() - jsonStart;

const jsonParseStart = performance.now();
const parsedData = JSON.parse(jsonString);
const jsonDeserializeTime = performance.now() - jsonParseStart;

// Calculate size
const size = new Blob([jsonString]).size;`}
                      </pre>
                    </div>

                    <div className="bg-white rounded-lg p-4 border border-slate-200">
                      <h4 className="font-semibold text-slate-800 mb-3 flex items-center">
                        <span className="w-3 h-3 bg-green-500 rounded-full mr-2"></span>
                        {t('XML Serialization')}
                      </h4>
                      <pre className="text-xs bg-slate-100 p-3 rounded border overflow-x-auto">
{`// Custom XML serializer
const serializeToXML = (obj, rootName = 'root') => {
  const xmlEscape = (str) => 
    str.replace(/&/g, '&amp;')
       .replace(/</g, '&lt;')
       .replace(/>/g, '&gt;');

  if (Array.isArray(obj)) {
    return obj.map((item, i) => 
      serializeToXML(item, \`item\${i}\`)
    ).join('');
  }

  let xml = \`<\${rootName}>\`;
  for (const [key, value] of Object.entries(obj)) {
    xml += \`<\${key}>\${xmlEscape(String(value))}</\${key}>\`;
  }
  xml += \`</\${rootName}>\`;
  return xml;
};`}
                      </pre>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="bg-white rounded-lg p-4 border border-slate-200">
                      <h4 className="font-semibold text-slate-800 mb-3 flex items-center">
                        <span className="w-3 h-3 bg-purple-500 rounded-full mr-2"></span>
                        {t('Protocol Buffers Encoding')}
                      </h4>
                      <pre className="text-xs bg-slate-100 p-3 rounded border overflow-x-auto">
{`// Generic JSON-value schema preserves arbitrary custom JSON
const bytes = encodeJsonProto(data);
const restored = decodeJsonProto(bytes);
const actualBinarySize = bytes.length;`}

                      </pre>
                    </div>

                    <div className="bg-white rounded-lg p-4 border border-slate-200">
                      <h4 className="font-semibold text-slate-800 mb-3 flex items-center">
                        <span className="w-3 h-3 bg-orange-500 rounded-full mr-2"></span>
                        {t('Multiple Iterations Testing')}
                      </h4>
                      <pre className="text-xs bg-slate-100 p-3 rounded border overflow-x-auto">
{`// Statistical analysis over multiple runs
const performComparison = async () => {
  const formats = ['JSON', 'XML', 'ProtoBuf'];
  const results = [];
  
  for (const format of formats) {
    const serializeTimes = [];
    const deserializeTimes = [];
    
    for (let i = 0; i < iterations; i++) {
      const { serializeTime, deserializeTime } = 
        await testFormat(format, data);
      serializeTimes.push(serializeTime);
      deserializeTimes.push(deserializeTime);
    }
    
    results.push({
      format,
      avgSerializeTime: calculateStatistic(serializeTimes, statisticType),
      avgDeserializeTime: calculateStatistic(deserializeTimes, statisticType)
    });
  }
};`}
                      </pre>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-semibold text-blue-800 mb-2">{t('Statistical Analysis Methods')}</h4>
                  <div className="text-sm text-blue-700 space-y-1">
                    <p><strong>{t('Average:')}</strong>{' '}{t('Mean performance across all iterations')}</p>
                    <p><strong>{t('P50 (Median):')}</strong>{' '}{t('50th percentile - typical performance')}</p>
                    <p><strong>{t('{name}:', { name: 'P95' })}</strong>{' '}{t('95th percentile - performance under load')}</p>
                    <p><strong>{t('{name}:', { name: 'P99' })}</strong>{' '}{t('99th percentile - worst-case performance')}</p>
                  </div>
                </div>

                <div className="bg-white rounded-lg p-4 border border-slate-200">
                  <h4 className="font-semibold text-slate-800 mb-3">{t('Performance Considerations')}</h4>
                  <div className="text-sm text-gray-700 space-y-2">
                    <p><strong>{t('{name}:', { name: 'JSON' })}</strong>{' '}{t('Native browser support, human-readable, no schema validation')}</p>
                    <p><strong>{t('{name}:', { name: 'XML' })}</strong>{' '}{t('Verbose format, strong schema support, slower parsing')}</p>
                    <p><strong>{t('Protocol Buffers:')}</strong>{' '}{t('Binary format, compact size, requires code generation')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-yellow-50 to-orange-50 border-2 border-yellow-200 rounded-2xl">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Info className="h-5 w-5 text-yellow-600" />
                  <span>{t('Implementation Notes')}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <h4 className="font-semibold text-black mb-2">JSON</h4>
                    <ul className="text-sm text-gray-700 space-y-1">
                      <li>{t('• Native JavaScript JSON.stringify/parse')}</li>
                      <li>{t('• UTF-8 encoding with pretty-printing')}</li>
                      <li>{t('• Real browser performance measurements')}</li>
                      <li>{t('• No schema validation overhead')}</li>
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold text-black mb-2">XML</h4>
                    <ul className="text-sm text-gray-700 space-y-1">
                      <li>{t('• Custom XML serializer with escaping')}</li>
                      <li>{t('• Proper XML structure and declaration')}</li>
                      <li>{t('• Native DOMParser, measured each iteration')}</li>
                      <li>{t('• Schema support capability included')}</li>
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold text-black mb-2">{t('Protocol Buffers')}</h4>
                    <ul className="text-sm text-gray-700 space-y-1">
                      <li>{t('• Real protobufjs binary encoding')}</li>
                      <li>{t('• Actual encoded byte length')}</li>
                      <li>{t('• Real binary decoding measured each iteration')}</li>
                      <li>{t('• Generic JSON-value schema preserves custom data')}</li>
                    </ul>
                  </div>
                </div>
                
                <div className="bg-white/80 rounded-lg p-4 border border-yellow-200">
                  <p className="text-sm text-gray-700">
                    <strong>{t('Note:')}</strong>{' '}{t('Protocol Buffers use a generic JSON-value schema, not an optimized application-specific schema. XML timings include DOM construction. Multiple iterations with statistical analysis provide more accurate performance insights than single-run tests.')}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

        </div>
      </div>
    </>
  );
};

export default DataFormatComparison;