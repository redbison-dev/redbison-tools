
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Shield, Upload, CheckCircle, XCircle, FileText, Key } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { useNavigate } from 'react-router-dom';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import { SIGNATURE_ALGORITHMS, SignatureError, verifySignature, type SignatureAlgorithm, type VerificationResult } from '@/lib/tools/digital-signature-validator';
import { useSampleOverwriteConfirm, useInitialSnapshot } from '@/components/tools/shared/SampleOverwriteConfirm';
import { useT } from '@/i18n';

const DigitalSignatureValidator = () => {
  const { t } = useT();
  const navigate = useNavigate();

  const handleToolSelect = (toolId: string) => {
    navigate(`/${toolId}`);
  };
  const [signatureInput, setSignatureInput] = useState('');
  const [publicKeyInput, setPublicKeyInput] = useState('');
  const [messageInput, setMessageInput] = useState('');
  const [validationResult, setValidationResult] = useState<VerificationResult | null>(null);
  const [algorithm, setAlgorithm] = useState<SignatureAlgorithm>('auto');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { toast } = useToast();
  const { trackAction } = useToolAnalytics();

  const validateSignature = async () => {
    if (!signatureInput.trim() || !publicKeyInput.trim() || !messageInput) {
      setError(t('Please provide signature, public key, and original message'));
      return;
    }

    setLoading(true);
    setError('');
    setValidationResult(null);
    trackAction('validate_signature');

    try {
      const result = await verifySignature({ message: messageInput, signature: signatureInput, publicKey: publicKeyInput, algorithm });
      setValidationResult(result);
      toast({
        title: result.valid ? t('Signature Valid') : t('Signature Invalid'),
        description: result.valid
          ? t('Verified with {matchedAlgorithm}', { matchedAlgorithm: result.matchedAlgorithm })
          : t('The signature does not match this message and key'),
        variant: result.valid ? "default" : "destructive",
      });
    } catch (err) {
      setError(err instanceof SignatureError ? t(err.source, err.vars) : err instanceof Error ? err.message : t('Failed to validate digital signature'));
    } finally {
      setLoading(false);
    }
  };

  // Load Sample asks before replacing anything the user typed.
  const sampleState = { signatureInput, publicKeyInput, messageInput };
  const { requestSampleLoad, confirmDialog } = useSampleOverwriteConfirm(sampleState, useInitialSnapshot(sampleState));

  const loadSampleData = () => requestSampleLoad(() => {
    // Signed with: openssl dgst -sha256 -sign key.pem message.txt | base64
    const sampleMessage = "Release 4.2.0 approved for production.";
    const samplePublicKey = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAihm9oVmnVTyt/G3DA6+A
9guRUp2+K+iS0o1OcXe2vwSumA4JSWa06neb0/kcjZSEASj+Jeng+BCkx10LAH68
VO+n0sjqk73PYmxjKFOW0CEf9CxemNHyZY0iO8lGLJNzgZp9aqYELOdYKZy7AQ6x
aQFmVOQ8dJEv2NaCHajrO4usr+L1Fu+BGoXYCk8Cselj1oV9dUFAtI9vFkDx5COc
FmvxwAsU+edzUFt80yxlMPNDaUK9oxadcMYShAp0+G9xoX2CM6JMYuzgUns0PcZP
C7hyn/DbOJaKsYga4Gzi6OuE0pX77HVmPuEeT66hAZrbnpOvdEezgC4gOERY3qKa
xQIDAQAB
-----END PUBLIC KEY-----`;
    const sampleSignature = "VHwQHg+vNwRHURZvS9fdeNIOdcbq6x+WHlyJmvzwoLt05IZWMEU4+z1C0dbp1zTLhzBiV5tZ6pCMNTZjubLSJJX2yWwKS+aH081Xlp28+d2HytAMxijaazE0ynnekmrFp3T7Rbhoz+tAz/M6rwyoTK99AtYOEGXSWi0aUIfyNe4NXc0bHshrRpMlSXIYz2LHiXc/Q4TZqM4BHCTpzQU1PLH8qSDFrNz1NSq0bQ26NwSPTQtPfC+ULL06CpxyNqHWjdz8Oflih1n6ATdLIe0H+L2pgECtlTSeyEHYUDyrRoIuYKEDWqtujgc02tQ8usJxOdiyK3uiBC6AsrpAm+luUg==";

    setMessageInput(sampleMessage);
    setPublicKeyInput(samplePublicKey);
    setSignatureInput(sampleSignature);
    setAlgorithm('auto');
    setValidationResult(null);
    setError('');
  });

  const clearAll = () => {
    setSignatureInput('');
    setPublicKeyInput('');
    setMessageInput('');
    setValidationResult(null);
    setError('');
  };

  return (
    <>
      
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6">
        <ToolBreadcrumb 
          category={{ label: t('Development & Tech'), href: "/category/development-tech" }}
          subcategory={{ label: t('Security Tools'), href: "/category/development-tech/security-tools" }}
          toolName="Digital Signature Validator"
        />
        
        <div className="tool-header mt-6">
          <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <h1 className="tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
                <Shield className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-blue-600" />
                {t('Digital Signature Validator')}
              </h1>
              <p className="tool-description text-gray-600 text-sm sm:text-base ml-11 sm:ml-13">{t('Verify RSA (PKCS#1 v1.5 and PSS), ECDSA and Ed25519 signatures against a public key, certificate or JWK with the Web Crypto API, in your browser.')}</p>
            </div>
            
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <Badge variant="outline" className="border-blue-500 text-blue-600 px-3 py-1 bg-blue-50 text-xs sm:text-sm">{t('Security')}</Badge>
              <Badge variant="outline" className="border-green-500 text-green-600 px-3 py-1 bg-green-50 text-xs sm:text-sm">{t('Signature')}</Badge>
            </div>
          </div>
        </div>

        <div className="space-y-6 sm:space-y-8 mt-6 sm:mt-8">

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {t('Original Message')}
              </CardTitle>
              <CardDescription>
                {t('The exact message that was signed, as UTF-8 text. A trailing newline changes the result.')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder={t('Enter the original message here...')}
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                className="min-h-[120px] font-mono text-sm"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                {t('Public Key')}
              </CardTitle>
              <CardDescription>
                {t('PEM public key (BEGIN PUBLIC KEY or RSA PUBLIC KEY), an X.509 certificate, or a JWK')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder={t('-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\n-----END PUBLIC KEY-----')}
                value={publicKeyInput}
                onChange={(e) => setPublicKeyInput(e.target.value)}
                className="min-h-[200px] font-mono text-sm"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                {t('Digital Signature')}
              </CardTitle>
              <CardDescription>
                {t('Base64, Base64url or hex. ECDSA signatures can be DER (OpenSSL) or raw r||s (JWS).')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder={t('Enter the base64 encoded digital signature...')}
                value={signatureInput}
                onChange={(e) => setSignatureInput(e.target.value)}
                className="min-h-[120px] font-mono text-sm"
              />

              <div>
                <label htmlFor="sig-alg" className="block text-sm font-medium mb-1">{t('Algorithm')}</label>
                <select
                  id="sig-alg"
                  value={algorithm}
                  onChange={(e) => setAlgorithm(e.target.value as SignatureAlgorithm)}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  {SIGNATURE_ALGORITHMS.map((a) => (
                    <option key={a.value} value={a.value}>{t(a.label)}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2 flex-wrap">
                <Button onClick={validateSignature} disabled={loading}>
                  {loading ? t('Validating...') : t('Validate Signature')}
                </Button>
                <Button variant="outline" onClick={loadSampleData}>
                  {t('Load Sample')}
                </Button>
                <Button variant="outline" onClick={clearAll}>
                  {t('Clear All')}
                </Button>
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-red-700 text-sm">{error}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t('Validation Results')}</CardTitle>
            <CardDescription>
              {t('Digital signature validation details')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {validationResult ? (
              <div className="space-y-6">
                {/* Overall Result */}
                <div className={`p-4 rounded-md border ${
                  validationResult.valid 
                    ? 'bg-green-50 border-green-200' 
                    : 'bg-red-50 border-red-200'
                }`}>
                  <div className="flex items-center gap-3">
                    {validationResult.valid ? (
                      <CheckCircle className="h-6 w-6 text-green-600" />
                    ) : (
                      <XCircle className="h-6 w-6 text-red-600" />
                    )}
                    <div>
                      <h3 className={`font-semibold ${
                        validationResult.valid ? 'text-green-800' : 'text-red-800'
                      }`}>
                        {validationResult.valid ? t('Signature Valid') : t('Signature Invalid')}
                      </h3>
                      <p className={`text-sm ${
                        validationResult.valid ? 'text-green-700' : 'text-red-700'
                      }`}>
                        {validationResult.valid 
                          ? t('The signature matches this exact message and public key')
                          : t('The signature does not verify: the message, key, signature or algorithm differ')
                        }
                      </p>
                    </div>
                  </div>
                </div>

                <Separator />

                <div>
                  <h3 className="text-lg font-semibold mb-3">{t('Technical Details')}</h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <label className="font-medium text-gray-600">{t('Algorithm')}</label>
                      <p>{validationResult.matchedAlgorithm ?? (algorithm === 'auto' ? t('No match') : algorithm)}</p>
                    </div>
                    <div>
                      <label className="font-medium text-gray-600">{t('Key')}</label>
                      <p>
                        {validationResult.key.info.algorithm}
                        {validationResult.key.info.curve ? ` ${validationResult.key.info.curve}` : ''}
                        {validationResult.key.info.keySize ? t(', {bits} bits', { bits: validationResult.key.info.keySize }) : ''}
                      </p>
                    </div>
                    <div>
                      <label className="font-medium text-gray-600">{t('Key Source')}</label>
                      <p className="break-all">{validationResult.key.source}</p>
                    </div>
                    <div>
                      <label className="font-medium text-gray-600">{t('Signature')}</label>
                      <p>{t('{signatureBytes} bytes, {signatureEncoding}', { signatureBytes: validationResult.signatureBytes, signatureEncoding: validationResult.signatureEncoding })}</p>
                    </div>
                    <div>
                      <label className="font-medium text-gray-600">{t('Message')}</label>
                      <p>{t('{messageBytes} bytes (UTF-8)', { messageBytes: validationResult.messageBytes })}</p>
                    </div>
                    <div>
                      <label className="font-medium text-gray-600">{t('Tried')}</label>
                      <p>{validationResult.tried.join(', ')}</p>
                    </div>
                  </div>
                </div>

                {!validationResult.valid && (
                  <div className="text-sm text-gray-700 bg-gray-50 border rounded-md p-3">
                    {t('Common causes: the message differs by whitespace or a trailing newline, the signature was made over a hash or a different encoding of the data, the wrong public key, or a different algorithm or padding.')}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Shield className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                <p>{t('Enter signature details and click validate to see results')}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
        </div>
      </div>
      {confirmDialog}
    </>
  );
};

export default DigitalSignatureValidator;
