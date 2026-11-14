/** Open-source build: no analytics. Same API as the main repo, no-op. */
import { useCallback } from 'react';

export const useToolAnalytics = () => {
  const trackAction = useCallback((_action: string, _parameters?: any) => {}, []);
  const forceFlush = useCallback(() => {}, []);
  return { trackAction, forceFlush };
};
