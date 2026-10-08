// Typed API client for the Sach-AI backend.
//
// All requests go through the Vite dev proxy at /api. Access tokens live in
// an httpOnly cookie, so the client never sees them; on a 401 we transparently
// rotate the refresh token once and retry the original request.

import type {
  BatchDetail,
  BatchSummary,
  ScanDetail,
  ScanSummary,
  User,
} from "./types";

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  formData?: FormData;
  signal?: AbortSignal;
  /** Internal: prevents infinite refresh loops. */
  isRetry?: boolean;
};

const request = async <T>(path: string, opts: RequestOptions = {}): Promise<T> => {
  const { method = "GET", body, formData, signal, isRetry } = opts;

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: "include",
      signal,
      ...(formData
        ? { body: formData }
        : body !== undefined
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }
          : {}),
    });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err;
    throw new ApiError(0, "network_error", "Cannot reach the Sach-AI server. Is it running?");
  }

  if (res.status === 401 && !isRetry && path !== "/auth/refresh" && path !== "/auth/login") {
    const refreshed = await request("/auth/refresh", { method: "POST", isRetry: true }).then(
      () => true,
      () => false,
    );
    if (refreshed) return request<T>(path, { ...opts, isRetry: true });
  }

  if (res.status === 204) return undefined as T;

  const payload = (await res.json().catch(() => null)) as
    | { error?: { code?: string; message?: string; details?: unknown } }
    | null;

  if (!res.ok) {
    throw new ApiError(
      res.status,
      payload?.error?.code ?? "unknown_error",
      payload?.error?.message ?? `Request failed (${res.status})`,
      payload?.error?.details,
    );
  }
  return payload as T;
};

// A slow CPU-bound model can legitimately take a minute+ per video.
const SCAN_TIMEOUT_MS = 300_000;

export const api = {
  // -- auth ----------------------------------------------------------------
  me: () => request<{ user: User }>("/auth/me"),
  register: (input: { name: string; email: string; password: string }) =>
    request<{ user: User }>("/auth/register", { method: "POST", body: input }),
  login: (input: { email: string; password: string }) =>
    request<{ user: User }>("/auth/login", { method: "POST", body: input }),
  logout: () => request<void>("/auth/logout", { method: "POST" }),

  // -- scans ---------------------------------------------------------------
  uploadScan: (video: File, signal?: AbortSignal) => {
    const form = new FormData();
    form.append("video", video);
    return request<{ scan: ScanDetail }>("/scans", {
      method: "POST",
      formData: form,
      signal,
      // The 401-refresh-retry path cannot replay a consumed FormData stream
      // reliably across browsers, so scans skip it; the auth provider keeps
      // sessions warm instead.
      isRetry: true,
    });
  },
  listScans: (params: { search?: string; limit?: number; offset?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.search) qs.set("search", params.search);
    qs.set("limit", String(params.limit ?? 50));
    qs.set("offset", String(params.offset ?? 0));
    return request<{ scans: ScanSummary[]; total: number }>(`/scans?${qs}`);
  },
  getScan: (id: string) => request<{ scan: ScanDetail }>(`/scans/${id}`),
  deleteScan: (id: string) => request<void>(`/scans/${id}`, { method: "DELETE" }),

  // -- batches ---------------------------------------------------------------
  createBatch: (label: string, items: { fileName: string; fileSize: number }[]) =>
    request<{ batch: BatchSummary; scans: ScanSummary[] }>("/batches", {
      method: "POST",
      body: { label, items },
    }),
  getBatch: (id: string) => request<BatchDetail>(`/batches/${id}`),
  listBatches: () => request<{ batches: BatchSummary[] }>("/batches"),
  deleteBatch: (id: string) => request<void>(`/batches/${id}`, { method: "DELETE" }),
  uploadBatchItem: (batchId: string, scanId: string, video: File, signal?: AbortSignal) => {
    const form = new FormData();
    form.append("video", video);
    return request<{ scan: ScanDetail }>(`/batches/${batchId}/scans/${scanId}`, {
      method: "POST",
      formData: form,
      signal,
      isRetry: true,
    });
  },
};

export { SCAN_TIMEOUT_MS };
