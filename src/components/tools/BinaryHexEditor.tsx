import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Copy, Upload, Download, Binary, FileX, Maximize, Minimize, Check } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { useNavigate } from 'react-router-dom';
import {
  bytesToBinary,
  bytesToEditableText,
  bytesToHex,
  formatHexDump,
  parseHex,
  textToBytes,
} from '@/lib/tools/binary-hex-editor';
import { useSampleOverwriteConfirm, useInitialSnapshot } from '@/components/tools/shared/SampleOverwriteConfirm';
import { useT } from '@/i18n';

const BinaryHexEditor = () => {
  const { t } = useT();
  const navigate = useNavigate();

  const handleToolSelect = (toolId: string) => {
    navigate(`/${toolId}`);
  };
  const [hexData, setHexData] = useState('');
  const [textData, setTextData] = useState('');
  const [binaryData, setBinaryData] = useState('');
  const [formattedDump, setFormattedDump] = useState('');
  const [hexError, setHexError] = useState('');
  const [textIsLossy, setTextIsLossy] = useState(false);
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copyAnimations, setCopyAnimations] = useState<{[key: string]: boolean}>({});
  const [downloadAnimation, setDownloadAnimation] = useState(false);
  const isMobile = useIsMobile();

  const triggerCopyAnimation = (key: string) => {
    setCopyAnimations(prev => ({ ...prev, [key]: true }));
    setTimeout(() => {
      setCopyAnimations(prev => ({ ...prev, [key]: false }));
    }, 1000);
  };

  const applyBytes = (bytes: Uint8Array, opts: { keepHex?: string; keepText?: string } = {}) => {
    const editable = bytesToEditableText(bytes);
    setHexData(opts.keepHex ?? bytesToHex(bytes));
    setTextData(opts.keepText ?? editable.text);
    setTextIsLossy(opts.keepText !== undefined ? false : editable.lossy);
    setBinaryData(bytesToBinary(bytes));
    setFormattedDump(formatHexDump(bytes));
    setHexError('');
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setFileSize(file.size);

    const reader = new FileReader();
    reader.onload = (e) => {
      const arrayBuffer = e.target?.result as ArrayBuffer;
      applyBytes(new Uint8Array(arrayBuffer));
    };
    reader.readAsArrayBuffer(file);
  };

  const onHexChange = (value: string) => {
    const parsed = parseHex(value);
    if (parsed.error) {
      // Keep what the user typed, but do not derive views from invalid hex.
      setHexData(value);
      setHexError(t(parsed.errorMsg.text, parsed.errorMsg.vars));
      return;
    }
    applyBytes(parsed.bytes, { keepHex: value });
  };

  const onTextChange = (value: string) => {
    applyBytes(textToBytes(value), { keepText: value });
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    triggerCopyAnimation(key);
  };

  const downloadHex = () => {
    if (!hexData) return;
    
    const blob = new Blob([hexData], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'hex-dump.txt';
    a.click();
    URL.revokeObjectURL(url);
    
    setDownloadAnimation(true);
    setTimeout(() => setDownloadAnimation(false), 1000);
  };

  // Load Sample asks before replacing anything the user typed.
  const sampleState = { hexData };
  const { requestSampleLoad, confirmDialog } = useSampleOverwriteConfirm(sampleState, useInitialSnapshot(sampleState));

  const generateSampleData = () => requestSampleLoad(() => {
    const sample = t('Hello, World! This is a sample binary data.');
    onTextChange(sample);
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
              toolName="Binary & Hex Editor"
            />
            
            <div className="tool-header mt-6">
              <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                  <h1 className="tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
                    <Binary className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-orange-600" />
                    {t('Hex Editor and Binary Viewer')}
                  </h1>
                  <p className="tool-description text-gray-600 text-sm sm:text-base ml-11 sm:ml-13">{t('View and edit binary data in hex, text, and binary formats')}</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <Badge variant="outline" className="border-orange-500 text-orange-600 px-3 py-1 bg-orange-50 text-xs sm:text-sm">{t('Binary')}</Badge>
                  <Badge variant="outline" className="border-purple-500 text-purple-600 px-3 py-1 bg-purple-50 text-xs sm:text-sm">{t('Editor')}</Badge>
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

            <div className="space-y-6 mt-6 sm:mt-8">
              <Card className="bg-white border-2 border-gray-200 rounded-2xl shadow-sm">
                <CardHeader>
                  <CardTitle className="text-black flex items-center gap-2 text-lg sm:text-xl">
                    <FileX className="h-5 w-5" />
                    {t('File Information')}
                    {fileName && (
                      <span className="text-sm font-normal text-gray-600">
                        {t('- {fileName} ({fileSize} bytes)', { fileName, fileSize })}
                      </span>
                    )}
                  </CardTitle>
                  <CardDescription className="text-gray-600 text-sm sm:text-base">
                    {t('Upload a file or enter data manually')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => document.getElementById('binary-file')?.click()}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      {t('Upload File')}
                    </Button>
                    <Button variant="outline" onClick={generateSampleData}>
                      {t('Sample Data')}
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={downloadHex} 
                      disabled={!hexData}
                      className={`transition-all duration-300 ${
                        downloadAnimation ? 'bg-green-50 border-green-500 text-green-600 scale-105' : ''
                      }`}
                    >
                      {downloadAnimation ? <Check className="h-4 w-4 mr-2" /> : <Download className="h-4 w-4 mr-2" />}
                      {downloadAnimation ? t('Downloaded!') : t('Download Hex')}
                    </Button>
                  </div>

                  <input
                    id="binary-file"
                    type="file"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </CardContent>
              </Card>

              <Tabs defaultValue="hex" className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="hex">{t('Hex View')}</TabsTrigger>
                  <TabsTrigger value="text">{t('Text View')}</TabsTrigger>
                  <TabsTrigger value="binary">{t('Binary View')}</TabsTrigger>
                  <TabsTrigger value="formatted">{t('Formatted Hex')}</TabsTrigger>
                </TabsList>
                
                <TabsContent value="hex" className="space-y-4">
                  <Card className="bg-white border-2 border-gray-200 rounded-2xl shadow-sm">
                    <CardHeader>
                      <CardTitle className="text-black text-lg sm:text-xl">{t('Hexadecimal View')}</CardTitle>
                      <CardDescription className="text-gray-600 text-sm sm:text-base">
                        {t('Edit data in hexadecimal format (space-separated bytes)')}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyToClipboard(hexData, 'hex')}
                          disabled={!hexData}
                          className={`transition-all duration-300 ${
                            copyAnimations.hex ? 'bg-green-50 border-green-500 text-green-600 scale-105' : ''
                          }`}
                        >
                          {copyAnimations.hex ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                          {copyAnimations.hex ? t('Copied!') : t('Copy Hex')}
                        </Button>
                      </div>
                      
                      <Textarea
                        placeholder="48 65 6C 6C 6F 20 57 6F 72 6C 64"
                        value={hexData}
                        onChange={(e) => onHexChange(e.target.value)}
                        className="min-h-[200px] font-mono text-sm"
                      />
                      {hexError && (
                        <p className="text-sm text-red-600" role="alert">{t('{hexError}. Other views show the last valid data.', { hexError })}</p>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
                
                <TabsContent value="text" className="space-y-4">
                  <Card className="bg-white border-2 border-gray-200 rounded-2xl shadow-sm">
                    <CardHeader>
                      <CardTitle className="text-black text-lg sm:text-xl">{t('Text View')}</CardTitle>
                      <CardDescription className="text-gray-600 text-sm sm:text-base">
                        {t('Edit data as text. Typed text is stored as UTF-8 bytes.')}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyToClipboard(textData, 'text')}
                          disabled={!textData}
                          className={`transition-all duration-300 ${
                            copyAnimations.text ? 'bg-green-50 border-green-500 text-green-600 scale-105' : ''
                          }`}
                        >
                          {copyAnimations.text ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                          {copyAnimations.text ? t('Copied!') : t('Copy Text')}
                        </Button>
                      </div>
                      
                      <Textarea
                        placeholder={t('Hello World')}
                        value={textData}
                        onChange={(e) => onTextChange(e.target.value)}
                        className="min-h-[200px] font-mono text-sm"
                      />
                      {textIsLossy && (
                        <p className="text-sm text-amber-700">
                          {t('These bytes are not plain UTF-8 text, so non-printable bytes are shown as dots. Editing here replaces them; edit in Hex View to keep them.')}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
                
                <TabsContent value="binary" className="space-y-4">
                  <Card className="bg-white border-2 border-gray-200 rounded-2xl shadow-sm">
                    <CardHeader>
                      <CardTitle className="text-black text-lg sm:text-xl">{t('Binary View')}</CardTitle>
                      <CardDescription className="text-gray-600 text-sm sm:text-base">
                        {t('View data in binary format (read-only)')}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyToClipboard(binaryData, 'binary')}
                          disabled={!binaryData}
                          className={`transition-all duration-300 ${
                            copyAnimations.binary ? 'bg-green-50 border-green-500 text-green-600 scale-105' : ''
                          }`}
                        >
                          {copyAnimations.binary ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                          {copyAnimations.binary ? t('Copied!') : t('Copy Binary')}
                        </Button>
                      </div>
                      
                      <Textarea
                        value={binaryData}
                        readOnly
                        className="min-h-[200px] font-mono text-sm"
                        placeholder="01001000 01100101 01101100 01101100 01101111"
                      />
                    </CardContent>
                  </Card>
                </TabsContent>
                
                <TabsContent value="formatted" className="space-y-4">
                  <Card className="bg-white border-2 border-gray-200 rounded-2xl shadow-sm">
                    <CardHeader>
                      <CardTitle className="text-black text-lg sm:text-xl">{t('Formatted Hex Dump')}</CardTitle>
                      <CardDescription className="text-gray-600 text-sm sm:text-base">
                        {t('Traditional hex dump format with offsets and ASCII representation')}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyToClipboard(formattedDump, 'formatted')}
                          disabled={!formattedDump}
                          className={`transition-all duration-300 ${
                            copyAnimations.formatted ? 'bg-green-50 border-green-500 text-green-600 scale-105' : ''
                          }`}
                        >
                          {copyAnimations.formatted ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                          {copyAnimations.formatted ? t('Copied!') : t('Copy Formatted')}
                        </Button>
                      </div>
                      
                      <div className="bg-gray-50 p-4 rounded-md border">
                        <pre className="font-mono text-sm whitespace-pre-wrap">
                          {formattedDump || t('No data to display')}
                        </pre>
                      </div>
                    </CardContent>
                  </Card>
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

export default BinaryHexEditor;
