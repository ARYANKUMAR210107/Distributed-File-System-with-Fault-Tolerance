import React, { useState } from "react";
import { CopyCheck, RefreshCw } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DataTable, type Column } from "../components/DataTable";
import { EventTimeline } from "../components/EventTimeline";
import { MetricSummary } from "../components/MetricSummary";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { dfsApi } from "../services/api";
import type {
  ClusterStats,
  FileRecord,
  NodeInfo,
  SystemEvent,
} from "../types/dfs";
import { formatBytes } from "../utils/format";

interface ReplicationPageProps {
  stats: ClusterStats | null;
  files: FileRecord[];
  nodes: NodeInfo[];
  events: SystemEvent[];
  onRefresh: () => void;
  onSelectFile: (fileId: string) => void;
}

export const ReplicationPage: React.FC<ReplicationPageProps> = ({
  stats,
  files,
  nodes,
  events,
  onRefresh,
  onSelectFile,
}) => {
  const [running, setRunning] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);

  const handleRunReplicate = async () => {
    setRunning(true);
    setResultMsg(null);
    try {
      const res = await dfsApi.triggerReReplication();
      setResultMsg(
        `Checked ${res.checked} under-replicated chunk(s): ${res.replicated} replicated, ${res.failed} failed.`
      );
      onRefresh();
    } catch (err) {
      setResultMsg(
        err instanceof Error ? err.message : "Re-replication request failed."
      );
    } finally {
      setRunning(false);
    }
  };

  const totalExpected = files.reduce((acc, f) => acc + f.expected_replicas, 0);
  const totalStored = files.reduce((acc, f) => acc + f.stored_replicas, 0);
  const underReplicatedFiles = files.filter(
    (f) => f.replication_status !== "replicated"
  ).length;

  const repEvents = events.filter(
    (e) =>
      e.event_type.includes("REPLICATION") ||
      e.event_type.includes("FAILOVER") ||
      e.event_type.includes("CORRUPTION")
  );

  const nodeChartData = nodes.map((n) => ({
    node: n.node_id,
    primary: n.primary_count,
    replica: n.replica_count,
  }));

  const columns: Array<Column<FileRecord>> = [
    {
      key: "filename",
      header: "File",
      render: (f) => (
        <div>
          <button
            onClick={() => onSelectFile(f.file_id)}
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
      header: "Logical Size",
      align: "right",
      render: (f) => (
        <span className="font-mono text-zinc-300">
          {formatBytes(f.file_size)}
        </span>
      ),
    },
    {
      key: "chunks",
      header: "Chunks",
      align: "right",
      render: (f) => (
        <span className="font-mono text-zinc-300">{f.total_chunks}</span>
      ),
    },
    {
      key: "rf",
      header: "Target RF",
      align: "right",
      render: (f) => (
        <span className="font-mono text-zinc-300">{f.replication_factor}</span>
      ),
    },
    {
      key: "copies",
      header: "Online Copies",
      align: "right",
      render: (f) => (
        <span className="font-mono text-zinc-200">
          {f.stored_replicas} / {f.expected_replicas}
        </span>
      ),
    },
    {
      key: "status",
      header: "Replication Status",
      render: (f) => <StatusBadge status={f.replication_status} />,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Replication"
        description="Replica placement balance, compliance status, and recovery orchestration"
        actions={
          <>
            <button
              disabled={running}
              onClick={handleRunReplicate}
              className="inline-flex items-center gap-1.5 rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50"
            >
              <CopyCheck className="h-3.5 w-3.5" />
              {running ? "Reconciling…" : "Verify & Re-Replicate"}
            </button>
            <button
              onClick={onRefresh}
              className="inline-flex items-center gap-1.5 rounded border border-[#272f3e] bg-[#141922] px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-[#1a202c]"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </>
        }
      />

      {resultMsg && (
        <div className="rounded border border-sky-500/30 bg-sky-500/10 px-3.5 py-2.5 text-xs text-sky-200">
          {resultMsg}
        </div>
      )}

      <MetricSummary
        items={[
          {
            label: "Logical Chunks",
            value: String(stats?.total_chunks ?? 0),
          },
          {
            label: "Stored Replicas",
            value: String(stats?.total_replicas ?? 0),
          },
          {
            label: "Online / Target",
            value: `${totalStored} / ${totalExpected}`,
            tone: totalStored < totalExpected ? "warning" : "healthy",
          },
          {
            label: "Under-Replicated Files",
            value: String(underReplicatedFiles),
            tone: underReplicatedFiles > 0 ? "warning" : "default",
          },
          {
            label: "Eligible Nodes",
            value: String(stats?.active_nodes ?? 0),
          },
          {
            label: "Recovery Events",
            value: String(repEvents.length),
          },
        ]}
      />

      <div className="rounded-md border border-[#1e2430] bg-[#0f1218] p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
          Primary vs. Replica Balance by Node
        </h2>
        <p className="mb-3 text-[11px] text-zinc-500">
          Round-Robin placement ensures primary and replica copies never share the same node
        </p>
        <div className="h-52 w-full">
          {nodeChartData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-zinc-500">
              No storage nodes registered.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={nodeChartData} barCategoryGap="30%">
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#1e2430"
                  vertical={false}
                />
                <XAxis
                  dataKey="node"
                  stroke="#71717a"
                  fontSize={11}
                  tickLine={false}
                />
                <YAxis
                  stroke="#71717a"
                  fontSize={11}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  cursor={{ fill: "#141922" }}
                  contentStyle={{
                    backgroundColor: "#0c0f14",
                    borderColor: "#272f3e",
                    borderRadius: "4px",
                    color: "#e4e4e7",
                    fontSize: "11px",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                <Bar dataKey="primary" name="Primary" fill="#38bdf8" />
                <Bar dataKey="replica" name="Replica" fill="#34d399" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <section className="space-y-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Per-File Replication Compliance
        </h2>
        <DataTable
          data={files}
          columns={columns}
          keyExtractor={(f) => f.file_id}
          onRowClick={(f) => onSelectFile(f.file_id)}
          emptyMessage="No files stored in the cluster."
        />
      </section>

      <section className="space-y-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Replication & Failover History
        </h2>
        <EventTimeline events={repEvents} pageSize={6} compact />
      </section>
    </div>
  );
};
