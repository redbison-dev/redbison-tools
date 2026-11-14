### What this changes

<!-- One or two sentences. Link the issue if there is one. -->

### External calls

<!--
REQUIRED. Pick one:

- "None. This change makes no new network requests."
- or list every domain this change causes the app (or the MCP server) to contact:

  | Domain | What is sent | What comes back | Triggered by |
  |---|---|---|---|
  | api.example.com | the IP the user typed | geolocation JSON | pressing "Look up" |

  and confirm:
  - [ ] added to `NETWORK_TOOLS` in `src/pages/Privacy.tsx`
  - [ ] named in the tool's own UI before the user acts
  - [ ] nothing is sent on page load, only on an explicit action
  - [ ] (MCP tools only) declared in `src/mcp/README.md`

See "Calls to external domains and APIs" in CONTRIBUTING.md.
-->

### Checks

- [ ] `bun run typecheck` passes
- [ ] `bun run test` passes (new logic has unit tests; fixes have a regression test)
- [ ] Docs updated if behavior changed (README / ARCHITECTURE / privacy page / MCP README)
