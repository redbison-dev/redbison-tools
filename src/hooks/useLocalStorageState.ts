import { useEffect, useRef, useState } from 'react';
import { useUrlParams } from '@/hooks/useUrlParams';

interface FormState {
  [key: string]: string | number | boolean | string[] | any;
}

export const useLocalStorageState = <T extends FormState>(
  storageKey: string,
  initialState: T,
  debounceMs: number = 1000
) => {
  const { getUrlParams } = useUrlParams();
  const [state, setState] = useState<T>(initialState);
  const [isLoaded, setIsLoaded] = useState(false);
  // A shared link (?key=...) shows its data without replacing what this
  // browser has saved, until the person actually edits it.
  const skipNextSave = useRef(false);
  const pendingSave = useRef<ReturnType<typeof setTimeout>>();

  // Load initial state from URL params first, then localStorage
  useEffect(() => {
    const urlParams = getUrlParams();
    let newState = { ...initialState };
    let hasUrlChanges = false;

    // First check URL parameters
    Object.keys(initialState).forEach((key) => {
      const urlValue = urlParams.get(key);
      if (urlValue !== null) {
        const initialValue = initialState[key as keyof T];
        try {
          if (typeof initialValue === 'number') {
            const parsed = parseFloat(urlValue);
            if (!isNaN(parsed)) {
              (newState as any)[key] = parsed;
              hasUrlChanges = true;
            }
          } else if (typeof initialValue === 'boolean') {
            (newState as any)[key] = urlValue === 'true';
            hasUrlChanges = true;
          } else if (Array.isArray(initialValue)) {
            (newState as any)[key] = JSON.parse(urlValue);
            hasUrlChanges = true;
          } else if (typeof initialValue === 'object') {
            (newState as any)[key] = JSON.parse(urlValue);
            hasUrlChanges = true;
          } else {
            (newState as any)[key] = urlValue;
            hasUrlChanges = true;
          }
        } catch (e) {
          // If JSON parsing fails, treat as string
          (newState as any)[key] = urlValue;
          hasUrlChanges = true;
        }
      }
    });

    // If no URL params, try loading from localStorage
    if (!hasUrlChanges) {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          const parsedData = JSON.parse(saved);
          newState = { ...initialState, ...parsedData };
        }
      } catch (error) {
        console.warn(`Failed to load data from localStorage for key: ${storageKey}`, error);
      }
    }

    skipNextSave.current = hasUrlChanges;
    setState(newState);
    setIsLoaded(true);
  }, [storageKey]);

  // Save to localStorage (debounced). State is not mirrored into the URL:
  // that put whole boards in the address bar and let any link overwrite
  // saved work. Sharing goes through getShareableUrl().
  useEffect(() => {
    if (!isLoaded) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }

    const timeoutId = setTimeout(() => {
      pendingSave.current = undefined;
      try {
        localStorage.setItem(storageKey, JSON.stringify(state));
      } catch (error) {
        console.warn(`Failed to save data to localStorage for key: ${storageKey}`, error);
      }
    }, debounceMs);
    pendingSave.current = timeoutId;

    return () => clearTimeout(timeoutId);
  }, [state, isLoaded, debounceMs, storageKey]);

  const updateState = (updates: Partial<T>) => {
    setState(prev => ({ ...prev, ...updates }));
  };

  // Cancel a debounced save so it can't write the old state back after a clear.
  const cancelPendingSave = () => {
    if (pendingSave.current) clearTimeout(pendingSave.current);
    pendingSave.current = undefined;
  };

  const resetState = () => {
    cancelPendingSave();
    setState(initialState);
    // Clear from localStorage
    try {
      localStorage.removeItem(storageKey);
    } catch (error) {
      console.warn(`Failed to clear localStorage for key: ${storageKey}`, error);
    }
  };

  const getShareableUrl = () => {
    const urlParams = new URLSearchParams();
    Object.entries(state).forEach(([key, value]) => {
      const initialValue = initialState[key as keyof T];
      if (value !== initialValue && value !== '' && value !== 0 && value !== false) {
        if (Array.isArray(value) || typeof value === 'object') {
          urlParams.set(key, JSON.stringify(value));
        } else {
          urlParams.set(key, String(value));
        }
      }
    });
    
    const baseUrl = window.location.origin + window.location.pathname;
    return urlParams.toString() ? `${baseUrl}?${urlParams.toString()}` : baseUrl;
  };

  const clearStorage = () => {
    cancelPendingSave();
    try {
      localStorage.removeItem(storageKey);
    } catch (error) {
      console.warn(`Failed to clear localStorage for key: ${storageKey}`, error);
    }
  };

  return {
    state,
    updateState,
    resetState,
    getShareableUrl,
    clearStorage,
    isLoaded
  };
};