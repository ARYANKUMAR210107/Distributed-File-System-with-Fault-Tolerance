import React, { useState } from "react";
import { Activity, HelpCircle, RefreshCw } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DataTable, type Column } from "../components/DataTable";
import { EventTimeline } from "../components/EventTimeline";
import { MetricSummary, type MetricItem } from "../components/MetricSummary";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { Tooltip } from "../components/Tooltip";
import { dfsApi } from "../services/api";
import type { ClusterStats, NodeInfo, SystemEvent } from "../types/dfs";
import {
  formatBytes,
  formatDate,
  formatRelativeTime,
} from "../utils/format";

interface DashboardPageProps {
  stats: ClusterStats | null;
  nodes: NodeInfo[];
  events: SystemEvent[];
  masterOnline: boolean;
  lastRefreshed: string | null;
  onRefresh: () => void;
  onSelectFiles: () => void;
  onSelectNodes: () => void;
  onSelectReplication: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  stats,
  nodes,
  events,
  masterOnline,
  lastRefreshed,
  onRefresh,
  onSelectFiles,
  onSelectNodes,
  onSelectReplication,
}) => {
  const [probingId, setProbingId] = useState<string | null>(null);

  const degradedNodes = nodes.filter((n) => n.status === "degraded").length;
  const offlineNodes = stats?.offline_nodes ?? 0;
  const degradedFiles = stats?.degraded_files ?? 0;

  let clusterHealth: "healthy" | "degraded" | "offline" = "healthy";
  if (
    !masterOnline ||
    (stats && stats.active_nodes === 0 && stats.total_nodes > 0)
  ) {
    clusterHealth = "offline";
  } else if (offlineNodes > 0 || degradedNodes > 0 || degradedFiles > 0) {
    clusterHealth = "degraded";
  }

  const replicationRate =
    stats && stats.total_files > 0
      ? `${Math.round((stats.healthy_files / stats.total_files) * 100)}%`
      : "100%";

  const totalDfsChunkBytes = nodes.reduce(
    (sum, n) => sum + n.chunks_used_bytes,
    0
  );

  const handleQuickProbe = async (nodeId: string) => {
    setProbingId(nodeId);
    try {
      await dfsApi.checkNodeHealth(nodeId);
      onRefresh();
    } finally {
      setProbingId(null);
    }
  };

  const metrics: MetricItem[] = [
    {
      label: "Total Files",
      value: stats ? String(stats.total_files) : "—",
      detail: stats ? `${stats.total_chunks} logical chunks` : undefined,
      onClick: onSelectFiles,
    },
    {
      label: "DFS Data Stored",
      value: stats ? formatBytes(stats.total_stored_bytes) : "—",
      detail: stats
        ? `${formatBytes(totalDfsChunkBytes)} across ${stats.total_replicas} replicas`
        : undefined,
      tooltip:
        "Logical uploaded file bytes vs. physical replicated chunk bytes stored across nodes.",
      onClick: onSelectFiles,
    },
    {
      label: "Host Capacity",
      value: stats ? formatBytes(stats.total_capacity_bytes) : "—",
      detail: stats
        ? `${formatBytes(stats.total_free_bytes)} host free`
        : undefined,
      tooltip:
        "Underlying OS disk capacity reported by registered Storage Nodes (shared host volume in local setups).",
      onClick: onSelectNodes,
    },
    {
      label: "Active Nodes",
      value: stats ? `${stats.active_nodes} / ${stats.total_nodes}` : "—",
      detail:
        offlineNodes > 0
          ? `${offlineNodes} offline`
          : degradedNodes > 0
          ? `${degradedNodes} degraded`
          : "All nodes healthy",
      tone:
        offlineNodes > 0 ? "error" : degradedNodes > 0 ? "warning" : "healthy",
      onClick: onSelectNodes,
    },
    {
      label: "Replication Health",
      value: replicationRate,
      detail: stats
        ? `${stats.healthy_files}/${stats.total_files} files compliant`
        : undefined,
      tooltip:
        "Percentage of stored files whose online chunk copies meet their target replication factor.",
      tone: degradedFiles > 0 ? "warning" : "healthy",
      onClick: onSelectReplication,
    },
    {
      label: "Degraded / Offline",
      value: String(offlineNodes + degradedNodes + degradedFiles),
      detail: `${degradedFiles} files · ${offlineNodes + degradedNodes} nodes`,
      tone:
        offlineNodes > 0
          ? "error"
          : degradedNodes + degradedFiles > 0
          ? "warning"
          : "default",
    },
  ];

  const chartData = nodes.map((n) => ({
    node: n.node_id,
    primary: n.primary_count,
    replica: n.replica_count,
  }));

  const nodeColumns: Array<Column<NodeInfo>> = [
    {
      key: "name",
      header: "Node",
      render: (n) => (
        <div className="whitespace-nowrap">
          <div className="font-medium text-zinc-100">{n.name}</div>
          <div className="font-mono text-[11px] text-zinc-500">{n.node_id}</div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (n) => (
        <span className="whitespace-nowrap">
          <StatusBadge status={n.status} />
        </span>
      ),
    },
    {
      key: "url",
      header: "Endpoint",
      render: (n) => (
        <span className="whitespace-nowrap font-mono text-xs text-zinc-300">
          {n.url}
        </span>
      ),
    },
    {
      key: "chunks",
      header: "Primary",
      align: "right",
      render: (n) => (
        <span className="whitespace-nowrap font-mono text-sky-400">
          {n.primary_count}
        </span>
      ),
    },
    {
      key: "replicas",
      header: "Replicas",
      align: "right",
      render: (n) => (
        <span className="whitespace-nowrap font-mono text-emerald-400">
          {n.replica_count}
        </span>
      ),
    },
    {
      key: "dfs_bytes",
      header: "DFS Used",
      align: "right",
      render: (n) => (
        <span className="whitespace-nowrap font-mono text-zinc-200">
          {formatBytes(n.chunks_used_bytes)}
        </span>
      ),
    },
    {
      key: "latency",
      header: "Latency",
      align: "right",
      render: (n) => (
        <span
          className={`whitespace-nowrap font-mono ${
            n.response_time_ms === null
              ? "text-zinc-500"
              : n.response_time_ms > 150
              ? "text-amber-400"
              : "text-zinc-200"
          }`}
        >
          {n.response_time_ms !== null
            ? `${n.response_time_ms.toFixed(1)} ms`
            : "—"}
        </span>
      ),
    },
    {
      key: "heartbeat",
      header: "Last Heartbeat",
      align: "right",
      render: (n) => (
        <span
          title={formatDate(n.last_heartbeat)}
          className="whitespace-nowrap font-mono text-[11px] text-zinc-400"
        >
          {formatRelativeTime(n.last_heartbeat)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (n) => (
        <div
          className="flex justify-end"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            disabled={probingId === n.node_id}
            onClick={() => handleQuickProbe(n.node_id)}
            title="Probe node health"
            className="inline-flex items-center gap-1 whitespace-nowrap rounded border border-[#272f3e] bg-[#141922] px-2 py-1 text-[11px] font-medium text-zinc-300 hover:bg-[#1a202c] disabled:opacity-50"
          >
            <Activity className="h-3 w-3" />
            {probingId === n.node_id ? "Probing…" : "Probe"}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="dfs-cluster-local"
        description="Central coordinator telemetry, replica balance, and node liveness"
        badge={<StatusBadge status={clusterHealth} size="md" />}
        meta={
          <>
            <span>
              System:{" "}
              <strong className="font-medium text-zinc-300">
                {masterOnline ? "Coordinator Online" : "Coordinator Unreachable"}
              </strong>
            </span>
            <span>·</span>
            <span className="font-mono">
              Refreshed: {lastRefreshed ? formatDate(lastRefreshed) : "—"}
            </span>
            <span>·</span>
            <span>Interval: 5s</span>
          </>
        }
        actions={
          <button
            onClick={onRefresh}
            className="inline-flex items-center gap-1.5 rounded border border-[#272f3e] bg-[#141922] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-[#1a202c]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        }
      />

      <MetricSummary items={metrics} />

      {/* Distribution Chart + Node Chunk Footprint */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="flex flex-col rounded-md border border-[#1e2430] bg-[#0f1218] p-4 lg:col-span-7">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                Chunk & Replica Distribution
              </h2>
              <p className="text-[11px] text-zinc-500">
                Primary vs. replica chunk count stored per node
              </p>
            </div>
            <span className="font-mono text-[11px] text-zinc-400">
              {stats?.total_chunks ?? 0} chunks · {stats?.total_replicas ?? 0}{" "}
              replicas
            </span>
          </div>
          <div className="h-52 w-full flex-1">
            {chartData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-zinc-500">
                No storage nodes registered.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} barCategoryGap="30%">
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
                  <RechartsTooltip
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
                  <Bar
                    dataKey="primary"
                    name="Primary Chunks"
                    stackId="a"
                    fill="#38bdf8"
                  />
                  <Bar
                    dataKey="replica"
                    name="Replica Chunks"
                    stackId="a"
                    fill="#34d399"
                    radius={[3, 3, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="flex flex-col rounded-md border border-[#1e2430] bg-[#0f1218] p-4 lg:col-span-5">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                  Node DFS Footprint
                </h2>
                <Tooltip text="Bar shows each node's share of total DFS chunk bytes. Host disk usage is shown separately below.">
                  <HelpCircle className="h-3.5 w-3.5 text-zinc-500 hover:text-zinc-300" />
                </Tooltip>
              </div>
              <p className="text-[11px] text-zinc-500">
                Actual DFS chunk bytes vs. host volume free space
              </p>
            </div>
            <span className="font-mono text-[11px] text-zinc-400">
              {formatBytes(totalDfsChunkBytes)}
            </span>
          </div>

          <div className="flex-1 space-y-2.5">
            {nodes.map((node) => {
              const sharePct =
                totalDfsChunkBytes > 0
                  ? Math.round(
                      (node.chunks_used_bytes / totalDfsChunkBytes) * 100
                    )
                  : 0;
              const hostUsedPct =
                node.total_bytes > 0
                  ? ((node.used_bytes / node.total_bytes) * 100).toFixed(1)
                  : "0.0";
              return (
                <div
                  key={node.node_id}
                  className="rounded border border-[#1e2430] bg-[#090b0f] px-3 py-2.5"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-medium text-zinc-200">
                        {node.node_id}
                      </span>
                      <span className="font-mono text-[11px] text-zinc-500">
                        {node.primary_count}P / {node.replica_count}R
                      </span>
                    </div>
                    <div className="font-mono text-zinc-200">
                      {formatBytes(node.chunks_used_bytes)}{" "}
                      <span className="text-[11px] text-zinc-500">
                        ({sharePct}%)
                      </span>
                    </div>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-sm bg-[#1a202c]">
                    <div
                      className="h-full bg-sky-500 transition-all"
                      style={{ width: `${sharePct}%` }}
                    />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between font-mono text-[10px] text-zinc-500">
                    <span>Host Free: {formatBytes(node.free_bytes)}</span>
                    <span>Host Volume: {hostUsedPct}% used</span>
                  </div>
                </div>
              );
            })}
            {nodes.length === 0 && (
              <p className="py-8 text-center text-xs text-zinc-500">
                No nodes registered.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Storage Node Overview */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Storage Nodes
          </h2>
          <button
            onClick={onSelectNodes}
            className="text-xs text-sky-400 hover:underline"
          >
            Inspect node inventory →
          </button>
        </div>
        <DataTable
          data={nodes}
          columns={nodeColumns}
          keyExtractor={(n) => n.node_id}
          onRowClick={() => onSelectNodes()}
          emptyMessage="No storage nodes registered."
        />
      </section>

      {/* Cluster Activity */}
      <section className="space-y-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Cluster Activity
        </h2>
        <EventTimeline events={events} pageSize={6} compact />
      </section>
    </div>
  );
};
