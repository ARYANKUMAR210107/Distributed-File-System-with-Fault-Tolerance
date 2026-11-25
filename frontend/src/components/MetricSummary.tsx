import React from "react";
import { HelpCircle } from "lucide-react";
import { Tooltip } from "./Tooltip";

export interface MetricItem {
  label: string;
  value: string;
  detail?: string;
  tooltip?: string;
  tone?: "default" | "healthy" | "warning" | "error";
  onClick?: () => void;
}

interface MetricSummaryProps {
  items: MetricItem[];
}

const TONE_CLASS: Record<NonNullable<MetricItem["tone"]>, string> = {
  default: "text-zinc-100",
  healthy: "text-emerald-400",
  warning: "text-amber-400",
  error: "text-rose-400",
};

export const MetricSummary: React.FC<MetricSummaryProps> = ({ items }) => {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-[#1e2430] bg-[#1e2430] sm:grid-cols-3 xl:grid-cols-6">
      {items.map((item) => {
        const valueColor = TONE_CLASS[item.tone ?? "default"];
        const Wrapper = item.onClick ? "button" : "div";
        return (
          <Wrapper
            key={item.label}
            onClick={item.onClick}
            className={`flex flex-col justify-between bg-[#0f1218] px-4 py-3 text-left transition-colors ${
              item.onClick ? "cursor-pointer hover:bg-[#141922]" : ""
            }`}
          >
            <div className="flex items-center justify-between gap-1.5">
              <span className="truncate text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                {item.label}
              </span>
              {item.tooltip && (
                <Tooltip text={item.tooltip}>
                  <HelpCircle className="h-3 w-3 shrink-0 text-zinc-600 hover:text-zinc-400" />
                </Tooltip>
              )}
            </div>
            <span
              className={`mt-1.5 font-mono text-base font-semibold tracking-tight sm:text-lg ${valueColor}`}
            >
              {item.value}
            </span>
            {item.detail && (
              <span className="mt-1 truncate text-[11px] text-zinc-400">
                {item.detail}
              </span>
            )}
          </Wrapper>
        );
      })}
    </div>
  );
};
