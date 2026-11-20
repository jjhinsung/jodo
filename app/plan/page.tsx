"use client";

import { useState } from "react";
import { Inter } from "next/font/google";
import ConfirmButton from "../components/ConfirmButton";
import PlanScenery from "../components/PlanScenery";
import PlanTabs, { LockIcon } from "../components/PlanTabs";
import SideTitle from "../components/SideTitle";
import TransitionLink from "../components/TransitionLink";
import {
  DEFAULT_MINUTES,
  TIME_CLASSES,
  TIME_LABELS,
  activePlan,
  addPlan,
  addTask,
  byImportance,
  deletePlan,
  deleteTask,
  lockPlan,
  renamePlan,
  resetPlan,
  updateTask,
  useJodo,
  type Plan,
  type Task,
  type TimeClass,
} from "../lib/jodo";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });

const PRIORITIES = [1, 2, 3, 4, 5];
const PRIORITY_HINT: Record<number, string> = {
  1: "Super high",
  2: "High",
  3: "Medium",
  4: "Low",
  5: "Really low",
};

const chip = "rounded-lg border text-sm font-semibold transition-colors";
const chipOn = "bg-[#F2E9DC] text-[#2a1c14] border-[#F2E9DC]";
const chipOff = "bg-transparent text-[#d9c4aa] border-[#6b4d38] hover:border-[#C9A27E]";
const smallBtn = "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors";

export default function PlanPage() {
  const state = useJodo();
  const plan = activePlan(state);
  const [justCreated, setJustCreated] = useState<string | null>(null);

  const open = plan.tasks.filter((t) => t.status !== "done").sort(byImportance);
  const done = plan.tasks.filter((t) => t.status === "done");
  const totalMinutes = open.reduce((sum, t) => sum + t.minutes, 0);

  return (
    <div data-dirt className={`${inter.className} flex min-h-screen bg-[#2a1c14] text-[#F2E9DC]`}>
      <PlanScenery />
      <SideTitle word="PLAN" borderClass="border-[#5a4030]" />

      <div data-dirt className="relative z-10 flex-1 min-w-0 pt-10 pb-44">
        <main data-dirt className="px-5 sm:px-10 max-w-2xl mx-auto">
          <PlanTabs
            plans={state.plans}
            activeId={plan.id}
            theme="brown"
            onNew={() => setJustCreated(addPlan())}
          />

          {/* Plan header: name + reset / delete */}
          <div data-dirt className="mt-6 flex flex-wrap items-center gap-3">
            <PlanName key={plan.id} plan={plan} autoFocus={justCreated === plan.id} />
            <div className="ml-auto flex items-center gap-2">
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

      {/* Fade so the task list doesn't run into the grass */}
      <div className="pointer-events-none fixed bottom-0 right-0 left-24 sm:left-28 z-[12] h-48 bg-gradient-to-t from-[#2a1c14] via-[#2a1c14]/90 to-transparent" />

      {/* Bottom bar — sits in front of the grass */}
      <div className="fixed bottom-0 right-0 left-24 sm:left-28 z-20 pb-6 px-6 sm:px-10">
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
  // remembers your last priority/time so adding many similar tasks is fast
  const [action, setAction] = useState("");
  const [priority, setPriority] = useState(3);
  const [time, setTime] = useState<TimeClass>("B");
  const [minutes, setMinutes] = useState(String(DEFAULT_MINUTES.B));

  function pickTime(t: TimeClass) {
    setTime(t);
    setMinutes(String(DEFAULT_MINUTES[t]));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!action.trim()) return;
    addTask({ action, priority, time, minutes: Number(minutes) || DEFAULT_MINUTES[time] });
    setAction("");
  }

  return (
    <form onSubmit={submit} className="mt-5 rounded-2xl bg-[#3a281c] border border-[#5a4030] p-4 sm:p-5 space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          placeholder="What do you need to do?"
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

      <div>
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#a88b72]">Priority</span>
          <span className="text-xs text-[#a88b72]">{PRIORITY_HINT[priority]}</span>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {PRIORITIES.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPriority(p)}
              className={`${chip} h-10 ${priority === p ? chipOn : chipOff}`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="block text-xs font-semibold uppercase tracking-wider text-[#a88b72] mb-1.5">
          How long will it take?
        </span>
        <div className="grid grid-cols-3 gap-2">
          {TIME_CLASSES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => pickTime(t)}
              className={`${chip} py-2 px-2 leading-tight ${time === t ? chipOn : chipOff}`}
            >
              <span className="block">{t}</span>
              <span className="block text-[11px] font-normal opacity-80">{TIME_LABELS[t]}</span>
            </button>
          ))}
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-[#d9c4aa]">
          Timer
          <input
            type="number"
            min={1}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            className="w-20 bg-[#2a1c14] border border-[#6b4d38] rounded-lg px-2 py-1.5 text-sm text-[#F2E9DC] focus:outline-none focus:border-[#C9A27E]"
          />
          minutes
        </label>
      </div>
    </form>
  );
}

function TaskRow({ task, locked }: { task: Task; locked: boolean }) {
  const badge = "w-9 h-9 shrink-0 rounded-lg bg-[#2a1c14] border border-[#6b4d38] text-sm font-bold flex items-center justify-center";

  if (locked) {
    return (
      <li className="flex items-center gap-3 rounded-xl bg-[#3a281c] border border-[#5a4030] pl-3 pr-4 py-2.5">
        <span className={badge}>P{task.priority}</span>
        <span className="flex-1 min-w-0 font-medium break-words">
          {task.action}
          {task.status === "active" && (
            <span className="ml-2 align-middle rounded-full bg-[#C9A27E] text-[#2a1c14] text-[11px] font-semibold px-2 py-0.5">
              In progress
            </span>
          )}
        </span>
        <span className={badge}>{task.time}</span>
        <span className="w-14 text-right text-xs text-[#a88b72]">{task.minutes} min</span>
      </li>
    );
  }

  function cyclePriority() {
    updateTask(task.id, { priority: task.priority === 5 ? 1 : task.priority + 1 });
  }

  function cycleTime() {
    const next = TIME_CLASSES[(TIME_CLASSES.indexOf(task.time) + 1) % TIME_CLASSES.length];
    updateTask(task.id, { time: next, minutes: DEFAULT_MINUTES[next] });
  }

  return (
    <li className="flex items-center gap-3 rounded-xl bg-[#3a281c] border border-[#5a4030] pl-3 pr-2 py-2.5">
      <button
        type="button"
        onClick={cyclePriority}
        title="Change priority"
        aria-label={`Priority ${task.priority}, tap to change`}
        className={`${badge} hover:border-[#C9A27E] transition-colors`}
      >
        P{task.priority}
      </button>

      <span className="flex-1 min-w-0 font-medium break-words">{task.action}</span>

      <button
        type="button"
        onClick={cycleTime}
        title={`${TIME_LABELS[task.time]} — tap to change`}
        aria-label={`Time class ${task.time}, tap to change`}
        className={`${badge} hover:border-[#C9A27E] transition-colors`}
      >
        {task.time}
      </button>

      <label className="flex items-center gap-1 text-xs text-[#a88b72] shrink-0">
        <input
          type="number"
          min={1}
          value={task.minutes}
          onChange={(e) => updateTask(task.id, { minutes: Math.max(1, Number(e.target.value) || 1) })}
          aria-label="Timer minutes"
          className="w-14 bg-[#2a1c14] border border-[#6b4d38] rounded-lg px-2 py-1.5 text-sm text-[#F2E9DC] focus:outline-none focus:border-[#C9A27E]"
        />
        min
      </label>

      <button
        type="button"
        aria-label={`Delete ${task.action}`}
        onClick={() => deleteTask(task.id)}
        className="text-[#8a6e57] hover:text-red-400 transition-colors text-xl leading-none px-2"
      >
        ×
      </button>
    </li>
  );
}
