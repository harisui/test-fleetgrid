import { DOCUMENTS_BUCKET } from "@/lib/constants";
import { AppError } from "@/server/errors/AppError";
import { BaseRepository } from "@/server/repositories/BaseRepository";
import type { Database } from "@/types/database.types";
import type { DocumentType, DriverDocument } from "@/types/domain";

type DocumentRow = Database["public"]["Tables"]["driver_documents"]["Row"];

export interface CreateDocumentInput {
  driverId: string;
  type: DocumentType;
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface StoredFileInfo {
  sizeBytes: number;
  mimeType: string;
}

export interface IDocumentRepository {
  listByDriverId(driverId: string): Promise<DriverDocument[]>;
  findById(id: string): Promise<DriverDocument | null>;
  create(input: CreateDocumentInput): Promise<DriverDocument>;
  delete(id: string): Promise<void>;
  /** One-time token that lets the browser upload one file to this exact path. */
  createUploadToken(path: string): Promise<string>;
  /** Real size and type of a stored file, or null when nothing is stored at the path. */
  getFileInfo(path: string): Promise<StoredFileInfo | null>;
  removeFile(path: string): Promise<void>;
  createSignedUrl(path: string, expiresInSeconds: number): Promise<string>;
}

export function mapDocument(row: DocumentRow): DriverDocument {
  return {
    id: row.id,
    driverId: row.driver_id,
    type: row.type,
    storagePath: row.storage_path,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
  };
}

export class DocumentRepository extends BaseRepository implements IDocumentRepository {
  private get bucket() {
    return this.supabase.storage.from(DOCUMENTS_BUCKET);
  }

  async listByDriverId(driverId: string): Promise<DriverDocument[]> {
    const result = await this.supabase
      .from("driver_documents")
      .select("*")
      .eq("driver_id", driverId)
      .order("created_at", { ascending: false });
    return this.unwrap(result).map(mapDocument);
  }

  async findById(id: string): Promise<DriverDocument | null> {
    const result = await this.supabase
      .from("driver_documents")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    const row = this.unwrapMaybe(result);
    return row ? mapDocument(row) : null;
  }

  async create(input: CreateDocumentInput): Promise<DriverDocument> {
    const result = await this.supabase
      .from("driver_documents")
      .insert({
        driver_id: input.driverId,
        type: input.type,
        storage_path: input.storagePath,
        file_name: input.fileName,
        mime_type: input.mimeType,
        size_bytes: input.sizeBytes,
      })
      .select("*")
      .single();
    return mapDocument(this.unwrap(result));
  }

  async delete(id: string): Promise<void> {
    const result = await this.supabase.from("driver_documents").delete().eq("id", id).select("id");
    if (this.unwrap(result).length === 0) throw AppError.notFound("Document not found");
  }

  async createUploadToken(path: string): Promise<string> {
    const { data, error } = await this.bucket.createSignedUploadUrl(path);
    if (error || !data) {
      // Storage rejects paths outside the driver's own folder. Details stay out of the UI.
      throw new AppError("FORBIDDEN", "This file could not be uploaded", { cause: error });
    }
    return data.token;
  }

  async getFileInfo(path: string): Promise<StoredFileInfo | null> {
    const { data, error } = await this.bucket.info(path);
    if (error || !data) return null;
    return { sizeBytes: data.size ?? 0, mimeType: data.contentType ?? "" };
  }

  async removeFile(path: string): Promise<void> {
    const { error } = await this.bucket.remove([path]);
    if (error) throw AppError.internal(error);
  }

  async createSignedUrl(path: string, expiresInSeconds: number): Promise<string> {
    const { data, error } = await this.bucket.createSignedUrl(path, expiresInSeconds);
    if (error || !data) {
      throw new AppError("NOT_FOUND", "Document not found", { cause: error });
    }
    return data.signedUrl;
  }
}
