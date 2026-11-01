import Link from "next/link";

/** A row of filter links kept in the URL; the current one is marked for screen readers too. */
export function AdminFilterLinks({
  label,
  current,
  links,
}: {
  label: string;
  current: string;
  links: { value: string; label: string; href: string }[];
}) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-2">
      {links.map((link) => (
        <Link
          key={link.value || "all"}
          href={link.href}
          aria-current={link.value === current ? "page" : undefined}
          className="flex min-h-target items-center rounded-field border border-border bg-card px-4 text-label leading-label hover:border-border-strong aria-[current=page]:border-foreground aria-[current=page]:font-semibold"
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
