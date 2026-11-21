/**
 * The server path, with the server replaced by a stub.
 *
 * The 35 tools that need the network were only ever exercised against the
 * real endpoint, which means the one thing never tested was what happens when
 * it says no. It says no in a way that is easy to miss: a *successful*
 * JSON-RPC reply carrying `isError: true` and the message where the answer
 * goes. Reading it as the answer printed validation errors to stdout with
 * exit code 0, so `redbison gitignore > .gitignore` wrote the error into the
 * file. Everything here is about that reply, and about the shape of what goes
 * out, which is the other half of the same bug.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runTool, RunError } from '../run';
import { optionsFor } from '../options';
import { TOOLS } from '../catalog';

type Sent = { name: string; arguments: Record<string, unknown> };

let sent: Sent[] = [];
let reply: unknown = {};
let fetchSpy: ReturnType<typeof vi.spyOn>;

/** The endpoint frames its replies as server-sent events. */
const sse = (body: unknown) => `event: message\ndata: ${JSON.stringify(body)}\n\n`;

const ok = (text: string) => ({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text }] } });

beforeEach(() => {
  sent = [];
  reply = ok('fine');
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((async (_url: string, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)).params as Sent);
    return { ok: true, status: 200, text: async () => sse(reply) } as Response;
  }) as typeof fetch);
});

afterEach(() => fetchSpy.mockRestore());

describe('a reply that is a failure dressed as a success', () => {
  it('is reported as a failure', async () => {
    reply = {
      jsonrpc: '2.0',
      id: 1,
      result: {
        content: [{ type: 'text', text: 'MCP error -32602: Input validation error: expected array' }],
        isError: true,
      },
    };
    await expect(runTool('js-beautify', 'var a=1', {})).rejects.toThrow(RunError);
    await expect(runTool('js-beautify', 'var a=1', {})).rejects.toThrow(/expected array/);
  });

  it('still reads a plain JSON-RPC error', async () => {
    reply = { jsonrpc: '2.0', id: 1, error: { message: 'no such tool' } };
    await expect(runTool('js-beautify', 'var a=1', {})).rejects.toThrow(/no such tool/);
  });

  it('still reads a tool error reported inside the text block', async () => {
    reply = ok(JSON.stringify({ error: { message: 'that is not valid JavaScript' } }));
    await expect(runTool('js-beautify', 'var {', {})).rejects.toThrow(/not valid JavaScript/);
  });

  it('does not mistake an answer that happens to contain the word error', async () => {
    reply = ok('{"errors": 0, "status": "clean"}');
    await expect(runTool('js-beautify', 'var a=1', {})).resolves.toContain('clean');
  });
});

describe('what actually goes over the wire', () => {
  const args = async (tool: string, input: string, options: Record<string, string | number | boolean>) => {
    await runTool(tool, input, options);
    // The last call, not the first: these tests make several each.
    return sent[sent.length - 1].arguments;
  };

  it('splits a list option into the list the tool asked for', async () => {
    // A command line has no lists. The help page has always said "comma
    // separated"; until this split existed, nothing honoured it and the
    // server refused every one of these five options.
    expect(await args('cron-build', '', { frequency: 'weekly', daysOfWeek: 'mon,fri' })).toMatchObject({
      daysOfWeek: ['mon', 'fri'],
    });
    expect(await args('password-strength', 'hunter2', { user_inputs: 'alice,acme' })).toMatchObject({
      user_inputs: ['alice', 'acme'],
    });
  });

  it('is tidy about spaces and stray commas, which people type', async () => {
    expect(await args('cron-build', '', { frequency: 'weekly', daysOfWeek: ' mon , fri ,' })).toMatchObject({
      daysOfWeek: ['mon', 'fri'],
    });
    expect(await args('cron-build', '', { frequency: 'weekly', daysOfWeek: 'mon' })).toMatchObject({
      daysOfWeek: ['mon'],
    });
  });

  it('leaves everything else exactly as it was typed', async () => {
    // A value with a comma in it that is *not* a list option must survive
    // whole: splitting one of those would quietly change the answer.
    const got = await args('cron-build', '', { frequency: 'weekly', minute: 30, daysOfWeek: 'mon' });
    expect(got.minute).toBe(30);
    expect(got.frequency).toBe('weekly');
  });

  it('never offers a value the server will refuse', () => {
    /*
     * The hand-written option specs win over the generated ones, so nothing
     * checks them against the schema the server actually enforces.
     * barcode-check declared mode ean13/ean8/upca against a tool that takes
     * auto/compute/validate, and ean13 was the *default*: the command the
     * help page printed was a command the endpoint refused. curl-to-code
     * left out a target the generator supports. Both were invisible because
     * the option tests skip tools that are not local.
     */
    const schemas = JSON.parse(
      readFileSync(resolve(__dirname, '../../../ide/shared/mcpSchemas.generated.json'), 'utf8'),
    ) as Record<string, { properties?: Record<string, { enum?: unknown[] }> }>;

    const wrong: string[] = [];
    for (const tool of TOOLS) {
      /*
       * Only the tools we actually send. A local tool may legitimately offer
       * more than the server does — case-convert implements CONSTANT_CASE
       * itself, hmac names its digests in lower case — and for those the
       * net is options.test.ts, which runs every declared value through the
       * local implementation. Between the two, every option is covered by
       * whichever check can actually see it.
       */
      if (!tool.mcp?.name || tool.offline) continue;
      const props = schemas[tool.mcp.name]?.properties ?? {};
      for (const opt of optionsFor(tool.id)) {
        const allowed = props[opt.key]?.enum?.map(String);
        if (!allowed) continue;
        for (const v of opt.values ?? []) {
          if (!allowed.includes(v.value)) wrong.push(`${tool.id} --${opt.key} offers ${v.value}; server takes ${allowed.join('|')}`);
        }
        if (opt.defaultValue !== undefined && !allowed.includes(String(opt.defaultValue))) {
          wrong.push(`${tool.id} --${opt.key} defaults to ${opt.defaultValue}; server takes ${allowed.join('|')}`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it('every option the schema calls a list is marked as one', async () => {
    /*
     * The drift this guards against is a one-word omission: the hand-written
     * entry for gitignore's `templates` wins over the generated one, so it
     * was the single array option the generator could not mark for itself,
     * and it was the one that shipped broken.
     */
    const schemas = JSON.parse(
      readFileSync(resolve(__dirname, '../../../ide/shared/mcpSchemas.generated.json'), 'utf8'),
    ) as Record<string, { properties?: Record<string, { type?: string }> }>;

    const unmarked: string[] = [];
    for (const tool of TOOLS) {
      if (!tool.mcp?.name || tool.offline) continue;
      const props = schemas[tool.mcp.name]?.properties ?? {};
      for (const opt of optionsFor(tool.id)) {
        const isArray = props[opt.key]?.type === 'array';
        if (isArray && !opt.list) unmarked.push(`${tool.id}.${opt.key}`);
        if (!isArray && opt.list) unmarked.push(`${tool.id}.${opt.key} marked a list but is not one`);
      }
    }
    expect(unmarked).toEqual([]);
  });

  it('puts the input where the tool keeps it, and keeps the fixed arguments', async () => {
    const got = await args('ascii-art', 'hi', {});
    // ascii-art pins its font in the catalog, and the input goes under the
    // name the tool keeps it in rather than under "input".
    expect(got.font).toBe('Standard');
    expect(Object.values(got)).toContain('hi');
  });
});

describe('the guards around the call', () => {
  it('refuses before sending when offline is on', async () => {
    await expect(
      runTool('js-beautify', 'var a=1', {}, { offline: true }),
    ).rejects.toThrow(/--offline|nothing was sent/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('counts the option text against the 1MB limit, not just the input', async () => {
    const big = 'x'.repeat(1_000_001);
    await expect(runTool('json-schema-validate', '{}', { schema: big })).rejects.toThrow(/1MB/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refuses a required option that is missing, before any network', async () => {
    await expect(runTool('css-gradient', '', { type: 'linear' })).rejects.toThrow(/needs --stops/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('says so when the endpoint answers with a status', async () => {
    fetchSpy.mockImplementation((async () => ({ ok: false, status: 503, text: async () => '' }) as Response) as typeof fetch);
    await expect(runTool('js-beautify', 'var a=1', {})).rejects.toThrow(/503/);
  });

  it('says so when the reply is not something it can read', async () => {
    fetchSpy.mockImplementation((async () => ({ ok: true, status: 200, text: async () => 'not json at all' }) as Response) as typeof fetch);
    await expect(runTool('js-beautify', 'var a=1', {})).rejects.toThrow(/Could not read the reply/);
  });
});
