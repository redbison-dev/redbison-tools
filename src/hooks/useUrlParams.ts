import { useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/** Query string for `params`, skipping empty values and zeros (same rules the tools have always used). */
export const buildSearch = (params: Record<string, string | number>): string => {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '' && value !== 0) {
      searchParams.set(key, String(value));
    }
  });
  const query = searchParams.toString();
  return query ? `?${query}` : '';
};

/**
 * Read and replace the current URL's query string.
 *
 * The returned functions keep the same identity across renders and skip
 * navigation when the URL would not change. Components list
 * `updateUrlParams` in effect dependencies, and a fresh function (or a
 * no-op navigation) each render used to loop forever.
 */
export const useUrlParams = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const locationRef = useRef(location);
  locationRef.current = location;

  const getUrlParams = useCallback(() => new URLSearchParams(locationRef.current.search), []);

  const updateUrlParams = useCallback(
    (params: Record<string, string | number>) => {
      const { pathname, search } = locationRef.current;
      const nextSearch = buildSearch(params);
      if (nextSearch === search) return;
      navigate(`${pathname}${nextSearch}`, { replace: true });
    },
    [navigate],
  );

  const clearUrlParams = useCallback(() => {
    const { pathname, search } = locationRef.current;
    if (!search) return;
    navigate(pathname, { replace: true });
  }, [navigate]);

  return { getUrlParams, updateUrlParams, clearUrlParams };
};
