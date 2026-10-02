import { DOCUMENTS_BUCKET } from "@/lib/constants";
import { createBrowserClient } from "@/lib/supabase/browser";

/**
 * Sends one file from the browser straight to private storage, using the one-time token the
 * server issued for exactly this path. Returns false when storage rejects it.
 */
export async function uploadWithToken(path: string, token: string, file: File): Promise<boolean> {
  const { error } = await createBrowserClient()
    .storage.from(DOCUMENTS_BUCKET)
    .uploadToSignedUrl(path, token, file, { contentType: file.type });
  return !error;
}
