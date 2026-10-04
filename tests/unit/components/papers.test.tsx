import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MultiUploadTile } from "@/components/driver/MultiUploadTile";
import { OnboardingDocuments } from "@/components/driver/OnboardingDocuments";
import { OTHER_PAPERS_TILE } from "@/lib/onboarding/options";
import type { Result } from "@/server/errors/AppError";
import type { DriverDocument } from "@/types/domain";
import { buildDocument, DRIVER_ID } from "../../setup/factories";

const actions = vi.hoisted(() => ({
  prepareDocumentUploadAction: vi.fn(),
  confirmDocumentUploadAction: vi.fn(),
  deleteDocumentAction: vi.fn(),
}));
const upload = vi.hoisted(() => ({ uploadWithToken: vi.fn() }));
const image = vi.hoisted(() => ({ prepareFileForUpload: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("@/server/actions/driver.actions", () => actions);
vi.mock("@/lib/supabase/upload", () => upload);
vi.mock("@/lib/image", async (original) => ({
  ...(await original<typeof import("@/lib/image")>()),
  prepareFileForUpload: image.prepareFileForUpload,
}));
vi.mock("sonner", () => ({ toast }));

const ok = <T,>(data: T): Result<T> => ({ ok: true, data });
const failure = (message: string): Result<never> => ({
  ok: false,
  error: { code: "VALIDATION", message },
});

const certificate = (index: number, fileName = `cert-${index}.pdf`): DriverDocument =>
  buildDocument({
    id: `d0000000-0000-4000-8000-00000000030${index}`,
    type: "certification",
    fileName,
    storagePath: `${DRIVER_ID}/c0000000-0000-4000-8000-00000000030${index}.pdf`,
    createdAt: `2026-10-0${index + 1}T12:00:00.000Z`,
  });

const pdf = (name: string) => new File(["%PDF-1.4"], name, { type: "application/pdf" });

describe("MultiUploadTile", () => {
  const base = {
    label: "Other papers",
    helper: "TWIC card, forklift card, other certificates",
    max: 5,
    onFile: vi.fn(),
    onRemove: vi.fn(),
  };

  it("lists each file with a Remove and shows how many are in", () => {
    render(<MultiUploadTile {...base} documents={[certificate(1), certificate(2)]} />);
    expect(screen.getByText("2 of 5")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Other papers files" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove cert-1.pdf" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove cert-2.pdf" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Take a photo" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Choose from phone" })).toBeEnabled();
  });

  it("stops offering uploads when full and says why", () => {
    render(
      <MultiUploadTile {...base} documents={[1, 2, 3, 4, 5].map((index) => certificate(index))} />,
    );
    expect(screen.getByText("5 of 5")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Take a photo" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Choose from phone" })).not.toBeInTheDocument();
    expect(screen.getByText(/You can add up to 5 other papers/)).toBeInTheDocument();
  });

  it("shows an error in the tile and offers Try again", () => {
    render(<MultiUploadTile {...base} documents={[]} error="File must be 10 MB or smaller" />);
    expect(screen.getByRole("alert")).toHaveTextContent("File must be 10 MB or smaller");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("shows the upload status and hides the buttons while a file is on its way", () => {
    render(<MultiUploadTile {...base} documents={[]} status="Uploading..." />);
    expect(screen.getByRole("progressbar", { name: "Other papers upload" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Take a photo" })).not.toBeInTheDocument();
  });
});

describe("OnboardingDocuments with the Other papers tile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    image.prepareFileForUpload.mockImplementation(async (file: File) => file);
    upload.uploadWithToken.mockResolvedValue(true);
  });

  it("keeps earlier certificates when another is added", async () => {
    const existing = certificate(1, "twic.pdf");
    const added = certificate(2, "forklift.pdf");
    actions.prepareDocumentUploadAction.mockResolvedValue(
      ok({ storagePath: added.storagePath, token: "tok" }),
    );
    actions.confirmDocumentUploadAction.mockResolvedValue(ok(added));
    const onChange = vi.fn();
    render(
      <OnboardingDocuments
        documents={[existing]}
        onChange={onChange}
        tiles={[OTHER_PAPERS_TILE]}
      />,
    );

    await userEvent.upload(
      screen.getByLabelText("Choose a file for other papers"),
      pdf("forklift.pdf"),
    );

    await waitFor(() => expect(onChange).toHaveBeenCalledWith([added, existing]));
    expect(actions.prepareDocumentUploadAction).toHaveBeenCalledWith(
      expect.objectContaining({ type: "certification", fileName: "forklift.pdf" }),
    );
    expect(actions.deleteDocumentAction).not.toHaveBeenCalled();
  });

  it("removes one file and leaves the others", async () => {
    actions.deleteDocumentAction.mockResolvedValue(ok(undefined));
    const onChange = vi.fn();
    const docs = [certificate(1), certificate(2)];
    render(
      <OnboardingDocuments documents={docs} onChange={onChange} tiles={[OTHER_PAPERS_TILE]} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Remove cert-1.pdf" }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith([docs[1]]));
    expect(actions.deleteDocumentAction).toHaveBeenCalledWith({ documentId: docs[0].id });
  });

  it("shows the server's limit message in the tile", async () => {
    actions.prepareDocumentUploadAction.mockResolvedValue(
      failure("You can add up to 5 other papers"),
    );
    render(<OnboardingDocuments documents={[]} onChange={vi.fn()} tiles={[OTHER_PAPERS_TILE]} />);
    await userEvent.upload(screen.getByLabelText("Choose a file for other papers"), pdf("six.pdf"));
    const tile = screen.getByText("Other papers").closest("[data-slot=multi-upload-tile]")!;
    expect(await within(tile as HTMLElement).findByRole("alert")).toHaveTextContent(
      "You can add up to 5 other papers",
    );
  });
});
