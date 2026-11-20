/**
 * The MCP client.
 *
 * The public endpoint speaks JSON-RPC over HTTP and answers with a Server-Sent
 * Events frame rather than a plain body, and it rejects a request that does
 * not accept both content types — so the Accept header here is load-bearing,
 * not decoration.
 *
 * Everything the extension cannot answer offline comes through here, which is
 * the same implementation redbison.dev runs. That is the point: one behaviour
 * to maintain rather than a second copy of thirty tools per editor.
 */
const ENDPOINT = 'https://mcp.redbison.dev';
const TIMEOUT_MS = 15_000;

export class McpError extends Error {}

/** Pull the JSON payload out of an SSE frame, or parse a plain body. */
function readFrame(body: string): unknown {
  const line = body.split('\n').find((l) => l.startsWith('data:'));
  const json = line ? line.slice(5).trim() : body.trim();
  if (!json) throw new McpError('The server sent an empty response.');
  try {
    return JSON.parse(json);
  } catch {
    throw new McpError('The server sent a response this version cannot read.');
  }
}

type RpcReply = {
  error?: { message?: string };
  result?: { isError?: boolean; content?: { type: string; text?: string }[] };
};

export async function callTool(
  name: string,
  args: Record<string, unknown>,
  endpoint: string = ENDPOINT,
): Promise<string> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // Both, or the server answers 406 before it looks at the request.
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name, arguments: args },
      }),
      signal: abort.signal,
    });
  } catch (e) {
    if (abort.signal.aborted) throw new McpError('The request timed out. Check your connection and try again.');
    throw new McpError(`Could not reach redbison.dev: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) throw new McpError(`redbison.dev answered ${res.status}. Try again in a moment.`);

  const reply = readFrame(await res.text()) as RpcReply;
  if (reply.error) throw new McpError(reply.error.message ?? 'The tool could not run.');

  const text = reply.result?.content?.find((c) => c.type === 'text')?.text;
  if (text === undefined) throw new McpError('The tool returned nothing.');
  // A tool reports its own failure in the body with isError, often as a JSON
  // envelope. Showing that raw puts a wall of braces in a notification, so
  // unwrap it to the sentence the tool wrote, plus its hint where there is one.
  if (reply.result?.isError) throw new McpError(readable(text));
  return text;
}

function readable(text: string): string {
  const stripped = text.replace(/^MCP error [-\d]+:\s*/, '');
  try {
    const envelope = JSON.parse(stripped) as { error?: { message?: string; hint?: string } };
    const message = envelope.error?.message;
    if (!message) return stripped;
    return envelope.error?.hint ? `${message}  ${envelope.error.hint}` : message;
  } catch {
    return stripped;
  }
}
