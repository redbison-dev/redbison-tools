/**
 * XML pretty-printing and minifying on top of the browser's DOMParser.
 * Keeps comments, CDATA sections, processing instructions and the DOCTYPE,
 * re-escapes text and attribute values, and never adds whitespace inside
 * mixed content or xml:space="preserve" elements, where it would change data.
 */

const ELEMENT = 1, TEXT = 3, CDATA = 4, PI = 7, COMMENT = 8, DOCTYPE = 10;

export function parseXml(input: string): Document {
  const doc = new DOMParser().parseFromString(input, 'text/xml');
  const err = doc.getElementsByTagName('parsererror')[0];
  if (err) {
    const msg = (err.textContent || 'Invalid XML').replace(/\s+/g, ' ').trim();
    throw new Error(msg || 'Invalid XML');
  }
  return doc;
}

const escText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
    .replace(/\t/g, '&#9;').replace(/\n/g, '&#10;').replace(/\r/g, '&#13;');

const openTag = (el: Element) => {
  const attrs = Array.from(el.attributes).map((a) => ` ${a.name}="${escAttr(a.value)}"`).join('');
  return `<${el.tagName}${attrs}`;
};

const isBlank = (n: Node) => n.nodeType === TEXT && !(n.nodeValue || '').trim();

/** Serializes a node exactly, without adding or removing whitespace. */
function exact(node: Node): string {
  switch (node.nodeType) {
    case TEXT: return escText(node.nodeValue || '');
    case CDATA: return `<![CDATA[${node.nodeValue || ''}]]>`;
    case COMMENT: return `<!--${node.nodeValue || ''}-->`;
    case PI: return `<?${(node as ProcessingInstruction).target}${node.nodeValue ? ` ${node.nodeValue}` : ''}?>`;
    case DOCTYPE: return new XMLSerializer().serializeToString(node);
    case ELEMENT: {
      const el = node as Element;
      if (!el.childNodes.length) return `${openTag(el)}/>`;
      return `${openTag(el)}>${Array.from(el.childNodes).map(exact).join('')}</${el.tagName}>`;
    }
    default: return '';
  }
}

const preservesSpace = (el: Element): boolean => {
  for (let cur: Element | null = el; cur; cur = cur.parentElement) {
    const v = cur.getAttribute('xml:space');
    if (v === 'preserve') return true;
    if (v === 'default') return false;
  }
  return false;
};

function pretty(node: Node, depth: number, tab: string): string {
  const pad = tab.repeat(depth);
  if (node.nodeType !== ELEMENT) return pad + exact(node).trim();
  const el = node as Element;
  const children = Array.from(el.childNodes);
  if (!children.length) return `${pad}${openTag(el)}/>`;
  // CDATA is character data too, so an element holding one is mixed content.
  const hasText = children.some((c) => (c.nodeType === TEXT && !isBlank(c)) || c.nodeType === CDATA);
  // Leaf text, mixed content and xml:space="preserve" are printed verbatim.
  if (hasText || preservesSpace(el)) {
    return pad + exact(el);
  }
  const inner = children.filter((c) => !isBlank(c)).map((c) => pretty(c, depth + 1, tab));
  if (!inner.length) return `${pad}${openTag(el)}/>`;
  return `${pad}${openTag(el)}>\n${inner.join('\n')}\n${pad}</${el.tagName}>`;
}

function minified(node: Node): string {
  if (node.nodeType !== ELEMENT) return exact(node);
  const el = node as Element;
  const children = Array.from(el.childNodes);
  if (!children.length) return `${openTag(el)}/>`;
  const hasText = children.some((c) => c.nodeType === TEXT && !isBlank(c));
  if (hasText || preservesSpace(el)) return exact(el);
  const kept = children.filter((c) => !isBlank(c));
  if (!kept.length) return `${openTag(el)}/>`;
  return `${openTag(el)}>${kept.map(minified).join('')}</${el.tagName}>`;
}

const declarationOf = (input: string) => input.trim().match(/^<\?xml[^>]*\?>/)?.[0];

export function beautifyXml(input: string, indent = '  '): string {
  const doc = parseXml(input);
  const parts: string[] = [];
  const decl = declarationOf(input);
  if (decl) parts.push(decl);
  Array.from(doc.childNodes).forEach((n) => { if (!isBlank(n)) parts.push(pretty(n, 0, indent)); });
  return parts.join('\n');
}

export function minifyXml(input: string): string {
  const doc = parseXml(input);
  const decl = declarationOf(input) ?? '';
  return decl + Array.from(doc.childNodes).filter((n) => !isBlank(n)).map(minified).join('');
}
