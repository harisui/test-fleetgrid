import { randomUUID } from "node:crypto";
import {
  CERTIFICATION_DOCUMENTS_MAX,
  CERTIFICATION_LIMIT_MESSAGE,
  MIME_EXTENSION,
  SIGNED_URL_TTL_SECONDS,
} from "@/lib/constants";
import {
  confirmUploadSchema,
  documentIdSchema,
  documentUploadSchema,
} from "@/lib/validation/document.schema";
import { AppError, parseInput } from "@/server/errors/AppError";
import type { IDocumentRepository } from "@/server/repositories/DocumentRepository";
import type { IDriverRepository } from "@/server/repositories/DriverRepository";
import type { IProfileRepository } from "@/server/repositories/ProfileRepository";
import type { DocumentType, Driver, DriverDocument } from "@/types/domain";

export interface PreparedUpload {
  /** Where the file must be stored: {driver_id}/{uuid}.{ext} */
  storagePath: string;
  /** One-time token that lets the browser send the file straight to private storage. */
  token: string;
}

/**
 * Document uploads happen in two steps so large files never pass through the app server:
 *
 *   1. prepareUpload: validate type and size, reserve a path, return a one-time upload token.
 *   2. The browser sends the file to storage with that token.
 *   3. confirmUpload: check what actually arrived (real size and type), then record it.
 */
export class DocumentService {
  constructor(
    private readonly documents: IDocumentRepository,
    private readonly drivers: IDriverRepository,
    private readonly profiles: IProfileRepository,
    private readonly newId: () => string = randomUUID,
  ) {}

  /** The driver's own documents, newest first. Empty before the card exists. */
  async list(userId: string): Promise<DriverDocument[]> {
    await this.requireDriverProfile(userId);
    const driver = await this.drivers.findByProfileId(userId);
    if (!driver) return [];
    return this.documents.listByDriverId(driver.id);
  }

  async prepareUpload(userId: string, input: unknown): Promise<PreparedUpload> {
    const driver = await this.requireDriver(userId);
    const { type, mimeType } = parseInput(documentUploadSchema, input);
    await this.requireRoomFor(driver, type);

    const storagePath = `${driver.id}/${this.newId()}.${MIME_EXTENSION[mimeType]}`;
    const token = await this.documents.createUploadToken(storagePath);
    return { storagePath, token };
  }

  async confirmUpload(userId: string, input: unknown): Promise<DriverDocument> {
    const driver = await this.requireDriver(userId);
    const { type, fileName, storagePath } = parseInput(confirmUploadSchema, input);

    // Only files in the driver's own folder can be recorded.
    if (!storagePath.startsWith(`${driver.id}/`)) {
      throw AppError.forbidden("This file could not be saved");
    }
    await this.requireRoomFor(driver, type);

    const file = await this.documents.getFileInfo(storagePath);
    if (!file) throw AppError.validation("Upload did not finish. Please try again.");

    // Validate what actually arrived, not what the browser claimed.
    const checked = documentUploadSchema.safeParse({
      type,
      fileName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
    });
    if (!checked.success) {
      await this.documents.removeFile(storagePath).catch(() => undefined);
      throw AppError.fromZod(checked.error);
    }

    try {
      return await this.documents.create({
        driverId: driver.id,
        type,
        storagePath,
        fileName,
        mimeType: checked.data.mimeType,
        sizeBytes: checked.data.sizeBytes,
      });
    } catch (error) {
      // Confirming the same upload twice keeps the first record and the file.
      if (error instanceof AppError && error.code === "CONFLICT") {
        const existing = (await this.documents.listByDriverId(driver.id)).find(
          (document) => document.storagePath === storagePath,
        );
        if (existing) return existing;
      }
      await this.documents.removeFile(storagePath).catch(() => undefined);
      throw error;
    }
  }

  /** A short-lived link to one of the driver's own documents. */
  async getPreviewUrl(userId: string, input: unknown): Promise<string> {
    const document = await this.requireOwnDocument(userId, input);
    return this.documents.createSignedUrl(document.storagePath, SIGNED_URL_TTL_SECONDS);
  }

  async delete(userId: string, input: unknown): Promise<void> {
    const document = await this.requireOwnDocument(userId, input);
    await this.documents.removeFile(document.storagePath);
    await this.documents.delete(document.id);
  }

  private async requireOwnDocument(userId: string, input: unknown): Promise<DriverDocument> {
    const driver = await this.requireDriver(userId);
    const { documentId } = parseInput(documentIdSchema, input);

    const document = await this.documents.findById(documentId);
    // Same answer for "does not exist" and "belongs to someone else".
    if (!document || document.driverId !== driver.id) {
      throw AppError.notFound("Document not found");
    }
    return document;
  }

  /** "Other papers" are capped; the database trigger (0008) enforces the same limit. */
  private async requireRoomFor(driver: Driver, type: DocumentType): Promise<void> {
    if (type !== "certification") return;
    const existing = await this.documents.listByDriverId(driver.id);
    const count = existing.filter((document) => document.type === "certification").length;
    if (count >= CERTIFICATION_DOCUMENTS_MAX) {
      throw AppError.validation(CERTIFICATION_LIMIT_MESSAGE, { type: CERTIFICATION_LIMIT_MESSAGE });
    }
  }

  private async requireDriver(userId: string): Promise<Driver> {
    await this.requireDriverProfile(userId);
    const driver = await this.drivers.findByProfileId(userId);
    if (!driver) throw AppError.validation("Save your basic details before uploading documents");
    return driver;
  }

  private async requireDriverProfile(userId: string): Promise<void> {
    const profile = await this.profiles.findById(userId);
    if (!profile || profile.role !== "driver") {
      throw AppError.forbidden("Only drivers can do this");
    }
    if (profile.status === "blocked") {
      throw AppError.forbidden("Your account has been blocked. Contact support for help.");
    }
  }
}
