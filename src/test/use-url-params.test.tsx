// @vitest-environment jsdom
import React, { useEffect } from 'react';
import { describe, it, expect } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { buildSearch, useUrlParams } from '@/hooks/useUrlParams';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('buildSearch', () => {
  it('drops empty values and zeros, keeps order', () => {
    expect(buildSearch({ principal: 1000, rate: 0, note: '', time: 2 })).toBe('?principal=1000&time=2');
    expect(buildSearch({ rate: 0 })).toBe('');
  });
});

describe('useUrlParams', () => {
  it('does not loop when updateUrlParams is an effect dependency', async () => {
    let renders = 0;
    let search = '';
    const Probe = () => {
      renders++;
      const { updateUrlParams } = useUrlParams();
      search = useLocation().search;
      // The pattern SimpleInterestCalculator uses.
      useEffect(() => {
        updateUrlParams({ principal: 10000, rate: 5, time: 1 });
      }, [updateUrlParams]);
      return null;
    };
    const el = document.createElement('div');
    const root = createRoot(el);
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/simple-interest-calculator']}>
          <Probe />
        </MemoryRouter>,
      );
    });
    expect(search).toBe('?principal=10000&rate=5&time=1');
    expect(renders).toBeLessThan(6);
    act(() => root.unmount());
  });
});
