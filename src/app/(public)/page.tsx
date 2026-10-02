import { AppShell } from "@/components/layout/AppShell";

export default function LandingPage() {
  return (
    <AppShell width="narrow">
      <div className="flex flex-col items-center py-10 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">FleetGrid</h1>
        <p className="text-muted-foreground mt-3 max-w-md text-base">
          Connecting local freight carriers with certified transport operators.
        </p>
      </div>
    </AppShell>
  );
}
