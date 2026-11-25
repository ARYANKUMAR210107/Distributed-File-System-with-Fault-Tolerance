import React from "react";

interface StatusBadgeProps {
  status: string;
  size?: "sm" | "md";
}

const STYLE_MAP: Record<string, { badge: string; dot: string }> = {
  online: {
    badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
    dot: "bg-emerald-400",
  },
  healthy: {
    badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
    dot: "bg-emerald-400",
  },
  replicated: {
    badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
    dot: "bg-emerald-400",
  },
  stored: {
    badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
    dot: "bg-emerald-400",
  },
  verified: {
    badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
    dot: "bg-emerald-400",
  },
  info: {
    badge: "bg-sky-500/10 text-sky-400 border-sky-500/25",
    dot: "bg-sky-400",
  },
  degraded: {
    badge: "bg-amber-500/10 text-amber-400 border-amber-500/25",
    dot: "bg-amber-400",
  },
  under_replicated: {
    badge: "bg-amber-500/10 text-amber-400 border-amber-500/25",
    dot: "bg-amber-400",
  },
  warning: {
    badge: "bg-amber-500/10 text-amber-400 border-amber-500/25",
    dot: "bg-amber-400",
  },
  offline: {
    badge: "bg-rose-500/10 text-rose-400 border-rose-500/25",
    dot: "bg-rose-400",
  },
  failed: {
    badge: "bg-rose-500/10 text-rose-400 border-rose-500/25",
    dot: "bg-rose-400",
  },
  corrupted: {
    badge: "bg-rose-500/10 text-rose-400 border-rose-500/25",
    dot: "bg-rose-400",
  },
  missing: {
    badge: "bg-rose-500/10 text-rose-400 border-rose-500/25",
    dot: "bg-rose-400",
  },
  unavailable: {
    badge: "bg-rose-500/10 text-rose-400 border-rose-500/25",
    dot: "bg-rose-400",
  },
  error: {
    badge: "bg-rose-500/10 text-rose-400 border-rose-500/25",
    dot: "bg-rose-400",
  },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  size = "sm",
}) => {
  const key = status.toLowerCase();
  const styles = STYLE_MAP[key] || {
    badge: "bg-zinc-800/70 text-zinc-300 border-zinc-700",
    dot: "bg-zinc-400",
  };
  const sizing =
    size === "md" ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-[11px]";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border font-medium capitalize tracking-tight ${sizing} ${styles.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} />
      {status.replace(/_/g, " ")}
    </span>
  );
};
