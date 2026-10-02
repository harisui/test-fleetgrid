import type { Metadata } from "next";

export const metadata: Metadata = { title: "My profile" };

export default function DriverProfilePage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">My profile</h1>
      <p className="text-muted-foreground mt-2">Your qualification card will appear here.</p>
    </div>
  );
}
