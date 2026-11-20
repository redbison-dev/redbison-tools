/**
 * RedBison Tools for VS Code.
 *
 * The whole design goal is that a tool should cost less than switching to a
 * browser tab: select, run, done. So a transform replaces the selection in
 * place and takes part in undo like any edit; an inspect opens a result
 * beside the editor rather than stealing focus; and an insert goes in at the
 * cursor. Every command also offers the hosted page, because some of these
 * are better with a UI than a one-shot answer.
 *
 * Commands and their menus are generated into package.json from
 * src/config/ideTools.ts by scripts/generate-ide-artifacts.ts.
 */
import * as vscode from 'vscode';
import { TOOLS, LINKS, type CatalogTool } from './catalog';
import { runLocal, LocalToolError } from './local';
import { callTool, McpError } from './mcp';
import { checkSize, TooLargeError } from './limits';

const OPEN_PAGE = 'Open on redbison.dev';

/** The text a command works on: the selection, or the whole document. */
function readInput(editor: vscode.TextEditor): { text: string; range: vscode.Range } {
  const sel = editor.selection;
  if (!sel.isEmpty) return { text: editor.document.getText(sel), range: sel };
  const full = new vscode.Range(
    editor.document.positionAt(0),
    editor.document.positionAt(editor.document.getText().length),
  );
  return { text: editor.document.getText(), range: full };
}

/** Pretty-print a JSON result, but leave a plain string alone. */
function present(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return raw;
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return raw;
  }
}

async function showResult(tool: CatalogTool, body: string) {
  // Beside the editor, read-only, and in a language the result actually is,
  // so a JSON answer gets folding and colour for free.
  const looksJson = body.trim().startsWith('{') || body.trim().startsWith('[');
  const doc = await vscode.workspace.openTextDocument({
    content: `${body}\n`,
    language: looksJson ? 'json' : 'plaintext',
  });
  await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preview: true });
}

/**
 * What a command cannot proceed without.
 *
 * Only three things qualify: an HMAC key, a regular expression, and the
 * stacks for a .gitignore. Everything else has a sensible default and runs
 * straight away, because a tool that asks a question every time is slower
 * than the browser tab it replaced. The alternatives are reachable through
 * "Run a tool with options", which is one command rather than a prompt on
 * every use.
 */
async function askFor(tool: CatalogTool): Promise<Record<string, unknown> | undefined> {
  if (tool.id === 'hmac') {
    const key = await vscode.window.showInputBox({ prompt: 'HMAC secret key', password: true, ignoreFocusOut: true });
    return key === undefined ? undefined : { key };
  }
  if (tool.id === 'regex-test') {
    const pattern = await vscode.window.showInputBox({ prompt: 'Regular expression', ignoreFocusOut: true });
    return pattern === undefined ? undefined : { pattern };
  }
  if (tool.id === 'gitignore') {
    const templates = await vscode.window.showInputBox({
      prompt: 'Stacks, comma separated',
      value: 'node,macos',
      ignoreFocusOut: true,
    });
    return templates === undefined ? undefined : { templates: templates.split(',').map((x) => x.trim()) };
  }
  return {};
}

/** The alternatives each tool offers, for "Run a tool with options". */
const OPTIONS: Record<string, { key: string; placeHolder: string; items: { label: string; description?: string; value: string }[] }[]> = {
  uuid: [{ key: 'variant', placeHolder: 'Which kind of UUID?', items: [
    { label: 'v4', description: 'random, the usual choice', value: 'v4' },
    { label: 'v7', description: 'time-ordered, sorts by creation, good as a database key', value: 'v7' },
    { label: 'v4 uppercase', value: 'v4-upper' },
    { label: 'v4 without hyphens', description: '32 hex characters', value: 'v4-compact' },
    { label: 'nil', description: 'all zeroes', value: 'nil' },
  ] }],
  hash: [
    { key: 'algorithm', placeHolder: 'Which algorithm?', items: [
      { label: 'sha256', description: 'the default', value: 'sha256' },
      { label: 'sha512', value: 'sha512' },
      { label: 'sha384', value: 'sha384' },
      { label: 'sha1', description: 'legacy only', value: 'sha1' },
      { label: 'md5', description: 'checksums only, broken for security', value: 'md5' },
    ] },
    { key: 'encoding', placeHolder: 'Output as', items: [
      { label: 'hex', value: 'hex' }, { label: 'base64', value: 'base64' },
    ] },
  ],
  'case-convert': [{ key: 'style', placeHolder: 'Convert to', items: [
    { label: 'camelCase', value: 'camel' }, { label: 'PascalCase', value: 'pascal' },
    { label: 'snake_case', value: 'snake' }, { label: 'kebab-case', value: 'kebab' },
    { label: 'CONSTANT_CASE', value: 'constant' }, { label: 'Title Case', value: 'title' },
    { label: 'UPPERCASE', value: 'upper' }, { label: 'lowercase', value: 'lower' },
  ] }],
  'base64-encode': [{ key: 'variant', placeHolder: 'Which alphabet?', items: [
    { label: 'Standard', description: 'RFC 4648, + and /', value: 'standard' },
    { label: 'URL-safe', description: '- and _, for query strings and JWTs', value: 'url' },
  ] }],
  'url-encode': [{ key: 'variant', placeHolder: 'Encode as', items: [
    { label: 'Component', description: 'escapes & = ? / too', value: 'component' },
    { label: 'Whole URL', description: 'leaves the structure alone', value: 'uri' },
  ] }],
  password: [{ key: 'charset', placeHolder: 'Which characters?', items: [
    { label: 'Letters, digits and symbols', value: 'full' },
    { label: 'Letters and digits', description: 'when a system rejects symbols', value: 'alphanumeric' },
    { label: 'Letters only', value: 'letters' },
  ] }],
  'lines-to-comma': [{ key: 'quote', placeHolder: 'Quote each item?', items: [
    { label: 'No quotes', value: 'none' },
    { label: 'Double quotes', description: 'for a JSON or SQL list', value: 'double' },
    { label: 'Single quotes', value: 'single' },
  ] }],
  'dedupe-lines': [{ key: 'compare', placeHolder: 'Compare lines how?', items: [
    { label: 'Exact match', value: 'exact' }, { label: 'Ignore case', value: 'ignore-case' },
  ] }],
  lorem: [{ key: 'unit', placeHolder: 'How much?', items: [
    { label: 'Paragraphs', value: 'paragraphs' }, { label: 'Sentences', value: 'sentences' },
  ] }],
};

async function run(tool: CatalogTool, preset: Record<string, unknown> = {}) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showWarningMessage('Open a file first.');
    return;
  }

  const asked = await askFor(tool);
  if (asked === undefined) return; // the reader pressed Escape
  const extra = { ...preset, ...asked };

  const { text, range } = tool.kind === 'insert' ? { text: '', range: editor.selection } : readInput(editor);
  if (tool.kind !== 'insert' && !text.trim()) {
    void vscode.window.showWarningMessage('Select some text first.');
    return;
  }

  let output: string;
  try {
    if (tool.kind !== 'insert') checkSize(text, tool.offline, tool.title);
    const local = runLocal(tool.id, text, extra);
    if (local !== undefined) {
      output = local;
    } else {
      const mcp = tool.mcp;
      if (!mcp) {
        // A native tool with no local branch is a bug in the catalog, not
        // something to paper over by calling a server that has no such tool.
        throw new LocalToolError(`${tool.title} is not available in this build.`);
      }
      output = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Window, title: `RedBison: ${tool.title}` },
        () => callTool(mcp.name, { ...(mcp.args ?? {}), ...extra, ...(mcp.input ? { [mcp.input]: text } : {}) }),
      );
    }
  } catch (e) {
    const message =
      e instanceof LocalToolError || e instanceof McpError || e instanceof TooLargeError ? e.message : String(e);
    // Deliberately not awaited. Awaiting leaves the command running until the
    // notification is dismissed, which in a test harness is forever and for a
    // reader means the progress state never clears after a failure.
    void vscode.window.showErrorMessage(`${tool.title}: ${message}`, OPEN_PAGE).then((choice) => {
      if (choice === OPEN_PAGE) void vscode.env.openExternal(vscode.Uri.parse(tool.url));
    });
    return;
  }

  if (tool.kind === 'inspect') {
    await showResult(tool, present(output));
    return;
  }

  // One edit, so a transform is a single undo step.
  await editor.edit((b) => (tool.kind === 'insert' ? b.insert(editor.selection.active, output) : b.replace(range, output)));
}

/**
 * The alternatives, without slowing the common path.
 *
 * Every command runs its sensible default with no questions. This is where a
 * reader goes when they want v7 instead of v4, or sha512 instead of sha256.
 */
async function runWithOptions() {
  const withOptions = TOOLS.filter((t) => OPTIONS[t.id]);
  const picked = await vscode.window.showQuickPick(
    withOptions.map((t) => ({ label: t.title, detail: t.summary, tool: t })),
    { placeHolder: 'Which tool?', matchOnDetail: true },
  );
  if (!picked) return;

  const chosen: Record<string, unknown> = {};
  for (const step of OPTIONS[picked.tool.id]) {
    const answer = await vscode.window.showQuickPick(step.items, { placeHolder: step.placeHolder });
    if (!answer) return;
    chosen[step.key] = answer.value;
  }
  await run(picked.tool, chosen);
}

/** The one command worth a keybinding: search every tool by name. */
async function pickAndRun() {
  const items = TOOLS.map((t) => ({
    label: t.title,
    description: t.offline ? '' : '$(cloud) online',
    detail: t.summary,
    tool: t,
  }));
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: 'RedBison: run a tool on the selection',
    matchOnDetail: true,
  });
  if (picked) await run(picked.tool);
}

/**
 * The documentation, read from the shipped data file the first time a reader
 * asks for it and kept after that. Bundled into the extension it would be
 * 43KB of markdown parsed at activation for every user, for a command most
 * never run; this way an editor that never opens the docs never pays for them.
 */
let docsCache: Record<string, string> | undefined;

async function loadDoc(context: vscode.ExtensionContext, id: string): Promise<string | undefined> {
  if (!docsCache) {
    let loaded: Record<string, string> = {};
    try {
      const uri = vscode.Uri.joinPath(context.extensionUri, 'media', 'docs.json');
      loaded = JSON.parse(Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8'));
    } catch {
      // Missing or unreadable docs must not break the command; the hosted
      // page is the fallback and is better anyway.
    }
    docsCache = loaded;
  }
  return docsCache[id];
}

/**
 * The tool's own help page, rendered in the editor.
 *
 * Markdown opened as a preview rather than a hand-written webview: it costs no
 * HTML, it inherits the reader's theme, and the links in it work. Each page
 * carries an example captured from the live tool, so what it shows is what the
 * command actually returns.
 */
async function browseDocs(context: vscode.ExtensionContext) {
  const picked = await vscode.window.showQuickPick(
    TOOLS.map((t) => ({
      label: t.title,
      description: t.offline ? 'offline' : '$(cloud)',
      detail: t.summary,
      tool: t,
    })),
    { placeHolder: 'Pick a tool to read about', matchOnDetail: true },
  );
  if (!picked) return;

  const markdown = await loadDoc(context, picked.tool.id);
  if (!markdown) {
    void vscode.env.openExternal(vscode.Uri.parse(picked.tool.url));
    return;
  }
  const doc = await vscode.workspace.openTextDocument({ content: markdown, language: 'markdown' });
  await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preview: true });
  // Rendered, not raw: this is documentation, not a file to edit.
  await vscode.commands.executeCommand('markdown.showPreview');
}

export function activate(context: vscode.ExtensionContext) {
  for (const tool of TOOLS)
    context.subscriptions.push(vscode.commands.registerCommand(`redbison.${tool.id}`, () => run(tool)));
  context.subscriptions.push(
    vscode.commands.registerCommand('redbison.run', pickAndRun),
    vscode.commands.registerCommand('redbison.docs', () => browseDocs(context)),
    vscode.commands.registerCommand('redbison.options', runWithOptions),
  );

  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  status.text = '$(tools) RedBison';
  status.tooltip = `Run one of ${TOOLS.length} tools on the selection — ${LINKS.site}`;
  status.command = 'redbison.run';
  status.show();
  context.subscriptions.push(status);
}

export function deactivate() {
  /* nothing to tear down: every subscription is disposed by the context */
}
