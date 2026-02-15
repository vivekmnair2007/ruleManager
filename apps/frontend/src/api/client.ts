export type UserRole = "Viewer" | "Analyst" | "Approver" | "Admin";

type ApiErrorPayload = {
  error: string;
  message?: string;
  serverEtag?: string;
  resource?: unknown;
};

const etags = new Map<string, string>();

export function getStoredEtag(key: string) {
  return etags.get(key);
}

export function setStoredEtag(key: string, etag: string | null) {
  if (!etag) return;
  etags.set(key, etag);
}

export class HttpError extends Error {
  constructor(public status: number, public payload: ApiErrorPayload) {
    super(payload.message ?? payload.error ?? "request failed");
  }
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080";

export async function apiGet<T>(path: string, etagKey?: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  const etag = response.headers.get("ETag");
  if (etag && etagKey) setStoredEtag(etagKey, etag);

  if (!response.ok) {
    throw new HttpError(response.status, await response.json());
  }

  return response.json();
}

export async function apiWrite<T>(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown,
  etagKey?: string
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (etagKey) {
    const etag = getStoredEtag(etagKey);
    if (etag) headers["If-Match"] = etag;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });

  const updatedEtag = response.headers.get("ETag");
  if (updatedEtag && etagKey) setStoredEtag(etagKey, updatedEtag);

  if (!response.ok) {
    const payload = await response.json();
    throw new HttpError(response.status, payload);
  }

  if (response.status === 204) return {} as T;
  return response.json();
}
