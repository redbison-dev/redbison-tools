/**
 * What the extension does once a real VS Code has loaded it.
 *
 * These run the commands against a real document, so they catch the things a
 * build cannot: a command that was never registered, an edit that does not
 * apply, a transform that mangles the selection. The offline commands are
 * used throughout so the suite does not depend on a network.
 */
import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { TOOLS } from '../../catalog';

const EXTENSION_ID = 'redbison.redbison-tools';

/** Open a scratch document, select all of it, run a command, read it back. */
async function runOn(content: string, command: string, language = 'plaintext'): Promise<string> {
  const doc = await vscode.workspace.openTextDocument({ content, language });
  const editor = await vscode.window.showTextDocument(doc);
  editor.selection = new vscode.Selection(
    doc.positionAt(0),
    doc.positionAt(content.length),
  );
  await vscode.commands.executeCommand(command);
  return doc.getText();
}

/** Poll briefly for a condition the editor applies asynchronously. */
async function waitFor(check: () => boolean, ms = 3000): Promise<boolean> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (check()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return check();
}

suite('RedBison Tools', () => {
  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext, `extension ${EXTENSION_ID} not found`);
    await ext.activate();
  });

  test('activates', () => {
    assert.strictEqual(vscode.extensions.getExtension(EXTENSION_ID)?.isActive, true);
  });

  test('registers a command for every tool, plus the two entry points', async () => {
    const registered = new Set(await vscode.commands.getCommands(true));
    const missing = TOOLS.map((t) => `redbison.${t.id}`).filter((id) => !registered.has(id));
    assert.deepStrictEqual(missing, [], 'these commands never reached the palette');
    assert.ok(registered.has('redbison.run'), 'the searchable entry point is missing');
    assert.ok(registered.has('redbison.docs'), 'the documentation browser is missing');
  });

  test('formats JSON in place', async () => {
    const out = await runOn('{"b":1,"a":[1,2]}', 'redbison.json-format', 'json');
    assert.strictEqual(out, '{\n  "b": 1,\n  "a": [\n    1,\n    2\n  ]\n}');
  });

  test('minifies JSON in place', async () => {
    const out = await runOn('{\n  "a": 1\n}', 'redbison.json-minify', 'json');
    assert.strictEqual(out, '{"a":1}');
  });

  test('Base64 round trips through the editor', async () => {
    const encoded = await runOn('RedBison Tools', 'redbison.base64-encode');
    assert.strictEqual(encoded, 'UmVkQmlzb24gVG9vbHM=');
    const decoded = await runOn(encoded, 'redbison.base64-decode');
    assert.strictEqual(decoded, 'RedBison Tools');
  });

  test('URL encode and decode round trip', async () => {
    const encoded = await runOn('q=red bison&page=2', 'redbison.url-encode');
    assert.strictEqual(encoded, 'q%3Dred%20bison%26page%3D2');
    assert.strictEqual(await runOn(encoded, 'redbison.url-decode'), 'q=red bison&page=2');
  });

  test('inserts a UUID at the cursor', async () => {
    const doc = await vscode.workspace.openTextDocument({ content: '', language: 'plaintext' });
    await vscode.window.showTextDocument(doc);
    await vscode.commands.executeCommand('redbison.uuid');
    assert.match(doc.getText().trim(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  test('a transform applies as a single edit, so it is one undo step', async () => {
    // The document version counts applied edits. One edit is one undo stop,
    // which is the property this extension controls. Driving the undo command
    // itself is not checked here: it routes to the focused editor, and a
    // headless harness has no window focus, so it would test the harness.
    const doc = await vscode.workspace.openTextDocument({ content: '{"a":1}', language: 'json' });
    const editor = await vscode.window.showTextDocument(doc);
    editor.selection = new vscode.Selection(doc.positionAt(0), doc.positionAt(7));
    const before = doc.version;
    await vscode.commands.executeCommand('redbison.json-format');
    await waitFor(() => doc.version > before);
    assert.notStrictEqual(doc.getText(), '{"a":1}', 'the transform should have run');
    assert.strictEqual(doc.version - before, 1, 'more than one edit means more than one undo');
  });

  test('bad input leaves the document alone', async () => {
    // The command reports the fault; it must not write half an answer.
    const content = '{not json';
    const doc = await vscode.workspace.openTextDocument({ content, language: 'json' });
    const editor = await vscode.window.showTextDocument(doc);
    editor.selection = new vscode.Selection(doc.positionAt(0), doc.positionAt(content.length));
    await vscode.commands.executeCommand('redbison.json-format');
    assert.strictEqual(doc.getText(), content);
  });

  test('every tool has a page in the shipped docs file', async () => {
    // Read the way the extension reads it, so a packaging mistake that leaves
    // the file out of the vsix fails here.
    const ext = vscode.extensions.getExtension(EXTENSION_ID)!;
    const uri = vscode.Uri.joinPath(ext.extensionUri, 'media', 'docs.json');
    const docs = JSON.parse(Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8'));
    const missing = TOOLS.filter((t) => !docs[t.id]).map((t) => t.id);
    assert.deepStrictEqual(missing, [], 'these would open a browser instead of a help page');
  });
});
