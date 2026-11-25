import React from "react";

interface TooltipProps {
  text: string;
  children: React.ReactNode;
}

export const Tooltip: React.FC<TooltipProps> = ({ text, children }) => {
  return (
    <span className="group relative inline-flex items-center">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded border border-[#272f3e] bg-[#141922] px-2 py-1 text-[11px] text-zinc-200 shadow-lg group-hover:block"
      >
        {text}
      </span>
    </span>
  );
};
