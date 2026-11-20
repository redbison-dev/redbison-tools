/**
 * Every option each tool accepts, described once.
 *
 * The editors ask for these through a picker and the CLI takes them as flags,
 * but the set of options, their values and their defaults are a property of
 * the tool, not of the interface. Keeping them here means `redbison hash
 * --help` and the VS Code picker cannot disagree about what sha384 is called,
 * and a new option is added in one place.
 *
 * `values` means the option is a closed set and anything else is refused by
 * name. Without it the option takes free text, or a number when `type` says
 * so. `defaultValue` is what the tool does when the flag is absent; it must
 * match the implementation, and a test checks a sample of them.
 */

export type ToolOption = {
  /** The flag name, used as --<key>. */
  key: string;
  /** One line, lower case, no full stop: it is printed in a column. */
  describe: string;
  type?: 'string' | 'number' | 'boolean';
  /** A closed set of allowed values. */
  values?: { value: string; describe?: string }[];
  defaultValue?: string | number | boolean;
  /** The option must be given; the tool cannot guess it. */
  required?: boolean;
  /**
   * The option carries a second body of text rather than a setting, so the
   * CLI also accepts it as a file with @path and reads stdin for the first.
   */
  isText?: boolean;
};

const hashAlgorithms: ToolOption = {
  key: 'algorithm',
  describe: 'digest algorithm',
  defaultValue: 'sha256',
  values: [
    { value: 'sha256', describe: 'the usual choice' },
    { value: 'sha512' },
    { value: 'sha384' },
    { value: 'sha1', describe: 'broken for signatures, fine for checksums' },
    { value: 'md5', describe: 'broken for signatures, fine for checksums' },
  ],
};

const hashEncoding: ToolOption = {
  key: 'encoding',
  describe: 'how to print the digest',
  defaultValue: 'hex',
  values: [{ value: 'hex' }, { value: 'base64' }],
};

export const TOOL_OPTIONS: Record<string, ToolOption[]> = {
  /* ------------------------------------------------------------ generators */
  uuid: [
    {
      key: 'variant',
      describe: 'which kind of UUID',
      defaultValue: 'v4',
      values: [
        { value: 'v4', describe: 'random, the usual choice' },
        { value: 'v7', describe: 'time-ordered, sorts by creation, good as a database key' },
        { value: 'v4-upper', describe: 'uppercase' },
        { value: 'v4-compact', describe: '32 hex characters, no hyphens' },
        { value: 'nil', describe: 'all zeroes' },
      ],
    },
  ],
  password: [
    { key: 'length', describe: 'how many characters', type: 'number', defaultValue: 20 },
    {
      key: 'charset',
      describe: 'which characters to draw from',
      defaultValue: 'full',
      values: [
        { value: 'full', describe: 'letters, digits and symbols' },
        { value: 'alphanumeric', describe: 'letters and digits' },
        { value: 'letters' },
      ],
    },
  ],
  lorem: [
    { key: 'count', describe: 'how many to produce', type: 'number', defaultValue: 2 },
    {
      key: 'unit',
      describe: 'what to count',
      defaultValue: 'paragraphs',
      values: [{ value: 'paragraphs' }, { value: 'sentences' }, { value: 'words' }],
    },
  ],

  /* ----------------------------------------------------------------- hashes */
  hash: [hashAlgorithms, hashEncoding],
  hmac: [
    { key: 'key', describe: 'the secret key', required: true },
    hashAlgorithms,
    hashEncoding,
  ],
  'hash-compare': [
    { key: 'b', describe: 'the hash to compare against', required: true, isText: true },
  ],

  /* ------------------------------------------------------------------- text */
  'case-convert': [
    {
      key: 'style',
      describe: 'which case',
      defaultValue: 'camel',
      values: [
        { value: 'camel', describe: 'helloWorld' },
        { value: 'pascal', describe: 'HelloWorld' },
        { value: 'snake', describe: 'hello_world' },
        { value: 'kebab', describe: 'hello-world' },
        { value: 'constant', describe: 'HELLO_WORLD' },
        { value: 'title', describe: 'Hello World' },
        { value: 'upper' },
        { value: 'lower' },
      ],
    },
  ],
  'sort-lines': [
    {
      key: 'order',
      describe: 'how to order the lines',
      defaultValue: 'asc',
      values: [
        { value: 'asc', describe: 'A to Z' },
        { value: 'desc', describe: 'Z to A' },
        { value: 'natural', describe: 'file9 before file10' },
        { value: 'length', describe: 'shortest first' },
      ],
    },
  ],
  'dedupe-lines': [
    {
      key: 'compare',
      describe: 'how to decide two lines are the same',
      defaultValue: 'exact',
      values: [{ value: 'exact' }, { value: 'ignore-case' }],
    },
  ],
  'wrap-lines': [
    { key: 'width', describe: 'column to wrap at (minimum 20)', type: 'number', defaultValue: 72 },
  ],
  'lines-to-comma': [
    {
      key: 'quote',
      describe: 'how to quote each item',
      defaultValue: 'none',
      values: [{ value: 'none' }, { value: 'double' }, { value: 'single' }],
    },
    { key: 'separator', describe: 'what to join with', defaultValue: ', ' },
  ],
  'comma-to-lines': [{ key: 'separator', describe: 'what to split on', defaultValue: ',' }],
  'number-lines': [{ key: 'separator', describe: 'what to put after the number', defaultValue: '. ' }],
  'list-compare': [
    { key: 'b', describe: 'the second list', required: true, isText: true },
  ],

  /* ------------------------------------------------------------- encodings */
  'base64-encode': [
    {
      key: 'variant',
      describe: 'which alphabet',
      defaultValue: 'standard',
      values: [
        { value: 'standard', describe: '+ and /, padded' },
        { value: 'url', describe: '- and _, unpadded, safe in a URL' },
      ],
    },
  ],
  'url-encode': [
    {
      key: 'variant',
      describe: 'how much to escape',
      defaultValue: 'component',
      values: [
        { value: 'component', describe: 'escape separators too, for one parameter' },
        { value: 'uri', describe: 'keep the URL structure intact' },
      ],
    },
  ],
  'escape-characters': [
    {
      key: 'format',
      describe: 'what to escape for',
      defaultValue: 'json',
      values: [{ value: 'json' }, { value: 'html' }, { value: 'xml' }],
    },
  ],
  'to-hex': [{ key: 'separator', describe: 'what to put between bytes', defaultValue: ' ' }],

  /* ----------------------------------------------------------------- others */
  'json-format': [
    { key: 'indent', describe: 'spaces per level', type: 'number', defaultValue: 2 },
  ],
  'number-base': [
    { key: 'from', describe: 'base of the input when it carries no prefix', defaultValue: '10' },
  ],
  'regex-test': [
    { key: 'pattern', describe: 'the regular expression', required: true },
    { key: 'flags', describe: 'regular expression flags', defaultValue: 'g' },
  ],
  'date-diff': [{ key: 'to', describe: 'the second date', required: true }],
  'utm-build': [
    { key: 'source', describe: 'utm_source' },
    { key: 'medium', describe: 'utm_medium' },
    { key: 'campaign', describe: 'utm_campaign' },
    { key: 'term', describe: 'utm_term' },
    { key: 'content', describe: 'utm_content' },
  ],

  /* ----------- server-backed tools whose MCP call carries fixed arguments */
  'ascii-art': [{ key: 'font', describe: 'figlet font', defaultValue: 'Standard' }],
  'barcode-check': [
    {
      key: 'mode',
      describe: 'which barcode',
      defaultValue: 'ean13',
      values: [{ value: 'ean13' }, { value: 'ean8' }, { value: 'upca' }],
    },
  ],
  'color-palette': [
    { key: 'rule', describe: 'harmony rule', defaultValue: 'analogous' },
    { key: 'name', describe: 'a name for the palette' },
  ],
  'curl-to-code': [
    {
      key: 'target',
      describe: 'which language',
      defaultValue: 'fetch',
      values: [
        { value: 'fetch', describe: 'JavaScript fetch' },
        { value: 'python' },
        { value: 'go' },
        { value: 'php' },
      ],
    },
  ],
  gitignore: [
    { key: 'templates', describe: 'comma-separated templates, such as node,macos', required: true },
  ],
};

/** The options a tool takes, or an empty list. */
export function optionsFor(toolId: string): ToolOption[] {
  return TOOL_OPTIONS[toolId] ?? [];
}

/** Every option key any tool accepts, for the CLI's unknown-flag message. */
export const ALL_OPTION_KEYS: string[] = [
  ...new Set(Object.values(TOOL_OPTIONS).flatMap((list) => list.map((o) => o.key))),
].sort();
