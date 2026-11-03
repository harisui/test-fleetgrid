import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DocReminderButton } from "@/components/admin/DocReminderButton";
import { docReminderText } from "@/content/sms-samples";
import { DOC_REMINDER_TEMPLATE, type DocReminderPreview } from "@/server/services/DocReminderService";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const actions = vi.hoisted(() => ({ previewDocReminderAction: vi.fn(), sendDocReminderAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/server/actions/docReminder.actions", () => actions);
// The service module is read for its template only; its server imports never run here.
vi.mock("@/server/services/BroadcastService", () => ({ inBatches: vi.fn(), SEND_CONCURRENCY: 10 }));

const DRIVER_ID = "d0000000-0000-4000-8000-000000000001";

const preview = (overrides: Partial<DocReminderPreview> = {}): DocReminderPreview => ({
  body: DOC_REMINDER_TEMPLATE,
  characters: 138,
  segments: 1,
  count: 2,
  excluded: { optedOut: 1, noConsent: 3, recent: 4 },
  byItems: { "CDL photos": 0, "medical card": 1, "CDL photos and medical card": 1 },
  sendAfter: null,
  blocked: null,
  confirmPhrase: "SEND 2",
  ...overrides,
});

describe("DocReminderButton (CR-5)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("bulk: shows the count, each wording, who is left out and why, and sends only after SEND {N}", async () => {
    actions.previewDocReminderAction.mockResolvedValue({ ok: true, data: preview() });
    actions.sendDocReminderAction.mockResolvedValue({ ok: true, data: { status: "sent" } });
    render(<DocReminderButton initial={preview()} />);
    await userEvent.click(screen.getByRole("button", { name: "Remind all drivers missing documents" }));
    const dialog = await screen.findByRole("dialog", { name: "Remind all drivers missing documents?" });
    expect(within(dialog).getByText(DOC_REMINDER_TEMPLATE)).toBeInTheDocument();
    expect(within(dialog).getByText("2 drivers will receive this.")).toBeInTheDocument();
    expect(within(dialog).getByText("medical card: 1")).toBeInTheDocument();
    expect(within(dialog).getByText("Left out: 1 opted out, 3 without consent, 4 reminded in the last 3 days.")).toBeInTheDocument();
    const send = within(dialog).getByRole("button", { name: "Send reminders" });
    expect(send).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText("Type SEND 2 to send"), "SEND 2");
    expect(send).toBeEnabled();
    await userEvent.click(send);
    await waitFor(() => expect(actions.sendDocReminderAction).toHaveBeenCalledWith({ confirm: "SEND 2" }));
    expect(toast.success).toHaveBeenCalledWith("Reminders sent");
    expect(router.refresh).toHaveBeenCalled();
  });

  it("is disabled with the reason when nobody can get one", () => {
    render(<DocReminderButton initial={preview({ count: 0, blocked: "No Registered driver missing documents can get a reminder now." })} />);
    const button = screen.getByRole("button", { name: "Remind all drivers missing documents" });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription("No Registered driver missing documents can get a reminder now.");
  });

  it("one driver: the exact text in a dialog, and 7 AM at night", async () => {
    const one = preview({ body: docReminderText("medical card"), count: 1, confirmPhrase: "SEND 1", sendAfter: "2026-11-06T13:00:00.000Z" });
    actions.previewDocReminderAction.mockResolvedValue({ ok: true, data: one });
    actions.sendDocReminderAction.mockResolvedValue({ ok: true, data: { status: "queued" } });
    render(<DocReminderButton driverId={DRIVER_ID} name="Pat Driver" initial={one} />);
    await userEvent.click(screen.getByRole("button", { name: "Send documents reminder" }));
    const dialog = await screen.findByRole("dialog", { name: "Send the documents reminder to Pat Driver?" });
    expect(within(dialog).getByText(docReminderText("medical card"))).toBeInTheDocument();
    expect(within(dialog).getByText("Sends at 7:00 AM")).toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/Type SEND/)).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Queue for 7:00 AM" }));
    await waitFor(() => expect(actions.sendDocReminderAction).toHaveBeenCalledWith({ driverId: DRIVER_ID }));
    expect(toast.success).toHaveBeenCalledWith("Queued for 7:00 AM");
  });

  it("one driver reminded in the last 3 days: disabled with the reason", () => {
    render(
      <DocReminderButton
        driverId={DRIVER_ID}
        name="Pat Driver"
        initial={preview({ count: 0, blocked: "A documents reminder went to this driver in the last 3 days." })}
      />,
    );
    expect(screen.getByRole("button", { name: "Send documents reminder" })).toHaveAccessibleDescription(
      "A documents reminder went to this driver in the last 3 days.",
    );
  });

  it("reports a refused send and reloads the counts", async () => {
    actions.previewDocReminderAction.mockResolvedValue({ ok: true, data: preview() });
    actions.sendDocReminderAction.mockResolvedValue({
      ok: false,
      error: { code: "VALIDATION", message: "The list changed", fieldErrors: { confirm: "Type SEND 1" } },
    });
    render(<DocReminderButton initial={preview()} />);
    await userEvent.click(screen.getByRole("button", { name: "Remind all drivers missing documents" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Type SEND 2 to send"), "SEND 2");
    await userEvent.click(within(dialog).getByRole("button", { name: "Send reminders" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Type SEND 1"));
    expect(actions.previewDocReminderAction).toHaveBeenCalledTimes(2);
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
