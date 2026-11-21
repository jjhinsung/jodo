"use client";

import { useRef, useState } from "react";
import { Inter } from "next/font/google";
import ConfirmButton from "../components/ConfirmButton";
import PlanScenery from "../components/PlanScenery";
import PlanTabs, { BookmarkIcon, LockIcon, SAVED_DRAG_TYPE } from "../components/PlanTabs";
import SideTitle from "../components/SideTitle";
import TransitionLink from "../components/TransitionLink";
import {
  DEFAULT_TIMER,
  PRIORITIES,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  TIMER_PRESETS,
  priorityStyle,
  activePlan,
  addPlan,
  addTask,
  applySaved,
  byImportance,
  deletePlan,
  deleteSaved,
  deleteTask,
  lockPlan,
  renamePlan,
  resetPlan,
  savePlan,
  updateTask,
  useJodo,
  type Plan,
  type SavedPlan,
  type Task,
} from "../lib/jodo";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });

// hide the browser's up/down arrows on number inputs
const noSpin = "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

const chip = "rounded-lg border text-sm font-semibold transition-colors";
const chipOn = "bg-[#F2E9DC] text-[#2a1c14] border-[#F2E9DC]";
const chipOff = "bg-transparent text-[#d9c4aa] border-[#6b4d38] hover:border-[#C9A27E]";
const smallBtn = "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors";

export default function PlanPage() {
  const state = useJodo();
  const plan = activePlan(state);
  const [justCreated, setJustCreated] = useState<string | null>(null);
  const [savedOpen, setSavedOpen] = useState(false);
  const [justSaved, setJustSaved] = useState<string | null>(null); // plan id, for the "Saved ✓" flash
  const alreadySaved = state.saved.some((s) => s.name.trim().toLowerCase() === plan.name.trim().toLowerCase());

  function handleSave() {
    savePlan(plan.id);
    setJustSaved(plan.id);
    setTimeout(() => setJustSaved((id) => (id === plan.id ? null : id)), 1800);
  }

  const open = plan.tasks.filter((t) => t.status !== "done").sort(byImportance);
  const done = plan.tasks.filter((t) => t.status === "done");
  const totalMinutes = open.reduce((sum, t) => sum + t.minutes, 0);

  const tabProps = {
    plans: state.plans,
    activeId: plan.id,
    theme: "brown" as const,
    onNew: () => setJustCreated(addPlan()),
    saved: { count: state.saved.length, open: savedOpen, onToggle: () => setSavedOpen((o) => !o) },
    onDropSaved: (id: string, planId?: string) => applySaved(id, planId),
  };

  return (
    <div data-dirt className={`${inter.className} flex min-h-screen bg-[#2a1c14] text-[#F2E9DC]`}>
      <PlanScenery />
      <SideTitle word="PLAN" />

      <div data-dirt className="relative z-10 flex-1 min-w-0 pt-10 pb-44">
        <main data-dirt className="px-5 sm:px-10 max-w-2xl mx-auto">
          {/* small screens: plans as a row; wide screens use the sidebar on the right */}
          <div className="lg:hidden">
            <PlanTabs {...tabProps} layout="row" />
          </div>

          {savedOpen && <SavedPanel saved={state.saved} activePlan={plan} onClose={() => setSavedOpen(false)} />}

          {/* Plan header: name + save / reset / delete */}
          <div data-dirt className="mt-6 flex flex-wrap items-center gap-3">
            <PlanName key={plan.id} plan={plan} autoFocus={justCreated === plan.id} />
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={plan.tasks.length === 0}
                title={alreadySaved ? "Update the saved copy of this plan" : "Save this plan to reuse it any day"}
                className={`${smallBtn} flex items-center gap-1.5 disabled:opacity-40 ${
                  justSaved === plan.id
                    ? "border-[#93C5FD] bg-[#1E3A8A] text-white"
                    : "border-[#6b4d38] text-[#d9c4aa] hover:border-[#93C5FD] hover:text-white"
                }`}
              >
                <BookmarkIcon className="w-3 h-3" />
                {justSaved === plan.id ? "Saved ✓" : alreadySaved ? "Update saved" : "Save plan"}
              </button>
              <ConfirmButton
                label="Reset plan"
                confirmLabel="Tap again to wipe it"
                onConfirm={() => resetPlan(plan.id)}
                className={`${smallBtn} border-[#6b4d38] text-[#d9c4aa] hover:border-[#C9A27E]`}
                armedClassName="!border-red-400 !text-red-300"
              />
              {state.plans.length > 1 && (
                <ConfirmButton
                  label="Delete"
                  confirmLabel="Tap again to delete"
                  onConfirm={() => deletePlan(plan.id)}
                  className={`${smallBtn} border-transparent text-[#a88b72] hover:text-red-300`}
                  armedClassName="!border-red-400 !text-red-300"
                />
              )}
            </div>
          </div>

          {plan.locked ? <LockedBanner plan={plan} /> : <QuickAdd />}

          {/* Tasks */}
          <div data-dirt className="mt-8 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[#a88b72]">Tasks</h2>
            {open.length > 0 && (
              <span className="text-sm text-[#a88b72]">
                {open.length} {open.length === 1 ? "task" : "tasks"} · ~{totalMinutes} min
              </span>
            )}
          </div>

          {open.length === 0 && done.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-[#5a4030] bg-[#2a1c14]/70 px-5 py-8 text-center text-[#a88b72]">
              Nothing in this plan yet. Add your first task above.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {open.map((task) => (
                <TaskRow key={task.id} task={task} locked={plan.locked} />
              ))}
              {done.map((task) => (
                <li
                  key={task.id}
                  className="flex items-center gap-3 rounded-xl border border-[#3f2c1f] bg-[#2f2017] px-3 py-2.5 text-[#8a6e57]"
                >
                  <span className="w-9 text-center text-green-500">✓</span>
                  <span className="flex-1 min-w-0 line-through break-words">{task.action}</span>
                </li>
              ))}
            </ul>
          )}
        </main>
      </div>

      {/* Plans sidebar (wide screens): every plan in one tall, scrollable list */}
      <aside data-dirt className="relative z-[16] hidden lg:block w-60 xl:w-64 shrink-0">
        <div data-dirt className="sticky top-0 h-screen pl-2 pr-5 pt-10 pb-36">
          <PlanTabs {...tabProps} layout="column" />
        </div>
      </aside>

      {/* Fade so the task list doesn't run into the grass */}
      <div className="pointer-events-none fixed bottom-0 right-0 lg:right-60 xl:right-64 left-24 sm:left-28 z-[12] h-48 bg-gradient-to-t from-[#2a1c14] via-[#2a1c14]/90 to-transparent" />

      {/* Bottom bar — sits in front of the grass */}
      <div className="fixed bottom-0 right-0 lg:right-60 xl:right-64 left-24 sm:left-28 z-20 pb-6 px-6 sm:px-10">
        <div className="max-w-2xl mx-auto">
          <TransitionLink
            kind="slash"
            href="/strike"
            aria-disabled={open.length === 0}
            onClick={() => lockPlan(plan.id)}
            className={`flex items-center justify-center gap-2 w-full py-3.5 rounded-xl font-bold tracking-wide transition-colors ${
              open.length === 0
                ? "bg-[#4a3424] text-[#a88b72] pointer-events-none"
                : "bg-[#F2E9DC] text-[#2a1c14] hover:bg-white"
            }`}
          >
            {plan.locked ? "Back to Strike →" : (
              <>
                <LockIcon /> Lock it in — go Strike →
              </>
            )}
          </TransitionLink>
        </div>
      </div>
    </div>
  );
}

/**
 * Reusable plans ("Morning routine": cook, coffee, water plants). Drag one onto the tabs
 * above (onto a plan to add its tasks there, anywhere else for a new tab), or tap a button.
 */
function SavedPanel({ saved, activePlan, onClose }: { saved: SavedPlan[]; activePlan: Plan; onClose: () => void }) {
  return (
    <section
      aria-label="Saved plans"
      className="mt-4 rounded-2xl border border-[#93C5FD]/30 bg-[#22170f]/95 p-4 sm:p-5 shadow-[0_20px_50px_rgba(0,0,0,0.35)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-bold">
            <BookmarkIcon className="w-4 h-4 text-[#93C5FD]" /> Saved plans
          </h2>
          <p className="mt-0.5 text-sm text-[#a88b72]">
            Drag one onto the tabs above — onto a plan to add its tasks, or onto “+ New plan” for a fresh tab.
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close saved plans" className="text-xl leading-none text-[#8a6e57] hover:text-[#F2E9DC]">
          ×
        </button>
      </div>

      {saved.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-[#5a4030] px-4 py-6 text-center text-sm text-[#a88b72]">
          Nothing saved yet. Build a plan you repeat (like cooking, coffee, watering plants), then hit{" "}
          <span className="font-semibold text-[#F2E9DC]">Save plan</span>.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {saved.map((s) => {
            const total = s.tasks.reduce((sum, t) => sum + t.minutes, 0);
            return (
              <li
                key={s.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(SAVED_DRAG_TYPE, s.id);
                  e.dataTransfer.setData("text/plain", s.name);
                  e.dataTransfer.effectAllowed = "copy";
                }}
                className="group cursor-grab active:cursor-grabbing rounded-xl border border-[#5a4030] bg-[#3a281c] p-3 transition-colors hover:border-[#93C5FD]/60"
              >
                <div className="flex items-center gap-3">
                  <span aria-hidden="true" className="select-none text-[#6b4d38] group-hover:text-[#93C5FD]">
                    ⋮⋮
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{s.name}</p>
                    <p className="text-xs text-[#a88b72]">
                      {s.tasks.length} {s.tasks.length === 1 ? "task" : "tasks"} · ~{total} min
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => applySaved(s.id)}
                    className={`${smallBtn} border-[#F2E9DC] bg-[#F2E9DC] text-[#2a1c14] hover:bg-white`}
                  >
                    Use as new tab
                  </button>
                  {!activePlan.locked && (
                    <button
                      type="button"
                      onClick={() => applySaved(s.id, activePlan.id)}
                      title={`Add these tasks to “${activePlan.name}”`}
                      className={`${smallBtn} hidden sm:block border-[#6b4d38] text-[#d9c4aa] hover:border-[#C9A27E]`}
                    >
                      Add to this plan
                    </button>
                  )}
                  <ConfirmButton
                    label="×"
                    confirmLabel="Delete?"
                    onConfirm={() => deleteSaved(s.id)}
                    className="rounded-lg px-2 py-1 text-sm text-[#8a6e57] hover:text-red-300"
                    armedClassName="!text-red-300"
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 pl-7">
                  {s.tasks.map((t, i) => (
                    <span
                      key={i}
                      style={priorityStyle(t.priority)}
                      className="rounded-md border px-2 py-0.5 text-[11px] font-semibold"
                    >
                      {t.action} · {t.minutes}m
                    </span>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** The plan's name, editable in place. */
function PlanName({ plan, autoFocus }: { plan: Plan; autoFocus: boolean }) {
  const [draft, setDraft] = useState(plan.name);
  return (
    <input
      value={draft}
      autoFocus={autoFocus}
      onFocus={(e) => autoFocus && e.target.select()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => renamePlan(plan.id, draft)}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      aria-label="Plan name"
      placeholder="Name this plan"
      className="min-w-0 flex-1 bg-transparent text-3xl font-extrabold tracking-tight placeholder:text-[#6b4d38] rounded-lg px-1 -mx-1 border border-transparent hover:border-[#5a4030] focus:border-[#C9A27E] focus:outline-none"
    />
  );
}

function LockedBanner({ plan }: { plan: Plan }) {
  const doneCount = plan.tasks.filter((t) => t.status === "done").length;
  return (
    <div className="mt-5 rounded-2xl border border-[#C9A27E]/50 bg-[#3a281c] p-5">
      <div className="flex items-center gap-2 font-bold">
        <LockIcon className="w-4 h-4 text-[#C9A27E]" />
        Locked in — you&apos;re striking this plan.
      </div>
      <p className="mt-1.5 text-sm text-[#d9c4aa]">
        No changes until every task is done. {doneCount} of {plan.tasks.length} finished.
      </p>
      <div className="mt-3 h-1.5 rounded-full bg-[#2a1c14] overflow-hidden">
        <div
          className="h-full bg-[#C9A27E] transition-all"
          style={{ width: `${plan.tasks.length ? (doneCount / plan.tasks.length) * 100 : 0}%` }}
        />
      </div>
    </div>
  );
}

function QuickAdd() {
  // remembers your last timer/priority so adding many similar tasks is fast
  const [action, setAction] = useState("");
  const [minutes, setMinutes] = useState(String(DEFAULT_TIMER));
  const [priority, setPriority] = useState(2);
  // keyboard flow: name ↵ → timer ↵ → priority (arrows) ↵ → added, back to name
  const [step, setStep] = useState<"name" | "timer" | "priority" | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<HTMLInputElement>(null);
  const priorityRef = useRef<HTMLDivElement>(null);

  function save() {
    if (!action.trim()) {
      nameRef.current?.focus();
      return;
    }
    addTask({ action, priority, minutes: Math.max(1, Number(minutes) || DEFAULT_TIMER) });
    setAction("");
    nameRef.current?.focus();
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    save();
  }

  function onNameKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (!action.trim()) return;
    timerRef.current?.focus();
    timerRef.current?.select();
  }

  function onTimerKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (!(Number(minutes) >= 1)) setMinutes(String(DEFAULT_TIMER));
    priorityRef.current?.focus();
  }

  function onPriorityKey(e: React.KeyboardEvent<HTMLDivElement>) {
    const k = e.key;
    if (k === "ArrowLeft" || k === "ArrowUp") setPriority((p) => Math.max(1, p - 1));
    else if (k === "ArrowRight" || k === "ArrowDown") setPriority((p) => Math.min(3, p + 1));
    else if (k === "1" || k === "2" || k === "3") setPriority(Number(k));
    else if (k === "Enter") save();
    else return;
    e.preventDefault();
  }

  const label = (s: typeof step) =>
    `flex items-center gap-2 text-xs font-semibold uppercase tracking-wider mb-2 transition-colors ${
      step === s ? "text-[#F2E9DC]" : "text-[#a88b72]"
    }`;
  const hint = (s: typeof step, text: string) =>
    step === s && (
      <span className="normal-case tracking-normal font-normal text-[11px] text-[#C9A27E]">{text}</span>
    );

  return (
    <form
      onSubmit={submit}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setStep(null);
      }}
      className="mt-5 rounded-2xl bg-[#3a281c] border border-[#5a4030] p-4 sm:p-5 space-y-5"
    >
      <div className="flex gap-2">
        <input
          ref={nameRef}
          type="text"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          onKeyDown={onNameKey}
          onFocus={() => setStep("name")}
          enterKeyHint="next"
          placeholder="What do you need to do? then Enter ↵"
          className="flex-1 min-w-0 bg-[#2a1c14] border border-[#6b4d38] rounded-lg px-4 py-3 text-base placeholder:text-[#8a6e57] focus:outline-none focus:border-[#C9A27E]"
        />
        <button
          type="submit"
          disabled={!action.trim()}
          className="px-5 rounded-lg bg-[#F2E9DC] text-[#2a1c14] font-semibold text-sm disabled:opacity-40 hover:bg-white transition-colors"
        >
          Add
        </button>
      </div>

      {/* Timer — the main event */}
      <div>
        <span className={label("timer")}>Timer {hint("timer", "type minutes, Enter ↵ for priority")}</span>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-baseline gap-2 rounded-xl border border-[#6b4d38] bg-[#2a1c14] px-4 py-2 focus-within:border-[#F2E9DC] focus-within:ring-2 focus-within:ring-[#C9A27E]/50">
            <input
              ref={timerRef}
              type="number"
              inputMode="numeric"
              enterKeyHint="next"
              min={1}
              max={600}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              onKeyDown={onTimerKey}
              onFocus={() => setStep("timer")}
              aria-label="Timer minutes"
              className={`w-20 bg-transparent text-4xl font-extrabold tabular-nums text-[#F2E9DC] focus:outline-none ${noSpin}`}
            />
            <span className="text-lg font-semibold text-[#a88b72]">min</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {TIMER_PRESETS.map((m) => (
              <button
                key={m}
                type="button"
                tabIndex={-1}
                onClick={() => setMinutes(String(m))}
                className={`${chip} h-10 min-w-11 px-3 ${Number(minutes) === m ? chipOn : chipOff}`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Priority */}
      <div>
        <span className={label("priority")}>Priority {hint("priority", "← → to choose, Enter ↵ to add")}</span>
        <div
          ref={priorityRef}
          role="radiogroup"
          aria-label="Priority"
          tabIndex={0}
          onKeyDown={onPriorityKey}
          onFocus={() => setStep("priority")}
          className="grid grid-cols-3 gap-2 rounded-xl p-1 -m-1 outline-none focus:ring-2 focus:ring-[#C9A27E]/60"
        >
          {PRIORITIES.map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={priority === p}
              tabIndex={-1}
              onClick={() => {
                setPriority(p);
                priorityRef.current?.focus();
              }}
              style={
                priority === p
                  ? priorityStyle(p)
                  : { borderColor: PRIORITY_COLORS[p].bg, backgroundColor: `${PRIORITY_COLORS[p].bg}59` }
              }
              className={`${chip} py-2 leading-tight ${
                priority === p
                  ? "border-2 ring-2 ring-[#F2E9DC] ring-offset-2 ring-offset-[#3a281c] scale-[1.03]"
                  : "border-2 text-[#F2E9DC] hover:brightness-125"
              }`}
            >
              <span className="block">{p}</span>
              <span className="block text-[11px] font-normal opacity-80">{PRIORITY_LABELS[p]}</span>
            </button>
          ))}
        </div>
      </div>
    </form>
  );
}

function TaskRow({ task, locked }: { task: Task; locked: boolean }) {
  // the whole block takes the priority colour (navy / royal / ice)
  const row = "flex items-center gap-3 rounded-xl border-2 py-2.5";
  const sub = { color: PRIORITY_COLORS[task.priority].sub };

  if (locked) {
    return (
      <li className={`${row} pl-4 pr-4`} style={priorityStyle(task.priority)} title={`${PRIORITY_LABELS[task.priority]} priority`}>
        <span className="flex-1 min-w-0 font-semibold break-words">
          {task.action}
          {task.status === "active" && (
            <span className="ml-2 align-middle rounded-full bg-[#F2E9DC] text-[#2a1c14] text-[11px] font-semibold px-2 py-0.5">
              In progress
            </span>
          )}
        </span>
        <span className="shrink-0 text-lg font-bold tabular-nums">
          {task.minutes}
          <span className="ml-1 text-xs font-semibold" style={sub}>min</span>
        </span>
      </li>
    );
  }

  return (
    <li className={`${row} pl-4 pr-2`} style={priorityStyle(task.priority)}>
      {/* tap the task to cycle its priority (and colour) */}
      <button
        type="button"
        onClick={() => updateTask(task.id, { priority: task.priority >= 3 ? 1 : task.priority + 1 })}
        title={`${PRIORITY_LABELS[task.priority]} priority — tap to change`}
        aria-label={`${task.action}, ${PRIORITY_LABELS[task.priority]} priority. Tap to change priority`}
        className="flex-1 min-w-0 text-left font-semibold break-words"
      >
        {task.action}
      </button>

      <label className="flex shrink-0 items-baseline gap-1 rounded-lg border border-black/15 bg-black/20 px-2 py-1 focus-within:border-current">
        <input
          type="number"
          min={1}
          value={task.minutes}
          onChange={(e) => updateTask(task.id, { minutes: Math.max(1, Number(e.target.value) || 1) })}
          aria-label="Timer minutes"
          className={`w-12 bg-transparent text-right text-lg font-bold tabular-nums text-current focus:outline-none ${noSpin}`}
        />
        <span className="text-xs font-semibold" style={sub}>min</span>
      </label>

      <button
        type="button"
        aria-label={`Delete ${task.action}`}
        onClick={() => deleteTask(task.id)}
        className="opacity-60 hover:opacity-100 hover:text-red-500 transition text-xl leading-none px-2"
      >
        ×
      </button>
    </li>
  );
}
