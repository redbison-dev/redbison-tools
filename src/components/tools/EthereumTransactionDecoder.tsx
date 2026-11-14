
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Copy, Search, Maximize, Minimize } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useToolAnalytics } from '@/hooks/useToolAnalytics';
import { useIsMobile } from '@/hooks/use-mobile';
import ToolBreadcrumb from '@/components/ui/ToolBreadcrumb';
import { useNavigate } from 'react-router-dom';
import {
  decodeRawTransaction,
  formatTransactionReport,
  isTransactionHash,
  TxDecodeError,
} from '@/lib/tools/ethereum-transaction-decoder';
import { msg, useT } from '@/i18n';

/** hexToBytes (smart-contract-abi-decoder) errors, shown translated. */
const HEX_ERRORS: string[] = [msg('Hex data must have an even number of characters'), msg('Hex data contains non-hex characters')];

const EthereumTransactionDecoder = () => {
  const { t } = useT();
  const navigate = useNavigate();

  const handleToolSelect = (toolId: string) => {
    navigate(`/${toolId}`);
  };
  const [txHash, setTxHash] = useState('');
  const [decodedData, setDecodedData] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { toast } = useToast();
  const { trackAction } = useToolAnalytics();
  const isMobile = useIsMobile();

  const decodeTx = () => {
    const input = txHash.trim();
    if (!input) {
      toast({
        title: t('Error'),
        description: t('Please paste a raw signed transaction (hex)'),
        variant: "destructive"
      });
      return;
    }

    // A 32-byte hash only identifies a transaction; its contents live on chain.
    if (isTransactionHash(input)) {
      setDecodedData(
        t('This looks like a transaction hash, not a raw transaction.') + '\n\n' +
        t('A hash is the Keccak-256 of the signed transaction, so the fields cannot be recovered from it offline.') + ' ' +
        t('Look it up on an explorer instead:') + `\n- Etherscan: https://etherscan.io/tx/${input}\n\n` +
        t('To decode here, paste the raw signed transaction (it starts with 0x02, 0x01 or 0xf8 and is usually 100+ bytes).') + ' ' +
        t('Wallets show it as "raw transaction", and {method} returns it from a node.', { method: 'eth_getRawTransactionByHash' })
      );
      trackAction('decode_ethereum_tx_hash_only');
      return;
    }

    try {
      setDecodedData(formatTransactionReport(decodeRawTransaction(input), t));
      trackAction('decode_ethereum_tx');
    } catch (error) {
      setDecodedData('');
      toast({
        title: t('Error'),
        description: error instanceof TxDecodeError ? t(error.text, error.vars) : error instanceof Error ? (HEX_ERRORS.includes(error.message) ? t(error.message) : error.message) : t('Could not decode this transaction'),
        variant: "destructive"
      });
    }
  };

  const copyData = () => {
    navigator.clipboard.writeText(decodedData);
    toast({ title: t('Copied!'), description: t('Transaction data copied to clipboard') });
    trackAction('copy_tx_data');
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
              toolName="Ethereum Transaction Decoder"
            />
            
            <div className="tool-header mt-6">
              <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                  <h1 className="tool-title text-black text-2xl sm:text-3xl lg:text-4xl font-bold flex items-center">
                    <Search className="h-8 w-8 sm:h-10 sm:w-10 mr-3 text-blue-600" />
                    {t('Ethereum Transaction Decoder')}
                  </h1>
                  <p className="tool-description text-gray-600 text-sm sm:text-base ml-11 sm:ml-13">{t('Decode raw signed Ethereum transactions (legacy and typed) offline')}</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <Badge variant="outline" className="border-blue-500 text-blue-600 px-3 py-1 bg-blue-50 text-xs sm:text-sm">{t('Ethereum')}</Badge>
                  <Badge variant="outline" className="border-green-500 text-green-600 px-3 py-1 bg-green-50 text-xs sm:text-sm">{t('Transaction')}</Badge>
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

            <div className="mt-6 sm:mt-8 space-y-4 sm:space-y-6">
              <Card className="border-2 border-gray-200">
                <CardHeader>
                  <CardTitle className="text-lg sm:text-xl">{t('Raw Transaction')}</CardTitle>
                  <CardDescription>{t('Paste a raw signed transaction in hex (0x02..., 0x01... or 0xf8...)')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Input
                    placeholder="0x02f87001..."
                    value={txHash}
                    onChange={(e) => setTxHash(e.target.value)}
                    className="font-mono"
                  />
                  <Button onClick={decodeTx} className="w-full sm:w-auto">
                    <Search className="h-4 w-4 mr-2" />
                    {t('Decode Transaction')}
                  </Button>
                </CardContent>
              </Card>

              {decodedData && (
                <Card className="border-2 border-gray-200">
                  <CardHeader>
                    <CardTitle className="text-lg sm:text-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <span>{t('Transaction Details')}</span>
                      <Button size="sm" variant="outline" onClick={copyData}>
                        <Copy className="h-4 w-4 mr-1" />
                        {t('Copy')}
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="whitespace-pre-wrap text-sm bg-gray-50 p-4 rounded-lg overflow-x-auto">
                      {decodedData}
                    </pre>
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

export default EthereumTransactionDecoder;
