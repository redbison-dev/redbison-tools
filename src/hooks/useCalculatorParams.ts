/**
 * Open-source build: same URL-param-synced calculator state as the main repo,
 * without the hosted site's per-market default machinery.
 */
import { useEffect, useState } from 'react';
import { useUrlParams } from '@/hooks/useUrlParams';

interface CalculatorState {
  [key: string]: string | number | boolean;
}

/** Identity here; the hosted site swaps in market-specific defaults. */
export function withMarketDefaults<T extends CalculatorState>(base: T, _pathname: string): T {
  return base;
}

export const useCalculatorParams = <T extends CalculatorState>(
  componentDefaults: T,
  debounceMs: number = 1000
) => {
  const [initialState] = useState<T>(componentDefaults);
  const { getUrlParams, updateUrlParams } = useUrlParams();
  const [state, setState] = useState<T>(initialState);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load initial state from URL params on mount
  useEffect(() => {
    const urlParams = getUrlParams();
    const newState = { ...initialState };
    let hasChanges = false;

    Object.keys(initialState).forEach((key) => {
      const urlValue = urlParams.get(key);
      if (urlValue !== null) {
        const initialValue = initialState[key as keyof T];
        if (typeof initialValue === 'number') {
          const parsed = parseFloat(urlValue);
          if (!isNaN(parsed)) {
            (newState as any)[key] = parsed;
            hasChanges = true;
          }
        } else if (typeof initialValue === 'boolean') {
          (newState as any)[key] = urlValue === 'true';
          hasChanges = true;
        } else {
          (newState as any)[key] = urlValue;
          hasChanges = true;
        }
      }
    });

    if (hasChanges) {
      setState(newState);
    }
    setIsLoaded(true);
  }, []);

  // Debounced URL update
  useEffect(() => {
    if (!isLoaded) return;

    const timeoutId = setTimeout(() => {
      const urlParams: Record<string, string | number> = {};
      Object.entries(state).forEach(([key, value]) => {
        const initialValue = initialState[key as keyof T];
        if (value !== initialValue && value !== '' && value !== 0 && value !== false) {
          urlParams[key] = value as string | number;
        }
      });

      updateUrlParams(urlParams);
    }, debounceMs);

    return () => clearTimeout(timeoutId);
  }, [state, isLoaded, debounceMs]);

  const updateState = (updates: Partial<T>) => {
    setState(prev => ({ ...prev, ...updates }));
  };

  const resetState = () => {
    setState(initialState);
  };

  const getShareableUrl = () => {
    const urlParams = new URLSearchParams();
    Object.entries(state).forEach(([key, value]) => {
      const initialValue = initialState[key as keyof T];
      if (value !== initialValue && value !== '' && value !== 0 && value !== false) {
        urlParams.set(key, String(value));
      }
    });

    const baseUrl = window.location.origin + window.location.pathname;
    return urlParams.toString() ? `${baseUrl}?${urlParams.toString()}` : baseUrl;
  };

  return {
    state,
    updateState,
    resetState,
    getShareableUrl,
    isLoaded
  };
};
