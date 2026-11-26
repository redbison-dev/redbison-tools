/**
 * Raycast-side findings from the automated review of the store PR
 * (raycast/extensions#34044), each reproduced against the real code.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  choiceTitle,
  cliCommand,
  concealCommand,
  concealResult,
  optionInfo,
  optionPlaceholder,
  UTILITIES,
  type Options,
} from "../src/lib/utilities";
import { parseArgs } from "../src/vendor/cli/src/args";

/** POSIX shell words: enough for what shellQuote writes (bare words and '...' with '\''). */
function shellWords(command: string): string[] {
  const words: string[] = [];
  let word = "";
  let started = false;
  for (let i = 0; i < command.length; i += 1) {
    const c = command[i];
    if (c === "'") {
      const end = command.indexOf("'", i + 1);
      word += command.slice(i + 1, end);
      started = true;
      i = end;
    } else if (c === "\\") {
      word += command[i + 1];
      started = true;
      i += 1;
    } else if (c === " ") {
      if (started) words.push(word);
      word = "";
      started = false;
    } else {
      word += c;
      started = true;
    }
  }
  if (started) words.push(word);
  return words;
}

/** The copied command, read back by the CLI's own parser. */
function parsedBack(id: string, options: Options) {
  const argv = shellWords(cliCommand(id, options));
  expect(argv[0]).toBe("redbison");
  return parseArgs(argv.slice(1));
}

describe("Copy CLI Command parses back to the same run (finding 8)", () => {
  it("a false switch stays false and does not swallow anything", () => {
    const p = parsedBack("nato", { markCase: false });
    expect(p.options).toEqual({ markCase: false });
    expect(p.input).toBeUndefined();
  });

  it("every boolean option of every utility, both ways", () => {
    for (const u of UTILITIES) {
      for (const o of u.options.filter((x) => x.type === "boolean")) {
        for (const value of [true, false]) {
          const p = parsedBack(u.id, { [o.key]: value });
          expect(p.tool, `${u.id} --${o.key}`).toBe(u.id);
          expect(p.options, `${u.id} --${o.key}=${value}`).toEqual({ [o.key]: value });
          expect(p.input, `${u.id} --${o.key}=${value}`).toBeUndefined();
        }
      }
    }
  });

  it("numbers, negative numbers and quoted text read back too", () => {
    expect(parsedBack("random-number", { min: -5, max: 10, count: 3 }).options).toEqual({ min: -5, max: 10, count: 3 });
    expect(parsedBack("regex-test", { pattern: "a b's --x" }).options).toEqual({ pattern: "a b's --x" });
  });
});

describe("option text is shown in US English (finding 10)", () => {
  const BRITISH = /\b(colour|behaviour|centre|favour|catalogue)/i;
  it("the vendored descriptions really are British, so the mapping is needed", () => {
    const raw = UTILITIES.flatMap((u) =>
      u.options.flatMap((o) => [o.describe, ...(o.values ?? []).map((v) => v.describe ?? "")]),
    );
    expect(raw.some((t) => BRITISH.test(t))).toBe(true);
  });
  it("no field description, placeholder or choice shows a British spelling", () => {
    for (const u of UTILITIES) {
      for (const o of u.options) {
        expect(optionInfo(o), `${u.id} ${o.key}`).not.toMatch(BRITISH);
        expect(optionPlaceholder(o), `${u.id} ${o.key}`).not.toMatch(BRITISH);
        for (const v of o.values ?? []) expect(choiceTitle(v), `${u.id} ${o.key} ${v.value}`).not.toMatch(BRITISH);
      }
    }
  });
  it("keeps the meaning: a capitalized description and value: description choices", () => {
    const background = UTILITIES.flatMap((u) => u.options).find((o) => o.describe === "the background colour, hex")!;
    expect(optionInfo(background)).toBe("The background color, hex");
    expect(choiceTitle({ value: "url", describe: "- and _, unpadded, safe in a URL" })).toBe(
      "url: - and _, unpadded, safe in a URL",
    );
    expect(choiceTitle({ value: "letters" })).toBe("letters");
  });
});

describe("secrets stay out of Clipboard History (finding 11)", () => {
  it("a generated password is copied concealed; other results are not", () => {
    expect(concealResult("password")).toBe(true);
    expect(concealResult("uuid")).toBe(false);
    expect(concealResult("json-format")).toBe(false);
  });
  it("a CLI command carrying an HMAC key is copied concealed", () => {
    expect(concealCommand("hmac", { key: "s3cret", algorithm: "sha256" })).toBe(true);
    expect(concealCommand("hmac", {})).toBe(false);
    expect(concealCommand("hash", { algorithm: "sha256" })).toBe(false);
  });
  it("every option that holds a secret is covered", () => {
    // An option whose description calls it a secret, key or password must conceal the command.
    for (const u of UTILITIES) {
      for (const o of u.options.filter((x) => /secret|password|passphrase|private key/i.test(x.describe))) {
        expect(concealCommand(u.id, { [o.key]: "x" }), `${u.id} --${o.key}`).toBe(true);
      }
    }
  });
});

describe("failures use showFailureToast (finding 16)", () => {
  const SRC = resolve(__dirname, "../src");
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      if (name === "vendor") return [];
      return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(name) ? [p] : [];
    });
  it("no catch block builds its own failure toast", () => {
    const offenders: string[] = [];
    for (const f of files(SRC)) {
      const text = readFileSync(f, "utf8");
      for (const m of text.matchAll(/\bcatch\s*(\([^)]*\))?\s*\{/g)) {
        // The catch body, up to its matching brace.
        let depth = 0;
        let end = m.index! + m[0].length - 1;
        for (; end < text.length; end += 1) {
          if (text[end] === "{") depth += 1;
          else if (text[end] === "}" && --depth === 0) break;
        }
        if (/Toast\.Style\.Failure/.test(text.slice(m.index!, end))) offenders.push(f.slice(SRC.length + 1));
      }
    }
    expect(offenders).toEqual([]);
  });
});
