import React from "react";
import { Info, RefreshCw } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EventTimeline } from "../components/EventTimeline";
import { MetricSummary } from "../components/MetricSummary";
import { NodeStatus } from "../components/NodeStatus";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import type { ClusterStats, NodeInfo, SystemEvent } from "../types/dfs";

interface MonitoringPageProps {
  stats: ClusterStats | null;
  nodes: NodeInfo[];
  events: SystemEvent[];
  masterOnline: boolean;
  onRefresh: () => void;
}

export const MonitoringPage: React.FC<MonitoringPageProps> = ({
  stats,
  nodes,
  events,
  masterOnline,
  onRefresh,
}) => {
  const uploads = events.filter((e) => e.event_type === "FILE_UPLOADED").length;
  const downloads = events.filter(
    (e) => e.event_type === "FILE_DOWNLOADED"
  ).length;
  const replications = events.filter(
    (e) => e.event_type === "REPLICATION_COMPLETED"
  ).length;
  const errorEvents = events.filter((e) => e.severity === "error").length;

  const avgLatency = (() => {
    const measured = nodes
      .map((n) => n.response_time_ms)
      .filter((v): v is number => v !== null);
    if (measured.length === 0) return "—";
    const avg = measured.reduce((a, b) => a + b, 0) / measured.length;
    return `${avg.toFixed(1)} ms`;
  })();

  const latencyData = nodes.map((n) => ({
    node: n.node_id,
    latencyMs: n.response_time_ms ?? 0,
    status: n.status,
  }));

  const eventBreakdown = [
    { type: "Uploads", count: uploads },
    { type: "Downloads", count: downloads },
    { type: "Re-Replications", count: replications },
    { type: "Errors", count: errorEvents },
  ];

  const availabilityPct =
    stats && stats.total_nodes > 0
      ? `${Math.round((stats.active_nodes / stats.total_nodes) * 100)}%`
      : "—";

  return (
    <div className="space-y-5">
      <PageHeader
        title="Monitoring"
        description="Live node availability, health probe latency, and recorded cluster operations"
        badge={
          <StatusBadge
            status={
              !masterOnline
                ? "offline"
                : stats && stats.offline_nodes > 0
                  ? "degraded"
                  : "healthy"
            }
            size="md"
          />
        }
        actions={
          <button
            onClick={onRefresh}
            className="inline-flex items-center gap-1.5 rounded border border-[#272f3e] bg-[#141922] px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-[#1a202c]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        }
      />

      <MetricSummary
        items={[
          {
            label: "Node Availability",
            value: availabilityPct,
            detail: stats
              ? `${stats.active_nodes} of ${stats.total_nodes} online`
              : undefined,
            tone:
              stats && stats.offline_nodes > 0 ? "warning" : "healthy",
          },
          {
            label: "Mean Probe Latency",
            value: avgLatency,
            detail: "Latest health check",
          },
          {
            label: "Recorded Uploads",
            value: String(uploads),
            detail: "From system_events",
          },
          {
            label: "Recorded Downloads",
            value: String(downloads),
            detail: "Verified SHA-256",
          },
          {
            label: "Re-Replications",
            value: String(replications),
            detail: "Auto + manual",
          },
          {
            label: "Error Events",
            value: String(errorEvents),
            tone: errorEvents > 0 ? "error" : "default",
          },
        ]}
      />

      {/* Explicit telemetry scope banner */}
      <div className="flex items-start gap-2.5 rounded-md border border-[#1e2430] bg-[#0f1218] px-3.5 py-2.5 text-[11px] text-zinc-400">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-400" />
        <span>
          Latency values show the latest real HTTP probe (`GET /health`)
          measured by the Master Node. Historical time-series metrics are not
          persisted by the backend; event counts reflect the latest{" "}
          {events.length} records in <code className="text-zinc-300">system_events</code>.
        </span>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="rounded-md border border-[#1e2430] bg-[#0f1218] p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
            Latest Health Probe Latency (ms)
          </h2>
          <p className="mb-3 text-[11px] text-zinc-500">
            Direct Master-to-Storage-Node HTTP round-trip time
          </p>
          <div className="h-52 w-full">
            {latencyData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-zinc-500">
                No nodes registered.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={latencyData} barCategoryGap="32%">
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
                  <YAxis stroke="#71717a" fontSize={11} tickLine={false} />
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
                  <Bar
                    dataKey="latencyMs"
                    name="Latency (ms)"
                    fill="#34d399"
                    radius={[3, 3, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-md border border-[#1e2430] bg-[#0f1218] p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
            Recorded Operation Counts
          </h2>
          <p className="mb-3 text-[11px] text-zinc-500">
            Aggregated directly from backend event logs
          </p>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={eventBreakdown} barCategoryGap="32%">
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#1e2430"
                  vertical={false}
                />
                <XAxis
                  dataKey="type"
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
                <Bar
                  dataKey="count"
                  name="Events"
                  fill="#38bdf8"
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Node Health Strip */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {nodes.map((node) => (
          <div
            key={node.node_id}
            className="rounded-md border border-[#1e2430] bg-[#0f1218] p-3.5"
          >
            <NodeStatus node={node} />
          </div>
        ))}
      </div>

      <section className="space-y-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Recent Monitoring & Fault Events
        </h2>
        <EventTimeline events={events} pageSize={8} showSearch />
      </section>
    </div>
  );
};
