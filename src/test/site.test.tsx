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

describe('footer', () => {
  const footerHtml = () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    );
    return document.querySelector('footer')!;
  };

  it('offers the privacy, local-storage and third-party popups', () => {
    const footer = footerHtml();
    for (const label of ['Privacy', 'Local storage', 'Third-party services & libraries']) {
      const trigger = [...footer.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
      expect(trigger, `footer is missing the "${label}" popup trigger`).toBeTruthy();
      expect(trigger!.getAttribute('aria-haspopup')).toBe('dialog');
    }
  });

  it('carries the repo, hosted-version, tool-list, bug and fortune links', () => {
    const footer = footerHtml();
    const text = footer.textContent ?? '';
    for (const label of ['GitHub', 'Hosted version', 'Full tool list with source links', 'Report a bug', 'Buy me a coffee', 'Fortune cookie', 'Full privacy page']) {
      expect(text, `footer is missing "${label}"`).toContain(label);
    }
    expect(footer.querySelector('a[href$="TOOLS.md"]'), 'tool list link').toBeTruthy();
    expect(footer.querySelector('a[href="https://buymeacoffee.com/redbison.dev"]'), 'coffee link').toBeTruthy();
  });
});

describe('privacy disclosures', () => {
  it('state the privacy-only nature, local storage and third-party libraries', async () => {
    const { PrivacySection, LocalStorageSection, ThirdPartySection } = await import('@/components/layout/privacyContent');
    const { bundledLibraries } = await import('@/thirdParty');

    render(<PrivacySection />);
    expect(document.body.textContent).toContain('Nothing you type is uploaded');
    expect(document.body.textContent).toMatch(/no analytics and no\s+telemetry/);
    document.body.innerHTML = '';

    render(<LocalStorageSection />);
    expect(document.body.textContent).toContain('redbison-tools.bookmarks');
    document.body.innerHTML = '';

    render(
      <MemoryRouter>
        <ThirdPartySection />
      </MemoryRouter>,
    );
    expect(bundledLibraries.length).toBeGreaterThan(20);
    expect(document.body.textContent).toContain(bundledLibraries[0].name);
    expect(document.body.textContent).toContain('No other tool makes any network request');
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
