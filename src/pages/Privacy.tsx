import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import OssHeader from '@/components/layout/OssHeader';
import OssFooter from '@/components/layout/OssFooter';

/**
 * The privacy model, stated precisely: what runs locally, what we keep in
 * localStorage, and the complete list of tools that make network requests.
 * This page is hand-maintained; if you add a tool that calls the network,
 * list it here (CONTRIBUTING.md asks the same).
 */
const NETWORK_TOOLS: { id: string; name: string; calls: string; when: string }[] = [
  {
    id: 'api-tester',
    name: 'API Tester',
    calls: 'The URL you enter (that is the tool\'s job). The example placeholder points at jsonplaceholder.typicode.com.',
    when: 'Only when you press Send.',
  },
  {
    id: 'graphql-playground',
    name: 'GraphQL Playground',
    calls: 'The GraphQL endpoint you enter.',
    when: 'Only when you run a query.',
  },
  {
    id: 'ip-address',
    name: 'IP Address Info',
    calls: 'api.ipify.org, api64.ipify.org and ipapi.co, to learn your public IP and its details.',
    when: 'When you ask for your public IP.',
  },
  {
    id: 'network-tools',
    name: 'Network Tools',
    calls: 'api.ipify.org, api64.ipify.org and ipapi.co, for the public-IP panel.',
    when: 'When you use the public-IP panel.',
  },
  {
    id: 'ip-address-lookup',
    name: 'IP Address Lookup',
    calls: 'ipinfo.io, to look up the IP you enter. Result locations link out to Google Maps.',
    when: 'When you look up an IP.',
  },
];

const Privacy = () => {
  useEffect(() => {
    document.title = 'Privacy & third-party calls — RedBison Tools';
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <OssHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 md:px-8">
        <h1 className="mb-2 text-3xl font-bold text-foreground">Privacy &amp; third-party calls</h1>
        <p className="mb-8 text-muted-foreground">
          Short version: your data stays on your device. This page states exactly what that means,
          and lists the only tools that touch the network at all.
        </p>

        <section className="mb-8">
          <h2 className="mb-2 text-xl font-bold text-foreground">How the tools work</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Every tool does its work client-side, in your browser. There is no backend, no account,
            no analytics and no telemetry of any kind — the analytics module in this codebase is a
            file of empty functions you can read. The production build is a static site; serve it
            from localhost or your own server and it behaves identically. Because the source is
            open, none of this has to be taken on trust: audit it, or run it where no network
            can reach.
          </p>
        </section>

        <section id="local-storage" className="mb-8 scroll-mt-20">
          <h2 className="mb-2 text-xl font-bold text-foreground">What we keep in local storage</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            A few conveniences are stored in your browser's <code>localStorage</code>, on your
            device only. It is never transmitted anywhere, it is not readable by other websites,
            and clearing your browser's site data removes it completely:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-6 text-sm text-muted-foreground">
            <li>
              <strong className="text-foreground">Bookmarks</strong> — the tools you bookmark with
              the header's bookmark button (key <code>redbison-tools.bookmarks</code>).
            </li>
            <li>
              <strong className="text-foreground">Per-tool preferences</strong> — a handful of
              tools remember settings such as your last-used options so they open the way you
              left them.
            </li>
          </ul>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Some tools also keep your current input in the page URL (so you can share a link to a
            calculation); that never leaves the browser unless you share the link yourself.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-2 text-xl font-bold text-foreground">The complete list of network calls</h2>
          <p className="mb-3 text-sm leading-6 text-muted-foreground">
            {NETWORK_TOOLS.length} of the 100 tools make network requests, because their job
            inherently needs one. Each names the service in its own UI, and nothing is sent until
            you act. <strong className="text-foreground">No other tool makes any network request.</strong>
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="py-2 pr-4 font-semibold">Tool</th>
                  <th className="py-2 pr-4 font-semibold">Calls</th>
                  <th className="py-2 font-semibold">When</th>
                </tr>
              </thead>
              <tbody>
                {NETWORK_TOOLS.map((t) => (
                  <tr key={t.id} className="border-b border-border/60 align-top">
                    <td className="py-2 pr-4">
                      <Link to={`/${t.id}`} className="font-medium text-foreground underline-offset-2 hover:underline">
                        {t.name}
                      </Link>
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">{t.calls}</td>
                    <td className="py-2 text-muted-foreground">{t.when}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            A few reference tools (HTTP status codes, MIME types, Ethereum decoders) contain
            plain links to documentation sites such as iana.org or etherscan.io — following a
            link is your choice and sends nothing from the tool itself.
          </p>
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
            {' '}— that would be the most important bug report we receive.
          </p>
        </section>
      </main>
      <OssFooter />
    </div>
  );
};

export default Privacy;
