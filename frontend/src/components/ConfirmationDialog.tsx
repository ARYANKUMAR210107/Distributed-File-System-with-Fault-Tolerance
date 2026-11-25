import React, { useEffect } from "react";
import { AlertTriangle, X } from "lucide-react";

interface ConfirmationDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, loading, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-md border border-[#272f3e] bg-[#0f1218] shadow-xl">
        <div className="flex items-center justify-between border-b border-[#1e2430] px-4 py-3">
          <div className="flex items-center gap-2">
            {destructive && (
              <AlertTriangle className="h-4 w-4 text-rose-400" />
            )}
            <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
          </div>
          <button
            disabled={loading}
            onClick={onCancel}
            aria-label="Close dialog"
            className="rounded p-1 text-zinc-400 hover:bg-[#1a202c] hover:text-zinc-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-4 py-4 text-xs leading-relaxed text-zinc-300">
          {description}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[#1e2430] bg-[#0c0f14] px-4 py-3">
          <button
            disabled={loading}
            onClick={onCancel}
            className="rounded border border-[#272f3e] bg-[#141922] px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-[#1a202c] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            disabled={loading}
            onClick={onConfirm}
            className={`rounded px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 ${
              destructive
                ? "bg-rose-600 hover:bg-rose-500"
                : "bg-sky-600 hover:bg-sky-500"
            }`}
          >
            {loading ? "Processing…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
