
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Copy, Zap, RefreshCw, Maximize2, Minimize2, Share } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import { useCalculatorParams } from '@/hooks/useCalculatorParams';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { useNavigate } from 'react-router-dom';
import { useToolResult } from '@/hooks/useToolResult';
import { useT } from '@/i18n';

const PasswordGenerator = () => {
  const { t } = useT();
  const { state, updateState, getShareableUrl, isLoaded } = useCalculatorParams({
    length: 16,
    includeNumbers: true as boolean,
    includeSymbols: true as boolean
  });
  
  const [password, setPassword] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { trackAction } = useToolAnalytics();
  const navigate = useNavigate();

  const handleToolSelect = (toolId: string) => {
    navigate(`/${toolId}`);
  };

  const generatePassword = () => {
    const length = state.length as number;
    let charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    
    if (state.includeNumbers) {
      charset += '0123456789';
    }
    
    if (state.includeSymbols) {
      charset += '!@#$%^&*()_+-=[]{}|;:,.<>?';
    }

    // Cryptographically secure selection with rejection sampling so every
    // character in the set is equally likely (no modulo bias).
    let result = '';
    const limit = 256 - (256 % charset.length);
    const buf = new Uint8Array(1);
    while (result.length < length) {
      crypto.getRandomValues(buf);
      if (buf[0] < limit) result += charset.charAt(buf[0] % charset.length);
    }
    
    setPassword(result);
    toast({
      title: t('Password Generated'),
      description: t('Secure password with {length} characters created!', { length }),
    });
    trackAction('generate_password', { length, includeNumbers: state.includeNumbers, includeSymbols: state.includeSymbols });
  };

  const shareSettings = () => {
    const shareUrl = getShareableUrl();
    navigator.clipboard.writeText(shareUrl);
    toast({
      title: t('Settings Shared'),
      description: t('Password generator settings URL copied to clipboard!'),
    });
    trackAction('share_password_settings');
  };

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: t('Copied!'),
      description: t('{type} copied to clipboard', { type }),
    });
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const handleNumbersChange = (checked: boolean | "indeterminate") => {
    updateState({ includeNumbers: checked === true });
  };

  const handleSymbolsChange = (checked: boolean | "indeterminate") => {
    updateState({ includeSymbols: checked === true });
  };

  // tool_result once the output settles; the key is compared, never sent.
  useToolResult('generated', password);

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 bg-white z-50 flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-4">
            <Zap className="h-8 w-8 text-black" />
            <h1 className="text-3xl font-bold text-black">{t('Password Generator')}</h1>
          </div>
          <Button onClick={toggleFullscreen} variant="outline" size="lg" className="border-2 border-gray-300">
            <Minimize2 className="h-5 w-5 mr-2" />
            {t('Exit Fullscreen')}
          </Button>
        </div>
        
        <div className="flex-1 p-8 flex items-center justify-center">
          <Card className="bg-white border-2 border-gray-200 shadow-sm w-full max-w-2xl">
            <CardHeader>
              <CardTitle className="text-black text-2xl flex items-center">
                <Zap className="h-8 w-8 mr-3" />
                {t('Password Generator')}
              </CardTitle>
              <CardDescription className="text-gray-600 text-lg">{t('Generate secure passwords')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              <div className="space-y-6">
                <div>
                  <label className="block text-lg font-medium text-gray-700 mb-3">
                    {t('Length: {length}', { length: state.length })}
                  </label>
                  <Slider
                    value={[state.length as number]}
                    onValueChange={(value) => updateState({ length: value[0] })}
                    max={64}
                    min={8}
                    step={1}
                    className="w-full"
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex items-center space-x-3">
                    <Checkbox
                      id="numbers-fs"
                      checked={state.includeNumbers as boolean}
                      onCheckedChange={handleNumbersChange}
                    />
                    <label htmlFor="numbers-fs" className="text-lg font-medium text-gray-700">
                      {t('Numbers (0-9)')}
                    </label>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <Checkbox
                      id="symbols-fs"
                      checked={state.includeSymbols as boolean}
                      onCheckedChange={handleSymbolsChange}
                    />
                    <label htmlFor="symbols-fs" className="text-lg font-medium text-gray-700">
                      {t('Symbols (!@#$...)')}
                    </label>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 p-6 rounded-xl border-2 border-gray-200">
                <Input
                  value={password || t('Click generate to create password')}
                  readOnly
                  className="bg-white border-2 border-gray-200 text-black font-mono text-center text-lg h-14"
                />
              </div>

              <div className="flex space-x-4">
                <Button 
                  onClick={generatePassword}
                  className="flex-1 bg-black hover:bg-gray-800 text-white py-4 text-lg"
                >
                  <Zap className="h-6 w-6 mr-3" />
                  {t('Generate Password')}
                </Button>
                
                <Button
                  onClick={shareSettings}
                  variant="outline"
                  className="border-2 border-gray-300 text-gray-700 py-4"
                >
                  <Share className="h-5 w-5" />
                </Button>
                
                {password && (
                  <Button
                    onClick={() => copyToClipboard(password, t('Password'))}
                    variant="outline"
                    className="border-2 border-gray-300 text-gray-700 py-4"
                  >
                    <Copy className="h-5 w-5" />
                  </Button>
                )}
              </div>

              <div className="bg-green-50 p-6 rounded-xl border-2 border-green-200">
                <h4 className="font-semibold text-green-700 mb-3 text-lg">{t('Security Tips')}</h4>
                <ul className="text-green-600 space-y-2">
                  <li>{t('• Use different passwords for each account')}</li>
                  <li>{t('• Include numbers and symbols')}</li>
                  <li>{t('• Minimum 12 characters recommended')}</li>
                  <li>{t('• Store in a password manager')}</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <>

      <div className="max-w-7xl mx-auto w-full px-4 sm:px-8 pt-1 pb-6 sm:pb-8 space-y-3">
        <ToolBreadcrumb
          category={{ label: t('Development & Tech'), href: "/category/development-tech" }}
          subcategory={{ label: t('Security Tools'), href: "/category/development-tech/security-tools" }}
          toolName="Password Generator"
        />
        <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-black flex items-center gap-3">
              <Zap className="h-8 w-8 text-blue-600" />
              {t('Password Generator')}
            </h1>
            <p className="text-gray-600 text-sm sm:text-base">{t('Generate secure passwords')}</p>
        </div>
        <div className="flex flex-col space-y-3 sm:space-y-0 sm:flex-row sm:items-center sm:space-x-3">
          {!isMobile && (
            <Button onClick={toggleFullscreen} variant="outline" className="border-2 border-gray-300">
              <Maximize2 className="h-4 w-4 mr-2" />
              {t('Fullscreen')}
            </Button>
          )}
          <div className="flex flex-wrap gap-2 sm:gap-3">
            <Badge variant="outline" className="border-yellow-500 text-yellow-600 bg-yellow-50">{t('Generators')}</Badge>
            <Badge variant="outline" className="border-red-500 text-red-600 bg-red-50">{t('Security')}</Badge>
          </div>
        </div>
      </div>

      <div className="flex justify-center">
        <Card className="bg-white border-2 border-gray-200 shadow-sm w-full max-w-2xl">
          <CardHeader>
            <CardTitle className="text-black text-lg sm:text-xl flex items-center">
              <Zap className="h-5 w-5 sm:h-6 sm:w-6 mr-2 sm:mr-3" />
              {t('Password Generator')}
            </CardTitle>
            <CardDescription className="text-gray-600 text-sm sm:text-base">{t('Generate secure passwords')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('Length: {length}', { length: state.length })}
                </label>
                <Slider
                  value={[state.length as number]}
                  onValueChange={(value) => updateState({ length: value[0] })}
                  max={64}
                  min={8}
                  step={1}
                  className="w-full"
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="numbers"
                    checked={state.includeNumbers as boolean}
                    onCheckedChange={handleNumbersChange}
                  />
                  <label htmlFor="numbers" className="text-sm font-medium text-gray-700">
                    {t('Numbers (0-9)')}
                  </label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="symbols"
                    checked={state.includeSymbols as boolean}
                    onCheckedChange={handleSymbolsChange}
                  />
                  <label htmlFor="symbols" className="text-sm font-medium text-gray-700">
                    {t('Symbols (!@#$...)')}
                  </label>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-xl border-2 border-gray-200">
              <Input
                value={password || t('Click generate to create password')}
                readOnly
                className="bg-white border-2 border-gray-200 text-black font-mono text-center text-sm sm:text-base"
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button 
                onClick={generatePassword}
                className="flex-1 bg-black hover:bg-gray-800 text-white py-3"
              >
                <Zap className="h-5 w-5 mr-2" />
                {t('Generate Password')}
              </Button>
              
              <Button
                onClick={shareSettings}
                variant="outline"
                className="border-2 border-gray-300 text-gray-700"
              >
                <Share className="h-4 w-4 mr-2" />
                {t('Share')}
              </Button>
              
              {password && (
                <Button
                  onClick={() => copyToClipboard(password, t('Password'))}
                  variant="outline"
                  className="border-2 border-gray-300 text-gray-700"
                >
                  <Copy className="h-4 w-4 mr-2" />
                  {t('Copy')}
                </Button>
              )}
            </div>

            <div className="bg-green-50 p-4 rounded-xl border-2 border-green-200">
              <h4 className="font-semibold text-green-700 mb-2 text-sm sm:text-base">{t('Security Tips')}</h4>
              <ul className="text-xs sm:text-sm text-green-600 space-y-1">
                <li>{t('• Use different passwords for each account')}</li>
                <li>{t('• Include numbers and symbols')}</li>
                <li>{t('• Minimum 12 characters recommended')}</li>
                <li>{t('• Store in a password manager')}</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

    </div>
    </>
  );
};

export default PasswordGenerator;
