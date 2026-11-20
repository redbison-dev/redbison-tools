/**
 * Running a tool: locally when we can, over the network when we must.
 *
 * The split is the same one the editors make, and for the same reason. 65 of
 * the 100 are arithmetic and string work that belongs on your machine; the
 * rest need a parser or a data set that changes without us. What is different
 * here is that a terminal is where people pipe secrets around, so --offline
 * is a real flag: it refuses rather than sending, and says which tool wanted
 * the network.
 */
import { runLocal, LocalToolError } from '../../ide/vscode/src/local';
import { byId, type CliTool } from './catalog';
import { missingRequired } from './args';

export class RunError extends Error {}

const ENDPOINT = process.env.REDBISON_MCP_URL ?? 'https://mcp.redbison.dev';

/** Input larger than this is refused before it is sent anywhere. */
const MAX_REMOTE_BYTES = 1_000_000;

export type RunOptions = {
  offline?: boolean;
  timeoutMs?: number;
};

export async function runTool(
  toolId: string,
  input: string,
  options: Record<string, string | number | boolean>,
  run: RunOptions = {},
): Promise<string> {
  const tool = byId(toolId);
  if (!tool) throw new RunError(`No tool called ${toolId}. Try: redbison --list`);

  const missing = missingRequired(toolId, options);
  if (missing.length) {
    const names = missing.map((o) => `--${o.key} (${o.describe})`).join(', ');
    throw new RunError(`${toolId} needs ${names}.`);
  }

  if (tool.offline) {
    try {
      const out = runLocal(toolId, input, options);
      if (out === undefined) {
        // The catalog says local but no implementation answered. A bug on our
        // side, so say so plainly rather than silently reaching out.
        throw new RunError(`${toolId} is marked as local but has no implementation. Please report this.`);
      }
      return out;
    } catch (e) {
      if (e instanceof LocalToolError) throw new RunError(e.message);
      throw e;
    }
  }

  if (run.offline) {
    throw new RunError(
      `${toolId} runs on the server, and --offline was given, so nothing was sent.\n` +
        `Tools that work without a network: redbison --list | grep local`,
    );
  }

  return callServer(tool, input, options, run.timeoutMs ?? 20_000);
}

async function callServer(
  tool: CliTool,
  input: string,
  options: Record<string, string | number | boolean>,
  timeoutMs: number,
): Promise<string> {
  if (!tool.mcp) throw new RunError(`${tool.id} has no server tool.`);

  /*
   * Everything that goes over the wire counts, not only the input.
   *
   * Some options carry a second body of text, and --b accepts a file, so
   * `text-diff --b @huge.txt small` would have posted megabytes while the
   * guard looked at the word "small".
   */
  const bytes =
    Buffer.byteLength(input, 'utf8') +
    Object.values(options).reduce<number>(
      (n, v) => n + (typeof v === 'string' ? Buffer.byteLength(v, 'utf8') : 0),
      0,
    );
  if (bytes > MAX_REMOTE_BYTES) {
    throw new RunError(
      `That is ${(bytes / 1e6).toFixed(1)}MB, and ${tool.id} would have to send it to redbison.dev. ` +
        `The limit is 1MB.`,
    );
  }

  const args: Record<string, unknown> = { ...(tool.mcp.args ?? {}), ...options };
  if (tool.mcp.input) args[tool.mcp.input] = input;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let text: string;
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // The endpoint frames its replies as server-sent events, so it needs
        // both types offered or it answers 406.
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: tool.mcp.name, arguments: args },
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new RunError(`redbison.dev answered ${res.status} for ${tool.id}.`);
    text = await res.text();
  } catch (e) {
    if (e instanceof RunError) throw e;
    if ((e as Error).name === 'AbortError') {
      throw new RunError(`${tool.id} timed out after ${timeoutMs / 1000}s.`);
    }
    throw new RunError(`Could not reach redbison.dev: ${(e as Error).message}`);
  } finally {
    clearTimeout(timer);
  }

  return unwrap(text, tool.id);
}

/** Pull the answer out of an SSE-framed JSON-RPC reply. */
function unwrap(body: string, toolId: string): string {
  const line = body.split('\n').find((l) => l.startsWith('data: '));
  const payload = line ? line.slice(6) : body;

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new RunError(`Could not read the reply for ${toolId}.`);
  }

  const result = (parsed as { result?: { content?: { type: string; text?: string }[] }; error?: { message?: string } });
  if (result.error) throw new RunError(result.error.message ?? `${toolId} failed.`);

  const first = result.result?.content?.find((c) => c.type === 'text');
  if (!first?.text) throw new RunError(`${toolId} returned nothing.`);

  // Tools report their own failures inside a text block rather than as a
  // JSON-RPC error, so an error shape here is still an error.
  try {
    const inner = JSON.parse(first.text) as { error?: { message?: string } };
    if (inner?.error?.message) throw new RunError(`${toolId}: ${inner.error.message}`);
  } catch (e) {
    if (e instanceof RunError) throw e;
    // Not JSON, which is the normal case.
  }

  return first.text;
}
