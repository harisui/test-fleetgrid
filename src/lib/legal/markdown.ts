/**
 * The small markdown the legal texts are written in (src/content/legal): "## " headings,
 * paragraphs, "- " lists with one level of nesting, [links](/path) and a trailing backslash for
 * a line break. Anything else is plain text: the text is shown exactly as written.
 */

export type Inline = { kind: "text"; text: string } | { kind: "link"; text: string; href: string } | { kind: "break" };

export interface ListItem {
  content: Inline[];
  children: ListItem[];
}

export type Block =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; content: Inline[] }
  | { kind: "list"; items: ListItem[] };

const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;

/** Links and line breaks inside a run of text. */
export function parseInline(source: string): Inline[] {
  const out: Inline[] = [];
  const lines = source.split("\n");
  lines.forEach((line, index) => {
    const hardBreak = line.endsWith("\\");
    const text = hardBreak ? line.slice(0, -1) : line;
    let last = 0;
    for (const match of text.matchAll(LINK)) {
      if (match.index > last) out.push({ kind: "text", text: text.slice(last, match.index) });
      out.push({ kind: "link", text: match[1], href: match[2] });
      last = match.index + match[0].length;
    }
    if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
    if (index < lines.length - 1) out.push(hardBreak ? { kind: "break" } : { kind: "text", text: " " });
  });
  return out;
}

function parseList(lines: string[]): ListItem[] {
  const items: ListItem[] = [];
  let current: { item: ListItem; text: string[] } | null = null;
  let child: { item: ListItem; text: string[] } | null = null;
  const close = () => {
    if (child) child.item.content = parseInline(child.text.join("\n"));
    if (current) current.item.content = parseInline(current.text.join("\n"));
  };
  for (const line of lines) {
    if (line.startsWith("- ")) {
      close();
      child = null;
      current = { item: { content: [], children: [] }, text: [line.slice(2)] };
      items.push(current.item);
    } else if (line.startsWith("  - ") && current) {
      if (child) child.item.content = parseInline(child.text.join("\n"));
      child = { item: { content: [], children: [] }, text: [line.slice(4)] };
      current.item.children.push(child.item);
    } else if (line.startsWith("    ") && child) {
      child.text.push(line.trim());
    } else if (line.startsWith("  ") && current) {
      current.text.push(line.trim());
    } else {
      throw new Error(`Legal markdown: a list line must start with "- " or two spaces: "${line}"`);
    }
  }
  close();
  return items;
}

/** The blocks of a legal text, in order. */
export function parseLegalMarkdown(body: string): Block[] {
  const blocks: Block[] = [];
  for (const chunk of body.replace(/\r\n/g, "\n").split(/\n{2,}/)) {
    const text = chunk.replace(/^\n+|\n+$/g, "");
    if (!text) continue;
    if (text.startsWith("## ")) {
      if (text.includes("\n")) throw new Error(`Legal markdown: a heading stands alone: "${text}"`);
      blocks.push({ kind: "heading", text: text.slice(3).trim() });
    } else if (text.startsWith("- ")) {
      blocks.push({ kind: "list", items: parseList(text.split("\n")) });
    } else {
      blocks.push({ kind: "paragraph", content: parseInline(text) });
    }
  }
  return blocks;
}

/** The "## " headings, in order, for a table of contents. */
export function legalHeadings(body: string): string[] {
  return parseLegalMarkdown(body).flatMap((block) => (block.kind === "heading" ? [block.text] : []));
}
