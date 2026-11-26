#!/usr/bin/env node
/**
 * Copies the extension into its own git repository, which is where
 * `npm run publish` has to run.
 *
 * Why not publish from integrations/raycast directly: `ray publish` (read in
 * @raycast/api 2.14, dist/commands/publish) works on the git repository
 * around the current folder. It refuses while anything in that repository is
 * uncommitted or untracked, it tags the repository's HEAD
 * (__raycast_latest_publish_*), and on a first publish it writes the subject
 * of every commit in `git log` into the pull request's commit message. In the
 * RedBison main repo that means the whole private history would land in a
 * public PR on raycast/extensions. A small repository holding only the
 * extension avoids all three.
 *
 *   npm run stage -- ~/src/redbison-raycast
 *
 * Re-run it after every change here, commit in the target, and publish from
 * there. The target's .git and node_modules are kept between runs.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const EXT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// The repo the extension sits in: the main repo (integrations/raycast) or
// redbison-tools (raycast/). Staging inside either is refused the same way.
const ROOT = [resolve(EXT, "../.."), resolve(EXT, "..")].find((dir) => existsSync(join(dir, "cli/src/catalog.ts"))) ?? resolve(EXT, "..");
const target = process.argv[2] ? resolve(process.argv[2]) : "";

if (!target) {
  console.error("Usage: npm run stage -- <folder outside the RedBison repo>");
  process.exit(2);
}
if (target === ROOT || target.startsWith(ROOT + sep)) {
  console.error(`[stage] ${target} is inside the RedBison repo. Pick a folder outside it, e.g. ~/src/redbison-raycast`);
  process.exit(2);
}

/* What a published extension does not need; publish skips most of these too. */
const SKIP = new Set(["node_modules", "raycast-env.d.ts", ".DS_Store", "dist", ".git"]);
const KEEP_IN_TARGET = new Set([".git", "node_modules"]);
/*
 * Maintainer-only files that must never reach the Raycast store PR: our publishing notes, the scripts
 * that sync and stage from our own repos, and the tests with their tooling. The store's rules keep an
 * extension's tests in the author's own repository, so the suite stays here (and in redbison-tools)
 * and the staged copy ships what Store users run. The first store PR (raycast/extensions#34044)
 * shipped all of it and its review flagged the tests, configs, scripts and vitest (2026-11-27).
 */
const MAINTAINER_ONLY = ["PUBLISHING.md", "scripts", "test", "vitest.config.mts", "tsconfig.test.json"];
/* `typecheck` only exists for the tests (tsconfig.test.json); `ray build` type-checks src itself. */
const MAINTAINER_SCRIPTS = ["sync", "stage", "test", "typecheck"];
/* Dependencies only the tests use. */
const TEST_ONLY_DEPENDENCIES = ["vitest"];

mkdirSync(target, { recursive: true });
for (const name of readdirSync(target)) {
  if (!KEEP_IN_TARGET.has(name)) rmSync(join(target, name), { recursive: true, force: true });
}
for (const name of readdirSync(EXT)) {
  if (SKIP.has(name)) continue;
  cpSync(join(EXT, name), join(target, name), {
    recursive: true,
    filter: (src) => !src.split(sep).some((part) => SKIP.has(part)),
  });
}

for (const rel of MAINTAINER_ONLY) rmSync(join(target, rel), { recursive: true, force: true });
const pkgPath = join(target, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
for (const name of MAINTAINER_SCRIPTS) delete pkg.scripts?.[name];
for (const name of TEST_ONLY_DEPENDENCIES) delete pkg.devDependencies?.[name];
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

/*
 * The copied lockfile still pins vitest and everything it pulls in, so it is
 * rebuilt from the trimmed package.json; `npm ci` in the store checks the two
 * agree. --package-lock-only touches neither node_modules nor any scripts.
 */
try {
  execFileSync("npm", ["install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd: target,
    stdio: ["ignore", "ignore", "inherit"],
  });
} catch {
  console.error(`[stage] Could not regenerate package-lock.json in ${target}. Run there: npm install --package-lock-only`);
  process.exit(1);
}
const lock = readFileSync(join(target, "package-lock.json"), "utf8");
for (const name of TEST_ONLY_DEPENDENCIES) {
  if (lock.includes(`"node_modules/${name}"`)) {
    console.error(`[stage] package-lock.json in ${target} still lists ${name}.`);
    process.exit(1);
  }
}

const git = (...args) => execFileSync("git", args, { cwd: target, encoding: "utf8" }).trim();
if (!existsSync(join(target, ".git"))) git("init", "-b", "main");

let email = "";
try {
  email = git("config", "user.email");
} catch {
  // not set anywhere
}

console.log(`[stage] Copied the extension to ${target}`);
console.log(
  email && email.endsWith("@users.noreply.github.com")
    ? `[stage] Commits there are authored as ${email}.`
    : `[stage] The pull request's commit will carry the git email "${email || "(none set)"}" publicly.\n` +
        `        To use your GitHub noreply address instead, run in ${target}:\n` +
        `          git config user.email "<id>+<username>@users.noreply.github.com"`,
);
console.log(`
Next, in ${target}:
  npm ci
  npm run build && npm run lint
  git add -A && git commit -m "RedBison extension"
  npm run publish`);
