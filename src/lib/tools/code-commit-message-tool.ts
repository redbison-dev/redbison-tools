import { msg } from '../msg';

export type CommitInputs = {
  changeType: string;
  changeDescription: string;
  filesChanged: string;
  bugDescription?: string;
  rootCause?: string;
  testingTypes: string[];
  testingDescription: string;
  breakingChange: boolean;
  additionalNotes: string;
};

export type GeneratedCommit = {
  title: string;
  description: string;
  fullMessage: string;
  /** English; the page shows warningMsgs through t(). The commit message itself stays English, as git tooling expects. */
  warnings: string[];
  warningMsgs: { text: string; vars: Record<string, string | number> }[];
};

export const BODY_WIDTH = 72;

/**
 * Pick a Conventional Commits scope from the first changed file: the folder
 * under a top-level source folder ("src/auth/login.ts" -> "auth"), else the
 * top-level folder ("docs/setup.md" -> "docs"). Files in the repository root
 * get no scope rather than an invented one.
 */
export function deriveScope(filesChanged: string): string | undefined {
  const first = filesChanged.split(',')[0]?.trim().replace(/\\/g, '/').replace(/^\.\//, '');
  if (!first) return undefined;
  const dirs = first.split('/').filter(Boolean).slice(0, -1);
  const pick = dirs.length >= 2 ? dirs[1] : dirs[0];
  if (!pick) return undefined;
  const scope = pick.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return scope || undefined;
}

/** Wrap prose at `width` columns; a leading "- " list marker gets a hanging indent. */
export function wrapText(text: string, width = BODY_WIDTH): string {
  return text
    .split('\n')
    .map((line) => {
      const bullet = /^(\s*[-*] )/.exec(line)?.[1] ?? '';
      const indent = ' '.repeat(bullet.length);
      const words = line.slice(bullet.length).split(/\s+/).filter(Boolean);
      if (words.length === 0) return '';
      const out: string[] = [];
      let cur = bullet + words[0];
      for (const w of words.slice(1)) {
        if (cur.length + 1 + w.length > width) {
          out.push(cur);
          cur = indent + w;
        } else cur += ` ${w}`;
      }
      out.push(cur);
      return out.join('\n');
    })
    .join('\n');
}

const TESTING_LABELS: Record<string, string> = {
  unit: 'unit tests',
  integration: 'integration tests',
  e2e: 'end-to-end tests',
  manual: 'manual testing',
  performance: 'performance testing',
  security: 'security testing',
};

const oneLine = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

/**
 * Build a Conventional Commits 1.0.0 message:
 *   type(scope)!: subject
 *
 *   body wrapped at 72 columns
 *
 *   BREAKING CHANGE: footer
 * Body sections use plain "Label:" lines, not Markdown "#" headings,
 * because git strips lines that start with "#" when you edit the message.
 */
export function buildCommitMessage(inputs: CommitInputs): GeneratedCommit {
  const warningMsgs: { text: string; vars: Record<string, string | number> }[] = [];
  const warn = (text: string, vars: Record<string, string | number> = {}) => warningMsgs.push({ text, vars });
  const type = inputs.changeType.trim().toLowerCase();
  const scope = deriveScope(inputs.filesChanged);
  const subject = oneLine(inputs.changeDescription).replace(/\.+$/, '');
  const bang = inputs.breakingChange ? '!' : '';
  const title = `${type}${scope ? `(${scope})` : ''}${bang}: ${subject}`;

  if (title.length > BODY_WIDTH) {
    warn(msg('The header is {length} characters. Keep it under {max} (50 is the classic target) so it is not cut off in git log --oneline and on GitHub.'), { length: title.length, max: BODY_WIDTH });
  }
  if (/\n/.test(inputs.changeDescription.trim())) {
    warn(msg('The change description had line breaks; the header must be one line, so they were joined. Put the detail in the body instead.'));
  }

  const paragraphs: string[] = [];
  if (oneLine(inputs.bugDescription)) paragraphs.push(`Problem: ${oneLine(inputs.bugDescription)}`);
  if (oneLine(inputs.rootCause)) paragraphs.push(`Root cause: ${oneLine(inputs.rootCause)}`);
  if (inputs.testingTypes.length > 0 || oneLine(inputs.testingDescription)) {
    const kinds = inputs.testingTypes.length ? `${inputs.testingTypes.map((t) => TESTING_LABELS[t] ?? t).join(', ')}.` : '';
    paragraphs.push(`Testing: ${[kinds, oneLine(inputs.testingDescription)].filter(Boolean).join(' ')}`);
  }
  const files = inputs.filesChanged.split(',').map((f) => f.trim()).filter(Boolean);
  if (files.length) paragraphs.push(`Files changed:\n${files.map((f) => `- ${f}`).join('\n')}`);
  const notes = oneLine(inputs.additionalNotes);
  if (notes && !inputs.breakingChange) paragraphs.push(notes);

  const footers: string[] = [];
  if (inputs.breakingChange) {
    footers.push(`BREAKING CHANGE: ${notes || 'describe what callers must change before upgrading.'}`);
    if (!notes) warn(msg('Describe the breaking change in Additional Notes; it becomes the BREAKING CHANGE footer that release tools put in the changelog.'));
  }

  const description = [...paragraphs.map((p) => wrapText(p)), ...footers.map((f) => wrapText(f))].join('\n\n');
  const fullMessage = description ? `${title}\n\n${description}` : title;
  const warnings = warningMsgs.map(({ text, vars }) => text.replace(/\{(\w+)\}/g, (all, k: string) => (vars[k] === undefined ? all : String(vars[k]))));
  return { title, description, fullMessage, warnings, warningMsgs };
}
