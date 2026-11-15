import Link from "next/link";
import { Fragment } from "react";
import { LegalHeading } from "@/components/layout/LegalPage";
import { parseLegalMarkdown, type Inline, type ListItem } from "@/lib/legal/markdown";

const linkClass = "text-foreground underline underline-offset-4";

function InlineText({ content }: { content: Inline[] }) {
  return content.map((part, index) => {
    if (part.kind === "break") return <br key={index} />;
    if (part.kind === "text") return <Fragment key={index}>{part.text}</Fragment>;
    if (part.href.startsWith("/")) {
      return (
        <Link key={index} href={part.href} className={linkClass}>
          {part.text}
        </Link>
      );
    }
    return (
      <a key={index} href={part.href} className={linkClass}>
        {part.text}
      </a>
    );
  });
}

function Items({ items }: { items: ListItem[] }) {
  return (
    <ul>
      {items.map((item, index) => (
        <li key={index}>
          <InlineText content={item.content} />
          {item.children.length > 0 && <Items items={item.children} />}
        </li>
      ))}
    </ul>
  );
}

/**
 * A legal text from src/content/legal, rendered for LegalPage (or the driver's acceptance page)
 * exactly as written: what is shown is what is archived.
 */
export function LegalBody({ body }: { body: string }) {
  return parseLegalMarkdown(body).map((block, index) => {
    if (block.kind === "heading") return <LegalHeading key={index}>{block.text}</LegalHeading>;
    if (block.kind === "list") return <Items key={index} items={block.items} />;
    return (
      <p key={index}>
        <InlineText content={block.content} />
      </p>
    );
  });
}
