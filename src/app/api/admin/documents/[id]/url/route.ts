import type { NextRequest } from "next/server";
import { getContainer } from "@/server/container";
import { AppError } from "@/server/errors/AppError";

/**
 * The admin opens a driver's paper from the detail sheet. The service checks the admin
 * role; the answer is a redirect to a signed link that expires after a minute.
 */
export async function GET(
  _request: NextRequest,
  context: RouteContext<"/api/admin/documents/[id]/url">,
): Promise<Response> {
  const { id } = await context.params;
  const { authService, adminService } = await getContainer();
  const user = await authService.getCurrentUser();
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401 });

  try {
    const url = await adminService.getDocumentUrl(user.id, { documentId: id });
    return Response.redirect(url, 302);
  } catch (error) {
    if (error instanceof AppError) {
      const status = error.code === "FORBIDDEN" ? 403 : error.code === "NOT_FOUND" ? 404 : 400;
      return Response.json({ error: error.message }, { status });
    }
    console.error("[FleetGrid] Admin document link failed:", error);
    return Response.json({ error: "Something went wrong" }, { status: 500 });
  }
}
