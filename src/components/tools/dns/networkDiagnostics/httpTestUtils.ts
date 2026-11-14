
import type { TFunction } from '@/i18n';
import { DiagnosticResult } from './types';

/** `t` translates the result text into the page's language (error messages from the browser stay as the browser gives them). */
export const performHttpTest = async (url: string, protocol: 'HTTP' | 'HTTPS', t: TFunction): Promise<DiagnosticResult> => {
  const startTime = Date.now();
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      mode: 'no-cors',
      signal: AbortSignal.timeout(10000)
    });
    const duration = Date.now() - startTime;

    const details = [
      t('Response time: {duration}ms', { duration }),
      t('Protocol: {protocol}', { protocol }),
      t('Connection: Successful'),
      t('Status: Network accessible')
    ];

    return {
      kind: 'http',
      test: t('{protocol} Connectivity', { protocol }),
      status: 'success',
      message: t('{protocol} connection successful ({duration}ms)', { protocol, duration }),
      duration,
      details
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const details = [
      t('Response time: {duration}ms', { duration }),
      t('Protocol: {protocol}', { protocol }),
      t('Error: {error}', { error: error instanceof Error ? error.message : t('Connection failed') }),
      t('Connection: Failed')
    ];

    return {
      kind: 'http',
      test: t('{protocol} Connectivity', { protocol }),
      status: 'error',
      message: t('{protocol} connection failed - {error}', { protocol, error: error instanceof Error ? error.message : t('Unknown error') }),
      duration,
      details
    };
  }
};
