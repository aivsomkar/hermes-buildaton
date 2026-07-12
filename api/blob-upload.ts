import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import type { VercelRequest, VercelResponse } from "@vercel/node";

// Inlined upload policy: this function must stay self-contained — importing from
// apps/api (an ESM package) crashes the CJS-compiled function at runtime.
const ALLOWED_CONTENT_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const MAX_BYTES = 200 * 1024 * 1024;

function validateUploadPath(pathname: string): void {
  const name = pathname.startsWith("inspirations/") ? pathname.slice("inspirations/".length) : null;
  if (!name || name.includes("/") || name.includes("\\") || name.includes("..") || !/\.(mp4|mov|webm)$/i.test(name)) {
    throw new Error("Invalid upload path");
  }
}

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
        return {
          access: "private",
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: MAX_BYTES,
          addRandomSuffix: true,
          allowOverwrite: false,
        };
      },
      onUploadCompleted: async () => {
        // Job creation records the returned Blob pathname; orphan cleanup is separate.
      },
    });
    return response.status(200).json(result);
  } catch (error) {
    return response.status(400).json({ error: error instanceof Error ? error.message : "Upload authorization failed" });
  }
}
