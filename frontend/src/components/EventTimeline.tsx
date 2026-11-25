import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import type { SystemEvent } from "../types/dfs";
import { formatDate } from "../utils/format";

interface EventTimelineProps {
  events: SystemEvent[];
  pageSize?: number;
  showSearch?: boolean;
  compact?: boolean;
}

function extractTarget(details: Record<string, unknown> | null): string {
  if (!details) return "cluster";
  const parts: string[] = [];
  if (typeof details.node_id === "string") parts.push(details.node_id);
  if (typeof details.target_node === "string") parts.push(details.target_node);
  if (typeof details.filename === "string") parts.push(details.filename);
  else if (typeof details.file_id === "string") parts.push(details.file_id);
  if (typeof details.chunk_id === "string" && parts.length === 0) {
    parts.push(details.chunk_id);
  }
  return parts.length > 0 ? parts.join(" · ") : "cluster";
}

export const EventTimeline: React.FC<EventTimelineProps> = ({
  events,
  pageSize = 8,
  showSearch = false,
  compact = false,
}) => {
  const [severity, setSeverity] = useState<string>("all");
  const [eventTypeFilter, setEventTypeFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const eventTypes = useMemo(() => {
    const unique = Array.from(new Set(events.map((e) => e.event_type)));
    return unique.sort();
  }, [events]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((ev) => {
      if (severity !== "all" && ev.severity !== severity) return false;
      if (eventTypeFilter !== "all" && ev.event_type !== eventTypeFilter) {
        return false;
      }
      if (!q) return true;
      return (
        ev.event_type.toLowerCase().includes(q) ||
        ev.message.toLowerCase().includes(q) ||
        extractTarget(ev.details).toLowerCase().includes(q)
      );
    });
  }, [events, severity, eventTypeFilter, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize
  );

  const severities: Array<{ id: string; label: string }> = [
    { id: "all", label: "All" },
    { id: "info", label: "Info" },
    { id: "warning", label: "Warning" },
    { id: "error", label: "Error" },
  ];

  return (
    <div className="overflow-hidden rounded-md border border-[#1e2430] bg-[#0f1218]">
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-[#1e2430] bg-[#141922] px-3.5 py-2.5">
        <div className="flex items-center gap-1">
          {severities.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setSeverity(s.id);
                setPage(1);
              }}
              className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                severity === s.id
                  ? "bg-sky-500/15 text-sky-300 ring-1 ring-inset ring-sky-500/30"
                  : "text-zinc-400 hover:bg-[#1a202c] hover:text-zinc-200"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {showSearch && (
            <>
              <select
                value={eventTypeFilter}
                onChange={(e) => {
                  setEventTypeFilter(e.target.value);
                  setPage(1);
                }}
                aria-label="Filter by event type"
                className="rounded border border-[#272f3e] bg-[#090b0f] px-2.5 py-1 text-[11px] text-zinc-200 focus:border-sky-500 focus:outline-none"
              >
                <option value="all">All Event Types</option>
                {eventTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search message, node, or file…"
                className="w-48 rounded border border-[#272f3e] bg-[#090b0f] px-2.5 py-1 text-xs text-zinc-200 placeholder-zinc-500 focus:border-sky-500 focus:outline-none"
              />
            </>
          )}
          <span className="font-mono text-[11px] text-zinc-500">
            {filtered.length} event{filtered.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-[#1e2430] text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              <th className="whitespace-nowrap px-3.5 py-2">Severity</th>
              <th className="whitespace-nowrap px-3.5 py-2">Event Type</th>
              <th className="whitespace-nowrap px-3.5 py-2">Resource</th>
              <th className="px-3.5 py-2">Description</th>
              <th className="whitespace-nowrap px-3.5 py-2 text-right">
                Timestamp
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1a202c]">
            {pageItems.map((ev) => (
              <tr key={ev.id} className="hover:bg-[#141922]/70">
                <td className="whitespace-nowrap px-3.5 py-2">
                  <StatusBadge status={ev.severity} />
                </td>
                <td className="whitespace-nowrap px-3.5 py-2 font-mono text-[11px] font-medium text-zinc-200">
                  {ev.event_type}
                </td>
                <td
                  className="max-w-[180px] truncate whitespace-nowrap px-3.5 py-2 font-mono text-[11px] text-sky-400/90"
                  title={extractTarget(ev.details)}
                >
                  {extractTarget(ev.details)}
                </td>
                <td
                  className={`px-3.5 py-2 leading-relaxed text-zinc-300 ${
                    compact ? "max-w-[440px] truncate" : "min-w-[260px]"
                  }`}
                  title={ev.message}
                >
                  {ev.message}
                </td>
                <td className="whitespace-nowrap px-3.5 py-2 text-right font-mono text-[11px] text-zinc-500">
                  {formatDate(ev.created_at)}
                </td>
              </tr>
            ))}
            {pageItems.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-xs text-zinc-500"
                >
                  No events match the current filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-[#1e2430] bg-[#0c0f14] px-3.5 py-2 text-[11px] text-zinc-400">
          <span className="font-mono">
            Page {safePage} / {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Previous page"
              className="rounded border border-[#272f3e] p-1 hover:bg-[#1a202c] disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              aria-label="Next page"
              className="rounded border border-[#272f3e] p-1 hover:bg-[#1a202c] disabled:opacity-40"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
