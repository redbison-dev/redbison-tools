# Contributing

Thanks for helping make these tools better. The bar is simple: every tool must be
correct, run entirely in the browser, and keep its tests green.
Start with [ARCHITECTURE.md](ARCHITECTURE.md) for the code map.

## Dev setup

```sh
bun install        # or npm install
bun run dev        # Vite dev server on http://localhost:5173
```

Before opening a PR:

```sh
bun run typecheck
bun run test
```

## Contribution policy

- **What's welcome:** bug fixes with a regression test, correctness improvements,
  new browser-only tools, test coverage, accessibility fixes, documentation.
- **What's declined:** anything requiring a backend or telemetry, ads or tracking,
  cosmetic churn without a user-visible benefit, drive-by dependency bumps, and
  tools that duplicate an existing one without being clearly better.
- **Process:** open an issue first for anything bigger than a small fix, so scope
  is agreed before you build. One concern per PR. Every PR must pass CI (typecheck,
  full test suite with coverage floors, build) and gets a maintainer review; small
  correct fixes merge fast, large rewrites get more scrutiny.
- **Licensing of contributions:** the project is MIT ([LICENSE](LICENSE)). By
  submitting a PR you agree your contribution is licensed under the same MIT terms
  (inbound = outbound). There is no CLA to sign. Only submit work you have the
  right to license — no copied proprietary code.
- **Attribution:** contributors appear in git history and GitHub's contributor
  graph. Accepted tool fixes are periodically synced to the hosted site at
  [redbison.dev](https://redbison.dev), so your fix helps both versions.
- **Conduct:** be respectful and assume good faith; see
  [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Maintainers may close issues or PRs
  that don't follow it.

## Ground rules for code

- **Correctness first.** Tools that calculate, convert or encode must use established,
  exact definitions (cite the source in a comment when it isn't obvious). A fix without
  a regression test will be asked to add one.
- **Browser-only.** No backends, no telemetry, no network calls except to public APIs a
  tool already documents in its UI.
- **One tool, one `<h1>`.** Each tool page owns exactly one level-1 heading — the
  integration suite enforces that every page mounts with one.
- **New tools** need: the component in `src/components/tools/`, pure logic in
  `src/lib/tools/` with unit tests, a row in `src/catalog.ts` and `src/toolRoutes.tsx`,
  and a passing integration run. See "Adding a tool" in ARCHITECTURE.md.

## Bugs

Open a [GitHub issue](https://github.com/redbison-dev/redbison-tools/issues) with the
tool name, the exact input, what you got and what you expected. For security-sensitive
findings use GitHub's private vulnerability reporting.

## Relationship to redbison.dev

This repo is the open-source core of [redbison.dev](https://redbison.dev); tool fixes
merged here are periodically synced with the hosted version, so your fix helps both.
