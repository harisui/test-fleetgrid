import { AppError } from "@/server/errors/AppError";
import type {
  CreateDocumentInput,
  IDocumentRepository,
  StoredFileInfo,
} from "@/server/repositories/DocumentRepository";
import type { DriverDocument } from "@/types/domain";

/** In-memory stand-in for DocumentRepository, including a fake storage bucket. */
export class FakeDocumentRepository implements IDocumentRepository {
  readonly rows = new Map<string, DriverDocument>();
  /** path -> stored file. Tests put files here to simulate the browser upload. */
  readonly files = new Map<string, StoredFileInfo>();
  readonly issuedTokens: string[] = [];
  failNextCreateWith: Error | null = null;
  failNextRemoveWith: Error | null = null;
  private sequence = 0;

  async listByDriverId(driverId: string): Promise<DriverDocument[]> {
    return [...this.rows.values()]
      .filter((row) => row.driverId === driverId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async findById(id: string): Promise<DriverDocument | null> {
    return this.rows.get(id) ?? null;
  }

  async create(input: CreateDocumentInput): Promise<DriverDocument> {
    if (this.failNextCreateWith) {
      const error = this.failNextCreateWith;
      this.failNextCreateWith = null;
      throw error;
    }
    if ([...this.rows.values()].some((row) => row.storagePath === input.storagePath)) {
      throw AppError.conflict();
    }
    this.sequence += 1;
    const document: DriverDocument = {
      id: `d0000000-0000-4000-8000-${String(this.sequence).padStart(12, "0")}`,
      ...input,
      createdAt: new Date(Date.UTC(2026, 9, 1, 12, 0, this.sequence)).toISOString(),
    };
    this.rows.set(document.id, document);
    return document;
  }

  async delete(id: string): Promise<void> {
    if (!this.rows.delete(id)) throw AppError.notFound("Document not found");
  }

  async createUploadToken(path: string): Promise<string> {
    const token = `token-for-${path}`;
    this.issuedTokens.push(token);
    return token;
  }

  async getFileInfo(path: string): Promise<StoredFileInfo | null> {
    return this.files.get(path) ?? null;
  }

  async removeFile(path: string): Promise<void> {
    if (this.failNextRemoveWith) {
      const error = this.failNextRemoveWith;
      this.failNextRemoveWith = null;
      throw error;
    }
    this.files.delete(path);
  }

  async createSignedUrl(path: string, expiresInSeconds: number): Promise<string> {
    if (!this.files.has(path)) throw AppError.notFound("Document not found");
    return `https://storage.test/${path}?expires=${expiresInSeconds}`;
  }
}
