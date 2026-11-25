import type {
  ClusterStats,
  FileDetailResponse,
  FileDistributionResponse,
  FileIntegrityResponse,
  FileRecord,
  NodeChunkInventory,
  NodeHealthDetail,
  NodeInfo,
  RuntimeSettings,
  SystemEvent,
  UploadResponse,
} from "../types/dfs";

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, init);
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body.detail) detail = body.detail;
    } catch {
      // ignore non-json error body
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export const dfsApi = {
  getMasterHealth: () =>
    request<{ status: string; service: string }>("/health"),

  getStats: () => request<ClusterStats>("/stats"),

  listNodes: () => request<NodeInfo[]>("/nodes"),

  registerNode: (payload: { node_id: string; name: string; url: string }) =>
    request<NodeInfo>("/nodes/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),

  checkNodeHealth: (nodeId: string) =>
    request<NodeHealthDetail>(`/nodes/${encodeURIComponent(nodeId)}/health`),

  getNodeChunks: (nodeId: string) =>
    request<NodeChunkInventory>(`/nodes/${encodeURIComponent(nodeId)}/chunks`),

  listFiles: (search?: string, status?: string) => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (status && status !== "all") params.set("file_status", status);
    const qs = params.toString();
    return request<FileRecord[]>(`/files${qs ? `?${qs}` : ""}`);
  },

  getFileDetails: (fileId: string) =>
    request<FileDetailResponse>(`/files/${encodeURIComponent(fileId)}`),

  getFileIntegrity: (fileId: string) =>
    request<FileIntegrityResponse>(
      `/files/${encodeURIComponent(fileId)}/integrity`
    ),

  getFileDistribution: (fileId: string) =>
    request<FileDistributionResponse>(
      `/files/${encodeURIComponent(fileId)}/distribution`
    ),

  deleteFile: (fileId: string) =>
    request<{
      file_id: string;
      filename: string;
      deleted: boolean;
      chunks_removed: number;
      failed_deletions: Array<{ chunk_id: string; node_id: string; error: string }>;
    }>(`/files/${encodeURIComponent(fileId)}`, { method: "DELETE" }),

  getDownloadUrl: (fileId: string) =>
    `${API_BASE_URL}/files/${encodeURIComponent(fileId)}/download`,

  uploadFile: (
    file: File,
    onProgress?: (percent: number) => void
  ): Promise<UploadResponse> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${API_BASE_URL}/upload`);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText) as UploadResponse);
          } catch {
            reject(new Error("Invalid server response after upload."));
          }
        } else {
          let detail = `Upload failed (HTTP ${xhr.status})`;
          try {
            const err = JSON.parse(xhr.responseText);
            if (err.detail) detail = err.detail;
          } catch {
            // ignore
          }
          reject(new Error(detail));
        }
      };

      xhr.onerror = () => reject(new Error("Network error during upload."));
      const formData = new FormData();
      formData.append("file", file);
      xhr.send(formData);
    });
  },

  listEvents: (limit = 100, severity?: string) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (severity && severity !== "all") params.set("severity", severity);
    return request<SystemEvent[]>(`/system/events?${params.toString()}`);
  },

  triggerReReplication: () =>
    request<{ checked: number; replicated: number; failed: number }>(
      "/system/re-replicate",
      { method: "POST" }
    ),

  getSettings: () => request<RuntimeSettings>("/settings"),

  updateSettings: (payload: Partial<RuntimeSettings>) =>
    request<RuntimeSettings>("/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
};
