import React from "react";
import { StatusBadge } from "./StatusBadge";
import type { NodeInfo } from "../types/dfs";
import { formatRelativeTime } from "../utils/format";

interface NodeStatusProps {
  node: NodeInfo;
  compact?: boolean;
}

export const NodeStatus: React.FC<NodeStatusProps> = ({
  node,
  compact = false,
}) => {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <StatusBadge status={node.status} />
        <div className="min-w-0">
          <div className="truncate text-xs font-medium text-zinc-200">
            {node.name}
          </div>
          {!compact && (
            <div className="truncate font-mono text-[11px] text-zinc-500">
              {node.node_id} · {node.url}
            </div>
          )}
        </div>
      </div>
      <div className="shrink-0 text-right font-mono text-[11px]">
        <div
          className={
            node.response_time_ms !== null
              ? node.response_time_ms > 150
                ? "text-amber-400"
                : "text-zinc-300"
              : "text-zinc-500"
          }
        >
          {node.response_time_ms !== null
            ? `${node.response_time_ms.toFixed(1)} ms`
            : "—"}
        </div>
        {!compact && (
          <div className="text-[10px] text-zinc-500">
            {formatRelativeTime(node.last_heartbeat)}
          </div>
        )}
      </div>
    </div>
  );
};
