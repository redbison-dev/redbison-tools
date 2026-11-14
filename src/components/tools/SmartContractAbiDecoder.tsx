
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Copy, Code, Maximize, Minimize } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import { useIsMobile } from '@/hooks/use-mobile';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { useNavigate } from 'react-router-dom';
import {
  AbiError,
  canonicalType,
  decodeCalldata,
  formatDecodedValue,
  parseAbiJson,
  summarizeAbi,
  type AbiParam,
} from '@/lib/tools/smart-contract-abi-decoder';
import { useT } from '@/i18n';

const SmartContractAbiDecoder = () => {
  const { t } = useT();
  const navigate = useNavigate();
  
  const handleToolSelect = (toolId: string) => {
    navigate(`/${toolId}`);
  };
  
  const [abiInput, setAbiInput] = useState('');
  const [calldataInput, setCalldataInput] = useState('');
  const [decodedOutput, setDecodedOutput] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { toast } = useToast();
  const { trackAction } = useToolAnalytics();
  const isMobile = useIsMobile();

  // Decoder errors carry their message template, so they read in the page language.
  const errorText = (error: Error) => (error instanceof AbiError ? t(error.text, error.vars) : error.message);

  const decodeABI = () => {
    if (!abiInput.trim()) {
      toast({
        title: t('Error'),
        description: t('Please enter ABI data to decode'),
        variant: "destructive"
      });
      return;
    }

    let abi;
    try {
      abi = parseAbiJson(abiInput);
    } catch (error) {
      toast({
        title: t('Error'),
        description: error instanceof SyntaxError
          ? t('Invalid ABI format. Please check your input.')
          : error instanceof Error ? errorText(error) : t('Invalid ABI'),
        variant: "destructive"
      });
      return;
    }

    try {
      const summary = summarizeAbi(abi);
      const params = (list: AbiParam[]) => list.map((p) => `${canonicalType(p)}${p.indexed ? ' indexed' : ''}${p.name ? ` ${p.name}` : ''}`).join(', ');
      const lines: string[] = [t('Smart Contract ABI Analysis:'), ''];

      if (calldataInput.trim()) {
        try {
          const call = decodeCalldata(abi, calldataInput);
          lines.push(t('Decoded Calldata:'));
          lines.push(t('- Function: {signature}', { signature: call.signature }));
          lines.push(t('- Selector: {selector}', { selector: call.selector }));
          call.args.forEach((arg) => lines.push(`- ${arg.name} (${arg.type}): ${formatDecodedValue(arg.value)}`));
        } catch (error) {
          lines.push(t('Calldata could not be decoded: {error}', { error: error instanceof Error ? errorText(error) : String(error) }));
        }
        lines.push('');
      }

      lines.push(t('Summary:'));
      lines.push(t('- Functions: {count}', { count: summary.functions.length }));
      lines.push(t('- Events: {count}', { count: summary.events.length }));
      lines.push(t('- Errors: {count}', { count: summary.errors.length }));
      lines.push(t('- Constructors: {count}', { count: summary.constructors.length }));
      if (summary.hasReceive) lines.push(t('- Has receive() for plain ETH transfers'));
      if (summary.hasFallback) lines.push(t('- Has fallback()'));
      lines.push('');

      if (summary.functions.length > 0) {
        lines.push(t('Functions (selector, signature):'));
        summary.functions.forEach((f) => {
          const outputs = f.outputs.length ? ` returns (${params(f.outputs)})` : '';
          const mut = f.stateMutability && f.stateMutability !== 'nonpayable' ? ` [${f.stateMutability}]` : '';
          lines.push(`- ${f.id}  ${f.name}(${params(f.inputs)})${outputs}${mut}`);
        });
        lines.push('');
      }
      if (summary.events.length > 0) {
        lines.push(t('Events (topic0, signature):'));
        summary.events.forEach((e) => lines.push(`- ${e.id}  ${e.name}(${params(e.inputs)})`));
        lines.push('');
      }
      if (summary.errors.length > 0) {
        lines.push(t('Custom errors (selector, signature):'));
        summary.errors.forEach((e) => lines.push(`- ${e.id}  ${e.name}(${params(e.inputs)})`));
        lines.push('');
      }

      lines.push(`${t('Full ABI:')}\n${JSON.stringify(abi, null, 2)}`);
      setDecodedOutput(lines.join('\n'));
      trackAction('decode_abi');
    } catch (error) {
      toast({
        title: t('Error'),
        description: error instanceof Error ? errorText(error) : t('Invalid ABI format. Please check your input.'),
        variant: "destructive"
      });
    }
  };

  const copyOutput = () => {
    navigator.clipboard.writeText(decodedOutput);
    toast({ title: t('Copied!'), description: t('Decoded ABI copied to clipboard') });
    trackAction('copy_decoded_abi');
  };

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
              subcategory={{ label: t('Blockchain Tools'), href: '/tech-tools/blockchain-tools' }}
              toolName="Smart Contract ABI Decoder"
            />
            
            <div className="tool-header mt-6">
              <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                  <h1 className="tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
                    <Code className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-blue-600" />
                    {t('Smart Contract ABI Decoder')}
                  </h1>
                  <p className="tool-description text-gray-600 text-sm sm:text-base ml-11 sm:ml-13">{t('Decode and analyze Ethereum smart contract ABI')}</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <Badge variant="outline" className="border-blue-500 text-blue-600 px-3 py-1 bg-blue-50 text-xs sm:text-sm">{t('Ethereum')}</Badge>
                  <Badge variant="outline" className="border-purple-500 text-purple-600 px-3 py-1 bg-purple-50 text-xs sm:text-sm">{t('Smart Contract')}</Badge>
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

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mt-6 sm:mt-8">
              <Card className="border-2 border-gray-200">
                <CardHeader>
                  <CardTitle className="text-lg sm:text-xl">{t('ABI Input')}</CardTitle>
                  <CardDescription>{t('Paste the ABI JSON (or a Hardhat/Foundry artifact) and, optionally, transaction input data')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    placeholder='[{"type":"function","name":"transfer","inputs":[{"type":"address","name":"to"},{"type":"uint256","name":"amount"}],"outputs":[{"type":"bool"}]}]'
                    value={abiInput}
                    onChange={(e) => setAbiInput(e.target.value)}
                    rows={12}
                    className="font-mono text-sm"
                  />
                  <div className="space-y-2">
                    <label htmlFor="abi-calldata" className="text-sm font-medium">{t('Calldata to decode (optional)')}</label>
                    <Textarea
                      id="abi-calldata"
                      placeholder={t('0xa9059cbb000000000000000000000000...')}
                      value={calldataInput}
                      onChange={(e) => setCalldataInput(e.target.value)}
                      rows={3}
                      className="font-mono text-sm"
                    />
                  </div>
                  <Button onClick={decodeABI} className="w-full">
                    <Code className="h-4 w-4 mr-2" />
                    {t('Decode ABI')}
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-2 border-gray-200">
                <CardHeader>
                  <CardTitle className="text-lg sm:text-xl flex items-center justify-between">
                    {t('Decoded Analysis')}
                    {decodedOutput && (
                      <Button size="sm" variant="outline" onClick={copyOutput}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    )}
                  </CardTitle>
                  <CardDescription>{t('Selectors, event topics and decoded arguments')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={decodedOutput}
                    readOnly
                    rows={12}
                    className="font-mono text-sm"
                    placeholder={t('Decoded ABI analysis will appear here...')}
                  />
                </CardContent>
              </Card>
            </div>
            
          </div>
        </div>
      </div>
    </>
  );
};

export default SmartContractAbiDecoder;
