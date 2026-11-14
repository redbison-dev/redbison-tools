import React, { useEffect } from 'react';
import OssHeader from '@/components/layout/OssHeader';
import OssFooter from '@/components/layout/OssFooter';
import { LocalStorageSection, PrivacySection, ThirdPartySection } from '@/components/layout/privacyContent';

/**
 * The full privacy page: the same disclosures the footer shows in dialogs,
 * at a shareable URL. The content lives in privacyContent.tsx so the two
 * can never disagree.
 */
const Privacy = () => {
  useEffect(() => {
    document.title = 'Privacy, local storage and third-party calls — RedBison Tools';
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <OssHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 md:px-8">
        <h1 className="mb-2 text-3xl font-bold text-foreground">Privacy, local storage and third-party calls</h1>
        <p className="mb-8 text-muted-foreground">
          Short version: your data stays on your device. This page states exactly what that means,
          what is kept in your browser, and everything this app contacts or bundles.
        </p>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-bold text-foreground">A privacy-only tool set</h2>
          <PrivacySection />
        </section>

        <section id="local-storage" className="mb-8 scroll-mt-20">
          <h2 className="mb-3 text-xl font-bold text-foreground">What we keep in local storage</h2>
          <LocalStorageSection />
        </section>

        <section id="third-party" className="mb-8 scroll-mt-20">
          <h2 className="mb-3 text-xl font-bold text-foreground">Third-party services and libraries</h2>
          <ThirdPartySection />
        </section>

        <section className="mb-8">
          <h2 className="mb-2 text-xl font-bold text-foreground">The MCP server</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            The bundled MCP server for AI assistants runs locally over stdio. It makes no network
            calls and sends no telemetry; your assistant talks to a process on your own machine.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-xl font-bold text-foreground">Questions or doubts</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            The source is the authority, not this page. If you find any behavior that contradicts
            what is written here, please{' '}
            <a
              href="https://github.com/redbison-dev/redbison-tools/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline underline-offset-2"
            >
              open an issue
            </a>
            : that would be the most important bug report we receive.
          </p>
        </section>
      </main>
      <OssFooter />
    </div>
  );
};

export default Privacy;
