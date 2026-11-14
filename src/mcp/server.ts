/**
 * A local MCP (Model Context Protocol) server exposing this repo's tools to
 * AI assistants over stdio — newline-delimited JSON-RPC 2.0, no SDK, no
 * network, no telemetry. Run it with:
 *
 *   bun run mcp              # or: npx tsx src/mcp/server.ts
 *
 * Register it with your assistant (see "AI assistants (MCP)" in README.md).
 */
import { createInterface } from 'node:readline';
import { TOOLS } from './tools';

type Rpc = { jsonrpc: '2.0'; id?: number | string | null; method?: string; params?: Record<string, unknown> };

const SERVER_INFO = { name: 'redbison-tools', version: '1.0.0' };

function send(message: Record<string, unknown>) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n');
}

function reply(id: Rpc['id'], result: unknown) {
  send({ id, result });
}

function replyError(id: Rpc['id'], code: number, message: string) {
  send({ id, error: { code, message } });
}

async function handle(msg: Rpc) {
  const { id, method, params } = msg;
  const isNotification = id === undefined;
  try {
    switch (method) {
      case 'initialize':
        return reply(id, {
          protocolVersion: (params?.protocolVersion as string) ?? '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
        });
      case 'ping':
        return reply(id, {});
      case 'tools/list':
        return reply(id, {
          tools: Object.entries(TOOLS).map(([name, t]) => ({
            name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        });
      case 'tools/call': {
        const name = String(params?.name ?? '');
        const tool = TOOLS[name];
        if (!tool) return replyError(id, -32602, `Unknown tool: ${name}`);
        try {
          const result = await tool.run((params?.arguments as Record<string, unknown>) ?? {});
          return reply(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
        } catch (e) {
          return reply(id, { content: [{ type: 'text', text: `Error: ${(e as Error).message}` }], isError: true });
        }
      }
      default:
        if (!isNotification) replyError(id, -32601, `Method not found: ${method}`);
    }
  } catch (e) {
    if (!isNotification) replyError(id, -32603, (e as Error).message);
  }
}

const rl = createInterface({ input: process.stdin, terminal: false });
rl.on('line', (line) => {
  const text = line.trim();
  if (!text) return;
  let msg: Rpc;
  try {
    msg = JSON.parse(text) as Rpc;
  } catch {
    return replyError(null, -32700, 'Parse error');
  }
  void handle(msg);
});
