import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/guards";
import { getContainer } from "@/server/container";
import { CARRIER_STAGE_PATHS } from "@/server/services/CarrierService";

/** The carrier home sends the carrier to the page for the stage they are at. */
export default async function CarrierPage() {
  const { user } = await requireRole("carrier");
  const { carrierService } = await getContainer();
  const access = await carrierService.getAccess(user.id);
  redirect(CARRIER_STAGE_PATHS[access.stage]);
}
