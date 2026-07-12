import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createUploadPolicy, validateUploadPath } from "../apps/api/src/upload-policy.js";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== "POST") return response.status(405).json({ error: "Method not allowed" });
  const token = process.env.SOURCE_BLOB_READ_WRITE_TOKEN ?? process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return response.status(503).json({ error: "Source storage is not configured" });

  try {
    const result = await handleUpload({
      request,
      body: request.body as HandleUploadBody,
      token,
      onBeforeGenerateToken: async (pathname) => {
        validateUploadPath(pathname);
        return createUploadPolicy();
      },
      onUploadCompleted: async () => {
        // Job creation records the returned Blob URL. Orphan cleanup is handled separately.
      },
    });
    return response.status(200).json(result);
  } catch (error) {
    return response.status(400).json({ error: error instanceof Error ? error.message : "Upload authorization failed" });
  }
}
