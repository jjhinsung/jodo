"use client";

import { useEffect, useRef, useState } from "react";
import { Inter } from "next/font/google";
import PlanTabs, { LockIcon } from "../components/PlanTabs";
import SideTitle from "../components/SideTitle";
import StrikeTrain from "../components/StrikeTrain";
import TransitionLink from "../components/TransitionLink";
import {
  FLASH_AFTER_SECONDS,
  TIME_LABELS,
  activePlan,
  byImportance,
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

  const [now, setNow] = useState(() => Date.now());
  const [askingBreak, setAskingBreak] = useState(false);
  const alarm = useAlarm();
  const alarmed = useRef(new Set<string>());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const left = (t: Task) => secondsLeft(t, now, pause);
  const running = tasks.filter((t) => t.status === "active");
  const critical = running.filter((t) => left(t) <= 0).sort((a, b) => left(a) - left(b));
  const inProgress = running.filter((t) => left(t) > 0).sort((a, b) => left(a) - left(b));
  const todo = tasks.filter((t) => t.status === "todo").sort(byImportance);
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

  // The break is over: ring and get back to it.
  useEffect(() => {
    if (pause && now >= pause.until) {
      if (now - pause.until < 5000) alarm.ring();
      resumePlan();
    }
  });

  const blocked = Boolean(pause) || (!multitask && running.length > 0);

  function handleStart(id: string) {
    alarm.unlock();
    startTask(id);
  }

  function startBreak(minutes: number) {
    alarm.unlock();
    pausePlan(minutes);
    setAskingBreak(false);
  }

  return (
    <div className={`${inter.className} flex min-h-screen bg-neutral-950 text-neutral-100`}>
      <SideTitle word="STRIKE" borderClass="border-neutral-800" />

      <div className="flex-1 min-w-0 pt-10 pb-56">
        <main className="px-5 sm:px-10 max-w-2xl mx-auto space-y-8">
          <div className="space-y-5">
            <PlanTabs plans={state.plans} activeId={plan.id} theme="black" />

            <div className="flex items-center gap-3">
              <h2 className="min-w-0 flex-1 truncate text-3xl font-extrabold tracking-tight">{plan.name}</h2>
              {plan.locked && (
                <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-neutral-700 px-3 py-1 text-xs font-semibold text-neutral-300">
                  <LockIcon /> Locked in
                </span>
              )}
              {running.length > 0 && !pause && (
                <button
                  type="button"
                  onClick={() => setAskingBreak(true)}
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
                  {[1, 2, 3, 4, 5].map((n) => (
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
                    multitask ? "bg-yellow-400" : "bg-neutral-700"
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

          {/* Next tasks — yellow */}
          {todo.length > 0 && (
            <section>
              <h2 className="mb-1 text-sm font-extrabold uppercase tracking-[0.2em] text-yellow-400">
                Next {next.length === 1 ? "task" : `${next.length} tasks`}
              </h2>
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
                    className={`flex items-center gap-4 rounded-xl border-2 border-yellow-400 bg-yellow-300 px-5 py-4 text-neutral-950 transition-opacity ${
                      blocked ? "opacity-40" : ""
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-lg break-words">{t.action}</p>
                      <p className="text-sm text-neutral-800">
                        P{t.priority} · {t.time} ({TIME_LABELS[t.time]}) · {t.minutes} min timer
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={blocked}
                      onClick={() => handleStart(t.id)}
                      className="shrink-0 px-5 py-2.5 rounded-lg bg-neutral-950 text-yellow-300 font-bold text-sm hover:bg-neutral-800 transition-colors disabled:cursor-not-allowed"
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

      {/* The train: how far through the plan you are */}
      <div className="pointer-events-none fixed bottom-0 right-0 left-24 sm:left-28 z-20">
        <div className="h-16 bg-gradient-to-t from-neutral-950 to-transparent" />
        <div className="bg-neutral-950">
          <StrikeTrain tasks={tasks} pause={pause} />
        </div>
      </div>

      {askingBreak && !pause && <BreakPicker onPick={startBreak} onCancel={() => setAskingBreak(false)} />}
      {pause && <BreakTimer pause={pause} now={now} />}
    </div>
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

/** "How long are you pausing for?" */
function BreakPicker({ onPick, onCancel }: { onPick: (min: number) => void; onCancel: () => void }) {
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
        <p className="mt-1 text-sm text-neutral-400">Your timers freeze. When the break runs out, you&apos;re back on.</p>
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
          Never mind, keep going
        </button>
      </div>
    </div>
  );
}

/** Big PAUSED pop-up over a slightly darkened page, with the break's time left. */
function BreakTimer({ pause, now }: { pause: Pause; now: number }) {
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
        <button
          type="button"
          onClick={() => resumePlan()}
          className="mt-6 rounded-xl bg-[#F2E9DC] px-6 py-3 font-bold text-neutral-950 transition-colors hover:bg-white"
        >
          I&apos;m back — resume now
        </button>
      </div>
    </div>
  );
}
