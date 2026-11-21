"use client";

import { useState } from "react";
import { setActivePlan, type Plan } from "../lib/jodo";

/** Drag-and-drop type for a saved plan card being dragged onto the plans list. */
export const SAVED_DRAG_TYPE = "application/x-jodo-saved";

const THEMES = {
  brown: {
    on: "bg-[#F2E9DC] text-[#2a1c14] border-[#F2E9DC]",
    off: "bg-[#3a281c]/80 text-[#d9c4aa] border-[#5a4030] hover:border-[#C9A27E]",
    countOn: "bg-[#2a1c14] text-[#F2E9DC]",
    countOff: "bg-[#5a4030] text-[#F2E9DC]",
    subOn: "text-[#6b4d38]",
    subOff: "text-[#a88b72]",
    add: "border-[#6b4d38] text-[#a88b72] hover:text-[#F2E9DC] hover:border-[#C9A27E]",
    drop: "!border-[#93C5FD] !bg-[#1E3A8A]/60 !text-white",
    heading: "text-[#a88b72]",
    ring: "ring-[#93C5FD]/40",
    // sidebar list: light-touch, sits right on the dirt
    colOn: "bg-[#F2E9DC]/10 border-[#C9A27E]/50 text-[#F2E9DC]",
    colOff: "bg-transparent border-transparent text-[#d9c4aa] hover:bg-[#3a281c]/50 hover:text-[#F2E9DC]",
    colCount: "text-[#a88b72]",
    colSub: "text-[#8a6e57]",
  },
  black: {
    on: "bg-[#F2E9DC] text-neutral-950 border-[#F2E9DC]",
    off: "bg-neutral-900 text-neutral-300 border-neutral-800 hover:border-neutral-600",
    countOn: "bg-neutral-950 text-[#F2E9DC]",
    countOff: "bg-neutral-700 text-neutral-100",
    subOn: "text-neutral-500",
    subOff: "text-neutral-500",
    add: "border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-500",
    drop: "!border-[#93C5FD] !bg-[#1E3A8A]/60 !text-white",
    heading: "text-neutral-500",
    ring: "ring-[#93C5FD]/40",
    colOn: "bg-white/[0.07] border-neutral-600 text-white",
    colOff: "bg-transparent border-transparent text-neutral-400 hover:bg-white/[0.04] hover:text-neutral-200",
    colCount: "text-neutral-500",
    colSub: "text-neutral-600",
  },
};

export function LockIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M4.5 7V5a3.5 3.5 0 1 1 7 0v2h.5A1.5 1.5 0 0 1 13.5 8.5v5A1.5 1.5 0 0 1 12 15H4a1.5 1.5 0 0 1-1.5-1.5v-5A1.5 1.5 0 0 1 4 7h.5Zm1.5 0h4V5a2 2 0 1 0-4 0v2Z" />
    </svg>
  );
}

export function BookmarkIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M4 1.5h8A1.5 1.5 0 0 1 13.5 3v11.6a.5.5 0 0 1-.8.4L8 11.6l-4.7 3.4a.5.5 0 0 1-.8-.4V3A1.5 1.5 0 0 1 4 1.5Z" />
    </svg>
  );
}

type Props = {
  plans: Plan[];
  activeId: string;
  theme: keyof typeof THEMES;
  /** "column" = the tall list in the right-hand Plans sidebar; "row" = compact bar for small screens */
  layout?: "row" | "column";
  onNew?: () => void;
  /** The "Saved" button: reusable plans */
  saved?: { count: number; open: boolean; onToggle: () => void };
  /** A saved plan was dropped: onto an unlocked plan (planId) or anywhere else on the list (new plan). */
  onDropSaved?: (savedId: string, planId?: string) => void;
};

/** Every plan ("Clean the house", "Homework", …) — a vertical list in the sidebar, or a row on phones. */
export default function PlanTabs({ plans, activeId, theme, layout = "row", onNew, saved, onDropSaved }: Props) {
  const t = THEMES[theme];
  const col = layout === "column";
  const [over, setOver] = useState<string | null>(null); // plan id, "new", or null
  const [dragging, setDragging] = useState(false);

  const isSavedDrag = (e: React.DragEvent) => Boolean(onDropSaved) && e.dataTransfer.types.includes(SAVED_DRAG_TYPE);

  const dropProps = (target: string, planId?: string) =>
    onDropSaved
      ? {
          onDragOver: (e: React.DragEvent) => {
            if (!isSavedDrag(e)) return;
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = "copy";
            setOver(target);
          },
          onDragLeave: () => setOver((o) => (o === target ? null : o)),
          onDrop: (e: React.DragEvent) => {
            if (!isSavedDrag(e)) return;
            e.preventDefault();
            e.stopPropagation();
            setOver(null);
            setDragging(false);
            onDropSaved(e.dataTransfer.getData(SAVED_DRAG_TYPE), planId);
          },
        }
      : {};

  const listDragProps = {
    onDragEnter: (e: React.DragEvent) => isSavedDrag(e) && setDragging(true),
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
        setDragging(false);
        setOver(null);
      }
    },
    ...dropProps("new"),
  };

  const newButton = onNew && (
    <button
      type="button"
      onClick={onNew}
      {...dropProps("new")}
      className={`shrink-0 font-semibold transition-all ${
        col
          ? `w-full rounded-lg border border-transparent px-3 py-2 text-left text-sm ${t.colOff}`
          : `rounded-full border border-dashed px-4 py-2 text-sm ${t.add}`
      } ${over === "new" ? t.drop : ""}`}
    >
      {over === "new" ? "Drop for a new plan" : "+ New plan"}
    </button>
  );

  const savedButton = saved && (
    <button
      type="button"
      onClick={saved.onToggle}
      aria-expanded={saved.open}
      className={`shrink-0 flex items-center gap-1.5 border font-semibold transition-colors ${
        col
          ? `w-full rounded-lg px-3 py-2 text-sm ${saved.open ? t.colOn : t.colOff}`
          : `rounded-full px-4 py-2 text-sm ${saved.open ? t.on : t.off}`
      }`}
    >
      <BookmarkIcon className="w-3.5 h-3.5" />
      <span className={col ? "flex-1 text-left" : ""}>Saved plans</span>
      {saved.count > 0 &&
        (col ? (
          <span className={`text-[11px] font-normal ${t.colCount}`}>{saved.count}</span>
        ) : (
          <span className={`rounded-full px-1.5 text-[11px] leading-5 ${saved.open ? t.countOn : t.countOff}`}>
            {saved.count}
          </span>
        ))}
    </button>
  );

  const items = plans.map((p) => {
    const on = p.id === activeId;
    const open = p.tasks.filter((x) => x.status !== "done");
    const left = open.length;
    const mins = open.reduce((sum, x) => sum + x.minutes, 0);
    const canDrop = !p.locked;
    const hovering = over === p.id;
    const allDone = p.tasks.length > 0 && left === 0;

    if (col) {
      // finished plans get a faint green wash so they're easy to tell apart
      const look = allDone
        ? on
          ? "bg-green-500/20 border-transparent text-green-50"
          : "bg-green-500/10 border-transparent text-green-100/90 hover:bg-green-500/15"
        : on
          ? t.colOn
          : t.colOff;
      return (
        <button
          key={p.id}
          type="button"
          role="tab"
          aria-selected={on}
          onClick={() => setActivePlan(p.id)}
          {...(canDrop ? dropProps(p.id, p.id) : {})}
          className={`w-full rounded-lg border px-3 py-2 text-left transition-all ${look} ${hovering ? t.drop : ""}`}
        >
          <span className="flex items-center gap-2">
            {p.locked && <LockIcon className="w-3.5 h-3.5 shrink-0" />}
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{p.name}</span>
            {left > 0 && !hovering && <span className={`shrink-0 text-xs tabular-nums ${t.colCount}`}>{left}</span>}
            {allDone && !hovering && <span className="shrink-0 text-xs text-green-400">✓</span>}
          </span>
          <span
            className={`mt-0.5 block truncate text-xs leading-4 ${
              hovering ? "" : allDone ? "text-green-400/80" : t.colSub
            }`}
          >
            {hovering
              ? "+ add these tasks here"
              : p.tasks.length === 0
                ? "Empty"
                : left === 0
                  ? "All done"
                  : `${left} left · ~${mins} min${p.locked ? " · striking" : ""}`}
          </span>
        </button>
      );
    }

    return (
      <button
        key={p.id}
        type="button"
        role="tab"
        aria-selected={on}
        onClick={() => setActivePlan(p.id)}
        {...(canDrop ? dropProps(p.id, p.id) : {})}
        className={`shrink-0 flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-all ${
          on ? t.on : t.off
        } ${hovering ? `${t.drop} scale-105` : ""}`}
      >
        {p.locked && <LockIcon />}
        <span className="max-w-[10rem] truncate">{p.name}</span>
        {hovering ? (
          <span className="text-[11px]">+ add here</span>
        ) : (
          left > 0 && (
            <span className={`rounded-full px-1.5 text-[11px] leading-5 ${on ? t.countOn : t.countOff}`}>{left}</span>
          )
        )}
      </button>
    );
  });

  if (col) {
    return (
      <nav aria-label="Plans" className="flex h-full min-h-0 flex-col gap-1">
        <div className="flex items-baseline justify-between px-3 pb-1">
          <h2 className={`text-xs font-bold uppercase tracking-[0.2em] ${t.heading}`}>Plans</h2>
          <span className={`text-xs ${t.heading}`}>{plans.length}</span>
        </div>
        {newButton}
        <div
          role="tablist"
          aria-orientation="vertical"
          aria-label="Plans"
          className={`-mx-1 min-h-0 flex-1 space-y-1 overflow-y-auto rounded-lg px-1 py-1 transition-shadow [scrollbar-width:thin] ${
            dragging ? `ring-2 ${t.ring}` : ""
          }`}
          {...listDragProps}
        >
          {items}
        </div>
        {savedButton}
      </nav>
    );
  }

  return (
    <div className="flex items-start gap-2">
      <div
        role="tablist"
        aria-label="Plans"
        className={`flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-1 rounded-full transition-shadow ${
          dragging ? `ring-2 ${t.ring}` : ""
        }`}
        {...listDragProps}
      >
        {items}
        {newButton}
      </div>
      {savedButton}
    </div>
  );
}
