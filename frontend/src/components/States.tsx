import React from "react";
import { AlertCircle, Inbox, Loader2 } from "lucide-react";

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  action,
}) => (
  <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-[#1e2430] bg-[#0f1218]/60 px-6 py-10 text-center">
    <Inbox className="h-7 w-7 text-zinc-600" />
    <p className="mt-2.5 text-sm font-medium text-zinc-300">{title}</p>
    {description && (
      <p className="mt-1 max-w-md text-xs text-zinc-500">{description}</p>
    )}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const LoadingState: React.FC<{ label?: string }> = ({
  label = "Loading cluster state…",
}) => (
  <div className="flex items-center justify-center gap-2.5 rounded-md border border-[#1e2430] bg-[#0f1218] px-6 py-10 text-xs text-zinc-400">
    <Loader2 className="h-4 w-4 animate-spin text-sky-400" />
    <span>{label}</span>
  </div>
);

export const ErrorState: React.FC<{
  message: string;
  onRetry?: () => void;
}> = ({ message, onRetry }) => (
  <div className="flex items-center justify-between gap-4 rounded-md border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-300">
    <div className="flex items-center gap-2.5">
      <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
      <span>{message}</span>
    </div>
    {onRetry && (
      <button
        onClick={onRetry}
        className="shrink-0 rounded border border-rose-500/40 px-2.5 py-1 text-[11px] font-medium text-rose-200 hover:bg-rose-500/20"
      >
        Retry
      </button>
    )}
  </div>
);
