const BASE = "";

export interface ApiError {
  detail: string;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("pramaan_token");
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (init.body && typeof init.body === "string" && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (res.status === 401) {
    localStorage.removeItem("pramaan_token");
    if (location.pathname !== "/login") location.href = "/login";
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch { /* keep default */ }
    throw new Error(detail);
  }
  if (res.status === 204) return undefined as T;
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return (await res.json()) as T;
  return (await res.blob()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: (path: string) => request<void>(path, { method: "DELETE" }),
  upload: <T>(path: string, form: FormData, method = "POST") => request<T>(path, { method, body: form }),
  download: (path: string) => request<Blob>(path),
};

export interface User {
  id: string;
  username: string;
  full_name: string | null;
  role: string;
  department: string | null;
  clearance: string;
  disabled: boolean;
}

export interface Case {
  id: string;
  title: string;
  classification: string;
  description: string | null;
  owner_id: string;
  status: string;
  created_at: string;
}

export interface Document {
  id: string;
  case_id: string;
  title: string;
  classification: string;
  status: string;
  version_count: number;
  created_at: string;
}

export interface DocVersion {
  version_number: number;
  content_hash: string;
  classification: string;
  created_at: string;
}

export interface Integrity {
  valid: boolean;
  hash_ok: boolean | null;
  signature_ok: boolean | null;
  content_hash: string | null;
}

export interface Permission {
  id: string;
  case_id: string;
  user_id: string;
  level: string;
}

export interface Citation {
  document_id: string;
  version_number: number;
  page: number | null;
  chunk_index: number;
  snippet: string;
}

export interface RagResponse {
  answer: string;
  citations: Citation[];
}

export interface AuditEvent {
  id: string;
  event_type: string;
  actor_id: string | null;
  object_ref: string | null;
  occurred_at: string;
  event_hash: string;
}
