/**
 * The properties that keep this extension from being the reason someone
 * uninstalls.
 *
 * A tools plugin is judged by what it costs when you are not using it. These
 * are the limits that matter, asserted rather than assumed, because every one
 * of them is easy to lose in a later change: a stray import pulls the docs
 * back into the bundle, a convenience listener starts waking on every
 * keystroke, a timeout gets dropped and a hung request holds a progress bar
 * forever.
 */
import * as assert from 'node:assert';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import * as vscode from 'vscode';
import { MAX_LOCAL_BYTES, MAX_REMOTE_BYTES } from '../../limits';
import { TOOLS } from '../../catalog';

const EXTENSION_ID = 'redbison.redbison-tools';

/**
 * The extension's own folder, asked of VS Code rather than counted in ../
 * from __dirname: the compiled tests nest differently depending on whether
 * an import crosses out of this folder.
 */
const root = (...p: string[]) =>
  resolve(vscode.extensions.getExtension(EXTENSION_ID)!.extensionUri.fsPath, ...p);

suite('Performance', () => {
  test('activates quickly', async () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID)!;
    const started = Date.now();
    await ext.activate();
    const ms = Date.now() - started;
    // Generous on purpose: this catches a regression that makes activation
    // expensive, not the few milliseconds registering commands costs.
    assert.ok(ms < 1000, `activation took ${ms}ms`);
  });

  test('the bundle carries nothing a reader does not use', () => {
    const bytes = statSync(root('dist/extension.js')).size;
    // This number has moved twice, both times to buy offline commands: the
    // HTTP status and MIME tables, then the implementations that took the
    // catalog from 7 local tools to 65 of 100. What it guards is weight with
    // no payoff, which is what the 43KB of documentation parsed at activation
    // was. Code that makes a command work on a plane earns its place; text
    // nobody opens does not. For scale, a typical published extension is
    // measured in megabytes.
    assert.ok(bytes < 120_000, `dist/extension.js is ${bytes} bytes`);
  });

  test('the documentation is not in the bundle', () => {
    const bundle = readFileSync(root('dist/extension.js'), 'utf8');
    // A sentence that only appears in a generated help page. Finding it in
    // the bundle means the docs are being parsed at activation again.
    assert.ok(
      !bundle.includes('Captured from the live tool'),
      'the documentation is bundled; it should be read from media/docs.json on demand',
    );
  });

  test('the package ships nothing a user does not run', () => {
    // The compiled tests were being packaged: 330KB of out/ in a 137KB
    // extension, downloaded by everyone and run by nobody. .vscodeignore is
    // the only thing standing between that and the Marketplace, and it is
    // easy to forget when a build directory moves.
    const ignore = readFileSync(root('.vscodeignore'), 'utf8');
    for (const path of ['out/**', 'src/**', 'node_modules/**', '.vscode-test/**'])
      assert.ok(ignore.includes(path), `.vscodeignore must exclude ${path}`);
  });

  test('nothing runs in the background', () => {
    const sources = ['src/extension.ts', 'src/local.ts', 'src/catalog.ts']
      .map((f) => readFileSync(root(f), 'utf8'))
      .join('\n')
      // Comments describe the rule and would match it.
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    for (const forbidden of ['setInterval', 'createFileSystemWatcher', 'onDidChangeTextDocument', 'onDidSaveTextDocument'])
      assert.ok(!sources.includes(forbidden), `${forbidden} would make the extension work while idle`);
  });

  test('every network call has a timeout', () => {
    const mcp = readFileSync(root('src/mcp.ts'), 'utf8');
    assert.ok(mcp.includes('AbortController'), 'a request with no timeout can hang a progress bar forever');
    assert.ok(/TIMEOUT_MS\s*=\s*\d+/.test(mcp), 'the timeout should be a named constant');
  });

  test('most of the catalog needs no network at all', () => {
    // The point of the local implementations. If this ratio falls, something
    // has been quietly moved back onto the server.
    const offline = TOOLS.filter((t) => t.offline).length;
    assert.ok(offline >= 60, `only ${offline} of ${TOOLS.length} tools run locally`);
    const native = TOOLS.filter((t) => t.native).length;
    assert.ok(native >= 20, `only ${native} tools have no server equivalent at all`);
  });

  test('input is capped before it is sent anywhere', () => {
    assert.ok(MAX_REMOTE_BYTES <= 1_000_000, 'a larger upload belongs on the hosted page');
    assert.ok(MAX_LOCAL_BYTES <= 10_000_000, 'parsing more than this blocks the extension host');
    assert.ok(MAX_REMOTE_BYTES < MAX_LOCAL_BYTES, 'local work should allow more than a network round trip');
  });

  test('refuses an oversized selection instead of sending it', async function () {
    this.timeout(20_000);
    // Just past the remote cap, on a command that would otherwise call out.
    const big = 'x'.repeat(MAX_REMOTE_BYTES + 1);
    const doc = await vscode.workspace.openTextDocument({ content: big, language: 'plaintext' });
    const editor = await vscode.window.showTextDocument(doc);
    editor.selection = new vscode.Selection(doc.positionAt(0), doc.positionAt(big.length));
    await vscode.commands.executeCommand('redbison.slugify');
    // The document is unchanged: the command declined rather than uploading.
    assert.strictEqual(doc.getText().length, big.length);
  });

  test('activation does not touch the network', () => {
    const extension = readFileSync(root('src/extension.ts'), 'utf8');
    const activate = extension.slice(extension.indexOf('export function activate'));
    assert.ok(!activate.includes('callTool'), 'activation must not call the server');
    assert.ok(!activate.includes('fetch('), 'activation must not make a request');
  });
});
