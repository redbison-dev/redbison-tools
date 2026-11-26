import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Archive, Zap, HardDrive, Clock, Info, Download, FileCode } from 'lucide-react';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import {
  compressBytes,
  compressionRatio,
  decompressBytes,
  loadBrotli,
  spaceSavings,
  summarize,
  type BrotliCodec,
  type CodecFormat,
} from '@/lib/tools/compression-tools';
import { useFormat, useT } from '@/i18n';

interface CompressionResult {
  algorithm: string;
  originalSize: number;
  compressedSize: number;
  /** original / compressed, e.g. 3.2 means 3.2:1 */
  compressionRatio: number;
  /** percentage of the original size saved */
  spaceSaved: number;
  compressionTime: number;
  decompressionTime: number;
  compressionLevel?: number;
  description: string;
}

const CompressionComparison = () => {
  const { t } = useT();
  const fmt = useFormat();
  const { trackAction } = useToolAnalytics();
  const [inputData, setInputData] = useState('');
  const [dataType, setDataType] = useState<'text' | 'json' | 'csv' | 'xml' | 'custom'>('text');
  const [results, setResults] = useState<CompressionResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [iterations, setIterations] = useState(10);
  const [statisticType, setStatisticType] = useState<'average' | 'p50' | 'p95' | 'p99'>('average');
  const [runNotes, setRunNotes] = useState<string[]>([]);

  const sampleData = {
    text: `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.`.repeat(10),
    
    json: JSON.stringify({
      users: Array.from({ length: 50 }, (_, i) => ({
        id: i + 1,
        name: `User ${i + 1}`,
        email: `user${i + 1}@example.com`,
        age: Math.floor(Math.random() * 50) + 18,
        active: Math.random() > 0.5,
        profile: {
          bio: `This is a detailed bio for user ${i + 1}. Lorem ipsum dolor sit amet, consectetur adipiscing elit.`,
          skills: ['JavaScript', 'Python', 'React', 'Node.js', 'TypeScript'],
          experience: Math.floor(Math.random() * 10) + 1
        }
      })),
      metadata: {
        total: 50,
        timestamp: new Date().toISOString(),
        version: '1.0'
      }
    }, null, 2),
    
    csv: Array.from({ length: 100 }, (_, i) => 
      `${i + 1},User ${i + 1},user${i + 1}@example.com,${Math.floor(Math.random() * 50) + 18},${Math.random() > 0.5 ? 'active' : 'inactive'},Software Engineer,${Math.floor(Math.random() * 100000) + 30000}`
    ).join('\n'),
    
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<employees>
${Array.from({ length: 30 }, (_, i) => `
  <employee id="${i + 1}">
    <name>Employee ${i + 1}</name>
    <email>employee${i + 1}@company.com</email>
    <department>Engineering</department>
    <salary>${Math.floor(Math.random() * 50000) + 50000}</salary>
    <skills>
      <skill>JavaScript</skill>
      <skill>React</skill>
      <skill>Node.js</skill>
    </skills>
    <address>
      <street>123 Main St</street>
      <city>Tech City</city>
      <zip>12345</zip>
    </address>
  </employee>`).join('')}
</employees>`,
    
    custom: ''
  };

  useEffect(() => {
    if (dataType !== 'custom') {
      setInputData(sampleData[dataType]);
      setHasRun(false); // Reset run state when data type changes
    }
  }, [dataType]);

  const performComparison = async () => {
    if (!inputData.trim()) return;
    
    setIsLoading(true);
    trackAction('compression_comparison_performed');

    // Add minimum duration to prevent glitch appearance
    const minDuration = 800; // 800ms minimum
    const startTime = performance.now();

    const results: CompressionResult[] = [];
    const input = new TextEncoder().encode(inputData);
    const originalSize = input.length;
    const notes: string[] = [];

    let brotli: BrotliCodec | undefined;
    try {
      brotli = await loadBrotli();
    } catch {
      notes.push(t('Brotli could not be loaded in this browser, so it was skipped.'));
    }

    try {
      const algorithms: { name: string; format: CodecFormat; level?: number; description: string }[] = [
        { name: t('Gzip (Level {level})', { level: 6 }), format: 'gzip', level: 6, description: t('pako default level, the usual balance of speed and size') },
        { name: t('Gzip (Fast)'), format: 'gzip', level: 1, description: t('Level 1: fastest gzip, larger output') },
        { name: t('Gzip (Best)'), format: 'gzip', level: 9, description: t('Level 9: smallest gzip, slowest to compress') },
        { name: 'Deflate (zlib)', format: 'deflate', level: 6, description: t('Same DEFLATE stream as gzip with a smaller zlib wrapper (RFC 1950)') },
        { name: t('Brotli (Quality {quality})', { quality: 11 }), format: 'brotli', level: 11, description: t('brotli-wasm at maximum quality, as used for pre-compressed web assets') },
        { name: 'LZ4', format: 'lz4', description: t('lz4js frame format, built for speed over ratio') },
      ];

      for (const algorithm of algorithms) {
        if (algorithm.format === 'brotli' && !brotli) continue;
        const compressionTimes: number[] = [];
        const decompressionTimes: number[] = [];
        let compressedSize = 0;
        
        for (let i = 0; i < iterations; i++) {
          const t0 = performance.now();
          const compressed = compressBytes(input, algorithm.format, brotli, algorithm.level);
          const t1 = performance.now();
          const restored = decompressBytes(compressed, algorithm.format, brotli);
          const t2 = performance.now();
          if (i === 0) {
            compressedSize = compressed.length;
            if (restored.length !== input.length) throw new Error(`${algorithm.name} did not round-trip`);
          }
          compressionTimes.push(t1 - t0);
          decompressionTimes.push(t2 - t1);
        }

        results.push({
          algorithm: algorithm.name,
          originalSize,
          compressedSize,
          compressionRatio: compressionRatio(originalSize, compressedSize),
          spaceSaved: spaceSavings(originalSize, compressedSize),
          compressionTime: summarize(compressionTimes, statisticType),
          decompressionTime: summarize(decompressionTimes, statisticType),
          compressionLevel: algorithm.level,
          description: algorithm.description
        });
      }

      // Ensure minimum duration to prevent glitch appearance
      const elapsed = performance.now() - startTime;
      if (elapsed < minDuration) {
        await new Promise(resolve => setTimeout(resolve, minDuration - elapsed));
      }

      setResults(results);
      setRunNotes(notes);
      setHasRun(true);
    } catch (error) {
      console.error('Error during compression:', error);
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

  const getBestAlgorithm = (metric: 'size' | 'compressionTime' | 'decompressionTime' | 'ratio') => {
    if (results.length === 0) return '';
    
    if (metric === 'size') {
      return results.reduce((min, current) => 
        current.compressedSize < min.compressedSize ? current : min
      ).algorithm;
    }
    
    if (metric === 'ratio') {
      return results.reduce((max, current) => 
        current.compressionRatio > max.compressionRatio ? current : max
      ).algorithm;
    }
    
    if (metric === 'compressionTime' || metric === 'decompressionTime') {
      return results.reduce((min, current) => 
        current[metric] < min[metric] ? current : min
      ).algorithm;
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
            toolName="Compression Algorithms Comparison"
          />
          
          <div className="tool-header mt-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
                  <Archive className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-green-600" />
                  {t('Compression Algorithm Comparison')}
                </h1>
                <p className="tool-description text-gray-600 text-sm sm:text-base ml-11 sm:ml-13">{t('Compare compression algorithms performance and analyze speed vs size trade-offs')}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="outline" className="border-green-500 text-green-600 px-4 py-2 bg-green-50">{t('Compression')}</Badge>
                <Badge variant="outline" className="border-blue-500 text-blue-600 px-4 py-2 bg-blue-50">{t('Performance')}</Badge>
              </div>
            </div>
          </div>

          <div className="space-y-6 mt-6 sm:mt-8">
            <Card className="bg-white border-2 border-gray-200 rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Info className="h-5 w-5 text-blue-600" />
                  <span>{t('Input Configuration')}</span>
                </CardTitle>
                <CardDescription>
                  {t('Choose a data type or enter custom data to test compression algorithms')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">{t('Data Type')}</label>
                    <Select value={dataType} onValueChange={(value: any) => setDataType(value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">{t('Text (Lorem Ipsum)')}</SelectItem>
                        <SelectItem value="json">{t('JSON Data')}</SelectItem>
                        <SelectItem value="csv">{t('CSV Data')}</SelectItem>
                        <SelectItem value="xml">{t('XML Data')}</SelectItem>
                        <SelectItem value="custom">{t('Custom Data')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

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
                
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">{t('Data to Compress')}</label>
                  <Textarea
                    value={inputData}
                    onChange={(e) => setInputData(e.target.value)}
                    placeholder={t('Enter data to compress...')}
                    className="min-h-[150px] font-mono text-xs resize-none"
                  />
                  <div className="text-xs text-gray-500">
                    {t('Current size: {value}', { value: formatBytes(new Blob([inputData]).size) })}
                  </div>
                </div>

                <Button 
                  onClick={performComparison} 
                  disabled={isLoading || !inputData.trim()}
                  className={`w-full transition-all duration-300 ${
                    hasRun && !isLoading 
                      ? 'bg-green-600 hover:bg-green-700 text-white' 
                      : ''
                  }`}
                >
                  {isLoading ? t('Running Compression Tests... ({iterations} runs)', { iterations }) : hasRun ? t('Run Again') : t('Compare Algorithms')}
                </Button>
              </CardContent>
            </Card>

            {results.length > 0 && (
              <>
                <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-2xl">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Zap className="h-5 w-5 text-green-600" />
                      <span>{t('Performance Winners')}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="bg-white/80 rounded-lg p-4 border border-green-200">
                        <div className="flex items-center space-x-2 mb-2">
                          <HardDrive className="h-4 w-4 text-green-600" />
                          <span className="font-semibold text-green-800">{t('Best Compression')}</span>
                        </div>
                        <div className="text-lg font-bold text-green-600">{getBestAlgorithm('ratio')}</div>
                        <div className="text-xs text-gray-600">{t('Highest compression ratio')}</div>
                      </div>
                      
                      <div className="bg-white/80 rounded-lg p-4 border border-green-200">
                        <div className="flex items-center space-x-2 mb-2">
                          <HardDrive className="h-4 w-4 text-blue-600" />
                          <span className="font-semibold text-blue-800">{t('Smallest Size')}</span>
                        </div>
                        <div className="text-lg font-bold text-blue-600">{getBestAlgorithm('size')}</div>
                        <div className="text-xs text-gray-600">{t('Most space efficient')}</div>
                      </div>
                      
                      <div className="bg-white/80 rounded-lg p-4 border border-green-200">
                        <div className="flex items-center space-x-2 mb-2">
                          <Clock className="h-4 w-4 text-orange-600" />
                          <span className="font-semibold text-orange-800">{t('Fastest Compression')}</span>
                        </div>
                        <div className="text-lg font-bold text-orange-600">{getBestAlgorithm('compressionTime')}</div>
                        <div className="text-xs text-gray-600">{t('Quickest to compress')}</div>
                      </div>
                      
                      <div className="bg-white/80 rounded-lg p-4 border border-green-200">
                        <div className="flex items-center space-x-2 mb-2">
                          <Clock className="h-4 w-4 text-purple-600" />
                          <span className="font-semibold text-purple-800">{t('Fastest Decompression')}</span>
                        </div>
                        <div className="text-lg font-bold text-purple-600">{getBestAlgorithm('decompressionTime')}</div>
                        <div className="text-xs text-gray-600">{t('Quickest to decompress')}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-white border-2 border-gray-200 rounded-2xl shadow-sm">
                  <CardHeader>
                    <CardTitle>{t('Detailed Comparison Results')}</CardTitle>
                    <CardDescription>
                      {t('Sizes are UTF-8 bytes. Ratio is original divided by compressed (higher is better); space saved is the share of the original removed.')}
                    </CardDescription>
                    {runNotes.map((note) => (
                      <p key={note} className="text-sm text-amber-700">{note}</p>
                    ))}
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200">
                            <th className="text-left py-2 font-medium text-gray-700">{t('Algorithm')}</th>
                            <th className="text-right py-2 font-medium text-gray-700">{t('Original Size')}</th>
                            <th className="text-right py-2 font-medium text-gray-700">{t('Compressed Size')}</th>
                            <th className="text-right py-2 font-medium text-gray-700">{t('Ratio (Space Saved)')}</th>
                            <th className="text-right py-2 font-medium text-gray-700">{t('Compress Time')}</th>
                            <th className="text-right py-2 font-medium text-gray-700">{t('Decompress Time')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {results.map((result) => (
                            <tr key={result.algorithm} className="border-b border-gray-100">
                              <td className="py-3">
                                <div>
                                  <div className="font-medium text-black">{result.algorithm}</div>
                                  <div className="text-xs text-gray-500">{result.description}</div>
                                </div>
                              </td>
                              <td className="py-3 text-right text-gray-700">
                                {formatBytes(result.originalSize)}
                              </td>
                              <td className="py-3 text-right">
                                <span className={getBestAlgorithm('size') === result.algorithm ? 'font-bold text-green-600' : 'text-gray-700'}>
                                  {formatBytes(result.compressedSize)}
                                </span>
                              </td>
                              <td className="py-3 text-right">
                                <span className={getBestAlgorithm('ratio') === result.algorithm ? 'font-bold text-green-600' : 'text-gray-700'}>
                                  {`${fmt.number(result.compressionRatio, { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false })}:1 (${fmt.number(result.spaceSaved, { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false })}%)`}
                                </span>
                              </td>
                              <td className="py-3 text-right">
                                <span className={getBestAlgorithm('compressionTime') === result.algorithm ? 'font-bold text-orange-600' : 'text-gray-700'}>
                                  {formatTime(result.compressionTime)}
                                </span>
                              </td>
                              <td className="py-3 text-right">
                                <span className={getBestAlgorithm('decompressionTime') === result.algorithm ? 'font-bold text-purple-600' : 'text-gray-700'}>
                                  {formatTime(result.decompressionTime)}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-yellow-50 to-orange-50 border-2 border-yellow-200 rounded-2xl">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Info className="h-5 w-5 text-yellow-600" />
                      <span>{t('Algorithm Information & Testing Notes')}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h4 className="font-semibold text-black mb-3">{t('Real Implementations')}</h4>
                        <div className="space-y-3">
                          <div className="bg-white/80 rounded-lg p-3 border border-yellow-200">
                            <h5 className="font-medium text-green-700 mb-1">{t('Gzip & Deflate')}</h5>
                            <p className="text-xs text-gray-700">{t('Actual implementation using pako.js library with real compression/decompression timing')}</p>
                          </div>
                          <div className="bg-white/80 rounded-lg p-3 border border-yellow-200">
                            <h5 className="font-medium text-blue-700 mb-1">{t('Brotli')}</h5>
                            <p className="text-xs text-gray-700">{t('Real implementation using brotli-wasm library with actual compression/decompression timing')}</p>
                          </div>
                          <div className="bg-white/80 rounded-lg p-3 border border-yellow-200">
                            <h5 className="font-medium text-purple-700 mb-1">LZ4</h5>
                            <p className="text-xs text-gray-700">{t('Real implementation using lz4js library with actual compression/decompression timing')}</p>
                          </div>
                        </div>
                      </div>
                      
                      <div>
                        <h4 className="font-semibold text-black mb-3">{t('Library Information')}</h4>
                        <div className="space-y-3">
                          <div className="bg-white/80 rounded-lg p-3 border border-yellow-200">
                            <h5 className="font-medium text-gray-700 mb-1">{t('Used Libraries')}</h5>
                            <p className="text-xs text-gray-700">{t('pako.js (Gzip/Deflate), brotli-wasm (Brotli), lz4js (LZ4)')}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="bg-white/80 rounded-lg p-4 border border-yellow-200">
                      <h4 className="font-semibold text-black mb-2">{t('When to Use Each Algorithm')}</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-700">
                        <div>
                          <strong>{t('{name}:', { name: 'Gzip' })}</strong>{' '}{t('Best general-purpose compression, widely supported, good balance of speed and ratio')}
                        </div>
                        <div>
                          <strong>{t('Deflate (zlib):')}</strong>{' '}{t('The same DEFLATE stream as gzip with a 6-byte zlib wrapper instead of gzip\'s 18 bytes')}
                        </div>
                        <div>
                          <strong>{t('{name}:', { name: 'Brotli' })}</strong>{' '}{t('Best compression ratios, ideal for web content, slower compression')}
                        </div>
                        <div>
                          <strong>{t('{name}:', { name: 'LZ4' })}</strong>{' '}{t('Ultra-fast compression/decompression, ideal for real-time applications')}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-slate-50 to-gray-50 border-2 border-slate-200 rounded-2xl">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <FileCode className="h-5 w-5 text-slate-600" />
                      <span>{t('Testing Methodology & Code Snippets')}</span>
                    </CardTitle>
                    <CardDescription>
                      {t('JavaScript implementation details for each compression algorithm test')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div className="bg-white rounded-lg p-4 border border-slate-200">
                          <h4 className="font-semibold text-slate-800 mb-3 flex items-center">
                            <span className="w-3 h-3 bg-green-500 rounded-full mr-2"></span>
                            {t('Gzip Implementation')}
                          </h4>
                          <pre className="text-xs bg-slate-100 p-3 rounded border overflow-x-auto">
{`// Using pako.js library
const compressWithGzip = async (data, level = 6) => {
  const start = performance.now();
  const compressed = pako.gzip(data, { level });
  const time = performance.now() - start;
  return { compressed, time };
};

const decompressWithGzip = async (data) => {
  const start = performance.now();
  const decompressed = pako.ungzip(data, { to: 'string' });
  const time = performance.now() - start;
  return { decompressed, time };
};`}
                          </pre>
                        </div>

                        <div className="bg-white rounded-lg p-4 border border-slate-200">
                          <h4 className="font-semibold text-slate-800 mb-3 flex items-center">
                            <span className="w-3 h-3 bg-blue-500 rounded-full mr-2"></span>
                            {t('Deflate Implementation')}
                          </h4>
                          <pre className="text-xs bg-slate-100 p-3 rounded border overflow-x-auto">
{`// Using pako.js library (zlib-wrapped deflate, RFC 1950)
const compressWithDeflate = async (data) => {
  const start = performance.now();
  const compressed = pako.deflate(data);
  const time = performance.now() - start;
  return { compressed, time };
};

const decompressWithDeflate = async (data) => {
  const start = performance.now();
  const decompressed = pako.inflate(data, { to: 'string' });
  const time = performance.now() - start;
  return { decompressed, time };
};`}
                          </pre>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="bg-white rounded-lg p-4 border border-slate-200">
                          <h4 className="font-semibold text-slate-800 mb-3 flex items-center">
                            <span className="w-3 h-3 bg-purple-500 rounded-full mr-2"></span>
                            {t('Brotli Implementation')}
                          </h4>
                          <pre className="text-xs bg-slate-100 p-3 rounded border overflow-x-auto">
{`// Using brotli-wasm (loaded lazily)
const brotli = await import('brotli-wasm').then(m => m.default);
const start = performance.now();
const compressed = brotli.compress(bytes, { quality: 11 });
const compressionTime = performance.now() - start;
const restored = brotli.decompress(compressed);`}
                          </pre>
                        </div>

                        <div className="bg-white rounded-lg p-4 border border-slate-200">
                          <h4 className="font-semibold text-slate-800 mb-3 flex items-center">
                            <span className="w-3 h-3 bg-orange-500 rounded-full mr-2"></span>
                            {t('LZ4 Implementation')}
                          </h4>
                          <pre className="text-xs bg-slate-100 p-3 rounded border overflow-x-auto">
{`// Using lz4js library (LZ4 frame format)
const compressWithLZ4 = (bytes) => {
  const start = performance.now();
  const compressed = new Uint8Array(lz4.compress(bytes));
  const time = performance.now() - start;
  return { compressed, time };
};`}
                          </pre>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white rounded-lg p-4 border border-slate-200">
                      <h4 className="font-semibold text-slate-800 mb-3">{t('Performance Measurement')}</h4>
                      <pre className="text-xs bg-slate-100 p-3 rounded border overflow-x-auto">
{`// Main comparison logic with timing
const performComparison = async () => {
  const minDuration = 800; // Minimum duration for UX
  const startTime = performance.now();
  const results = [];
  
  // Test each algorithm
  for (const algorithm of ['Gzip', 'Deflate', 'Brotli', 'LZ4']) {
    const { compressed, compressionTime } = await compress(data, algorithm);
    const { decompressed, decompressionTime } = await decompress(compressed, algorithm);
    
    results.push({
      algorithm,
      originalSize: new Blob([data]).size,
      compressedSize: compressed.length,
      compressionRatio: originalSize / compressed.length, // 3.2 means 3.2:1
      spaceSaved: (1 - compressed.length / originalSize) * 100,
      compressionTime,
      decompressionTime
    });
  }
  
  // Ensure minimum duration for visual feedback
  const elapsed = performance.now() - startTime;
  if (elapsed < minDuration) {
    await new Promise(resolve => setTimeout(resolve, minDuration - elapsed));
  }
  
  return results;
};`}
                      </pre>
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h4 className="font-semibold text-blue-800 mb-2">{t('Libraries Used')}</h4>
                      <div className="text-sm text-blue-700 space-y-1">
                        <p><strong>{t('{name}:', { name: 'pako.js' })}</strong>{' '}{t('Pure JavaScript implementation of zlib library (Gzip/Deflate)')}</p>
                        <p><strong>{t('{name}:', { name: 'lz4js' })}</strong>{' '}{t('JavaScript implementation of LZ4 compression algorithm')}</p>
                        <p><strong>{t('{name}:', { name: 'brotli-wasm' })}</strong>{' '}{t('The reference Brotli encoder compiled to WebAssembly, loaded on demand')}</p>
                        <p><strong>{t('{name}:', { name: 'Performance.now()' })}</strong>{' '}{t('High-resolution timing for accurate measurements')}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>

        </div>
      </div>
    </>
  );
};

export default CompressionComparison;