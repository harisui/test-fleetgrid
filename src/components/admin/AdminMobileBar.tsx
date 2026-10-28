"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AdminNav } from "@/components/admin/AdminNav";
import { AdminSidebarFooter } from "@/components/admin/AdminSidebar";
import { Logo } from "@/components/shared/Logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ADMIN_HOME } from "@/lib/admin/nav";

/**
 * Under the lg breakpoint the sidebar becomes this bar: the wordmark and a menu button that
 * opens the same navigation in a sheet from the left edge.
 */
export function AdminMobileBar({ adminLabel }: { adminLabel: string }) {
  const [open, setOpen] = useState(false);
  return (
    <header
      data-slot="admin-mobile-bar"
      className="sticky top-0 z-40 flex h-14 items-center gap-3 border-t-4 border-primary bg-sign-panel px-4 text-sign-panel-foreground lg:hidden"
    >
      <Link href={ADMIN_HOME} className="flex items-center rounded-badge">
        <Logo height={28} />
        <span className="sr-only">FleetGrid admin</span>
      </Link>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Menu"
            className="ml-auto text-current hover:bg-sign-panel-foreground/10"
          >
            <Menu aria-hidden="true" className="size-6" />
          </Button>
        </SheetTrigger>
        <SheetContent
          side="left"
          className="border-r-0 border-t-4 border-primary bg-sign-panel text-sign-panel-foreground [&_[data-slot=sheet-close]]:text-current"
        >
          <SheetTitle className="text-sign-panel-foreground">Menu</SheetTitle>
          <SheetDescription className="sr-only">The admin pages and your account.</SheetDescription>
          <AdminNav onNavigate={() => setOpen(false)} />
          <AdminSidebarFooter adminLabel={adminLabel} />
        </SheetContent>
      </Sheet>
    </header>
  );
}
