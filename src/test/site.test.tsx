// @vitest-environment jsdom
/** The site chrome: search, privacy page, and the footer-only upsells. */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '@/App';
import { searchCatalog } from '@/lib/searchCatalog';
import { JOKES, FORTUNES } from '@/components/layout/easterEggs';

describe('tool search', () => {
  it('finds tools by name, prefix first', () => {
    const results = searchCatalog('regex');
    expect(results[0].id).toBe('regex-tester');
  });

  it('finds tools by description and subcategory', () => {
    expect(searchCatalog('duplicate lines').map((t) => t.id)).toContain('remove-duplicate-lines');
    expect(searchCatalog('graphql').length).toBeGreaterThanOrEqual(5);
  });

  it('returns nothing for an empty query and caps results', () => {
    expect(searchCatalog('')).toEqual([]);
    expect(searchCatalog('a').length).toBeLessThanOrEqual(8);
  });
});

describe('privacy page', () => {
  it('renders with the local-storage section and the complete network-call list', () => {
    render(
      <MemoryRouter initialEntries={['/privacy']}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole('heading', { level: 1 })[0].textContent).toContain('Privacy');
    expect(document.getElementById('local-storage')).toBeTruthy();
    for (const name of ['API Tester', 'GraphQL Playground', 'IP Address Info', 'Network Tools', 'IP Address Lookup']) {
      expect(screen.getAllByText(name).length, name).toBeGreaterThan(0);
    }
  });
});

describe('home page chrome', () => {
  it('shows the title centered header and keeps repo links in the footer only', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole('heading', { level: 1 })[0].textContent).toBe('Safe, Browser-Only Online Developer Tools');
    const githubLinks = [...document.querySelectorAll('a[href*="github.com/redbison-dev"]')];
    expect(githubLinks.length).toBeGreaterThan(0);
    const header = document.querySelector('header')!;
    expect(header.querySelector('a[href*="github.com"]')).toBeNull();
    expect(header.querySelector('a[href="https://redbison.dev"]')).toBeNull();
    expect(header.querySelector('input[type="search"]')).toBeTruthy();
  });
});

describe('easter eggs', () => {
  it('jokes and fortunes are non-empty and reasonably sized', () => {
    expect(JOKES.length).toBeGreaterThanOrEqual(10);
    expect(FORTUNES.length).toBeGreaterThanOrEqual(10);
    for (const line of [...JOKES, ...FORTUNES]) expect(line.length).toBeGreaterThan(15);
  });
});
