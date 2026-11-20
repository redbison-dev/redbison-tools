/**
 * Runs the test suite inside a real VS Code, downloaded for the purpose.
 *
 * Packaging a .vsix proves the extension builds; it does not prove a single
 * command works once the editor loads it. This does: VS Code starts, the
 * extension activates, and the commands run against a real document.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { runTests } from '@vscode/test-electron';

const userDataDir = mkdtempSync(join(tmpdir(), 'rbvs-'));

async function main() {
  try {
    await runTests({
      // The working directory, not a count of ../ from __dirname: the
      // compiled tests sit under out/ide/vscode/src/test because local.ts
      // imports the site's own modules from outside this folder, which moves
      // tsc's rootDir to the repository root. Counting levels breaks the next
      // time an import crosses that line.
      extensionDevelopmentPath: process.cwd(),
      extensionTestsPath: resolve(__dirname, './suite/index'),
      // No user settings or other extensions in the way, so a failure is ours.
      // The user-data-dir is short and outside the repo on purpose: macOS caps
      // a unix socket path at ~103 characters, and VS Code puts its IPC socket
      // under this directory, so a deep checkout fails to start with EINVAL.
      launchArgs: [
        '--disable-extensions',
        '--disable-gpu',
        '--no-sandbox',
        `--user-data-dir=${userDataDir}`,
      ],
    });
  } catch (err) {
    console.error('Failed to run tests', err);
    process.exit(1);
  }
}

void main();
