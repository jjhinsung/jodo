"use client";

import { setActivePlan, type Plan } from "../lib/jodo";

const THEMES = {
  brown: {
    on: "bg-[#F2E9DC] text-[#2a1c14] border-[#F2E9DC]",
    off: "bg-[#3a281c]/80 text-[#d9c4aa] border-[#5a4030] hover:border-[#C9A27E]",
    countOn: "bg-[#2a1c14] text-[#F2E9DC]",
    countOff: "bg-[#5a4030] text-[#F2E9DC]",
    add: "border-[#6b4d38] text-[#a88b72] hover:text-[#F2E9DC] hover:border-[#C9A27E]",
  },
  black: {
    on: "bg-[#F2E9DC] text-neutral-950 border-[#F2E9DC]",
    off: "bg-neutral-900 text-neutral-300 border-neutral-800 hover:border-neutral-600",
    countOn: "bg-neutral-950 text-[#F2E9DC]",
    countOff: "bg-neutral-700 text-neutral-100",
    add: "border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500",
  },
};

export function LockIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M4.5 7V5a3.5 3.5 0 1 1 7 0v2h.5A1.5 1.5 0 0 1 13.5 8.5v5A1.5 1.5 0 0 1 12 15H4a1.5 1.5 0 0 1-1.5-1.5v-5A1.5 1.5 0 0 1 4 7h.5Zm1.5 0h4V5a2 2 0 1 0-4 0v2Z" />
    </svg>
  );
}

type Props = {
  plans: Plan[];
  activeId: string;
  theme: keyof typeof THEMES;
  onNew?: () => void;
};

/** One tab per plan ("Clean the house", "Homework", …). */
export default function PlanTabs({ plans, activeId, theme, onNew }: Props) {
  const t = THEMES[theme];
  return (
    <div role="tablist" aria-label="Plans" className="flex items-center gap-2 overflow-x-auto pb-1">
      {plans.map((p) => {
        const on = p.id === activeId;
        const left = p.tasks.filter((x) => x.status !== "done").length;
        return (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => setActivePlan(p.id)}
            className={`shrink-0 flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
              on ? t.on : t.off
            }`}
          >
            {p.locked && <LockIcon />}
            <span className="max-w-[10rem] truncate">{p.name}</span>
            {left > 0 && (
              <span className={`rounded-full px-1.5 text-[11px] leading-5 ${on ? t.countOn : t.countOff}`}>{left}</span>
            )}
          </button>
        );
      })}
      {onNew && (
        <button
          type="button"
          onClick={onNew}
          className={`shrink-0 rounded-full border border-dashed px-4 py-2 text-sm font-semibold transition-colors ${t.add}`}
        >
          + New plan
        </button>
      )}
    </div>
  );
}
