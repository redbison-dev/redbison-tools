/**
 * What a local tool offers, against what its server twin accepts.
 *
 * Options are derived from the MCP schema only for tools that call the
 * server: for a local one the hand-written spec is the truth, deliberately,
 * because a derived option can advertise something the schema accepts and
 * the local code ignores — a flag taken, dropped, and an answer that looks
 * exactly as correct as the right one.
 *
 * The cost of that rule is that moving a tool off the network silently
 * deletes every option it had not been given by hand. It happened: nine
 * tools lost the lot in one commit, and `redbison redirect-rules --platform
 * netlify` started answering "redirect-rules takes no options". Tests passed
 * throughout, because nothing compared the two sides.
 *
 * So this is the comparison. Every option the server accepts is either
 * offered by the local tool or written down below as deliberately left out,
 * with the reason.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TOOLS } from '../catalog';
import { optionsFor } from '../options';

type Schema = { properties?: Record<string, { type?: string }>; required?: string[] };

const SCHEMAS = JSON.parse(
  readFileSync(resolve(__dirname, '../../../ide/shared/mcpSchemas.generated.json'), 'utf8'),
) as Record<string, Schema>;

/**
 * Options the server takes that a local tool deliberately does not, and why.
 *
 * Every entry here is a promise that the local answer does not depend on the
 * option. Anything that would change the answer belongs in the spec instead.
 */
const NOT_OFFERED: Record<string, Record<string, string>> = {
  morse: {
    wpm: 'only scales the playback timing, which the text answer does not carry',
    effectiveWpm: 'same: a Farnsworth gap in a schedule nothing here plays',
  },
  hmac: { key_encoding: 'the local digest reads the key as UTF-8, as the page does' },
  'markdown-table': { align: 'the local aligner keeps the column markers the table already has' },
};

/**
 * Gaps that were already there, recorded rather than waved through.
 *
 * Twenty-two tools made local long before this check existed offer fewer
 * options than their server twin, and auditing all of them is its own piece
 * of work: each needs someone to decide whether the option changes the
 * answer or not. They are listed so the list can be read, and the test only
 * lets it shrink — the same bargain docs/calculation-standard-baseline.json
 * strikes. A new gap is a failure; closing an old one means deleting a line.
 */
const KNOWN_GAPS = JSON.parse(
  readFileSync(resolve(__dirname, 'local-option-gaps.json'), 'utf8'),
) as Record<string, string[]>;

function gapsFor(id: string, tool: (typeof TOOLS)[number]): string[] {
  const schema = SCHEMAS[tool.mcp!.name];
  if (!schema?.properties) return [];
  const offered = new Set(optionsFor(id).map((o) => o.key));
  const excused = NOT_OFFERED[id] ?? {};
  return Object.keys(schema.properties)
    .filter((key) => key !== tool.mcp!.input && !offered.has(key) && !(key in excused))
    .sort();
}

describe('a local tool offers what the server would', () => {
  const local = TOOLS.filter((t) => t.offline && t.mcp?.name);

  it.each(local.map((t) => [t.id, t] as const))('%s', (id, tool) => {
    const missing = gapsFor(id, tool);
    const known = KNOWN_GAPS[id] ?? [];
    const fresh = missing.filter((k) => !known.includes(k));
    expect(
      fresh,
      `${id} drops ${fresh.join(', ')}: add the option to ide/shared/toolOptions.ts, ` +
        'or a reason to NOT_OFFERED. Making a tool local deletes every option it was not given by hand.',
    ).toEqual([]);
  });

  it('never lets the list of known gaps grow back', () => {
    // Closing one means deleting its line here. Re-adding a line does not
    // make the gap acceptable, it makes the baseline a dumping ground.
    const closed: string[] = [];
    for (const [id, keys] of Object.entries(KNOWN_GAPS)) {
      const tool = TOOLS.find((t) => t.id === id);
      if (!tool?.mcp?.name || !tool.offline) {
        closed.push(`${id} is no longer a local tool with a server twin`);
        continue;
      }
      const missing = gapsFor(id, tool);
      for (const key of keys) {
        if (!missing.includes(key)) closed.push(`${id}.${key} is offered now; remove it from local-option-gaps.json`);
      }
    }
    expect(closed).toEqual([]);
  });

  it('keeps no excuse for an option that is offered after all', () => {
    // An entry left behind here after the option was added reads as a
    // limitation that no longer exists.
    const stale: string[] = [];
    for (const [id, keys] of Object.entries(NOT_OFFERED)) {
      const offered = new Set(optionsFor(id).map((o) => o.key));
      for (const key of Object.keys(keys)) if (offered.has(key)) stale.push(`${id}.${key}`);
    }
    expect(stale).toEqual([]);
  });

  /*
   * Options the server insists on and the local tool does not, deliberately.
   * Only for a tool that still does something sensible without the flag.
   */
  const REQUIRED_DIFFERS: Record<string, Record<string, string>> = {
    'utm-build': {
      source: 'with no parameters at all it hands the URL back unchanged, which is a '
        + 'no-op rather than a wrong answer; the server refuses instead',
    },
  };

  it('marks required what the server marks required', () => {
    const wrong: string[] = [];
    for (const tool of local) {
      const schema = SCHEMAS[tool.mcp!.name];
      const required = new Set(schema?.required ?? []);
      const pinned = new Set(Object.keys(tool.mcp!.args ?? {}));
      for (const opt of optionsFor(tool.id)) {
        const serverWants = required.has(opt.key) && !pinned.has(opt.key);
        // A tool with a default does not need the flag; one without does.
        const excused = REQUIRED_DIFFERS[tool.id]?.[opt.key] !== undefined;
        if (serverWants && !opt.required && opt.defaultValue === undefined && !excused) {
          wrong.push(`${tool.id} --${opt.key} is required by the server but optional here`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });
});
