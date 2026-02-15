import { createHash } from "node:crypto";

export function createEtagFromParts(parts: Array<string | number | null | undefined>) {
  const value = parts.map((part) => String(part ?? "")).join("|");
  const digest = createHash("sha1").update(value).digest("hex");
  return `"${digest}"`;
}

export function stripWeakEtag(etag: string | undefined) {
  if (!etag) {
    return "";
  }
  return etag.replace(/^W\//, "");
}
