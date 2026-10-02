import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";

interface AuthCardProps {
  title: string;
  description?: string;
  children: ReactNode;
}

/** Shared frame for the login, verify and role screens. */
export function AuthCard({ title, description, children }: AuthCardProps) {
  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <h1 className="text-xl font-semibold">{title}</h1>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
