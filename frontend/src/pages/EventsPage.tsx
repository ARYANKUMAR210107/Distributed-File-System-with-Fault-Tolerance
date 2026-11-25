import React from "react";
import { RefreshCw } from "lucide-react";
import { EventTimeline } from "../components/EventTimeline";
import { PageHeader } from "../components/PageHeader";
import type { SystemEvent } from "../types/dfs";

interface EventsPageProps {
  events: SystemEvent[];
  onRefresh: () => void;
}

export const EventsPage: React.FC<EventsPageProps> = ({
  events,
  onRefresh,
}) => {
  const errorCount = events.filter((e) => e.severity === "error").length;
  const warnCount = events.filter((e) => e.severity === "warning").length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Event Logs"
        description="Persistent SQLite audit trail of node health transitions, transfers, failovers, and recoveries"
        meta={
          <span className="font-mono">
            {events.length} loaded · {warnCount} warning · {errorCount} error
          </span>
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

      <EventTimeline events={events} pageSize={15} showSearch />
    </div>
  );
};
