/**
 * Does the local answer equal the server's answer?
 *
 * The only question that matters when moving a tool off the network: a local
 * implementation that is *nearly* right is worse than no local implementation,
 * because nothing will ever tell the user which one they got. This asks the
 * real endpoint and diffs, for whatever cases the table below carries.
 */
import { runLocal } from '../../ide/vscode/src/local';
import { byId } from '../src/catalog';
import { optionsFor } from '../src/options';

const ENDPOINT = process.env.REDBISON_MCP_URL ?? 'https://mcp.redbison.dev';

async function server(mcpName: string, args: Record<string, unknown>): Promise<string> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: mcpName, arguments: args } }),
  });
  const body = await res.text();
  const line = body.split('\n').find((l) => l.startsWith('data: '));
  const parsed = JSON.parse(line ? line.slice(6) : body);
  const text = parsed.result?.content?.find((c: { type: string }) => c.type === 'text')?.text ?? '';
  return parsed.result?.isError ? `ERROR: ${text}` : text;
}

export type Case = {
  id: string;
  input: string;
  options?: Record<string, unknown>;
  /*
   * The endpoint wraps a refusal in its own envelope — { error: { tool,
   * message, hint } } — which is a transport concern the local path has no
   * part in and no other local tool reproduces. Where that is the only
   * difference, the case says so and the messages are compared instead.
   */
  envelopedRefusal?: boolean;
};

/** The human part of a refusal, whichever shape it arrived in. */
function firstMessage(text: string): string {
  const body = text.replace(/^ERROR:\s*/, '');
  try {
    const parsed = JSON.parse(body) as { error?: string; errors?: string[] };
    return parsed.errors?.[0] ?? parsed.error ?? body;
  } catch {
    return body;
  }
}

export async function compare(cases: Case[]) {
  let bad = 0;
  for (const c of cases) {
    const tool = byId(c.id);
    if (!tool?.mcp) { console.log(`?  ${c.id}: no server tool`); continue; }
    let local: string;
    try {
      // The same merge runTool does, and the same list splitting, so this
      // compares the two answers rather than two different questions.
      const out = runLocal(c.id, c.input, { ...(tool.mcp.args ?? {}), ...(c.options ?? {}) });
      if (out === undefined) { console.log(`-  ${c.id}: not implemented locally`); bad += 1; continue; }
      local = out;
    } catch (e) {
      local = `ERROR: ${(e as Error).message}`;
    }
    const lists = new Set(optionsFor(c.id).filter((o) => o.list).map((o) => o.key));
    const args: Record<string, unknown> = { ...(tool.mcp.args ?? {}) };
    for (const [k, v] of Object.entries(c.options ?? {})) {
      args[k] = lists.has(k) && typeof v === 'string'
        ? v.split(',').map((s) => s.trim()).filter(Boolean)
        : v;
    }
    if (tool.mcp.input) args[tool.mcp.input] = c.input;
    const remote = await server(tool.mcp.name, args);
    const bothRefused = local.startsWith('ERROR:') && remote.startsWith('ERROR:');
    const sameMessage =
      c.envelopedRefusal && bothRefused && remote.includes(JSON.parse(JSON.stringify(firstMessage(local))));
    if (local === remote || sameMessage) {
      console.log(`${sameMessage ? 'OK~' : 'OK '} ${c.id} ${JSON.stringify(c.options ?? {})}`);
    } else {
      bad += 1;
      console.log(`XX ${c.id} ${JSON.stringify(c.options ?? {})}`);
      console.log(`   local : ${JSON.stringify(local.slice(0, 160))}`);
      console.log(`   server: ${JSON.stringify(remote.slice(0, 160))}`);
    }
  }
  console.log(bad ? `\n${bad} mismatch(es)` : '\nall match');
  return bad;
}
