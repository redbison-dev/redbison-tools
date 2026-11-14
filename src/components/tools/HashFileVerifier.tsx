
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Shield, Upload, Maximize, Minimize, CheckCircle, XCircle } from 'lucide-react';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import { useIsMobile } from '@/hooks/use-mobile';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { useNavigate } from 'react-router-dom';
import { FILE_HASH_ALGORITHMS, HashInputError, verifyBytes, type FileHashAlgorithm } from '@/lib/tools/hash-file-verifier';
import { useT } from '@/i18n';

const HashFileVerifier = () => {
  const { t } = useT();
  const navigate = useNavigate();
  
  const handleToolSelect = (toolId: string) => {
    navigate(`/${toolId}`);
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };
  
  const [file, setFile] = useState<File | null>(null);
  const [expectedHash, setExpectedHash] = useState('');
  const [actualHash, setActualHash] = useState('');
  const [isMatching, setIsMatching] = useState<boolean | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const { trackAction } = useToolAnalytics();
  const isMobile = useIsMobile();

  const [algorithm, setAlgorithm] = useState<FileHashAlgorithm | 'auto'>('auto');
  const [usedAlgorithm, setUsedAlgorithm] = useState<FileHashAlgorithm | ''>('');
  const [error, setError] = useState('');

  const clearResult = () => {
    setActualHash('');
    setIsMatching(null);
    setUsedAlgorithm('');
    setError('');
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = event.target.files?.[0];
    if (uploadedFile) {
      setFile(uploadedFile);
      clearResult();
    }
  };

  const verifyFile = async () => {
    if (!file || !expectedHash.trim()) {
      return;
    }

    setIsVerifying(true);
    clearResult();
    trackAction('verify_file_hash');

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const outcome = await verifyBytes(bytes, expectedHash, algorithm);
      setActualHash(outcome.actual);
      setUsedAlgorithm(outcome.algorithm);
      setIsMatching(outcome.match);
    } catch (err) {
      setError(err instanceof HashInputError ? t(err.text, err.vars) : err instanceof Error ? err.message : t('Could not hash this file'));
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <>

      <div className={`${isFullscreen ? 'fixed inset-0 z-50 bg-white overflow-auto' : ''}`}>
        <div className={`${isFullscreen ? 'min-h-screen p-4 sm:p-8' : 'tool-page bg-white min-h-screen'}`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-8 -mt-5 pb-1 sm:pb-2">
            {/* Breadcrumb */}
            <div className="!m-0 !p-0 !mt-0 !pt-0 -mt-2">
            <ToolBreadcrumb 
              category={{ label: t('Tech Tools'), href: "/category/development-tech" }}
              subcategory={{ label: t('Security Tools'), href: "/category/development-tech/security-tools" }}
              toolName="Hash File Verifier"
            />
            </div>
            
            <div className="tool-header mt-3">
              <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                  <h1 className="tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
                    <Shield className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-blue-600" />
                    {t('Hash File Verifier')}
                  </h1>
                  <p className="tool-description text-gray-600 text-sm sm:text-base ml-11 sm:ml-13">{t('Check a download against its published MD5, SHA-1, SHA-256, SHA-384 or SHA-512 checksum. The file is hashed in your browser and never uploaded.')}</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <Badge variant="outline" className="border-blue-500 text-blue-600 px-3 py-1 bg-blue-50 text-xs sm:text-sm">{t('Hash')}</Badge>
                  <Badge variant="outline" className="border-green-500 text-green-600 px-3 py-1 bg-green-50 text-xs sm:text-sm">{t('Security')}</Badge>
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

            <div className="space-y-6 sm:space-y-8 mt-6 sm:mt-8">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
              <Card className="bg-white border-2 border-gray-200 rounded-2xl shadow-sm">
                <CardHeader>
                  <CardTitle className="text-black text-lg sm:text-xl">{t('File Upload & Expected Hash')}</CardTitle>
                  <CardDescription>{t('Pick a file and paste the checksum from the download page')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">{t('Select File')}</label>
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                      <Upload className="h-8 w-8 mx-auto text-gray-500 mb-2" />
                      <input
                        type="file"
                        onChange={handleFileUpload}
                        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                      />
                    </div>
                    {file && (
                      <p className="text-sm text-gray-600 mt-2">
                        Selected: {file.name} ({(file.size / 1024).toFixed(2)} KB)
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">{t('Expected Hash')}</label>
                    <Input
                      value={expectedHash}
                      onChange={(e) => { setExpectedHash(e.target.value); clearResult(); }}
                      placeholder={t('Paste the checksum, a sha256sum line or sha384-... SRI value')}
                      className="font-mono text-sm"
                    />
                  </div>

                  <div>
                    <label htmlFor="hash-alg" className="block text-sm font-medium mb-2">{t('Algorithm')}</label>
                    <select
                      id="hash-alg"
                      value={algorithm}
                      onChange={(e) => { setAlgorithm(e.target.value as FileHashAlgorithm | 'auto'); clearResult(); }}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="auto">{t('Auto-detect from the expected hash')}</option>
                      {FILE_HASH_ALGORITHMS.map((a) => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                  </div>

                  {error && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">{error}</div>
                  )}

                  <Button 
                    onClick={verifyFile}
                    disabled={!file || !expectedHash.trim() || isVerifying}
                    className="w-full bg-green-600 hover:bg-green-700 text-white"
                  >
                    <Shield className="h-4 w-4 mr-2" />
                    {isVerifying ? t('Verifying...') : t('Verify File')}
                  </Button>
                </CardContent>
              </Card>

              <Card className="bg-white border-2 border-gray-200 rounded-2xl shadow-sm">
                <CardHeader>
                  <CardTitle className="text-black text-lg sm:text-xl">{t('Verification Results')}</CardTitle>
                  <CardDescription>{t('File hash verification status')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {actualHash && (
                    <div>
                      <label className="block text-sm font-medium mb-2">{t('Calculated Hash')}{usedAlgorithm ? ` (${usedAlgorithm})` : ''}</label>
                      <div className="bg-gray-50 p-3 rounded-lg border font-mono text-sm break-all">
                        {actualHash}
                      </div>
                    </div>
                  )}

                  {isMatching !== null && (
                    <div className={`p-4 rounded-lg border-2 flex items-center space-x-3 ${
                      isMatching 
                        ? 'bg-green-50 border-green-200' 
                        : 'bg-red-50 border-red-200'
                    }`}>
                      {isMatching ? (
                        <CheckCircle className="h-6 w-6 text-green-600" />
                      ) : (
                        <XCircle className="h-6 w-6 text-red-600" />
                      )}
                      <div>
                        <p className={`font-semibold ${
                          isMatching ? 'text-green-800' : 'text-red-800'
                        }`}>
                          {isMatching ? t('Hash Verification Passed') : t('Hash Verification Failed')}
                        </p>
                        <p className={`text-sm ${
                          isMatching ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {isMatching 
                            ? t('File integrity verified successfully') 
                            : t('The file differs from the one the checksum was made for: corrupted, modified, or a different version')
                          }
                        </p>
                      </div>
                    </div>
                  )}

                  {!actualHash && (
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center text-gray-500">
                      {t('Upload a file and enter expected hash to verify')}
                    </div>
                  )}
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

export default HashFileVerifier;
