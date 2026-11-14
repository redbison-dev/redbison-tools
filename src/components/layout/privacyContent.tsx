import React from 'react';
import { Link } from 'react-router-dom';
import { bundledLibraries } from '@/thirdParty';

/**
 * The privacy disclosures, written once and shown in two places: the footer
 * dialogs and the full /privacy page. Keeping them here means the popup and
 * the page can never say different things.
 *
 * NETWORK_TOOLS is the complete list of tools that contact anything. If you
 * add a tool that calls the network, add it here (CONTRIBUTING.md requires
 * it, and src/test/network-calls.test.ts enforces it).
 */
export const NETWORK_TOOLS: { id: string; name: string; calls: string; when: string }[] = [
  {
    id: 'api-tester',
    name: 'API Tester',
    calls: "The URL you enter (that is the tool's job). The example placeholder points at jsonplaceholder.typicode.com.",
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

const P = ({ children }: { children: React.ReactNode }) => (
  <p className="text-sm leading-6 text-muted-foreground">{children}</p>
);

/** The privacy-only nature of the app: no backend, no tracking, no accounts. */
export const PrivacySection = () => (
  <div className="space-y-3">
    <P>
      <strong className="text-foreground">Nothing you type is uploaded.</strong> Every tool does its
      work client-side, in your browser. There is no backend, no account, no analytics and no
      telemetry of any kind: the analytics module in this codebase is a file of empty functions you
      can read.
    </P>
    <P>
      Nothing is logged, profiled or sold, because there is nowhere for it to go. The production
      build is a static site, so you can serve it from localhost, from your own server or from a
      machine with no internet access at all and every tool behaves identically.
    </P>
    <P>
      Because the source is open, none of this has to be taken on trust. Audit it, or run it where
      no network can reach.
    </P>
    <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
      <li>No cookies are set, by us or by anyone else.</li>
      <li>No third-party fonts, scripts, pixels or CDNs load at runtime.</li>
      <li>No sign-up, no email address, no identifiers of any kind.</li>
    </ul>
  </div>
);

/** What the app keeps in the browser, and nowhere else. */
export const LocalStorageSection = () => (
  <div className="space-y-3">
    <P>
      A few conveniences are stored in your browser's <code>localStorage</code>, on your device
      only. It is never transmitted anywhere, it is not readable by other websites, and clearing
      your browser's site data removes it completely:
    </P>
    <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
      <li>
        <strong className="text-foreground">Bookmarks</strong>: the tools you bookmark with the
        header's bookmark button (key <code>redbison-tools.bookmarks</code>).
      </li>
      <li>
        <strong className="text-foreground">Per-tool preferences</strong>: a handful of tools
        remember settings such as your last-used options so they open the way you left them.
      </li>
    </ul>
    <P>
      Some tools also keep your current input in the page URL, so you can share a link to a
      calculation. That never leaves the browser unless you share the link yourself.
    </P>
  </div>
);

/** Third-party code bundled in, and third-party services any tool contacts. */
export const ThirdPartySection = () => (
  <div className="space-y-4">
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Services tools can contact</h3>
      <P>
        {NETWORK_TOOLS.length} of the 100 tools make network requests, because their job inherently
        needs one. Each names the service in its own interface, and nothing is sent until you act.{' '}
        <strong className="text-foreground">No other tool makes any network request.</strong>
      </P>
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
      <P>
        A few reference tools (HTTP status codes, MIME types, Ethereum decoders) contain plain links
        to documentation sites such as iana.org or etherscan.io. Following a link is your choice and
        sends nothing from the tool itself.
      </P>
    </div>

    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Open-source libraries in the bundle</h3>
      <P>
        These {bundledLibraries.length} libraries are compiled into the app at build time and run in
        your browser like the rest of the code. None is fetched from a CDN at runtime and none
        contacts a server. Versions are pinned in <code>package.json</code>, so you can audit or
        rebuild exactly what you are running.
      </P>
      <ul className="grid max-h-56 grid-cols-1 gap-x-6 gap-y-1 overflow-y-auto rounded-lg border border-border p-3 text-xs sm:grid-cols-2">
        {bundledLibraries.map((lib) => (
          <li key={lib.name} className="text-muted-foreground">
            <code className="text-foreground">{lib.name}</code> <span className="opacity-70">{lib.version}</span>
            {lib.purpose ? ` — ${lib.purpose}` : ''}
          </li>
        ))}
      </ul>
    </div>
  </div>
);

export const PRIVACY_SECTIONS = {
  privacy: { title: 'Privacy', description: 'What this app does and does not do with your data.', Body: PrivacySection },
  'local-storage': { title: 'Local storage', description: 'What is kept in this browser, and nowhere else.', Body: LocalStorageSection },
  'third-party': { title: 'Third-party services and libraries', description: 'Everything this app contacts or bundles.', Body: ThirdPartySection },
} as const;

export type PrivacySectionKey = keyof typeof PRIVACY_SECTIONS;
