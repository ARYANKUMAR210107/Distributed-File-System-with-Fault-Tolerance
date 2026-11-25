import React from "react";
import {
  Activity,
  ChevronsLeft,
  ChevronsRight,
  CopyCheck,
  FolderKanban,
  HardDrive,
  LayoutDashboard,
  ListFilter,
  Menu,
  Server,
  Settings,
  X,
} from "lucide-react";

export type NavPage =
  | "dashboard"
  | "files"
  | "nodes"
  | "replication"
  | "monitoring"
  | "events"
  | "settings"
  | "file-detail";

interface SidebarProps {
  activePage: NavPage;
  onNavigate: (page: NavPage) => void;
  masterOnline: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

interface NavGroup {
  section: string;
  items: Array<{
    id: NavPage;
    label: string;
    icon: React.FC<{ className?: string }>;
  }>;
}

const NAV_GROUPS: NavGroup[] = [
  {
    section: "OVERVIEW",
    items: [
      { id: "dashboard", label: "Cluster Overview", icon: LayoutDashboard },
    ],
  },
  {
    section: "STORAGE",
    items: [
      { id: "files", label: "Files", icon: FolderKanban },
      { id: "nodes", label: "Storage Nodes", icon: Server },
      { id: "replication", label: "Replication", icon: CopyCheck },
    ],
  },
  {
    section: "OBSERVABILITY",
    items: [
      { id: "monitoring", label: "Monitoring", icon: Activity },
      { id: "events", label: "Event Logs", icon: ListFilter },
    ],
  },
  {
    section: "SYSTEM",
    items: [{ id: "settings", label: "Settings", icon: Settings }],
  },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activePage,
  onNavigate,
  masterOnline,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
}) => {
  const handleSelect = (page: NavPage) => {
    onNavigate(page);
    onCloseMobile();
  };

  const content = (
    <div className="flex h-full flex-col bg-[#0c0f14]">
      {/* Brand Header */}
      <div
        className={`flex items-start justify-between gap-2 border-b border-[#1e2430] px-3.5 py-3.5 ${
          collapsed ? "justify-center px-2" : ""
        }`}
      >
        <div
          className={`flex min-w-0 items-center gap-2.5 ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-sky-500/30 bg-sky-500/10 text-sky-400">
            <HardDrive className="h-4 w-4" />
          </div>
          {!collapsed && (
            <div className="min-w-0 space-y-0.5">
              <div className="text-[13px] font-semibold leading-snug tracking-tight text-zinc-100">
                Distributed Storage Control Plane
              </div>
              <div className="text-[11px] leading-tight text-zinc-500">
                Fault-Tolerant Storage Infrastructure
              </div>
            </div>
          )}
        </div>
        {!collapsed && (
          <button
            onClick={onToggleCollapse}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
            className="hidden shrink-0 rounded p-1 text-zinc-500 hover:bg-[#141922] hover:text-zinc-200 lg:inline-flex"
          >
            <ChevronsLeft className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={onCloseMobile}
          aria-label="Close navigation"
          className="shrink-0 rounded p-1 text-zinc-400 hover:bg-[#141922] lg:hidden"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {collapsed && (
        <div className="hidden justify-center border-b border-[#1e2430] py-2 lg:flex">
          <button
            onClick={onToggleCollapse}
            aria-label="Expand sidebar"
            title="Expand sidebar"
            className="rounded p-1 text-zinc-500 hover:bg-[#141922] hover:text-zinc-200"
          >
            <ChevronsRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Grouped Navigation */}
      <nav
        aria-label="Primary navigation"
        className="flex-1 space-y-5 overflow-y-auto px-2.5 py-4"
      >
        {NAV_GROUPS.map((group) => (
          <div key={group.section}>
            {!collapsed && (
              <div className="mb-1.5 px-2.5 text-[10px] font-semibold tracking-wider text-zinc-500">
                {group.section}
              </div>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive =
                  activePage === item.id ||
                  (activePage === "file-detail" && item.id === "files");
                return (
                  <button
                    key={item.id}
                    onClick={() => handleSelect(item.id)}
                    title={collapsed ? item.label : undefined}
                    aria-current={isActive ? "page" : undefined}
                    className={`group flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-xs font-medium transition-colors ${
                      isActive
                        ? "bg-sky-500/10 text-sky-300 ring-1 ring-inset ring-sky-500/25"
                        : "text-zinc-400 hover:bg-[#141922] hover:text-zinc-100"
                    } ${collapsed ? "justify-center px-0" : ""}`}
                  >
                    <Icon
                      className={`h-4 w-4 shrink-0 ${
                        isActive
                          ? "text-sky-400"
                          : "text-zinc-500 group-hover:text-zinc-300"
                      }`}
                    />
                    {!collapsed && (
                      <span className="truncate">{item.label}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Master Status Footer */}
      <div className="border-t border-[#1e2430] p-3">
        <div
          className={`flex items-center rounded border border-[#1e2430] bg-[#090b0f] px-2.5 py-2 ${
            collapsed ? "justify-center" : "justify-between"
          }`}
        >
          {!collapsed && (
            <span className="text-[11px] font-medium text-zinc-400">
              Master API
            </span>
          )}
          <span
            title={`Master API: ${masterOnline ? "Online" : "Offline"}`}
            className={`inline-flex items-center gap-1.5 font-mono text-[11px] font-medium ${
              masterOnline ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                masterOnline ? "bg-emerald-400" : "bg-rose-400"
              }`}
            />
            {!collapsed && (masterOnline ? "Online" : "Offline")}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop rail */}
      <aside
        className={`hidden shrink-0 border-r border-[#1e2430] transition-all duration-150 lg:block ${
          collapsed ? "w-16" : "w-[272px]"
        }`}
      >
        {content}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-black/70"
            onClick={onCloseMobile}
          />
          <aside className="relative z-10 w-[272px] border-r border-[#1e2430]">
            {content}
          </aside>
        </div>
      )}
    </>
  );
};

export const MobileTopBar: React.FC<{
  onOpenMenu: () => void;
  masterOnline: boolean;
}> = ({ onOpenMenu, masterOnline }) => (
  <div className="flex items-center justify-between border-b border-[#1e2430] bg-[#0c0f14] px-4 py-2.5 lg:hidden">
    <button
      onClick={onOpenMenu}
      aria-label="Open navigation"
      className="rounded p-1.5 text-zinc-300 hover:bg-[#141922]"
    >
      <Menu className="h-4 w-4" />
    </button>
    <span className="text-xs font-semibold text-zinc-100">
      Distributed Storage Control Plane
    </span>
    <span
      className={`h-2 w-2 rounded-full ${
        masterOnline ? "bg-emerald-400" : "bg-rose-400"
      }`}
    />
  </div>
);
