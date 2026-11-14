// @vitest-environment jsdom
/**
 * Integration: mount every tool route through the real router and assert the
 * page renders a level-1 heading (each tool owns exactly one <h1>). Catches
 * broken imports, crashed components and route/catalog drift in one sweep.
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '@/App';
import { catalog } from '@/catalog';

describe('every tool page renders', () => {
  for (const tool of catalog) {
    it(`/${tool.id} mounts with an h1`, async () => {
      const { unmount } = render(
        <MemoryRouter initialEntries={[`/${tool.id}`]}>
          <AppRoutes />
        </MemoryRouter>,
      );
      try {
        await waitFor(() => {
          expect(screen.getAllByRole('heading', { level: 1 }).length).toBeGreaterThan(0);
        }, { timeout: 15000 });
      } finally {
        unmount();
      }
    });
  }

  it('the home page lists every tool', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    );
    for (const tool of catalog) {
      expect(screen.getAllByText(tool.name).length, tool.id).toBeGreaterThan(0);
    }
  });
});
