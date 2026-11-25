import React, { useCallback, useEffect, useState } from "react";
import {
  MobileTopBar,
  Sidebar,
  type NavPage,
} from "./components/Sidebar";
import { ErrorState } from "./components/States";
import { DashboardPage } from "./pages/DashboardPage";
import { EventsPage } from "./pages/EventsPage";
import { FileDetailsPage } from "./pages/FileDetailsPage";
import { FilesPage } from "./pages/FilesPage";
import { MonitoringPage } from "./pages/MonitoringPage";
import { NodesPage } from "./pages/NodesPage";
import { ReplicationPage } from "./pages/ReplicationPage";
import { SettingsPage } from "./pages/SettingsPage";
import { dfsApi } from "./services/api";
import type {
  ClusterStats,
  FileRecord,
  NodeInfo,
  SystemEvent,
} from "./types/dfs";

export const App: React.FC = () => {
  const [activePage, setActivePage] = useState<NavPage>("dashboard");
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [masterOnline, setMasterOnline] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
  const [stats, setStats] = useState<ClusterStats | null>(null);
  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [events, setEvents] = useState<SystemEvent[]>([]);

  const refreshCluster = useCallback(async () => {
    try {
      await dfsApi.getMasterHealth();
      setMasterOnline(true);
      const [s, n, f, e] = await Promise.all([
        dfsApi.getStats(),
        dfsApi.listNodes(),
        dfsApi.listFiles(),
        dfsApi.listEvents(150),
      ]);
      setStats(s);
      setNodes(n);
      setFiles(f);
      setEvents(e);
      setLastRefreshed(new Date().toISOString());
    } catch {
      setMasterOnline(false);
    }
  }, []);

  useEffect(() => {
    refreshCluster();
    const timer = window.setInterval(refreshCluster, 5000);
    return () => window.clearInterval(timer);
  }, [refreshCluster]);

  const handleSelectFile = (fileId: string) => {
    setSelectedFileId(fileId);
    setActivePage("file-detail");
  };

  return (
    <div className="flex min-h-screen bg-[#090b0f] text-zinc-100">
      <Sidebar
        activePage={activePage}
        onNavigate={(page) => setActivePage(page)}
        masterOnline={masterOnline}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar
          onOpenMenu={() => setMobileMenuOpen(true)}
          masterOnline={masterOnline}
        />

        <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[1440px] space-y-5">
            {!masterOnline && (
              <ErrorState
                message="Master Node coordinator (127.0.0.1:8000) is unreachable. Start the Master Node server to restore telemetry."
                onRetry={refreshCluster}
              />
            )}

            {activePage === "dashboard" && (
              <DashboardPage
                stats={stats}
                nodes={nodes}
                events={events}
                masterOnline={masterOnline}
                lastRefreshed={lastRefreshed}
                onRefresh={refreshCluster}
                onSelectFiles={() => setActivePage("files")}
                onSelectNodes={() => setActivePage("nodes")}
                onSelectReplication={() => setActivePage("replication")}
              />
            )}

            {activePage === "files" && (
              <FilesPage
                files={files}
                onRefresh={refreshCluster}
                onSelectFile={handleSelectFile}
              />
            )}

            {activePage === "file-detail" && selectedFileId && (
              <FileDetailsPage
                fileId={selectedFileId}
                onBack={() => setActivePage("files")}
              />
            )}

            {activePage === "nodes" && (
              <NodesPage nodes={nodes} onRefresh={refreshCluster} />
            )}

            {activePage === "replication" && (
              <ReplicationPage
                stats={stats}
                files={files}
                nodes={nodes}
                events={events}
                onRefresh={refreshCluster}
                onSelectFile={handleSelectFile}
              />
            )}

            {activePage === "monitoring" && (
              <MonitoringPage
                stats={stats}
                nodes={nodes}
                events={events}
                masterOnline={masterOnline}
                onRefresh={refreshCluster}
              />
            )}

            {activePage === "events" && (
              <EventsPage events={events} onRefresh={refreshCluster} />
            )}

            {activePage === "settings" && <SettingsPage />}
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;
