export const SOURCE_UPLOAD_CONTENT_TYPES = ["video/mp4", "video/quicktime", "video/webm"] as const;
export const SOURCE_UPLOAD_MAX_BYTES = 200 * 1024 * 1024;

export function createUploadPolicy() {
  return {
    allowedContentTypes: [...SOURCE_UPLOAD_CONTENT_TYPES],
    maximumSizeInBytes: SOURCE_UPLOAD_MAX_BYTES,
    addRandomSuffix: true,
    allowOverwrite: false,
  };
}

export function validateUploadPath(pathname: string): void {
  if (!pathname.startsWith("inspirations/") || pathname.slice("inspirations/".length).includes("/")) {
    throw new Error("Invalid upload path");
  }
  normalizeUploadPath(pathname.slice("inspirations/".length));
}

export function normalizeUploadPath(filename: string): string {
  const trimmed = filename.trim();
  if (!trimmed || trimmed.includes("..") || trimmed.includes("/") || trimmed.includes("\\")) {
    throw new Error("Invalid upload filename");
  }
  const safe = trimmed.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-160);
  if (!safe || !/\.(mp4|mov|webm)$/i.test(safe)) throw new Error("Invalid upload filename");
  return `inspirations/${safe}`;
}
