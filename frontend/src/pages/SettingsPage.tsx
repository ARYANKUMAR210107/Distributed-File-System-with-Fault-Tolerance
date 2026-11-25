import React, { useEffect, useState } from "react";
import { CheckCircle2, Save } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { ErrorState, LoadingState } from "../components/States";
import { API_BASE_URL, dfsApi } from "../services/api";
import type { RuntimeSettings } from "../types/dfs";

export const SettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<RuntimeSettings | null>(null);
  const [chunkSizeKB, setChunkSizeKB] = useState(1024);
  const [replicationFactor, setReplicationFactor] = useState(2);
  const [maxUploadMb, setMaxUploadMb] = useState(200);
  const [autoReplicate, setAutoReplicate] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    dfsApi
      .getSettings()
      .then((s) => {
        setSettings(s);
        setChunkSizeKB(Math.round(s.chunk_size / 1024));
        setReplicationFactor(s.replication_factor);
        setMaxUploadMb(s.max_upload_size_mb);
        setAutoReplicate(s.auto_replicate_on_failure);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load settings.")
      );
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedMsg(null);
    setError(null);
    try {
      const updated = await dfsApi.updateSettings({
        chunk_size: chunkSizeKB * 1024,
        replication_factor: replicationFactor,
        max_upload_size_mb: maxUploadMb,
        auto_replicate_on_failure: autoReplicate,
      });
      setSettings(updated);
      setSavedMsg("Runtime configuration persisted to Master Node.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  if (!settings && !error) {
    return <LoadingState label="Loading cluster configuration…" />;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Settings"
        description="Safe runtime configuration for chunking, replication factor, and automated failure recovery"
      />

      {error && <ErrorState message={error} />}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <form
          onSubmit={handleSave}
          className="space-y-4 rounded-md border border-[#1e2430] bg-[#0f1218] p-5 lg:col-span-2"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="chunk-size"
                className="block text-[11px] font-medium uppercase tracking-wider text-zinc-400"
              >
                Default Chunk Size (KB)
              </label>
              <input
                id="chunk-size"
                type="number"
                min={4}
                max={65536}
                value={chunkSizeKB}
                onChange={(e) => setChunkSizeKB(Number(e.target.value))}
                className="mt-1.5 w-full rounded border border-[#272f3e] bg-[#090b0f] px-3 py-1.5 font-mono text-xs text-zinc-100 focus:border-sky-500 focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-zinc-500">
                Range: 4 KB – 65,536 KB. Applies to newly uploaded objects.
              </p>
            </div>

            <div>
              <label
                htmlFor="rep-factor"
                className="block text-[11px] font-medium uppercase tracking-wider text-zinc-400"
              >
                Replication Factor
              </label>
              <input
                id="rep-factor"
                type="number"
                min={1}
                max={5}
                value={replicationFactor}
                onChange={(e) => setReplicationFactor(Number(e.target.value))}
                className="mt-1.5 w-full rounded border border-[#272f3e] bg-[#090b0f] px-3 py-1.5 font-mono text-xs text-zinc-100 focus:border-sky-500 focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-zinc-500">
                Distinct Storage Nodes per chunk (1 – 5).
              </p>
            </div>

            <div>
              <label
                htmlFor="max-upload"
                className="block text-[11px] font-medium uppercase tracking-wider text-zinc-400"
              >
                Max Upload Size (MB)
              </label>
              <input
                id="max-upload"
                type="number"
                min={1}
                max={2048}
                value={maxUploadMb}
                onChange={(e) => setMaxUploadMb(Number(e.target.value))}
                className="mt-1.5 w-full rounded border border-[#272f3e] bg-[#090b0f] px-3 py-1.5 font-mono text-xs text-zinc-100 focus:border-sky-500 focus:outline-none"
              />
            </div>
          </div>

          <label className="flex items-center gap-2.5 border-t border-[#1e2430] pt-4 text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={autoReplicate}
              onChange={(e) => setAutoReplicate(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-[#272f3e] bg-[#090b0f] text-sky-500"
            />
            Automatically re-replicate under-replicated chunks when a Storage Node goes offline
          </label>

          {savedMsg && (
            <div className="flex items-center gap-2 rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {savedMsg}
            </div>
          )}

          <div className="pt-1">
            <button
              disabled={saving || !settings}
              type="submit"
              className="inline-flex items-center gap-1.5 rounded bg-sky-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? "Saving…" : "Save Configuration"}
            </button>
          </div>
        </form>

        <div className="rounded-md border border-[#1e2430] bg-[#0f1218] p-5 text-xs">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-300">
            Control Plane Diagnostics
          </h2>
          <dl className="space-y-3 text-xs">
            <div>
              <dt className="text-[11px] text-zinc-500">Master API Base URL</dt>
              <dd className="mt-0.5 font-mono text-zinc-200">{API_BASE_URL}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-zinc-500">
                Health Check Interval
              </dt>
              <dd className="mt-0.5 font-mono text-zinc-200">
                {settings?.health_check_interval_seconds ?? "—"} seconds
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-zinc-500">Placement Policy</dt>
              <dd className="mt-0.5 text-zinc-300">
                Round-Robin with Distinct-Node Replica Placement
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-zinc-500">
                Integrity Verification
              </dt>
              <dd className="mt-0.5 text-zinc-300">
                Per-chunk & full-file SHA-256 checksums
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
};
