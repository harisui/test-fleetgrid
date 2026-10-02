import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <AppShell width="narrow">
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
        <p className="text-muted-foreground">The page you are looking for does not exist.</p>
        <Button asChild size="touch" className="mt-2">
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </AppShell>
  );
}
