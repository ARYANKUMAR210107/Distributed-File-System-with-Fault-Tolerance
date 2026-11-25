import React, { useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Download,
  Eye,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { ConfirmationDialog } from "../components/ConfirmationDialog";
import { DataTable, type Column } from "../components/DataTable";
import { PageHeader } from "../components/PageHeader";
import { ErrorState } from "../components/States";
import { StatusBadge } from "../components/StatusBadge";
import { dfsApi } from "../services/api";
import type { FileRecord, UploadResponse } from "../types/dfs";
import { formatBytes, formatDate } from "../utils/format";

interface FilesPageProps {
  files: FileRecord[];
  onRefresh: () => void;
  onSelectFile: (fileId: string) => void;
}

export const FilesPage: React.FC<FilesPageProps> = ({
  files,
  onRefresh,
  onSelectFile,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState<string>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadFilename, setUploadFilename] = useState<string | null>(null);
  const [uploadSize, setUploadSize] = useState<number>(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [pendingDelete, setPendingDelete] = useState<FileRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setUploadFilename(file.name);
    setUploadSize(file.size);
    setUploadProgress(0);
    setError(null);
    setUploadResult(null);
    try {
      const res = await dfsApi.uploadFile(file, setUploadProgress);
      setUploadResult(res);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setError(null);
    try {
      await dfsApi.deleteFile(pendingDelete.file_id);
      setPendingDelete(null);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete file.");
    } finally {
      setDeleting(false);
    }
  };

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const processedFiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = files.filter((f) => {
      if (statusFilter !== "all" && f.status !== statusFilter) return false;
      if (!q) return true;
      return (
        f.filename.toLowerCase().includes(q) ||
        f.file_id.toLowerCase().includes(q)
      );
    });

    return [...filtered].sort((a, b) => {
      let av: string | number = a.created_at;
      let bv: string | number = b.created_at;
      if (sortKey === "filename") {
        av = a.filename.toLowerCase();
        bv = b.filename.toLowerCase();
      } else if (sortKey === "size") {
        av = a.file_size;
        bv = b.file_size;
      } else if (sortKey === "chunks") {
        av = a.total_chunks;
        bv = b.total_chunks;
      } else if (sortKey === "replicas") {
        av = a.stored_replicas;
        bv = b.stored_replicas;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [files, search, statusFilter, sortKey, sortDir]);

  const columns: Array<Column<FileRecord>> = [
    {
      key: "filename",
      header: "File",
      sortable: true,
      render: (f) => (
        <div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSelectFile(f.file_id);
            }}
            className="font-medium text-zinc-100 hover:text-sky-400 hover:underline"
          >
            {f.filename}
          </button>
          <div className="font-mono text-[11px] text-zinc-500">{f.file_id}</div>
        </div>
      ),
    },
    {
      key: "size",
      header: "Size",
      align: "right",
      sortable: true,
      render: (f) => (
        <span className="font-mono text-zinc-300">
          {formatBytes(f.file_size)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Integrity",
      render: (f) => <StatusBadge status={f.status} />,
    },
    {
      key: "chunks",
      header: "Chunks",
      align: "right",
      sortable: true,
      render: (f) => (
        <span className="font-mono text-zinc-300">{f.total_chunks}</span>
      ),
    },
    {
      key: "replicas",
      header: "Replicas",
      sortable: true,
      render: (f) => (
        <div className="flex items-center gap-2">
          <StatusBadge status={f.replication_status} />
          <span className="font-mono text-[11px] text-zinc-400">
            {f.stored_replicas}/{f.expected_replicas}
          </span>
        </div>
      ),
    },
    {
      key: "created_at",
      header: "Uploaded",
      align: "right",
      sortable: true,
      render: (f) => (
        <span className="font-mono text-[11px] text-zinc-500">
          {formatDate(f.created_at)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (f) => (
        <div
          className="flex items-center justify-end gap-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => onSelectFile(f.file_id)}
            title="Inspect chunks & distribution"
            aria-label={`Inspect ${f.filename}`}
            className="rounded border border-[#272f3e] bg-[#141922] p-1.5 text-zinc-300 hover:bg-[#1a202c]"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
          <a
            href={dfsApi.getDownloadUrl(f.file_id)}
            title="Download file"
            aria-label={`Download ${f.filename}`}
            className="rounded border border-[#272f3e] bg-[#141922] p-1.5 text-zinc-300 hover:bg-[#1a202c]"
          >
            <Download className="h-3.5 w-3.5" />
          </a>
          <button
            onClick={() => setPendingDelete(f)}
            title="Delete file"
            aria-label={`Delete ${f.filename}`}
            className="rounded border border-rose-500/25 bg-rose-500/10 p-1.5 text-rose-400 hover:bg-rose-500/20"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Files"
        description="Chunked object storage, SHA-256 verification, and replica tracking"
        meta={
          <span className="font-mono">{files.length} total objects</span>
        }
        actions={
          <>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
                e.target.value = "";
              }}
            />
            <button
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-sky-500 disabled:opacity-50"
            >
              <Upload className="h-3.5 w-3.5" />
              {uploading ? `Uploading ${uploadProgress}%` : "Upload File"}
            </button>
          </>
        }
      />

      {/* Compact Upload Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          const f = e.dataTransfer.files?.[0];
          if (f && !uploading) handleUpload(f);
        }}
        className={`rounded-md border border-dashed px-4 py-3.5 transition-colors ${
          dragActive
            ? "border-sky-500 bg-sky-500/5"
            : "border-[#272f3e] bg-[#0f1218]"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <Upload className="h-4 w-4 text-zinc-400" />
            <div>
              <span className="font-medium text-zinc-200">
                Drop a file here to distribute across storage nodes
              </span>
              <span className="ml-2 text-zinc-500">
                or{" "}
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="text-sky-400 hover:underline"
                >
                  browse local disk
                </button>
              </span>
            </div>
          </div>
          {uploading && uploadFilename && (
            <span className="font-mono text-[11px] text-sky-300">
              {uploadFilename} ({formatBytes(uploadSize)}) · {uploadProgress}%
            </span>
          )}
        </div>

        {uploading && (
          <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-sm bg-[#1a202c]">
            <div
              className="h-full bg-sky-500 transition-all"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        )}

        {uploadResult && (
          <div className="mt-2.5 flex items-center gap-2 rounded border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            <span>
              <strong>{uploadResult.filename}</strong> (
              {formatBytes(uploadResult.file_size)}) distributed into{" "}
              {uploadResult.total_chunks} chunk(s), status:{" "}
              <span className="font-mono">{uploadResult.status}</span>.
              {uploadResult.warnings.length > 0 &&
                ` Warnings: ${uploadResult.warnings.join(" | ")}`}
            </span>
          </div>
        )}
      </div>

      {error && <ErrorState message={error} />}

      {/* Search & Status Filter */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-3 top-2 h-3.5 w-3.5 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by filename or file ID…"
            className="w-full rounded border border-[#272f3e] bg-[#0f1218] py-1.5 pl-8 pr-3 text-xs text-zinc-100 placeholder-zinc-500 focus:border-sky-500 focus:outline-none"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by integrity status"
          className="rounded border border-[#272f3e] bg-[#0f1218] px-3 py-1.5 text-xs text-zinc-200 focus:border-sky-500 focus:outline-none"
        >
          <option value="all">All Statuses</option>
          <option value="healthy">Healthy</option>
          <option value="degraded">Degraded</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      <DataTable
        data={processedFiles}
        columns={columns}
        keyExtractor={(f) => f.file_id}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={handleSort}
        onRowClick={(f) => onSelectFile(f.file_id)}
        emptyMessage="No files match the current search or filter."
      />

      <ConfirmationDialog
        open={pendingDelete !== null}
        title="Delete Distributed File"
        description={
          pendingDelete
            ? `Permanently delete "${pendingDelete.filename}" (${pendingDelete.total_chunks} chunk(s)) and remove all replicas from Storage Nodes?`
            : ""
        }
        confirmLabel="Delete File"
        destructive
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
};
