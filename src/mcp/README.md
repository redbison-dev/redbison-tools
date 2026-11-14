# MCP server

This folder is a local [MCP](https://modelcontextprotocol.io) (Model Context Protocol)
server that exposes a curated set of this repo's tools to AI assistants — Claude Code,
Claude Desktop, Cursor, VS Code, Codex CLI, Gemini CLI or any other MCP client.

It speaks newline-delimited JSON-RPC over **stdio** with no SDK dependency, makes no
network calls, and sends no telemetry: every tool call runs the same pure functions from
`src/lib/tools` that the web pages use, entirely on your machine.

- `tools.ts` — the registry: each tool's description, JSON schema, `run()` and a tested example
- `server.ts` — the stdio transport (initialize, tools/list, tools/call, ping)

## Run it locally

```sh
bun run mcp                      # from the repo root
# or without bun:
npx tsx src/mcp/server.ts
```

The server reads JSON-RPC from stdin and answers on stdout — your MCP client starts and
manages it for you once registered:

**Claude Code**

```sh
claude mcp add redbison-tools -- bun run /path/to/redbison-tools/src/mcp/server.ts
```

**Claude Desktop** (`claude_desktop_config.json`), **Cursor** (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "redbison-tools": {
      "command": "bun",
      "args": ["run", "/path/to/redbison-tools/src/mcp/server.ts"]
    }
  }
}
```

**VS Code** (`.vscode/mcp.json`) uses a `"servers"` object and requires `"type": "stdio"`
on the entry. Setup walkthroughs for every client, including Codex CLI and Gemini CLI, are
in our guide: [How to Set Up MCP Servers in Claude, Cursor, VS Code, Codex and Gemini CLI](https://redbison.dev/blog/how-to-set-up-mcp-servers-in-ai-clients).

Want to build your own server like this one from scratch? See
[How to Build an MCP Server in TypeScript or Python](https://redbison.dev/blog/how-to-build-an-mcp-server).

## Or use our hosted MCP server

If you'd rather skip running anything, use RedBison's hosted server — the same tools plus
many more (90+ tools, including every calculator via `run_calculator`), served over
streamable HTTP:

- **Endpoint:** `https://mcp.redbison.dev`
- **Docs and live tool list:** [redbison.dev/mcp](https://redbison.dev/mcp) · [redbison.dev/ai](https://redbison.dev/ai)

```sh
claude mcp add --transport http redbison https://mcp.redbison.dev
```

```json
{ "mcpServers": { "redbison": { "url": "https://mcp.redbison.dev" } } }
```

No key or sign-up; please use it kindly.

## Tools in this repo's server

Arguments marked * are required. Every example below is executed by the test suite
(`src/test/mcp.test.ts`), so this table cannot silently drift from the code.

### `case_convert`
Convert text into every common case format at once: camelCase, snake_case, kebab-case,
PascalCase, CONSTANT_CASE, Title Case and more.
- `text`* — the text to convert
- Example: `{"text": "hello world example"}`

### `regex_test`
Test a JavaScript regular expression against text; returns matches with positions and
capture groups.
- `text`* — the text to search; `pattern`* — the regex, without slashes; `flags` — e.g. `gi` (default `g`)
- Example: `{"text": "cat bat hat", "pattern": "([bh])at", "flags": "g"}`

### `hash_text`
Hash UTF-8 text and return the hex digest.
- `text`*; `algorithm` — one of `MD5`, `SHA-1`, `SHA-256` (default), `SHA-512`, `SHA3-256`
- Example: `{"text": "hello", "algorithm": "SHA-256"}`

### `json_format`
Validate and pretty-print JSON; a parse error comes back with its position.
- `json`*; `indent` — spaces (default 2)
- Example: `{"json": "{\"b\":1,\"a\":[1,2]}"}`

### `json_to_yaml`
Convert a JSON document to YAML.
- `json`*
- Example: `{"json": "{\"name\":\"demo\",\"items\":[1,2]}"}`

### `yaml_to_json`
Convert a YAML document to JSON.
- `yaml`*
- Example: `{"yaml": "name: demo\nitems:\n  - 1\n  - 2\n"}`

### `csv_to_json`
Parse CSV text (first row = headers) into an array of JSON records.
- `csv`*
- Example: `{"csv": "name,qty\nbolt,4\nnut,9"}`

### `base64_convert`
Base64-encode or -decode UTF-8 text.
- `mode`* — `encode` or `decode`; `text`*
- Example: `{"mode": "encode", "text": "hello"}`

### `binary_text_convert`
Convert text to binary or hex byte strings (UTF-8), or binary back to text.
- `mode`* — `to-binary`, `to-hex` or `from-binary`; `text`*
- Example: `{"mode": "to-binary", "text": "Hi"}`

### `epoch_convert`
Convert a Unix timestamp to ISO 8601 UTC; seconds / milliseconds / microseconds /
nanoseconds are auto-detected.
- `value`*
- Example: `{"value": "1700000000"}` → `2023-11-14T22:13:20.000Z`

### `jwt_decode`
Decode a JWT **without verifying it**: returns header and payload. Never paste
production secrets into any tool.
- `token`*
- Example: the standard jwt.io demo token

### `cron_describe`
Explain a cron expression in plain English.
- `expression`*
- Example: `{"expression": "*/15 9-17 * * 1-5"}` → "Every 15 minutes, between 09:00 AM and 05:59 PM, Monday through Friday"

### `number_base_convert`
Convert an integer between bases 2–36 with exact arbitrary-precision arithmetic.
- `value`*; `fromBase`*; `toBase`* (each 2–36)
- Example: `{"value": "ff", "fromBase": 16, "toBase": 2}` → `11111111`

### `markdown_to_html`
Convert Markdown (CommonMark + GitHub tables, strikethrough, task lists) to HTML.
- `markdown`*
- Example: `{"markdown": "# Hi\n\n- one\n- two"}`

## Adding a tool

One entry in `tools.ts`: a description, a JSON schema, a `run()` that calls a function
from `src/lib/tools`, and an `example` the test suite executes. Document it in this file —
the tests fail if a registered tool is missing from this README.
