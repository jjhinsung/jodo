import { useSyncExternalStore } from "react";

export type TimeClass = "A" | "B" | "C";
export type Status = "todo" | "active" | "done";

export type Task = {
  id: string;
  action: string;
  priority: number; // 1 (super high) – 5 (really low)
  time: TimeClass; // A: <10 min, B: 10–30 min, C: 1 hour+
  minutes: number; // time allotted; the Strike timer counts down from this
  status: Status;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  pausedMs?: number; // time spent on breaks while this task was running
};

/** A break: every running timer in the plan is frozen until `until`. */
export type Pause = { startedAt: number; until: number };

/** A separate list, e.g. "Clean the house" or "Homework". */
export type Plan = {
  id: string;
  name: string;
  tasks: Task[];
  /** Once you go Strike, the plan is locked in — no edits until every task is done. */
  locked: boolean;
  pause?: Pause;
  createdAt: number;
};

export type JodoState = {
  plans: Plan[];
  activePlanId: string;
  visibleCount: number; // how many "next" tasks Strike shows (default 3)
  multitask: boolean; // allow several tasks in progress at once
};

export const TIME_CLASSES: TimeClass[] = ["A", "B", "C"];
export const TIME_LABELS: Record<TimeClass, string> = {
  A: "Under 10 min",
  B: "10–30 min",
  C: "1 hour +",
};
export const DEFAULT_MINUTES: Record<TimeClass, number> = { A: 10, B: 20, C: 60 };

/** Seconds past the deadline after which a CRITICAL task starts flashing. */
export const FLASH_AFTER_SECONDS = 30 * 60;

const KEY = "jodo-state-v2";
const OLD_KEYS = ["jodo-state", "jodo-tasks"]; // single-list versions

const DEFAULT_PLAN: Plan = { id: "default", name: "Today", tasks: [], locked: false, createdAt: 0 };
const EMPTY: JodoState = { plans: [DEFAULT_PLAN], activePlanId: "default", visibleCount: 3, multitask: false };

// ---------- parsing / migration ----------

function normalizeTask(raw: unknown): Task | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  if (typeof t.id !== "string" || typeof t.action !== "string") return null;

  const time: TimeClass = TIME_CLASSES.includes(t.time as TimeClass)
    ? (t.time as TimeClass)
    : t.time === "D" || t.time === "E"
      ? "C"
      : "B";
  const minutesNum = Number(t.minutes ?? t.allotment);
  const minutes = minutesNum > 0 ? Math.round(minutesNum) : DEFAULT_MINUTES[time];
  const status: Status = t.status === "active" || t.status === "done" ? t.status : "todo";

  return {
    id: t.id,
    action: t.action,
    priority: Math.min(5, Math.max(1, Number(t.priority) || 3)),
    time,
    minutes,
    status,
    createdAt: Number(t.createdAt) || 0,
    startedAt: typeof t.startedAt === "number" ? t.startedAt : undefined,
    completedAt: typeof t.completedAt === "number" ? t.completedAt : undefined,
    pausedMs: typeof t.pausedMs === "number" ? t.pausedMs : undefined,
  };
}

function normalizeTasks(list: unknown): Task[] {
  return Array.isArray(list) ? list.map(normalizeTask).filter((t): t is Task => t !== null) : [];
}

function normalizePlan(raw: unknown): Plan | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.id !== "string") return null;
  const pause = p.pause as Pause | undefined;
  return {
    id: p.id,
    name: typeof p.name === "string" && p.name.trim() ? p.name : "Untitled",
    tasks: normalizeTasks(p.tasks),
    locked: Boolean(p.locked),
    pause: pause && typeof pause.startedAt === "number" && typeof pause.until === "number" ? pause : undefined,
    createdAt: Number(p.createdAt) || 0,
  };
}

function settings(data: Record<string, unknown> | null) {
  const count = Number(data?.visibleCount);
  return {
    visibleCount: count >= 1 && count <= 5 ? Math.round(count) : 3,
    multitask: Boolean(data?.multitask),
  };
}

function parseCurrent(raw: string): JodoState {
  try {
    const data = JSON.parse(raw);
    const plans = Array.isArray(data?.plans)
      ? data.plans.map(normalizePlan).filter((p: Plan | null): p is Plan => p !== null)
      : [];
    if (plans.length === 0) return EMPTY;
    const activePlanId = plans.some((p: Plan) => p.id === data.activePlanId) ? data.activePlanId : plans[0].id;
    return { plans, activePlanId, ...settings(data) };
  } catch {
    return EMPTY;
  }
}

/** Earlier versions had one flat list of tasks — it becomes the "Today" plan. */
function parseOld(raw: string): JodoState {
  try {
    const data = JSON.parse(raw);
    const tasks = normalizeTasks(Array.isArray(data) ? data : data?.tasks);
    const plan: Plan = { ...DEFAULT_PLAN, tasks, locked: tasks.some((t) => t.status === "active") };
    return { plans: [plan], activePlanId: plan.id, ...settings(Array.isArray(data) ? null : data) };
  } catch {
    return EMPTY;
  }
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

// ---------- the store ----------

// Snapshots must be referentially stable between changes, so cache by the raw string.
let cache: { key: string | undefined; state: JodoState } = { key: undefined, state: EMPTY };
const listeners = new Set<() => void>();

function getSnapshot(): JodoState {
  const raw = read(KEY);
  if (raw !== null) {
    if (cache.key !== raw) cache = { key: raw, state: parseCurrent(raw) };
    return cache.state;
  }
  const old = OLD_KEYS.map(read).find((r) => r !== null) ?? null;
  const key = `old:${old ?? ""}`;
  if (cache.key !== key) cache = { key, state: old ? parseOld(old) : EMPTY };
  return cache.state;
}

function getServerSnapshot(): JodoState {
  return EMPTY;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function update(fn: (s: JodoState) => JodoState) {
  const prev = getSnapshot();
  const next = fn(prev);
  if (next === prev) return;
  const raw = JSON.stringify(next);
  try {
    localStorage.setItem(KEY, raw);
  } catch {
    /* storage unavailable — keep going in memory */
  }
  cache = { key: raw, state: next };
  listeners.forEach((l) => l());
}

/** Change one plan (the active one unless an id is given). Return the same plan to skip. */
function updatePlan(fn: (p: Plan, s: JodoState) => Plan, planId?: string) {
  update((s) => {
    const id = planId ?? s.activePlanId;
    const plan = s.plans.find((p) => p.id === id);
    if (!plan) return s;
    const next = fn(plan, s);
    if (next === plan) return s;
    return { ...s, plans: s.plans.map((p) => (p.id === id ? next : p)) };
  });
}

/** Read everything; re-renders on any change (including other tabs). */
export function useJodo(): JodoState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function activePlan(s: JodoState): Plan {
  return s.plans.find((p) => p.id === s.activePlanId) ?? s.plans[0];
}

// ---------- plan actions ----------

export function addPlan(name = "New plan"): string {
  const plan: Plan = { id: crypto.randomUUID(), name, tasks: [], locked: false, createdAt: Date.now() };
  update((s) => ({ ...s, plans: [...s.plans, plan], activePlanId: plan.id }));
  return plan.id;
}

export function setActivePlan(id: string) {
  update((s) => (s.activePlanId === id ? s : { ...s, activePlanId: id }));
}

export function renamePlan(id: string, name: string) {
  const clean = name.trim() || "Untitled";
  updatePlan((p) => (p.name === clean ? p : { ...p, name: clean }), id);
}

export function deletePlan(id: string) {
  update((s) => {
    if (s.plans.length <= 1) return s;
    const plans = s.plans.filter((p) => p.id !== id);
    return { ...s, plans, activePlanId: s.activePlanId === id ? plans[0].id : s.activePlanId };
  });
}

/** Wipe a plan clean — the only way out of a locked plan before it's done. */
export function resetPlan(id: string) {
  updatePlan((p) => ({ ...p, tasks: [], locked: false, pause: undefined }), id);
}

/** Commit to a plan: from now on it can't be edited until every task is done. */
export function lockPlan(id: string) {
  updatePlan((p) => (p.locked || !p.tasks.some((t) => t.status !== "done") ? p : { ...p, locked: true }), id);
}

// ---------- task actions (active plan) ----------

export function addTask(input: { action: string; priority: number; time: TimeClass; minutes: number }) {
  const action = input.action.trim();
  if (!action) return;
  updatePlan((p) => {
    if (p.locked) return p;
    const task: Task = {
      id: crypto.randomUUID(),
      action,
      priority: input.priority,
      time: input.time,
      minutes: Math.max(1, Math.round(input.minutes) || DEFAULT_MINUTES[input.time]),
      status: "todo",
      createdAt: Date.now(),
    };
    return { ...p, tasks: [...p.tasks, task] };
  });
}

export function updateTask(id: string, patch: Partial<Pick<Task, "action" | "priority" | "time" | "minutes">>) {
  updatePlan((p) => (p.locked ? p : { ...p, tasks: p.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
}

export function deleteTask(id: string) {
  updatePlan((p) => (p.locked ? p : { ...p, tasks: p.tasks.filter((t) => t.id !== id) }));
}

/** Start a task's timer (locks the plan). Blocked during a break, and without multitask while another runs. */
export function startTask(id: string) {
  updatePlan((p, s) => {
    if (p.pause) return p;
    if (!s.multitask && p.tasks.some((t) => t.status === "active")) return p;
    return {
      ...p,
      locked: true,
      tasks: p.tasks.map((t) =>
        t.id === id ? { ...t, status: "active", startedAt: Date.now(), pausedMs: 0 } : t,
      ),
    };
  });
}

export function completeTask(id: string) {
  updatePlan((p) => {
    const tasks = p.tasks.map((t) => (t.id === id ? { ...t, status: "done" as const, completedAt: Date.now() } : t));
    const allDone = tasks.every((t) => t.status === "done");
    // finishing the last task releases the lock
    return { ...p, tasks, locked: allDone ? false : p.locked, pause: allDone ? undefined : p.pause };
  });
}

/** Put a finished task back in the to-do pile. */
export function reopenTask(id: string) {
  updatePlan((p) => ({
    ...p,
    tasks: p.tasks.map((t) =>
      t.id === id ? { ...t, status: "todo", startedAt: undefined, completedAt: undefined, pausedMs: undefined } : t,
    ),
  }));
}

export function clearCompleted() {
  updatePlan((p) => ({ ...p, tasks: p.tasks.filter((t) => t.status !== "done") }));
}

// ---------- breaks ----------

export function pausePlan(minutes: number) {
  const now = Date.now();
  const ms = Math.max(1, minutes) * 60_000;
  updatePlan((p) => (p.pause ? p : { ...p, pause: { startedAt: now, until: now + ms } }));
}

/** End the break (early, or when its timer runs out): running timers pick up where they froze. */
export function resumePlan() {
  updatePlan((p) => {
    if (!p.pause) return p;
    const end = Math.min(Date.now(), p.pause.until);
    const pause = p.pause;
    return {
      ...p,
      pause: undefined,
      tasks: p.tasks.map((t) => {
        if (t.status !== "active" || t.startedAt === undefined) return t;
        const frozen = Math.max(0, end - Math.max(pause.startedAt, t.startedAt));
        return { ...t, pausedMs: (t.pausedMs ?? 0) + frozen };
      }),
    };
  });
}

// ---------- settings ----------

export function setVisibleCount(n: number) {
  update((s) => ({ ...s, visibleCount: Math.min(5, Math.max(1, n)) }));
}

export function setMultitask(on: boolean) {
  update((s) => ({ ...s, multitask: on }));
}

// ---------- helpers ----------

/** Most important first; ties go to the quicker task, then the older one. */
export function byImportance(a: Task, b: Task) {
  return a.priority - b.priority || a.time.localeCompare(b.time) || a.createdAt - b.createdAt;
}

/** Seconds left on a running task (negative once overdue). Frozen while the plan is on a break. */
export function secondsLeft(task: Task, now: number, pause?: Pause) {
  const started = task.startedAt ?? now;
  let paused = task.pausedMs ?? 0;
  if (pause) {
    const from = Math.max(pause.startedAt, started);
    const to = Math.min(now, pause.until);
    if (to > from) paused += to - from;
  }
  const elapsed = Math.max(0, now - started - paused);
  return Math.round(task.minutes * 60 - elapsed / 1000);
}

export function formatClock(totalSeconds: number) {
  const sign = totalSeconds < 0 ? "-" : "";
  const abs = Math.abs(totalSeconds);
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${sign}${h}:${mm}:${ss}` : `${sign}${mm}:${ss}`;
}
