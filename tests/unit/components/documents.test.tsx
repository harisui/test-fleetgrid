import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentUploader } from "@/components/driver/DocumentUploader";
import type { Result } from "@/server/errors/AppError";
import { buildDocument, DRIVER_ID } from "../../setup/factories";

const actions = vi.hoisted(() => ({
  prepareDocumentUploadAction: vi.fn(),
  confirmDocumentUploadAction: vi.fn(),
  getDocumentPreviewUrlAction: vi.fn(),
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
const failure = (message: string, fieldErrors?: Record<string, string>): Result<never> => ({
  ok: false,
  error: { code: "VALIDATION", message, fieldErrors },
});

const MB = 1024 * 1024;
const PATH = `${DRIVER_ID}/c0000000-0000-4000-8000-000000000009.jpg`;

function fileOf(name: string, type: string, sizeBytes = 2000): File {
  return new File([new Uint8Array(sizeBytes)], name, { type });
}

const chooser = () => screen.getByLabelText("Choose a file to upload");
const list = () => screen.getByRole("list", { name: "Uploaded documents" });

async function choose(file: File) {
  // applyAccept: false lets tests pick files the accept filter would hide, like a drag and drop.
  await userEvent.upload(chooser(), file, { applyAccept: false });
}

beforeEach(() => {
  vi.clearAllMocks();
  image.prepareFileForUpload.mockImplementation(async (file: File) => file);
  actions.prepareDocumentUploadAction.mockResolvedValue(ok({ storagePath: PATH, token: "tok" }));
  upload.uploadWithToken.mockResolvedValue(true);
  actions.confirmDocumentUploadAction.mockImplementation(
    async (input: { fileName: string; type: string }) =>
      ok(
        buildDocument({
          id: "d0000000-0000-4000-8000-000000000009",
          fileName: input.fileName,
          type: input.type as "cdl_front",
          storagePath: PATH,
        }),
      ),
  );
});

describe("DocumentUploader", () => {
  it("shows an empty state without documents", () => {
    render(<DocumentUploader initialDocuments={[]} />);
    expect(screen.getByText("No documents yet")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Uploaded documents" })).not.toBeInTheDocument();
  });

  it("lists existing documents with type, name and size", () => {
    render(
      <DocumentUploader
        initialDocuments={[
          buildDocument(),
          buildDocument({
            id: "2",
            type: "medical_card",
            fileName: "medical.pdf",
            mimeType: "application/pdf",
            sizeBytes: 2 * MB,
          }),
        ]}
      />,
    );
    const items = within(list()).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("CDL (front)");
    expect(items[0]).toHaveTextContent("cdl-front.jpg · 244 KB");
    expect(items[1]).toHaveTextContent("Medical card");
    expect(items[1]).toHaveTextContent("medical.pdf · 2.0 MB");
  });

  it("offers every document type and accepts only images and PDF", async () => {
    render(<DocumentUploader initialDocuments={[]} />);
    await userEvent.click(screen.getByRole("combobox", { name: "Document type" }));
    const options = await screen.findAllByRole("option");
    // Certificates have their own tile, so the dropdown leaves them out.
    expect(options.map((option) => option.textContent)).toEqual([
      "CDL (front)",
      "CDL (back)",
      "Medical card",
      "Other",
    ]);
    await userEvent.keyboard("{Escape}");
    expect(chooser()).toHaveAttribute("accept", "image/jpeg,image/png,image/webp,application/pdf");
  });

  it("shows the Other papers tile with the certificates already uploaded", () => {
    render(
      <DocumentUploader
        initialDocuments={[
          buildDocument({
            id: "d0000000-0000-4000-8000-000000000201",
            type: "certification",
            fileName: "twic.pdf",
          }),
          buildDocument({
            id: "d0000000-0000-4000-8000-000000000202",
            type: "cdl_front",
            fileName: "front.jpg",
          }),
        ]}
      />,
    );
    const tile = screen.getByText("Other papers").closest("[data-slot=multi-upload-tile]")!;
    expect(tile).toHaveAttribute("data-count", "1");
    expect(within(tile as HTMLElement).getByText(/twic\.pdf/)).toBeInTheDocument();
    expect(within(tile as HTMLElement).queryByText(/front\.jpg/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove twic.pdf" })).toBeInTheDocument();
  });

  it("uploads: compress, reserve, send to storage, confirm, then list", async () => {
    const original = fileOf("cdl.jpg", "image/jpeg", 3 * MB);
    const compressed = fileOf("cdl.jpg", "image/jpeg", 400_000);
    image.prepareFileForUpload.mockResolvedValue(compressed);

    render(<DocumentUploader initialDocuments={[]} />);
    await userEvent.click(screen.getByRole("combobox", { name: "Document type" }));
    await userEvent.click(await screen.findByRole("option", { name: "CDL (back)" }));
    expect(screen.getByRole("combobox", { name: "Document type" })).toHaveTextContent("CDL (back)");
    await choose(original);

    await waitFor(() => expect(within(list()).getAllByRole("listitem")).toHaveLength(1));
    expect(image.prepareFileForUpload).toHaveBeenCalledWith(original);
    expect(actions.prepareDocumentUploadAction).toHaveBeenCalledWith({
      type: "cdl_back",
      fileName: "cdl.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 400_000,
    });
    expect(upload.uploadWithToken).toHaveBeenCalledWith(PATH, "tok", compressed);
    expect(actions.confirmDocumentUploadAction).toHaveBeenCalledWith({
      type: "cdl_back",
      fileName: "cdl.jpg",
      storagePath: PATH,
    });
    expect(toast.success).toHaveBeenCalledWith("Document uploaded");
    expect(screen.queryByText("No documents yet")).not.toBeInTheDocument();
  });

  it("puts the newest upload first", async () => {
    render(<DocumentUploader initialDocuments={[buildDocument()]} />);
    await choose(fileOf("new.pdf", "application/pdf"));
    await waitFor(() => expect(within(list()).getAllByRole("listitem")).toHaveLength(2));
    expect(within(list()).getAllByRole("listitem")[0]).toHaveTextContent("new.pdf");
  });

  it.each([
    ["notes.txt", "text/plain", 100, "Upload a JPG, PNG, WebP or PDF file"],
    ["anim.gif", "image/gif", 100, "Upload a JPG, PNG, WebP or PDF file"],
    ["huge.pdf", "application/pdf", 10 * MB + 1, "File must be 10 MB or smaller"],
    ["empty.pdf", "application/pdf", 0, "File is empty"],
  ])("rejects %s before anything is sent", async (name, type, size, message) => {
    render(<DocumentUploader initialDocuments={[]} />);
    await choose(fileOf(name, type, size));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(image.prepareFileForUpload).not.toHaveBeenCalled();
    expect(actions.prepareDocumentUploadAction).not.toHaveBeenCalled();
    expect(upload.uploadWithToken).not.toHaveBeenCalled();
  });

  it("rejects an image that is still over 10 MB after compression", async () => {
    image.prepareFileForUpload.mockResolvedValue(fileOf("big.jpg", "image/jpeg", 10 * MB + 1));
    render(<DocumentUploader initialDocuments={[]} />);
    await choose(fileOf("big.jpg", "image/jpeg", 9 * MB));

    expect(await screen.findByRole("alert")).toHaveTextContent("File must be 10 MB or smaller");
    expect(actions.prepareDocumentUploadAction).not.toHaveBeenCalled();
  });

  it("shows the server's reason when the upload is refused", async () => {
    actions.prepareDocumentUploadAction.mockResolvedValue(
      failure("Check the form", { mimeType: "Upload a JPG, PNG, WebP or PDF file" }),
    );
    render(<DocumentUploader initialDocuments={[]} />);
    await choose(fileOf("a.pdf", "application/pdf"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Upload a JPG, PNG, WebP or PDF file",
    );
    expect(upload.uploadWithToken).not.toHaveBeenCalled();
  });

  it("shows a general server message when there is no field error", async () => {
    actions.prepareDocumentUploadAction.mockResolvedValue(
      failure("Save your basic details before uploading documents"),
    );
    render(<DocumentUploader initialDocuments={[]} />);
    await choose(fileOf("a.pdf", "application/pdf"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Save your basic details");
  });

  it("reports a failed transfer and does not confirm", async () => {
    upload.uploadWithToken.mockResolvedValue(false);
    render(<DocumentUploader initialDocuments={[]} />);
    await choose(fileOf("a.pdf", "application/pdf"));

    expect(await screen.findByRole("alert")).toHaveTextContent("Upload failed. Please try again.");
    expect(actions.confirmDocumentUploadAction).not.toHaveBeenCalled();
    expect(screen.getByText("No documents yet")).toBeInTheDocument();
  });

  it("reports a refused confirmation (server found a bad file)", async () => {
    actions.confirmDocumentUploadAction.mockResolvedValue(
      failure("Check the form", { sizeBytes: "File must be 10 MB or smaller" }),
    );
    render(<DocumentUploader initialDocuments={[]} />);
    await choose(fileOf("a.pdf", "application/pdf"));
    expect(await screen.findByRole("alert")).toHaveTextContent("File must be 10 MB or smaller");

    actions.confirmDocumentUploadAction.mockResolvedValue(failure("Upload did not finish."));
    await choose(fileOf("b.pdf", "application/pdf"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Upload did not finish.");
  });

  it("clears a previous error on the next attempt and allows the same file again", async () => {
    render(<DocumentUploader initialDocuments={[]} />);
    await choose(fileOf("notes.txt", "text/plain"));
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    await choose(fileOf("a.pdf", "application/pdf"));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect((chooser() as HTMLInputElement).value).toBe("");
  });

  it("shows progress and locks the controls while uploading", async () => {
    let resolve!: (value: boolean) => void;
    upload.uploadWithToken.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<DocumentUploader initialDocuments={[]} />);
    await choose(fileOf("a.pdf", "application/pdf"));

    expect(await screen.findByRole("button", { name: "Uploading..." })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Document type" })).toBeDisabled();

    // A second file chosen meanwhile is ignored.
    await choose(fileOf("b.pdf", "application/pdf"));
    expect(actions.prepareDocumentUploadAction).toHaveBeenCalledOnce();

    await act(async () => resolve(true));
    expect(await screen.findByRole("button", { name: "Choose photo or PDF" })).toBeEnabled();
  });

  it("the visible button opens the file chooser", async () => {
    render(<DocumentUploader initialDocuments={[]} />);
    const click = vi.spyOn(chooser(), "click");
    await userEvent.click(screen.getByRole("button", { name: "Choose photo or PDF" }));
    expect(click).toHaveBeenCalledOnce();
  });

  describe("preview", () => {
    it("shows an image from a signed URL", async () => {
      const document = buildDocument();
      actions.getDocumentPreviewUrlAction.mockResolvedValue(
        ok({ url: "https://signed.test/a.jpg" }),
      );
      render(<DocumentUploader initialDocuments={[document]} />);
      await userEvent.click(screen.getByRole("button", { name: "Preview cdl-front.jpg" }));

      const picture = await screen.findByRole("img", { name: "CDL (front) preview" });
      expect(picture).toHaveAttribute("src", "https://signed.test/a.jpg");
      expect(actions.getDocumentPreviewUrlAction).toHaveBeenCalledWith({ documentId: document.id });
    });

    it("offers a link for a PDF", async () => {
      actions.getDocumentPreviewUrlAction.mockResolvedValue(
        ok({ url: "https://signed.test/a.pdf" }),
      );
      render(
        <DocumentUploader
          initialDocuments={[buildDocument({ mimeType: "application/pdf", fileName: "a.pdf" })]}
        />,
      );
      await userEvent.click(screen.getByRole("button", { name: "Preview a.pdf" }));

      const link = await screen.findByRole("link", { name: "Open PDF" });
      expect(link).toHaveAttribute("href", "https://signed.test/a.pdf");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });

    it("can be closed", async () => {
      actions.getDocumentPreviewUrlAction.mockResolvedValue(
        ok({ url: "https://signed.test/a.jpg" }),
      );
      render(<DocumentUploader initialDocuments={[buildDocument()]} />);
      await userEvent.click(screen.getByRole("button", { name: "Preview cdl-front.jpg" }));
      await screen.findByRole("dialog");
      await userEvent.click(screen.getByRole("button", { name: "Close" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });

    it("toasts when the link cannot be created", async () => {
      actions.getDocumentPreviewUrlAction.mockResolvedValue(failure("Document not found"));
      render(<DocumentUploader initialDocuments={[buildDocument()]} />);
      await userEvent.click(screen.getByRole("button", { name: "Preview cdl-front.jpg" }));

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Document not found"));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  describe("delete", () => {
    it("asks first, and Cancel keeps the document", async () => {
      render(<DocumentUploader initialDocuments={[buildDocument()]} />);
      await userEvent.click(screen.getByRole("button", { name: "Delete cdl-front.jpg" }));

      const dialog = await screen.findByRole("dialog");
      expect(dialog).toHaveTextContent("cdl-front.jpg will be removed permanently.");
      await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(actions.deleteDocumentAction).not.toHaveBeenCalled();
      expect(within(list()).getAllByRole("listitem")).toHaveLength(1);
    });

    it("deletes after confirmation", async () => {
      const document = buildDocument();
      actions.deleteDocumentAction.mockResolvedValue(ok(null));
      render(<DocumentUploader initialDocuments={[document]} />);
      await userEvent.click(screen.getByRole("button", { name: "Delete cdl-front.jpg" }));
      const dialog = await screen.findByRole("dialog");
      await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

      await waitFor(() => expect(screen.getByText("No documents yet")).toBeInTheDocument());
      expect(actions.deleteDocumentAction).toHaveBeenCalledWith({ documentId: document.id });
      expect(toast.success).toHaveBeenCalledWith("Document deleted");
    });

    it("keeps the document and toasts when the delete fails", async () => {
      actions.deleteDocumentAction.mockResolvedValue(failure("Something went wrong."));
      render(<DocumentUploader initialDocuments={[buildDocument()]} />);
      await userEvent.click(screen.getByRole("button", { name: "Delete cdl-front.jpg" }));
      const dialog = await screen.findByRole("dialog");
      await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Something went wrong."));
      expect(within(list()).getAllByRole("listitem")).toHaveLength(1);
    });

    it("cannot be dismissed while deleting", async () => {
      let resolve!: (value: Result<null>) => void;
      actions.deleteDocumentAction.mockReturnValue(new Promise((r) => (resolve = r)));
      render(<DocumentUploader initialDocuments={[buildDocument()]} />);
      await userEvent.click(screen.getByRole("button", { name: "Delete cdl-front.jpg" }));
      const dialog = await screen.findByRole("dialog");
      await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

      expect(await within(dialog).findByRole("button", { name: "Deleting..." })).toBeDisabled();
      expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
      await userEvent.keyboard("{Escape}");
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      await act(async () => resolve(ok(null)));
    });
  });
});
