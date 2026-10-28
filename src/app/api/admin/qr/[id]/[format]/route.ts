import type { NextRequest } from "next/server";
import { renderQrPng, renderQrSvg } from "@/lib/qr/render";
import { getContainer } from "@/server/container";
import { AppError } from "@/server/errors/AppError";

/**
 * The printable code for one QR link, PNG or SVG, for the admin only. `?download=1` makes
 * the browser save it under the location's name; without it the image shows inline (the
 * preview in the sheet).
 */
export async function GET(
  request: NextRequest,
  context: RouteContext<"/api/admin/qr/[id]/[format]">,
): Promise<Response> {
  const { id, format } = await context.params;
  if (format !== "png" && format !== "svg") return Response.json({ error: "png or svg" }, { status: 404 });

  const { authService, qrService } = await getContainer();
  const user = await authService.getCurrentUser();
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401 });

  try {
    const link = await qrService.getLink(user.id, { qrLinkId: id });
    const url = qrService.shortLink(link);
    const artwork = { url, label: link.locationName, caption: url.replace(/^https?:\/\//, "") };
    const download = request.nextUrl.searchParams.get("download") === "1";
    const fileName = `fleetgrid-qr-${link.slug}.${format}`;
    const disposition = `${download ? "attachment" : "inline"}; filename="${fileName}"`;

    if (format === "svg") {
      return new Response(await renderQrSvg(artwork), {
        headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Content-Disposition": disposition, "Cache-Control": "private, no-store" },
      });
    }
    const image = await renderQrPng(artwork);
    return new Response(await image.arrayBuffer(), {
      headers: { "Content-Type": "image/png", "Content-Disposition": disposition, "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof AppError) {
      const status = error.code === "FORBIDDEN" ? 403 : error.code === "NOT_FOUND" ? 404 : 400;
      return Response.json({ error: error.message }, { status });
    }
    console.error("[FleetGrid] QR image failed:", error);
    return Response.json({ error: "Something went wrong" }, { status: 500 });
  }
}
