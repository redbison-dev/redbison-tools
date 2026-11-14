import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Archive, Download, Upload, Info } from 'lucide-react';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { useNavigate } from 'react-router-dom';
import { compressText, decompressText, describeSizeChange, loadBrotli, CodecError, type CompressionFormat } from '@/lib/tools/compression-tools';
import { useFormat, useT } from '@/i18n';

const CompressionTools = () => {
  const { t } = useT();
  const fmt = useFormat();
  const navigate = useNavigate();

  const handleToolSelect = (toolId: string) => {
    navigate(`/${toolId}`);
  };
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [operation, setOperation] = useState<'compress' | 'decompress'>('compress');
  const [format, setFormat] = useState<CompressionFormat>('gzip');
  const [sizeInfo, setSizeInfo] = useState<{ inputBytes: number; resultBytes: number } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const { trackAction } = useToolAnalytics();

  const handleProcess = async () => {
    if (!inputText.trim()) return;

    setIsProcessing(true);
    try {
      const brotli = format === 'brotli' ? await loadBrotli() : undefined;
      if (operation === 'compress') {
        const result = compressText(inputText, format, brotli);
        setOutputText(result.output);
        setSizeInfo({ inputBytes: result.inputBytes, resultBytes: result.resultBytes });
      } else {
        setOutputText(decompressText(inputText.trim(), format, brotli));
        setSizeInfo(null);
      }
      trackAction('compression_process', { operation, format });
    } catch (error) {
      setOutputText(t('Error: {message}', { message: error instanceof CodecError ? t(error.source, error.vars) : error instanceof Error ? error.message : t('Unknown error occurred') }));
      setSizeInfo(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClear = () => {
    setInputText('');
    setOutputText('');
    setSizeInfo(null);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(outputText);
    trackAction('compression_copy');
  };

  const downloadResult = () => {
    const blob = new Blob([outputText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${operation === 'compress' ? t('compress-result') : t('decompress-result')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    trackAction('compression_download');
  };

  return (
    <>

      <div className="tool-page bg-white min-h-screen">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 -mt-5 py-1 sm:py-2">
          <ToolBreadcrumb 
            category={{ label: t('Tech Tools'), href: '/tech-tools' }}
            subcategory={{ label: t('Data Formats'), href: '/tech-tools/data-formats' }}
            toolName="Compression Tools"
          />
          
          <div className="tool-header mt-6">
            <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2">
                <h1 className="tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
                  <Archive className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-blue-600" />
                  {t('Compress and Decompress Text')}
                </h1>
                <p className="tool-description text-gray-600 text-sm sm:text-base ml-11 sm:ml-13">
                  {t('Compress and decompress text using various formats')}
                </p>
              </div>
              
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <Badge variant="outline" className="border-blue-500 text-blue-600 px-3 py-1 bg-blue-50 text-xs sm:text-sm">
                  {t('Compression')}
                </Badge>
                <Badge variant="outline" className="border-green-500 text-green-600 px-3 py-1 bg-green-50 text-xs sm:text-sm">
                  {t('Encoding')}
                </Badge>
              </div>
            </div>
          </div>

          <div className="space-y-6 mt-6 sm:mt-8">
            {/* Controls */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('Configuration')}</CardTitle>
                <CardDescription>{t('Choose operation type and compression format')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t('Operation')}</label>
                    <Select value={operation} onValueChange={(value: 'compress' | 'decompress') => setOperation(value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="compress">{t('Compress')}</SelectItem>
                        <SelectItem value="decompress">{t('Decompress')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t('Format')}</label>
                    <Select value={format} onValueChange={(value: CompressionFormat) => setFormat(value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gzip">{t('Gzip')}</SelectItem>
                        <SelectItem value="deflate">{t('Deflate (zlib)')}</SelectItem>
                        <SelectItem value="base64">{t('Base64')}</SelectItem>
                        <SelectItem value="lz4">LZ4</SelectItem>
                        <SelectItem value="brotli">{t('Brotli')}</SelectItem>
                        <SelectItem value="url">{t('URL Encoding')}</SelectItem>
                        <SelectItem value="hex">{t('Hex Encoding')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="flex flex-wrap gap-2">
                  <Button onClick={handleProcess} disabled={!inputText.trim() || isProcessing}>
                    {operation === 'compress' ? t('Compress') : t('Decompress')}
                  </Button>
                  <Button variant="outline" onClick={handleClear}>
                    {t('Clear')}
                  </Button>
                  {outputText && (
                    <>
                      <Button variant="outline" onClick={handleCopy}>
                        {t('Copy Result')}
                      </Button>
                      <Button variant="outline" onClick={downloadResult}>
                        <Download className="h-4 w-4 mr-2" />
                        {t('Download')}
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Input/Output */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center">
                    <Upload className="h-5 w-5 mr-2" />
                    {t('Input Text')}
                  </CardTitle>
                  <CardDescription>
                    {operation === 'compress' ? t('Enter text to compress') : t('Paste Base64 output from this tool (or hex / URL-encoded text for those formats)')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder={operation === 'compress' ? t('Enter your text here...') : t('Enter compressed data here...')}
                    rows={12}
                    className="font-mono text-sm"
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center">
                    <Download className="h-5 w-5 mr-2" />
                    {t('Output')}
                    {sizeInfo && (
                      <Badge
                        variant="outline"
                        className={`ml-2 ${sizeInfo.resultBytes <= sizeInfo.inputBytes ? 'text-green-600 border-green-500' : 'text-amber-700 border-amber-500'}`}
                      >
                        {t('{inputBytes} → {resultBytes} bytes, {value}', { inputBytes: sizeInfo.inputBytes, resultBytes: sizeInfo.resultBytes, value: describeSizeChange(sizeInfo.inputBytes, sizeInfo.resultBytes, t, (n) => fmt.number(n, { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false })) })}
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {operation === 'compress' ? t('Compressed result. Binary output is shown as Base64; sizes compare the raw compressed bytes.') : t('Decompressed result')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={outputText}
                    readOnly
                    placeholder={t('Result will appear here...')}
                    rows={12}
                    className="font-mono text-sm bg-gray-50"
                  />
                </CardContent>
              </Card>
            </div>

            {/* Information */}
            <Card className="border-2 border-blue-200 bg-blue-50">
              <CardHeader>
                <CardTitle className="text-lg text-blue-800 flex items-center">
                  <Info className="h-5 w-5 mr-2" />
                  {t('About Compression Formats')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                  <div className="text-sm text-blue-700 space-y-3">
                    <div>
                      <strong>{t('{name}:', { name: 'Gzip' })}</strong>{' '}{t('DEFLATE with a 10-byte header and CRC-32 trailer (RFC 1952). The most widely supported format for files and HTTP.')}
                    </div>
                    <div>
                      <strong>{t('Deflate (zlib):')}</strong>{' '}{t('DEFLATE data with a 2-byte zlib header and Adler-32 checksum (RFC 1950), the format HTTP calls "deflate".')}
                    </div>
                    <div>
                      <strong>{t('{name}:', { name: 'Base64' })}</strong>{' '}{t('Encoding format (not compression) that converts binary data to ASCII text.')}
                    </div>
                    <div>
                      <strong>{t('{name}:', { name: 'LZ4' })}</strong>{' '}{t('LZ4 frame format via lz4js. Very fast, with lower ratios than gzip.')}
                    </div>
                    <div>
                      <strong>{t('{name}:', { name: 'Brotli' })}</strong>{' '}{t('RFC 7932 via brotli-wasm at quality 11. Usually the smallest output for text, slower to compress.')}
                    </div>
                    <div>
                      <strong>{t('{name}:', { name: 'URL/Hex' })}</strong>{' '}{t('Encoding formats for web-safe text and hexadecimal representation.')}
                    </div>
                    <p className="mt-3 text-xs">
                      {t('Tip: Brotli usually gives the smallest output, LZ4 the fastest. Base64, URL and hex are encodings and always make data larger.')}
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

export default CompressionTools;
