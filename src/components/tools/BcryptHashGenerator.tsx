import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Shield, Copy, Key, CheckCircle, XCircle, RotateCcw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import bcrypt from 'bcryptjs';
import { isBcryptHash } from '@/lib/tools/bcrypt-hash-generator';
import { useFormat, useT } from '@/i18n';

interface BcryptHashGeneratorProps {
  onToolSelect?: (toolId: string) => void;
}

interface HashResult {
  hash: string;
  saltRounds: number;
  timestamp: number;
}

const BcryptHashGenerator = ({ onToolSelect }: BcryptHashGeneratorProps) => {
  const { t } = useT();
  const fmt = useFormat();
  const [password, setPassword] = useState('');
  const [saltRounds, setSaltRounds] = useState(10);
  const [hash, setHash] = useState('');
  const [verifyPassword, setVerifyPassword] = useState('');
  const [verifyHash, setVerifyHash] = useState('');
  const [verificationResult, setVerificationResult] = useState<boolean | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [history, setHistory] = useState<HashResult[]>([]);
  const { toast } = useToast();
  const { trackAction } = useToolAnalytics();

  const generateHash = async () => {
    if (!password.trim()) {
      toast({
        title: t('Input Required'),
        description: t('Please enter a password to hash.'),
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    try {
      const generatedHash = await bcrypt.hash(password, saltRounds);
      setHash(generatedHash);
      
      // Add to history
      const result: HashResult = {
        hash: generatedHash,
        saltRounds,
        timestamp: Date.now()
      };
      setHistory(prev => [result, ...prev.slice(0, 9)]); // Keep last 10

      trackAction('bcrypt_hash_generated', {
        saltRounds,
        passwordLength: password.length
      });

      toast({
        title: t('Hash Generated'),
        description: t('Bcrypt hash has been generated successfully.'),
      });

    } catch (error) {
      toast({
        title: t('Generation Error'),
        description: t('Failed to generate hash. Please try again.'),
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const verifyPasswordHash = async () => {
    if (!verifyPassword.trim() || !verifyHash.trim()) {
      toast({
        title: t('Input Required'),
        description: t('Please enter both password and hash to verify.'),
        variant: "destructive",
      });
      return;
    }

    // bcryptjs resolves false for a malformed hash, which would read as "does not match".
    if (!isBcryptHash(verifyHash)) {
      setVerificationResult(null);
      toast({
        title: t('Invalid Hash Format'),
        description: t('Expected a 60-character bcrypt hash starting with $2a$, $2b$ or $2y$.'),
        variant: "destructive",
      });
      return;
    }

    setIsVerifying(true);
    try {
      const isValid = await bcrypt.compare(verifyPassword, verifyHash.trim());
      setVerificationResult(isValid);

      trackAction('bcrypt_hash_verified', {
        isValid,
        passwordLength: verifyPassword.length
      });

      toast({
        title: isValid ? t('Verification Successful') : t('Verification Failed'),
        description: isValid ? t('Password matches the hash.') : t('Password does not match the hash.'),
        variant: isValid ? "default" : "destructive",
      });

    } catch (error) {
      setVerificationResult(false);
      toast({
        title: t('Verification Error'),
        description: t('Invalid hash format or verification failed.'),
        variant: "destructive",
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({
        title: t('Copied!'),
        description: t('{type} copied to clipboard.', { type }),
      });
    }).catch(() => {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      toast({
        title: t('Copied!'),
        description: t('{type} copied to clipboard.', { type }),
      });
    });

    trackAction('bcrypt_copied', { type });
  };

  const clearAll = () => {
    setPassword('');
    setHash('');
    setVerifyPassword('');
    setVerifyHash('');
    setVerificationResult(null);
    setHistory([]);
    trackAction('bcrypt_generator_cleared');
  };

  const useFromHistory = (item: HashResult) => {
    setVerifyHash(item.hash);
    setVerificationResult(null);
  };

  const getSaltRoundsInfo = (rounds: number) => {
    const recommendations = {
      4: { level: t('Very Fast'), security: t('Low'), time: "~1ms", color: "text-red-500" },
      6: { level: t('Fast'), security: t('Low'), time: "~4ms", color: "text-orange-500" },
      8: { level: t('Fast'), security: t('Medium'), time: "~16ms", color: "text-yellow-500" },
      10: { level: t('Balanced'), security: t('Good'), time: "~64ms", color: "text-green-500" },
      12: { level: t('Slow'), security: t('High'), time: "~256ms", color: "text-blue-500" },
      14: { level: t('Very Slow'), security: t('Very High'), time: "~1s", color: "text-purple-500" },
      16: { level: t('Extremely Slow'), security: t('Maximum'), time: "~4s", color: "text-red-600" }
    };
    return recommendations[rounds as keyof typeof recommendations] || recommendations[10];
  };

  return (
    <>

      <div className="tool-page bg-white min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 -mt-5 pb-1 sm:pb-2">
          {/* Breadcrumb */}
          <div className="!m-0 !p-0 !mt-0 !pt-0 -mt-2">
          <ToolBreadcrumb 
            category={{ label: t('Tech Tools'), href: "/category/development-tech" }}
            subcategory={{ label: t('Security Tools'), href: "/category/development-tech/security-tools" }}
            toolName="Bcrypt Hash Generator"
          />
          </div>
          
          <div className="tool-header mt-3">
            <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2">
                <h1 className="tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
                  <Shield className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-blue-600" />
                  {t('Bcrypt Hash Generator')}
                </h1>
                <p className="tool-description text-gray-600 text-sm sm:text-base ml-11 sm:ml-13">{t('Generate & verify secure bcrypt hashes for password storage & authentication systems')}</p>
              </div>
              
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <Badge variant="outline" className="border-blue-500 text-blue-600 px-3 py-1 bg-blue-50 text-xs sm:text-sm">{t('Security')}</Badge>
                <Badge variant="outline" className="border-green-500 text-green-600 px-3 py-1 bg-green-50 text-xs sm:text-sm">{t('Bcrypt')}</Badge>
              </div>
            </div>
          </div>

          <div className="space-y-6 sm:space-y-8 mt-6 sm:mt-8">
            <div className="grid gap-6 lg:grid-cols-2">
            {/* Hash Generation */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  {t('Generate Hash')}
                </CardTitle>
                <CardDescription>
                  {t('Create a secure bcrypt hash from your password')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="password">{t('Password')}</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder={t('Enter password to hash')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && generateHash()}
                  />
                </div>

                <div>
                  <Label htmlFor="saltRounds">{t('Salt Rounds')}</Label>
                  <Select value={saltRounds.toString()} onValueChange={(value) => setSaltRounds(parseInt(value))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[4, 6, 8, 10, 12, 14, 16].map((rounds) => {
                        const info = getSaltRoundsInfo(rounds);
                        return (
                          <SelectItem key={rounds} value={rounds.toString()}>
                            <div className="flex items-center justify-between w-full">
                              <span>{t('{rounds} rounds', { rounds })}</span>
                              <span className={`text-xs ml-2 ${info.color}`}>
                                {info.level} ({info.time})
                              </span>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <div className="text-sm text-muted-foreground mt-1">
                    {(() => {
                      const info = getSaltRoundsInfo(saltRounds);
                      return (
                        <span className={info.color}>
                          {t('{level} - {security} Security (~{time})', { level: info.level, security: info.security, time: info.time })}
                        </span>
                      );
                    })()}
                  </div>
                </div>

                <Button 
                  onClick={generateHash} 
                  disabled={isGenerating || !password.trim()}
                  className="w-full"
                >
                  {isGenerating ? t('Generating...') : t('Generate Hash')}
                </Button>

                {hash && (
                  <div className="space-y-2">
                    <Label>{t('Generated Hash')}</Label>
                    <div className="relative">
                      <Textarea
                        value={hash}
                        readOnly
                        className="font-mono text-sm bg-muted pr-12"
                        rows={3}
                      />
                      <Button
                        size="sm"
                        onClick={() => copyToClipboard(hash, t('Hash'))}
                        className="absolute right-2 top-2"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t('Length: {length} characters | Salt Rounds: {saltRounds}', { length: hash.length, saltRounds })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Hash Verification */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5" />
                  {t('Verify Hash')}
                </CardTitle>
                <CardDescription>
                  {t('Verify if a password matches a bcrypt hash')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="verify-password">{t('Password to Verify')}</Label>
                  <Input
                    id="verify-password"
                    type="password"
                    placeholder={t('Enter password')}
                    value={verifyPassword}
                    onChange={(e) => setVerifyPassword(e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="verify-hash">{t('Hash to Compare')}</Label>
                  <Textarea
                    id="verify-hash"
                    placeholder={t('Enter bcrypt hash')}
                    value={verifyHash}
                    onChange={(e) => setVerifyHash(e.target.value)}
                    className="font-mono text-sm"
                    rows={3}
                  />
                </div>

                <Button 
                  onClick={verifyPasswordHash} 
                  disabled={isVerifying || !verifyPassword.trim() || !verifyHash.trim()}
                  className="w-full"
                >
                  {isVerifying ? t('Verifying...') : t('Verify Password')}
                </Button>

                {verificationResult !== null && (
                  <div className={`p-4 rounded-lg border ${
                    verificationResult 
                      ? 'bg-green-50 border-green-200 text-green-800' 
                      : 'bg-red-50 border-red-200 text-red-800'
                  }`}>
                    <div className="flex items-center gap-2">
                      {verificationResult ? (
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-600" />
                      )}
                      <span className="font-semibold">
                        {verificationResult ? t('Password Matches!') : t('Password Does Not Match')}
                      </span>
                    </div>
                    <p className="text-sm mt-1">
                      {verificationResult 
                        ? t('The password correctly verifies against the provided hash.')
                        : t('The password does not match the hash or the hash format is invalid.')
                      }
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

            {/* History and Actions */}
            <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle>{t('Security Information')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <h4 className="font-semibold">{t('What is Bcrypt?')}</h4>
                      <p className="text-sm text-muted-foreground">
                        {t('Bcrypt is a password hashing function designed to be slow and computationally expensive, making it resistant to brute-force attacks.')}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <h4 className="font-semibold">{t('Salt Rounds')}</h4>
                      <p className="text-sm text-muted-foreground">
                        {t('Higher salt rounds increase security but also computation time. 10-12 rounds are typically recommended for most applications.')}
                      </p>
                    </div>
                  </div>
                  
                  <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm text-yellow-800">
                      <strong>{t('Security Note:')}</strong>{' '}{t('Never store passwords in plain text. Always use bcrypt or similar hashing algorithms for password storage.')}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {history.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>{t('Recent Hashes')}</CardTitle>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={clearAll}
                    className="ml-auto"
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    {t('Clear')}
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {history.map((item, index) => (
                      <div
                        key={index}
                        className="p-2 bg-muted rounded cursor-pointer hover:bg-muted/80 transition-colors"
                        onClick={() => useFromHistory(item)}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <Badge variant="secondary">{t('{saltRounds} rounds', { saltRounds: item.saltRounds })}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {fmt.date(new Date(item.timestamp), { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
                          </span>
                        </div>
                        <div className="font-mono text-xs truncate text-muted-foreground">
                          {item.hash}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          </div>
        </div>
      </div>
    </>
  );
};

export default BcryptHashGenerator;