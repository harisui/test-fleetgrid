import { randomInt, randomUUID } from "node:crypto";
import { FAKE_PHONE_PREFIX } from "@/lib/dev/phones";
import { BaseRepository } from "@/server/repositories/BaseRepository";
import type { Database } from "@/types/database.types";
import type { AccountStatus } from "@/types/domain";

export interface FakePhone {
  phone: string;
  fullName: string;
  status: AccountStatus;
  smsOptIn: boolean;
  smsOptedOut: boolean;
  shiftsPaused: boolean;
}

export interface FakePhoneText {
  id: string;
  direction: "inbound" | "outbound";
  kind: string;
  body: string;
  status: string;
  at: string;
}

export type FakeDriverColumns = Partial<Database["public"]["Tables"]["drivers"]["Insert"]>;

const REQUIRED_DOCUMENTS = ["cdl_front", "cdl_back", "medical_card"] as const;

/** The simulated phones (local only, see devPhonesEnabled). Runs with the service role. */
export class DevPhonesRepository extends BaseRepository {
  async listPhones(): Promise<FakePhone[]> {
    const rows = this.unwrap(
      await this.supabase
        .from("drivers")
        .select("full_name, sms_opt_in, sms_opted_out, shifts_paused, profiles!inner(phone, status)")
        .like("profiles.phone", `${FAKE_PHONE_PREFIX}%`)
        .order("created_at", { ascending: false })
        .limit(200),
    );
    return rows.map((row) => ({
      phone: row.profiles.phone,
      fullName: row.full_name,
      status: row.profiles.status,
      smsOptIn: row.sms_opt_in,
      smsOptedOut: row.sms_opted_out,
      shiftsPaused: row.shifts_paused,
    }));
  }

  /** Every text to and from this number, oldest first. */
  async thread(phone: string): Promise<FakePhoneText[]> {
    const rows = this.unwrap(
      await this.supabase
        .from("sms_messages_current")
        .select("id, direction, kind, body, status, created_at")
        .or(`to_phone.eq.${phone},from_phone.eq.${phone}`)
        .order("created_at", { ascending: true })
        .limit(200),
    );
    return rows.map((row) => ({
      id: row.id ?? "",
      direction: row.direction === "inbound" ? "inbound" : "outbound",
      kind: row.kind ?? "",
      body: row.body ?? "",
      status: row.status ?? "",
      at: row.created_at ?? "",
    }));
  }

  /** A driver on a fresh +1 555 number. Roster-Ready goes through the database's own check. */
  async createDriver(fullName: string, columns: FakeDriverColumns, rosterReady: boolean): Promise<string> {
    const phone = `${FAKE_PHONE_PREFIX}7${String(randomInt(0, 1_000_000)).padStart(6, "0")}`;
    const { data, error } = await this.supabase.auth.admin.createUser({ phone, password: `pw-${randomUUID()}`, phone_confirm: true });
    if (error || !data.user) throw new Error(`The fake driver was not created: ${error?.message}`);
    const id = data.user.id;
    this.unwrap(await this.supabase.from("profiles").insert({ id, phone, role: "driver", status: "pending" }).select("id"));
    const [driver] = this.unwrap(await this.supabase.from("drivers").insert({ profile_id: id, full_name: fullName, ...columns }).select("id"));
    if (rosterReady && driver) {
      this.unwrap(
        await this.supabase
          .from("driver_documents")
          .insert(REQUIRED_DOCUMENTS.map((type) => ({ driver_id: driver.id, type, storage_path: `${driver.id}/${type}.png`, file_name: `${type}.png`, mime_type: "image/png", size_bytes: 68 })))
          .select("id"),
      );
      this.unwrap(await this.supabase.from("profiles").update({ status: "approved" }).eq("id", id).select("id"));
    }
    return phone;
  }
}
