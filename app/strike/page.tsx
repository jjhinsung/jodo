"use client";

import { useEffect, useRef, useState } from "react";
import { Inter } from "next/font/google";
import PlanTabs, { LockIcon } from "../components/PlanTabs";
import SideTitle from "../components/SideTitle";
import StrikeTrain from "../components/StrikeTrain";
import TransitionLink from "../components/TransitionLink";
import { useFloat } from "../components/FloatingTimer";
import {
  DECIDE_SECONDS,
  FLASH_AFTER_SECONDS,
  breakThenNext,
  continueStrike,
  settleBetween,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  priorityStyle,
  activePlan,
  planSeed,
  shuffleTasks,
  strikeQueue,
  clearCompleted,
  completeTask,
  formatClock,
  pausePlan,
  reopenTask,
  resumePlan,
  secondsLeft,
  setMultitask,
  setVisibleCount,
  startTask,
  useJodo,
  type Pause,
  type Task,
} from "../lib/jodo";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });

const BREAK_OPTIONS = [2, 5, 10, 15];

// ---------- alarm ----------

/** Browsers only allow sound after a user gesture, so we unlock on Start / Pause clicks. */
function useAlarm() {
  const ctxRef = useRef<AudioContext | null>(null);

  function unlock() {
    try {
      if (!ctxRef.current) ctxRef.current = new AudioContext();
      if (ctxRef.current.state === "suspended") void ctxRef.current.resume();
    } catch {
      /* no audio support */
    }
  }

  function ring() {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const t0 = ctx.currentTime;
    for (let i = 0; i < 6; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = i % 2 === 0 ? 880 : 660;
      const start = t0 + i * 0.3;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.26);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.28);
    }
  }

  return { unlock, ring };
}

// ---------- page ----------

export default function Strike() {
  const state = useJodo();
  const { visibleCount, multitask } = state;
  const plan = activePlan(state);
  const { tasks, pause } = plan;

  // the app-wide clock: keeps full speed while the floating timer is open, even with this tab in the background
  const float = useFloat();
  const now = float.now;
  // which moment the break picker was opened for — it closes itself if that moment passes
  const [askKey, setAskKey] = useState<string | null>(null);
  const alarm = useAlarm();
  const alarmed = useRef(new Set<string>());

  const left = (t: Task) => secondsLeft(t, now, pause);
  const running = tasks.filter((t) => t.status === "active");
  const critical = running.filter((t) => left(t) <= 0).sort((a, b) => left(a) - left(b));
  const inProgress = running.filter((t) => left(t) > 0).sort((a, b) => left(a) - left(b));
  const todo = strikeQueue(plan); // shuffled: tasks come up in random order
  const next = todo.slice(0, visibleCount);
  const done = tasks.filter((t) => t.status === "done").sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));

  // Ring once, the moment a timer crosses zero. (Tasks already overdue on page load stay quiet.)
  useEffect(() => {
    for (const t of running) {
      const s = secondsLeft(t, now, pause);
      if (s <= 0 && s > -5 && !alarmed.current.has(t.id)) {
        alarmed.current.add(t.id);
        alarm.ring();
      }
    }
  });

  // The break is over: ring and get back to it (a between-tasks break starts the next task).
  useEffect(() => {
    if (pause && now >= pause.until) {
      if (now - pause.until < 5000) alarm.ring();
      resumePlan();
    }
  });

  // Didn't pick a task or a break within the minute → a random task starts (with a ring if it just happened).
  const between = !pause ? plan.between : undefined;
  useEffect(() => {
    if (between && now >= between.at + DECIDE_SECONDS * 1000) {
      if (now - (between.at + DECIDE_SECONDS * 1000) < 5000) alarm.ring();
      settleBetween(now);
    }
  });

  const askingBreak = askKey !== null && askKey === (between ? `b${between.at}` : "run");

  // the pop-up is up until they choose Continue; then they're back to picking, clock still running
  const deciding = Boolean(between && !between.picking);
  const picking = Boolean(between?.picking);
  const blocked = Boolean(pause) || deciding || (!multitask && running.length > 0);
  const lastDone = done[0];
  const pickLeft = between ? Math.min(DECIDE_SECONDS, Math.max(0, Math.ceil((between.at + DECIDE_SECONDS * 1000 - now) / 1000))) : 0;

  function handleStart(id: string) {
    alarm.unlock();
    startTask(id);
  }

  function handleContinue() {
    alarm.unlock();
    setAskKey(null);
    continueStrike();
  }

  function startBreak(minutes: number) {
    alarm.unlock();
    if (between) breakThenNext(minutes);
    else pausePlan(minutes);
    setAskKey(null);
  }

  return (
    <div className={`${inter.className} flex min-h-screen bg-neutral-950 text-neutral-100`}>
      <SideTitle word="STRIKE" />

      <div className="flex-1 min-w-0 pt-10 pb-56">
        <main className="px-5 sm:px-10 max-w-2xl mx-auto space-y-8">
          <div className="space-y-5">
            <div className="lg:hidden">
              <PlanTabs plans={state.plans} activeId={plan.id} theme="black" layout="row" />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <h2 className="min-w-[10rem] flex-1 truncate text-3xl font-extrabold tracking-tight">{plan.name}</h2>
              {plan.locked && (
                <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-neutral-700 px-3 py-1 text-xs font-semibold text-neutral-300">
                  <LockIcon /> Locked in
                </span>
              )}
              {float.mode && (
                <button
                  type="button"
                  onClick={() => {
                    alarm.unlock();
                    float.toggle();
                  }}
                  aria-pressed={float.open}
                  className={`flex shrink-0 items-center gap-2 rounded-xl border-2 px-4 py-2 text-sm font-bold transition-colors ${
                    float.open
                      ? "border-[#3B82F6] bg-[#3B82F6] text-white hover:bg-[#2563EB]"
                      : "border-neutral-600 text-neutral-200 hover:border-neutral-400"
                  }`}
                >
                  <FloatIcon /> {float.open ? "Floating" : "Float timer"}
                </button>
              )}
              {running.length > 0 && !pause && (
                <button
                  type="button"
                  onClick={() => setAskKey("run")}
                  className="flex shrink-0 items-center gap-2 rounded-xl border-2 border-sky-400/70 px-4 py-2 text-sm font-bold text-sky-300 transition-colors hover:bg-sky-400 hover:text-neutral-950"
                >
                  <PauseIcon /> Pause
                </button>
              )}
            </div>

            {/* Settings */}
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-neutral-400">
                Show
                <div className="flex gap-1">
                  {[1, 2, 3].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setVisibleCount(n)}
                      className={`w-8 h-8 rounded-lg text-sm font-semibold border transition-colors ${
                        visibleCount === n
                          ? "bg-neutral-100 text-neutral-950 border-neutral-100"
                          : "border-neutral-700 text-neutral-300 hover:border-neutral-500"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                tasks at a time
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={multitask}
                onClick={() => setMultitask(!multitask)}
                className="flex items-center gap-2 text-sm text-neutral-400"
              >
                Multitask
                <span
                  className={`relative inline-block w-10 h-6 rounded-full transition-colors ${
                    multitask ? "bg-[#3B82F6]" : "bg-neutral-700"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${
                      multitask ? "left-[18px]" : "left-0.5"
                    }`}
                  />
                </span>
              </button>
            </div>
          </div>

          {tasks.length === 0 && (
            <div className="rounded-xl border border-dashed border-neutral-700 px-5 py-10 text-center text-neutral-400">
              <p>This plan has no tasks yet.</p>
              <TransitionLink
                kind="warp"
                href="/plan"
                className="mt-3 inline-block font-semibold text-white underline underline-offset-4"
              >
                Plan it first
              </TransitionLink>
            </div>
          )}

          {/* CRITICAL — red */}
          {critical.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-extrabold uppercase tracking-[0.2em] text-red-500">Critical</h2>
              <ul className="space-y-3">
                {critical.map((t) => {
                  const s = left(t);
                  const flashing = !pause && s <= -FLASH_AFTER_SECONDS;
                  return (
                    <li
                      key={t.id}
                      className={`rounded-xl border-2 border-red-500 bg-red-600 px-5 py-4 text-white ${
                        flashing ? "critical-flash" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-bold text-lg break-words">{t.action}</p>
                          <p className="text-sm text-red-100">Over time — finish it and mark it done.</p>
                        </div>
                        <span className="font-mono text-3xl font-extrabold tabular-nums">{formatClock(s)}</span>
                      </div>
                      <DoneButton task={t} className="bg-white text-red-700 hover:bg-red-50" />
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* In progress */}
          {inProgress.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-extrabold uppercase tracking-[0.2em] text-neutral-400">
                In progress{pause ? " · paused" : ""}
              </h2>
              <ul className="space-y-3">
                {inProgress.map((t) => (
                  <li key={t.id} className="rounded-xl border border-neutral-700 bg-neutral-900 px-5 py-4">
                    <div className="flex items-center justify-between gap-4">
                      <p className="font-semibold text-lg break-words min-w-0">{t.action}</p>
                      <span className="font-mono text-3xl font-bold tabular-nums">{formatClock(left(t))}</span>
                    </div>
                    <DoneButton task={t} className="bg-neutral-100 text-neutral-950 hover:bg-white" />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Next tasks — coloured by priority (navy / royal / ice blue) */}
          {todo.length > 0 && (
            <section>
              {/* After "Continue": the same clock keeps running until they pick */}
              {picking && between && (
                <div
                  className={`mb-4 flex items-center gap-4 rounded-xl border-2 px-4 py-3 ${
                    pickLeft <= 10 ? "border-red-500/70 bg-red-950/40" : "border-[#3B82F6]/60 bg-[#1E3A8A]/25"
                  }`}
                >
                  <span
                    className={`font-mono text-3xl font-extrabold tabular-nums ${
                      pickLeft <= 10 ? "animate-pulse text-red-400" : "text-white"
                    }`}
                  >
                    {formatClock(pickLeft)}
                  </span>
                  <span className="min-w-0 flex-1 text-sm leading-snug text-neutral-300">
                    <span className="block font-bold text-white">Pick your next task.</span>
                    Nothing picked by then → a random one starts for you.
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      alarm.unlock();
                      setAskKey(`b${between.at}`);
                    }}
                    className="shrink-0 rounded-lg border border-sky-400/60 px-3 py-1.5 text-xs font-bold text-sky-300 transition-colors hover:bg-sky-400 hover:text-neutral-950"
                  >
                    Break
                  </button>
                </div>
              )}
              <div className="mb-1 flex items-center justify-between gap-3">
                <h2 className="text-sm font-extrabold uppercase tracking-[0.2em] text-[#93C5FD]">
                  Next {next.length === 1 ? "task" : `${next.length} tasks`}
                </h2>
                {todo.length > 1 && (
                  <button
                    type="button"
                    onClick={() => shuffleTasks(plan.id)}
                    title="Deal the remaining tasks in a new random order"
                    className="flex items-center gap-1.5 rounded-lg border border-neutral-700 px-2.5 py-1 text-xs font-semibold text-neutral-300 transition-colors hover:border-[#93C5FD] hover:text-white"
                  >
                    <ShuffleIcon /> Shuffle
                  </button>
                )}
              </div>
              <p className="mb-3 text-sm text-neutral-400">
                {pause
                  ? "On a break — these wait for you."
                  : blocked
                    ? "Finish what you're working on to unlock these (or turn on Multitask)."
                    : next.length > 1
                      ? "Pick one. The timer starts the moment you do."
                      : "Start it. The timer begins now."}
                {todo.length > next.length && ` ${todo.length - next.length} more waiting.`}
              </p>
              <ul className="space-y-3">
                {next.map((t) => (
                  <li
                    key={t.id}
                    style={priorityStyle(t.priority)}
                    className={`flex items-center gap-4 rounded-xl border-2 px-5 py-4 transition-opacity ${
                      blocked ? "opacity-40" : ""
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-lg break-words">{t.action}</p>
                      <p className="text-sm" style={{ color: PRIORITY_COLORS[t.priority].sub }}>
                        {t.minutes} min timer · {PRIORITY_LABELS[t.priority]} priority
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={blocked}
                      onClick={() => handleStart(t.id)}
                      className="shrink-0 px-5 py-2.5 rounded-lg bg-neutral-950 text-white font-bold text-sm hover:bg-neutral-800 transition-colors disabled:cursor-not-allowed"
                    >
                      Start
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {tasks.length > 0 && todo.length === 0 && running.length === 0 && (
            <p className="rounded-xl border border-green-800 bg-green-950 px-5 py-6 text-center text-green-200 font-semibold">
              Every task in this plan is done. Plan unlocked — go enjoy it.
            </p>
          )}

          {/* Completed — dark green */}
          {done.length > 0 && (
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-extrabold uppercase tracking-[0.2em] text-green-500">
                  Completed · {done.length}
                </h2>
                {!plan.locked && (
                  <button
                    type="button"
                    onClick={clearCompleted}
                    className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
              <ul className="space-y-2">
                {done.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between gap-3 rounded-xl bg-green-900 border border-green-800 px-5 py-3 text-green-100"
                  >
                    <span className="line-through decoration-green-400/60 break-words min-w-0">{t.action}</span>
                    <button
                      type="button"
                      onClick={() => reopenTask(t.id)}
                      className="shrink-0 text-xs text-green-300/80 hover:text-white transition-colors"
                    >
                      Undo
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {tasks.length > 0 && (
            <div className="text-center">
              <TransitionLink
                kind="warp"
                href="/plan"
                className="text-sm text-neutral-500 hover:text-neutral-300 transition-colors"
              >
                ← Back to Plan
              </TransitionLink>
            </div>
          )}
        </main>
      </div>

      {/* Plans sidebar (wide screens) */}
      <aside className="hidden lg:block w-60 xl:w-64 shrink-0">
        <div className="sticky top-0 h-screen pl-2 pr-5 pt-10 pb-64">
          <PlanTabs plans={state.plans} activeId={plan.id} theme="black" layout="column" />
        </div>
      </aside>

      {/* The train: how far through the plan you are */}
      <div className="pointer-events-none fixed bottom-0 right-0 left-24 sm:left-28 z-20">
        <div className="h-16 bg-gradient-to-t from-neutral-950 to-transparent" />
        <div className="bg-neutral-950">
          <StrikeTrain tasks={tasks} pause={pause} seed={planSeed(plan)} />
        </div>
      </div>

      {between && deciding && (
        <BetweenTasks
          at={between.at}
          now={now}
          finished={lastDone}
          onContinue={handleContinue}
          onBreak={() => {
            alarm.unlock();
            setAskKey(`b${between.at}`);
          }}
          paused={askingBreak}
        />
      )}
      {askingBreak && !pause && (
        <BreakPicker
          onPick={startBreak}
          onCancel={() => setAskKey(null)}
          cancelLabel={between ? "Back" : undefined}
          note={between ? "When the break runs out, you pick your next task." : undefined}
        />
      )}
      {pause && <BreakTimer pause={pause} now={now} thenPick={Boolean(pause.thenNext && todo.length > 0)} />}
    </div>
  );
}

function ShuffleIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M2 4h2.5c1.2 0 2 .6 2.7 1.6l1.6 2.8c.7 1 1.5 1.6 2.7 1.6H14" />
      <path d="M2 12h2.5c1.2 0 2-.6 2.7-1.6M9.8 5.6c.7-1 1.5-1.6 2.7-1.6H14" />
      <path d="M12 2l2 2-2 2M12 10l2 2-2 2" />
    </svg>
  );
}

function FloatIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" className={className}>
      <rect x="1.5" y="2.5" width="13" height="10" rx="1.5" />
      <rect x="8" y="7" width="5" height="4" rx="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

function PauseIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className={className}>
      <rect x="3" y="2" width="3.5" height="12" rx="1" />
      <rect x="9.5" y="2" width="3.5" height="12" rx="1" />
    </svg>
  );
}

function DoneButton({ task, className }: { task: Task; className: string }) {
  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => completeTask(task.id)}
        className={`px-5 py-2 rounded-lg font-bold text-sm transition-colors ${className}`}
      >
        Mark done
      </button>
    </div>
  );
}

/**
 * Shown right after you finish a task. A one-minute clock runs so the strike never just stops:
 * Continue (back to picking your next task) or take a break. Choose nothing and you get an
 * automatic short break, after which the next task starts by itself.
 */
function BetweenTasks({
  at,
  now,
  finished,
  onContinue,
  onBreak,
  paused,
}: {
  at: number;
  now: number;
  finished?: Task;
  onContinue: () => void;
  onBreak: () => void;
  paused: boolean; // the break picker is open on top
}) {
  const remaining = Math.min(DECIDE_SECONDS, Math.max(0, Math.ceil((at + DECIDE_SECONDS * 1000 - now) / 1000)));
  const frac = remaining / DECIDE_SECONDS;
  const urgent = remaining <= 10;

  // Enter = continue, B = break
  useEffect(() => {
    if (paused) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onContinue();
      } else if (e.key === "b" || e.key === "B") {
        onBreak();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paused, onContinue, onBreak]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-5 backdrop-blur-[3px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="between-title"
        className="paused-pop w-full max-w-md rounded-3xl border-2 border-green-500/50 bg-neutral-950/95 px-7 py-8 text-center shadow-[0_30px_80px_rgba(0,0,0,0.6)]"
      >
        <p className="text-sm font-bold uppercase tracking-[0.25em] text-green-400">✓ Struck</p>
        {finished && <p className="mt-1 truncate text-neutral-400 line-through decoration-green-500/60">{finished.action}</p>}
        <h3 id="between-title" className="mt-4 text-2xl font-extrabold">
          Keep the streak going?
        </h3>

        {/* the countdown that keeps you moving */}
        <p
          className={`mt-4 font-mono text-5xl font-extrabold tabular-nums ${urgent ? "animate-pulse text-red-400" : "text-[#F2E9DC]"}`}
        >
          {formatClock(remaining)}
        </p>
        <div className="mx-auto mt-3 h-1.5 max-w-xs overflow-hidden rounded-full bg-neutral-800">
          <div
            className="h-full rounded-full"
            style={{
              width: `${frac * 100}%`,
              background: urgent ? "#f87171" : "#3B82F6",
              transition: "width 1s linear, background 0.3s",
            }}
          />
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          No choice by then → a random task starts for you.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            autoFocus
            onClick={onContinue}
            className="rounded-2xl bg-[#3B82F6] px-4 py-4 font-extrabold text-white transition hover:brightness-110"
          >
            Continue
            <span className="block text-[11px] font-semibold text-blue-100/80">Enter ↵</span>
          </button>
          <button
            type="button"
            onClick={onBreak}
            className="rounded-2xl border-2 border-sky-400/60 px-4 py-4 font-extrabold text-sky-300 transition-colors hover:bg-sky-400 hover:text-neutral-950"
          >
            Take a break
            <span className="block text-[11px] font-semibold opacity-70">B</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/** "How long are you pausing for?" */
function BreakPicker({
  onPick,
  onCancel,
  cancelLabel = "Never mind, keep going",
  note = "Your timers freeze. When the break runs out, you're back on.",
}: {
  onPick: (min: number) => void;
  onCancel: () => void;
  cancelLabel?: string;
  note?: string;
}) {
  const [custom, setCustom] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-5">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="break-title"
        className="relative w-full max-w-sm rounded-2xl border border-neutral-700 bg-neutral-900 p-6"
      >
        <h3 id="break-title" className="text-xl font-extrabold">
          How long are you pausing?
        </h3>
        <p className="mt-1 text-sm text-neutral-400">{note}</p>
        <div className="mt-5 grid grid-cols-4 gap-2">
          {BREAK_OPTIONS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onPick(m)}
              className="rounded-xl border border-neutral-700 py-3 font-bold transition-colors hover:border-sky-400 hover:bg-sky-400 hover:text-neutral-950"
            >
              {m}
              <span className="block text-[11px] font-medium opacity-70">min</span>
            </button>
          ))}
        </div>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const m = Number(custom);
            if (m > 0) onPick(Math.min(m, 120));
          }}
        >
          <input
            type="number"
            min={1}
            max={120}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Other (min)"
            className="min-w-0 flex-1 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!(Number(custom) > 0)}
            className="rounded-lg bg-sky-400 px-4 text-sm font-bold text-neutral-950 disabled:opacity-40"
          >
            Start break
          </button>
        </form>
        <button type="button" onClick={onCancel} className="mt-4 w-full text-sm text-neutral-500 hover:text-neutral-300">
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}

/** Big PAUSED pop-up over a slightly darkened page, with the break's time left. */
function BreakTimer({ pause, now, thenPick }: { pause: Pause; now: number; thenPick: boolean }) {
  const total = Math.max(1, Math.round((pause.until - pause.startedAt) / 1000));
  const remaining = Math.max(0, Math.round((pause.until - now) / 1000));
  const frac = remaining / total;
  const urgent = remaining <= 10;
  const warning = remaining <= 30;
  const color = urgent ? "#ef4444" : warning ? "#facc15" : "#7dd3fc";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-5 backdrop-blur-[2px]">
      <div
        role="status"
        aria-live="polite"
        className="paused-pop w-full max-w-md rounded-3xl border-2 border-sky-400/50 bg-neutral-950/90 px-8 py-9 text-center shadow-[0_30px_80px_rgba(0,0,0,0.6)]"
      >
        <p className="paused-pulse text-6xl sm:text-7xl font-black tracking-[0.08em] text-sky-300">PAUSED</p>

        <p
          className={`mt-5 font-mono text-6xl font-extrabold tabular-nums ${urgent ? "animate-pulse" : ""}`}
          style={{ color }}
        >
          {formatClock(remaining)}
        </p>
        <p className="mt-1 text-sm font-semibold uppercase tracking-[0.25em] text-neutral-400">left on your break</p>

        <div className="mt-6 h-2 overflow-hidden rounded-full bg-neutral-800">
          <div
            className="h-full rounded-full"
            style={{ width: `${frac * 100}%`, background: color, transition: "width 1s linear, background 0.3s" }}
          />
        </div>

        <p className="mt-5 text-neutral-300">
          {urgent ? "Almost time. Get ready." : warning ? "Wrap it up — break's nearly over." : "Breathe. Water. Stretch. The clock is running."}
        </p>
        {thenPick && (
          <p className="mt-3 text-sm text-neutral-400">
            When it ends you&apos;ll pick your next task — you get {DECIDE_SECONDS / 60} minute before one is picked for you.
          </p>
        )}
        <button
          type="button"
          onClick={() => resumePlan()}
          className="mt-6 rounded-xl bg-[#F2E9DC] px-6 py-3 font-bold text-neutral-950 transition-colors hover:bg-white"
        >
          {thenPick ? "I'm back — pick my next task" : "I'm back — resume now"}
        </button>
      </div>
    </div>
  );
}
