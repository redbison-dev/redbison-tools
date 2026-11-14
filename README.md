# RedBison Tools

[![CI](https://github.com/redbison-dev/redbison-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/redbison-dev/redbison-tools/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/redbison-dev/redbison-tools/branch/main/graph/badge.svg)](https://codecov.io/gh/redbison-dev/redbison-tools)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**100 free developer tools that run entirely in your browser** — JSON, regex, hashing,
encoders, SQL, GraphQL, network utilities and more. This is the open-source core of
[redbison.dev](https://redbison.dev).

## What this repo is

The top 100 developer tools from redbison.dev as a standalone React app: the tool
components, their logic and their tests, with a minimal home page that lists everything.
No analytics, no accounts, no ads — every tool does its work client-side, so nothing you
type ever leaves your machine.

The hosted version at **[redbison.dev](https://redbison.dev)** (also reachable via
redbison.tools) carries these same tools plus 500+ more calculators and converters,
guides, multi-language versions and an [MCP server for AI assistants](https://redbison.dev/mcp).

## Tools included

Text processing, diff and list comparison, code formatters (SQL, HTML, CSS, JS, XML,
YAML), data conversion (JSON ⇄ YAML/CSV/TypeScript, Markdown ⇄ HTML, XML → JSON, TOML,
cURL → code), security (hashing, HMAC, AES, RSA/EC keys, JWT, TOTP, X.509, SAML,
passwords), SQL and database design tools, GraphQL tooling, an API tester, network
utilities (subnet calculator, DNS, IP tools), binary/data-format tools (hex editor,
protobuf, Avro, Parquet, compression), time tools, and web/devops helpers (cron
expressions, .gitignore, chmod, Docker compose). The full list is on the home page.

## Run it locally

```sh
# bun (recommended)
bun install
bun run dev

# or npm
npm install
npm run dev
```

Open http://localhost:5173. Production build: `bun run build` (output in `dist/`), then
`bun run preview` to serve it.

## Host it yourself

The build is a fully static site — host `dist/` anywhere: GitHub Pages, Netlify, Vercel,
Cloudflare Pages, an S3 bucket or any web server. One note: routes are client-side, so
configure your host to serve `index.html` for unknown paths (Netlify: a `/* /index.html 200`
redirect; GitHub Pages: a `404.html` copy of `index.html`).

## AI assistants (MCP)

The repo ships a local [MCP](https://modelcontextprotocol.io) server (`src/mcp/server.ts`,
no SDK, no network, no telemetry) that exposes a curated set of the tools — case
conversion, regex testing, hashing, JSON/YAML/CSV conversion, Base64, binary/hex, epoch,
JWT decoding, cron explanations, number bases, Markdown→HTML — to any MCP client over stdio:

```sh
bun run mcp        # or: npx tsx src/mcp/server.ts
```

Register it with Claude Code:

```sh
claude mcp add redbison-tools -- bun run /path/to/redbison-tools/src/mcp/server.ts
```

or in Claude Desktop's `claude_desktop_config.json`:

```json
{ "mcpServers": { "redbison-tools": { "command": "bun", "args": ["run", "/path/to/redbison-tools/src/mcp/server.ts"] } } }
```

Adding a tool to the server is one entry in `src/mcp/tools.ts` (description, JSON schema,
a `run()` that calls the same `src/lib/tools` function the page uses, and an example the
test suite executes). The hosted version at redbison.dev offers a larger remote MCP server
with 90+ tools at [redbison.dev/mcp](https://redbison.dev/mcp).

## Tests and coverage

```sh
bun run typecheck      # TypeScript
bun run test           # unit + integration (every tool page is mounted and must render)
bun run test:coverage  # coverage report (v8), also printed in CI on every PR
```

The suite is 2,000+ tests: unit tests covering the tool logic in `src/lib/tools`, and an
integration suite that mounts all 100 tool routes through the real router and fails if any
page stops rendering. Coverage currently sits at ~64% lines / ~62% statements, with floors
enforced in `vitest.config.ts` so it can only go up. CI runs all of this on every push and
pull request and uploads coverage to Codecov (badge above).

## Found a bug?

**Please [open an issue](https://github.com/redbison-dev/redbison-tools/issues).** Include
the tool, the input that misbehaved and what you expected — tool correctness reports are
treated as top priority. Security-sensitive reports: please use GitHub's private
vulnerability reporting instead of a public issue.

## Contributing

Contributions are welcome — fixes, new tools, tests, docs. See
[CONTRIBUTING.md](CONTRIBUTING.md) for the dev setup and contribution policy,
[ARCHITECTURE.md](ARCHITECTURE.md) for the code organization and tool categorization,
and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for conduct expectations. You are also free
to fork and host your own copy under the MIT license.

## License

[MIT](LICENSE). The RedBison name and logo identify the upstream project; if you publish
a substantially modified fork, please use your own name for it.
