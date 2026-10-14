"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Button } from "@/components/ui/button";
import { HEADER_CTA, LOGIN_LINK, NAV_LINKS } from "@/content/marketing";

/**
 * The phone menu: a button in the header opens a full-height sheet with the same links as
 * the desktop navigation, each 56px tall. Radix traps focus while it is open, closes it on
 * Escape and returns focus to the button. It also closes itself when the route changes.
 */
export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  // A route change closes the sheet: state adjusted during render, as React recommends.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  const linkClass =
    "flex h-target-lg items-center rounded-button px-4 text-button leading-button font-bold hover:bg-muted";

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Menu"
          className="md:hidden"
          data-slot="menu-button"
        >
          <Menu aria-hidden="true" className="size-6" />
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-sign-panel/70 duration-(--motion-base) data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Content
          data-slot="mobile-menu"
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col gap-2 border-l border-border bg-background p-4 text-foreground shadow-2 duration-(--motion-base) data-open:animate-in data-open:slide-in-from-right data-closed:animate-out data-closed:slide-out-to-right"
        >
          <div className="flex items-center justify-between">
            <DialogPrimitive.Title className="font-heading text-h2 leading-h2 font-semibold">
              Menu
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              Pages of the FleetGrid site
            </DialogPrimitive.Description>
            <DialogPrimitive.Close asChild>
              <Button type="button" variant="ghost" size="icon" aria-label="Close menu">
                <X aria-hidden="true" className="size-6" />
              </Button>
            </DialogPrimitive.Close>
          </div>
          <nav aria-label="Main mobile">
            <ul className="flex flex-col">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className={linkClass}>
                    {link.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link href={LOGIN_LINK.href} className={linkClass}>
                  {LOGIN_LINK.label}
                </Link>
              </li>
            </ul>
          </nav>
          <Button asChild className="mt-2 w-full">
            <Link href={HEADER_CTA.href}>{HEADER_CTA.label}</Link>
          </Button>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
