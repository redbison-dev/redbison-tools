
import type { TFunction } from '@/i18n';
import { DiagnosticResult } from './types';

/** `t` translates the result text into the page's language. */
export const performPingTest = async (domain: string, t: TFunction): Promise<DiagnosticResult> => {
  const results: string[] = [];
  const times: number[] = [];
  let totalTime = 0;
  let successCount = 0;

  // Perform multiple "ping" tests
  for (let i = 0; i < 3; i++) {
    const startTime = Date.now();
    try {
      await fetch(`https://${domain}`, {
        method: 'HEAD',
        mode: 'no-cors',
        signal: AbortSignal.timeout(3000)
      });
      const duration = Date.now() - startTime;
      results.push(t('Request {n}: {duration}ms', { n: i + 1, duration }));
      times.push(duration);
      totalTime += duration;
      successCount++;
    } catch (error) {
      results.push(t('Request {n}: Failed', { n: i + 1 }));
    }
  }

  const avgTime = successCount > 0 ? Math.round(totalTime / successCount) : 0;
  const test = t('HTTPS Round-Trip Timing (not ICMP ping)');

  if (successCount > 0) {
    return {
      kind: 'ping',
      test,
      status: 'success',
      message: t('Average HTTPS response time: {avg}ms ({count}/3 successful)', { avg: avgTime, count: successCount }),
      details: [
        t('Successful requests: {count}/3', { count: successCount }),
        t('Average time: {avg}ms', { avg: avgTime }),
        t('Best time: {best}ms', { best: Math.min(...times) }),
        ...results
      ]
    };
  } else {
    return {
      kind: 'ping',
      test,
      status: 'error',
      message: t('All HTTPS timing requests failed'),
      details: results
    };
  }
};
