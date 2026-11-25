import React, { useState } from "react";
import { Activity, Box, Plus, RefreshCw, X } from "lucide-react";
import { DataTable, type Column } from "../components/DataTable";
import { PageHeader } from "../components/PageHeader";
import { ErrorState } from "../components/States";
import { StatusBadge } from "../components/StatusBadge";
import { dfsApi } from "../services/api";
import type { NodeChunkInventory, NodeInfo } from "../types/dfs";
import {
  formatBytes,
  formatDate,
  formatRelativeTime,
  formatUptime,
  truncateHash,
} from "../utils/format";

interface NodesPageProps {
  nodes: NodeInfo[];
  onRefresh: () => void;
}

export const NodesPage: React.FC<NodesPageProps> = ({ nodes, onRefresh }) => {
  const [showRegister, setShowRegister] = useState(false);
  const [nodeId, setNodeId] = useState("");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [registering, setRegistering] = useState(false);

  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<NodeInfo | null>(null);
  const [inventory, setInventory] = useState<NodeChunkInventory | null>(null);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegistering(true);
    setError(null);
    try {
      await dfsApi.registerNode({ node_id: nodeId, name, url });
      setNodeId("");
      setName("");
      setUrl("");
      setShowRegister(false);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register node.");
    } finally {
      setRegistering(false);
    }
  };

  const handleHealthCheck = async (id: string) => {
    setCheckingId(id);
    setError(null);
    try {
      await dfsApi.checkNodeHealth(id);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Health check failed.");
    } finally {
      setCheckingId(null);
    }
  };

  const handleInspectNode = async (node: NodeInfo) => {
    setSelectedNode(node);
    setLoadingInventory(true);
    setError(null);
    try {
      const inv = await dfsApi.getNodeChunks(node.node_id);
      setInventory(inv);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load node inventory."
      );
    } finally {
      setLoadingInventory(false);
    }
  };

  const activeSelected =
    selectedNode
      ? nodes.find((n) => n.node_id === selectedNode.node_id) ?? selectedNode
      : null;

  const columns: Array<Column<NodeInfo>> = [
    {
      key: "node",
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
      key: "footprint",
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
      key: "uptime",
      header: "Uptime",
      align: "right",
      render: (n) => (
        <span className="whitespace-nowrap font-mono text-zinc-400">
          {formatUptime(n.uptime_seconds)}
        </span>
      ),
    },
    {
      key: "heartbeat",
      header: "Last Heartbeat",
      align: "right",
      render: (n) => (
        <span
          className="whitespace-nowrap font-mono text-[11px] text-zinc-400"
          title={formatDate(n.last_heartbeat)}
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
          className="flex items-center justify-end gap-1.5 whitespace-nowrap"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            disabled={checkingId === n.node_id}
            onClick={() => handleHealthCheck(n.node_id)}
            title="Probe node health"
            className="inline-flex items-center gap-1 rounded border border-[#272f3e] bg-[#141922] px-2 py-1 text-[11px] font-medium text-zinc-200 hover:bg-[#1a202c] disabled:opacity-50"
          >
            <Activity className="h-3 w-3" />
            {checkingId === n.node_id ? "Probing…" : "Probe"}
          </button>
          <button
            onClick={() => handleInspectNode(n)}
            title="Inspect node details and stored chunks"
            className="inline-flex items-center gap-1 rounded border border-[#272f3e] bg-[#141922] px-2 py-1 text-[11px] font-medium text-zinc-200 hover:bg-[#1a202c]"
          >
            <Box className="h-3 w-3" />
            Inspect
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Storage Nodes"
        description="Registered worker nodes, liveness probes, host disk capacity, and chunk inventory"
        meta={
          <span className="font-mono">
            {nodes.filter((n) => n.status === "online").length} online ·{" "}
            {nodes.filter((n) => n.status === "degraded").length} degraded ·{" "}
            {nodes.filter((n) => n.status === "offline").length} offline
          </span>
        }
        actions={
          <>
            <button
              onClick={() => setShowRegister((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500"
            >
              <Plus className="h-3.5 w-3.5" />
              Register Node
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

      {error && <ErrorState message={error} />}

      {showRegister && (
        <form
          onSubmit={handleRegister}
          className="rounded-md border border-[#1e2430] bg-[#0f1218] p-4"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
              Register Storage Node
            </h2>
            <button
              type="button"
              onClick={() => setShowRegister(false)}
              className="text-zinc-500 hover:text-zinc-300"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-4">
            <input
              required
              value={nodeId}
              onChange={(e) => setNodeId(e.target.value)}
              placeholder="Node ID (e.g. node-4)"
              className="rounded border border-[#272f3e] bg-[#090b0f] px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:border-sky-500 focus:outline-none"
            />
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Display Name (e.g. Storage Node 4)"
              className="rounded border border-[#272f3e] bg-[#090b0f] px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:border-sky-500 focus:outline-none"
            />
            <input
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://127.0.0.1:8004"
              className="rounded border border-[#272f3e] bg-[#090b0f] px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:border-sky-500 focus:outline-none"
            />
            <button
              disabled={registering}
              type="submit"
              className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50"
            >
              {registering ? "Registering…" : "Save & Probe"}
            </button>
          </div>
        </form>
      )}

      <DataTable
        data={nodes}
        columns={columns}
        keyExtractor={(n) => n.node_id}
        onRowClick={(n) => handleInspectNode(n)}
        emptyMessage="No storage nodes registered."
      />

      {/* Detailed Node Inspector Panel */}
      {activeSelected && (
        <section className="rounded-md border border-[#1e2430] bg-[#0f1218]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1e2430] bg-[#141922] px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-xs font-semibold text-zinc-100">
                {activeSelected.node_id}
              </span>
              <span className="text-xs text-zinc-400">
                {activeSelected.name}
              </span>
              <StatusBadge status={activeSelected.status} />
            </div>
            <button
              onClick={() => {
                setSelectedNode(null);
                setInventory(null);
              }}
              aria-label="Close inspector"
              className="rounded p-1 text-zinc-400 hover:bg-[#1a202c] hover:text-zinc-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-px border-b border-[#1e2430] bg-[#1e2430] text-xs sm:grid-cols-4">
            <div className="bg-[#0f1218] p-3.5">
              <div className="text-[11px] text-zinc-500">Endpoint</div>
              <div className="mt-1 truncate font-mono text-zinc-200">
                {activeSelected.url}
              </div>
            </div>
            <div className="bg-[#0f1218] p-3.5">
              <div className="text-[11px] text-zinc-500">Host Disk Volume</div>
              <div className="mt-1 font-mono text-zinc-200">
                {formatBytes(activeSelected.free_bytes)} free /{" "}
                {formatBytes(activeSelected.total_bytes)}
              </div>
            </div>
            <div className="bg-[#0f1218] p-3.5">
              <div className="text-[11px] text-zinc-500">
                DFS Chunk Payload
              </div>
              <div className="mt-1 font-mono text-zinc-200">
                {formatBytes(activeSelected.chunks_used_bytes)} (
                {activeSelected.chunk_count} chunks)
              </div>
            </div>
            <div className="bg-[#0f1218] p-3.5">
              <div className="text-[11px] text-zinc-500">Last Heartbeat</div>
              <div className="mt-1 font-mono text-zinc-200">
                {formatDate(activeSelected.last_heartbeat)}
              </div>
            </div>
          </div>

          <div className="p-4">
            <div className="mb-2.5 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Live On-Disk Chunk Inventory
              </h3>
              {inventory && (
                <span className="font-mono text-[11px] text-zinc-500">
                  {inventory.reachable
                    ? `${inventory.chunks.length} chunk(s) on disk`
                    : `Unreachable: ${inventory.error}`}
                </span>
              )}
            </div>
            {loadingInventory ? (
              <div className="py-6 text-center text-xs text-zinc-500">
                Querying node chunk inventory…
              </div>
            ) : inventory && inventory.chunks.length > 0 ? (
              <div className="max-h-64 overflow-y-auto rounded border border-[#1e2430]">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#1e2430] bg-[#141922] text-[11px] uppercase text-zinc-500">
                      <th className="px-3 py-2">Chunk ID</th>
                      <th className="px-3 py-2 text-right">Size</th>
                      <th className="px-3 py-2">SHA-256</th>
                      <th className="px-3 py-2 text-right">Stored At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1a202c]">
                    {inventory.chunks.map((c) => (
                      <tr key={c.chunk_id} className="hover:bg-[#141922]/60">
                        <td className="px-3 py-2 font-mono text-zinc-200">
                          {c.chunk_id}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-zinc-300">
                          {formatBytes(c.size_bytes)}
                        </td>
                        <td
                          className="px-3 py-2 font-mono text-zinc-400"
                          title={c.sha256_hash}
                        >
                          {truncateHash(c.sha256_hash, 18)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-[11px] text-zinc-500">
                          {formatDate(c.stored_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="py-4 text-xs text-zinc-500">
                {inventory?.reachable === false
                  ? `Cannot query node: ${inventory.error}`
                  : "No chunks stored on this node."}
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
};
