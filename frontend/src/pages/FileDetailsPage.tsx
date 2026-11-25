import React, { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Download, ShieldCheck } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { ErrorState, LoadingState } from "../components/States";
import { StatusBadge } from "../components/StatusBadge";
import { dfsApi } from "../services/api";
import type {
  FileDetailResponse,
  FileDistributionResponse,
  FileIntegrityResponse,
} from "../types/dfs";
import { formatBytes, formatDate, truncateHash } from "../utils/format";

interface FileDetailsPageProps {
  fileId: string;
  onBack: () => void;
}

export const FileDetailsPage: React.FC<FileDetailsPageProps> = ({
  fileId,
  onBack,
}) => {
  const [detail, setDetail] = useState<FileDetailResponse | null>(null);
  const [distribution, setDistribution] =
    useState<FileDistributionResponse | null>(null);
  const [integrity, setIntegrity] = useState<FileIntegrityResponse | null>(
    null
  );
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    Promise.all([
      dfsApi.getFileDetails(fileId),
      dfsApi.getFileDistribution(fileId),
    ])
      .then(([d, dist]) => {
        if (!cancelled) {
          setDetail(d);
          setDistribution(dist);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load file.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  const handleVerifyIntegrity = async () => {
    setVerifying(true);
    setError(null);
    try {
      const res = await dfsApi.getFileIntegrity(fileId);
      setIntegrity(res);
      const refreshed = await dfsApi.getFileDetails(fileId);
      setDetail(refreshed);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Integrity verification failed."
      );
    } finally {
      setVerifying(false);
    }
  };

  if (error && !detail) {
    return (
      <div className="space-y-4">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Files
        </button>
        <ErrorState message={error} />
      </div>
    );
  }

  if (!detail || !distribution) {
    return <LoadingState label="Loading file metadata and replica topology…" />;
  }

  const { file, chunks } = detail;

  return (
    <div className="space-y-5">
      <PageHeader
        title={file.filename}
        description={`Object ID: ${file.file_id}`}
        badge={<StatusBadge status={file.status} size="md" />}
        meta={
          <>
            <span className="font-mono">{formatBytes(file.file_size)}</span>
            <span>·</span>
            <span className="font-mono">{file.total_chunks} chunks</span>
            <span>·</span>
            <span className="font-mono">RF {file.replication_factor}</span>
            <span>·</span>
            <span className="font-mono">
              Uploaded {formatDate(file.created_at)}
            </span>
          </>
        }
        actions={
          <>
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1.5 rounded border border-[#272f3e] bg-[#141922] px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-[#1a202c]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </button>
            <button
              disabled={verifying}
              onClick={handleVerifyIntegrity}
              className="inline-flex items-center gap-1.5 rounded border border-emerald-500/35 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              {verifying ? "Probing Nodes…" : "Verify Integrity"}
            </button>
            <a
              href={dfsApi.getDownloadUrl(file.file_id)}
              className="inline-flex items-center gap-1.5 rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500"
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </a>
          </>
        }
      />

      {error && <ErrorState message={error} />}

      {/* Metadata Bar */}
      <div className="grid grid-cols-1 divide-y divide-[#1e2430] rounded-md border border-[#1e2430] bg-[#0f1218] md:grid-cols-4 md:divide-x md:divide-y-0">
        <div className="p-3.5">
          <div className="text-[11px] uppercase tracking-wider text-zinc-500">
            Content Type
          </div>
          <div className="mt-1 font-mono text-xs text-zinc-200">
            {file.content_type}
          </div>
        </div>
        <div className="p-3.5">
          <div className="text-[11px] uppercase tracking-wider text-zinc-500">
            Chunk Size
          </div>
          <div className="mt-1 font-mono text-xs text-zinc-200">
            {formatBytes(file.chunk_size)}
          </div>
        </div>
        <div className="p-3.5">
          <div className="text-[11px] uppercase tracking-wider text-zinc-500">
            Replication State
          </div>
          <div className="mt-1 flex items-center gap-2">
            <StatusBadge status={file.replication_status} />
            <span className="font-mono text-xs text-zinc-400">
              {file.stored_replicas}/{file.expected_replicas} copies
            </span>
          </div>
        </div>
        <div className="p-3.5">
          <div className="text-[11px] uppercase tracking-wider text-zinc-500">
            Original SHA-256
          </div>
          <div
            className="mt-1 truncate font-mono text-xs text-zinc-300"
            title={file.sha256_hash}
          >
            {file.sha256_hash}
          </div>
        </div>
      </div>

      {/* Active Integrity Report */}
      {integrity && (
        <div className="rounded-md border border-[#1e2430] bg-[#0f1218] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1e2430] pb-3">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-200">
                Active Chunk Integrity Probe
              </h2>
              <p className="text-[11px] text-zinc-500">
                SHA-256 verified against live chunk payloads on Storage Nodes
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-xs text-zinc-400">
                {integrity.healthy_chunks}/{integrity.total_chunks} healthy
              </span>
              <StatusBadge status={integrity.overall_status} size="md" />
            </div>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {integrity.chunks.map((c) => (
              <div
                key={c.chunk_id}
                className="rounded border border-[#1e2430] bg-[#090b0f] p-3 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-medium text-zinc-200">
                    Chunk #{c.chunk_index}
                  </span>
                  <StatusBadge status={c.status} />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {c.details.map((d, i) => (
                    <span
                      key={i}
                      className="rounded border border-[#272f3e] bg-[#141922] px-2 py-0.5 font-mono text-[11px] text-zinc-300"
                    >
                      {d.node_id}: {d.status}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chunk Distribution Topology */}
      <section className="rounded-md border border-[#1e2430] bg-[#0f1218] p-4">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-300">
          Chunk Distribution & Replica Topology
        </h2>
        <div className="space-y-2">
          {distribution.distribution.map((item) => (
            <div
              key={item.chunk_id}
              className="flex flex-wrap items-center gap-2.5 rounded border border-[#1e2430] bg-[#090b0f] px-3.5 py-2.5 text-xs"
            >
              <div className="min-w-[165px]">
                <div className="font-mono font-semibold text-zinc-200">
                  Chunk #{item.chunk_index}
                </div>
                <div className="font-mono text-[11px] text-zinc-500">
                  {formatBytes(item.chunk_size)} ·{" "}
                  {truncateHash(item.sha256_hash, 12)}
                </div>
              </div>

              <ArrowRight className="h-3.5 w-3.5 text-zinc-600" />

              {item.primary_node ? (
                <div className="inline-flex items-center gap-2 rounded border border-sky-500/30 bg-sky-500/10 px-2.5 py-1">
                  <span className="text-[11px] font-medium text-sky-300">
                    PRIMARY
                  </span>
                  <span className="font-mono text-zinc-100">
                    {item.primary_node.node_id}
                  </span>
                  <StatusBadge status={item.primary_node.node_status} />
                </div>
              ) : (
                <span className="text-rose-400">No primary assigned</span>
              )}

              {item.replica_nodes.map((rep) => (
                <React.Fragment key={rep.node_id}>
                  <ArrowRight className="h-3.5 w-3.5 text-zinc-600" />
                  <div className="inline-flex items-center gap-2 rounded border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1">
                    <span className="text-[11px] font-medium text-emerald-300">
                      REPLICA
                    </span>
                    <span className="font-mono text-zinc-100">
                      {rep.node_id}
                    </span>
                    <StatusBadge status={rep.node_status} />
                  </div>
                </React.Fragment>
              ))}
            </div>
          ))}
          {distribution.distribution.length === 0 && (
            <p className="text-xs text-zinc-500">
              Empty file (0 bytes) — no chunks stored.
            </p>
          )}
        </div>
      </section>

      {/* Chunk Metadata Table */}
      <div className="overflow-hidden rounded-md border border-[#1e2430] bg-[#0f1218]">
        <div className="border-b border-[#1e2430] bg-[#141922] px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wider text-zinc-300">
          Chunk Inventory
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[#1e2430] text-[11px] uppercase tracking-wider text-zinc-500">
                <th className="px-3.5 py-2">#</th>
                <th className="px-3.5 py-2">Chunk ID</th>
                <th className="px-3.5 py-2 text-right">Size</th>
                <th className="px-3.5 py-2">SHA-256</th>
                <th className="px-3.5 py-2">Storage Locations</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1a202c]">
              {chunks.map((c) => (
                <tr key={c.chunk_id} className="hover:bg-[#141922]/70">
                  <td className="px-3.5 py-2.5 font-mono text-zinc-400">
                    {c.chunk_index}
                  </td>
                  <td className="px-3.5 py-2.5 font-mono text-zinc-200">
                    {c.chunk_id}
                  </td>
                  <td className="px-3.5 py-2.5 text-right font-mono text-zinc-300">
                    {formatBytes(c.chunk_size)}
                  </td>
                  <td
                    className="px-3.5 py-2.5 font-mono text-zinc-400"
                    title={c.sha256_hash}
                  >
                    {truncateHash(c.sha256_hash, 20)}
                  </td>
                  <td className="px-3.5 py-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      {c.locations.map((loc) => (
                        <span
                          key={loc.node_id}
                          className="inline-flex items-center gap-1.5 rounded border border-[#272f3e] bg-[#090b0f] px-2 py-0.5 font-mono text-[11px]"
                        >
                          <span className="text-zinc-200">{loc.node_id}</span>
                          <span className="text-[10px] text-zinc-500">
                            {loc.is_primary ? "P" : "R"}
                          </span>
                          <StatusBadge status={loc.status} />
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
