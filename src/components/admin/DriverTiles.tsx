import { StatTile, StatTileGrid } from "@/components/admin/StatTile";
import type { DriverTiles as Tiles } from "@/server/services/AdminService";
import { ROSTER_READY } from "@/lib/drivers/tiers";

/** The counts at the top of the Drivers page. */
export function DriverTiles({ tiles }: { tiles: Tiles }) {
  return (
    <StatTileGrid label="Driver counts" columns={4}>
      <StatTile label="Total" value={tiles.total} caption="every sign-up" />
      <StatTile label="Registered" value={tiles.pending} caption={`signed up, not ${ROSTER_READY}`} />
      <StatTile label={ROSTER_READY} value={tiles.approved} caption="listed to carriers" />
      <StatTile label="Blocked" value={tiles.blocked} />
      <StatTile label="Incomplete" value={tiles.incomplete} caption="card not finished" />
      <StatTile label="Missing documents" value={tiles.missingDocuments} caption="Registered, CDL or medical card to upload" />
      <StatTile label="Reminders sent" value={tiles.remindersSent} caption="for documents, last 7 days" />
      <StatTile label="Today" value={tiles.today} caption="sign-ups since midnight" />
      <StatTile label="This week" value={tiles.thisWeek} caption="sign-ups since Monday" />
    </StatTileGrid>
  );
}
