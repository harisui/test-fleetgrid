import { StatTile, StatTileGrid } from "@/components/admin/StatTile";
import type { SignupTiles as Tiles } from "@/server/services/AnalyticsService";

const pct = (value: number | null) => (value === null ? "0%" : `${value}%`);

/** Driver sign-ups today, this week and this month, and how many finish and say yes to texts. */
export function SignupTiles({ tiles }: { tiles: Tiles }) {
  return (
    <StatTileGrid label="Sign-ups" columns={6}>
      <StatTile label="Today" value={tiles.today} caption="driver sign-ups" />
      <StatTile label="This week" value={tiles.thisWeek} caption="since Monday" />
      <StatTile label="This month" value={tiles.thisMonth} caption="since the 1st" />
      <StatTile label="Complete" value={pct(tiles.completePercent)} caption="of profiles finished" />
      <StatTile label="SMS opt-in" value={pct(tiles.smsPercent)} caption="said yes to shift texts" />
    </StatTileGrid>
  );
}
