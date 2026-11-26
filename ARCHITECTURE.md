# Code organization

A quick map of the repo for contributors: where things live, how tools are
categorized, and how a request becomes a rendered tool page.

## Top level

```
index.html              Vite entry; the only HTML file
vite.config.ts          build config (alias @ -> src)
vitest.config.ts        test config (node env by default; jsdom for UI suites)
tailwind.config.ts      design tokens (colors, radii) shared by every tool
.github/workflows/      CI: typecheck, tests + coverage, build, Codecov upload
public/                 static assets (logo, favicon)
src/                    everything else — see below
```

## src/

```
main.tsx                mounts <App/>; imports the global stylesheet
App.tsx                 router: "/" (home), "/:toolId" (tool page), 404
catalog.ts              GENERATED — one row per tool: id, name, desc, category, subcategory
toolRoutes.tsx          GENERATED — toolId -> React.lazy(component) map
index.css               Tailwind layers + the shared design tokens (CSS variables)

pages/
  Home.tsx              bare-minimal list of every tool, grouped by subcategory
  ToolPage.tsx          page frame: header, <Suspense>, the tool component, footer
  NotFound.tsx          404

components/
  layout/               OssHeader / OssFooter — the shared page chrome
  tools/                one file per tool component (PascalCase, e.g. RegexTester.tsx);
                        subfolders group families (converters/, devformat/, calculators/)
  ui/                   shadcn/ui primitives (Button, Card, Tabs, ...) used by every tool

lib/
  tools/                pure logic, one module per tool family (case-converter.ts,
                        unit-converter.ts, specialty-converters.ts, ...). No React in here —
                        this is what the unit tests exercise.
  utils.ts              cn() class-name helper

hooks/                  shared React hooks (use-toast, useCalculatorParams for
                        URL-synced inputs, useUrlParams, use-mobile, ...)
mcp/                    local MCP server for AI assistants: tools.ts (the registry —
                        description, JSON schema, run()) and server.ts (stdio JSON-RPC)
i18n/                   English-only msg()/t() layer (same API as the hosted site)
utils/                  no-op analytics stubs (see "Relationship to redbison.dev")

test/
  catalog.test.ts            catalog integrity (116 tools, unique ids, routes match)
  tools.integration.test.tsx mounts all 116 tool routes; every page must render an <h1>
  tools/                     unit tests for lib/tools logic
  setup.ts                   jsdom polyfills (matchMedia, ResizeObserver, clipboard)
```

## Tool categorization

Every tool has one row in `src/catalog.ts` with a `category` and `subcategory`;
the home page groups by subcategory. The 116 tools span:

| Subcategory | Examples |
|---|---|
| Text Processing | case converter, regex tester, duplicate-line tools |
| Diff Tools | text diff, list comparison |
| Code Formatters | SQL, HTML, CSS, JS, XML, YAML beautifiers |
| Data Conversion | JSON ⇄ YAML/CSV/TypeScript, Markdown ⇄ HTML, TOML, cURL → code |
| Security Tools | hashing, HMAC, AES, RSA/EC keys, JWT, TOTP, X.509, SAML, passwords |
| Database Tools | query builder, schema designer, ERD generator, index optimizer |
| API Tools | API tester, GraphQL playground and tooling |
| Network Tools | subnet calculator, DNS lookup, IP tools |
| Data Formats | hex editor, text encoding, protobuf, Avro, Parquet, compression |
| Blockchain Tools | number base, IEEE-754, Ethereum tx / ABI decoders |
| Time Tools | epoch converter, timezone converter |
| Web & DevOps | HTTP status codes, cron expressions, .gitignore, chmod, Docker compose |

## How a page renders

1. The router matches `/:toolId` and renders `pages/ToolPage.tsx`.
2. ToolPage looks the id up in `catalog.ts` (name, for `document.title`) and in
   `toolRoutes.tsx` (the lazy component); unknown ids render the 404.
3. The tool component renders inside `<Suspense>` between OssHeader and OssFooter.
   Each tool owns exactly one `<h1>` — the integration suite enforces this.
4. All work happens client-side. Tools must not call private backends; the few
   network tools use public APIs they name in their UI.

## Adding a tool

1. Pure logic in `src/lib/tools/<name>.ts` with unit tests in `src/test/tools/`.
2. Component in `src/components/tools/<Name>.tsx` (one `<h1>`, UI from `components/ui`).
3. A row in `src/catalog.ts` and an entry in `src/toolRoutes.tsx`.
4. `bun run typecheck && bun run test` — the integration suite picks the route up
   automatically from the catalog.

## Relationship to redbison.dev

This repo is generated from the redbison.dev source tree: tool components and
logic are byte-identical with the hosted site, while analytics are replaced
with no-op stubs (`src/utils/analytics.ts`, `src/hooks/useToolAnalytics.ts`)
and i18n with an English-only layer that keeps the same API. `catalog.ts` and
`toolRoutes.tsx` are written by the exporter — edit them normally in a PR here;
accepted changes are synced back upstream so both versions benefit.
