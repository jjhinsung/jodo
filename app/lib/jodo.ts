import { useSyncExternalStore, type CSSProperties } from "react";

export type Status = "todo" | "active" | "done";

export type Task = {
  id: string;
  action: string;
  priority: number; // 1 (high) – 3 (low)
  minutes: number; // the timer: Strike counts down from this
  status: Status;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  pausedMs?: number; // time spent on breaks while this task was running
};

/**
 * A break: every running timer in the plan is frozen until `until`.
 * `thenNext` = a between-tasks break: when it ends you're back to picking your next task
 * (with the one-minute clock running again).
 */
export type Pause = { startedAt: number; until: number; thenNext?: boolean };

/** A separate list, e.g. "Clean the house" or "Homework". */
export type Plan = {
  id: string;
  name: string;
  tasks: Task[];
  /** Once you go Strike, the plan is locked in — no edits until every task is done. */
  locked: boolean;
  pause?: Pause;
  /**
   * Just finished a task (or a break ended): a short countdown to pick a task or take a break.
   * Pick neither and a random task starts for you.
   * `picking` = they chose Continue and are now picking their next task — the same clock keeps running.
   */
  between?: { at: number; picking?: boolean };
  /** Seed for the random order Strike shows tasks in (new shuffle each time you lock in). */
  shuffle?: number;
  createdAt: number;
};

/** A reusable plan ("Morning routine") you can drop back in any day. */
export type SavedTask = { action: string; priority: number; minutes: number };
export type SavedPlan = { id: string; name: string; tasks: SavedTask[]; createdAt: number };

export type JodoState = {
  plans: Plan[];
  activePlanId: string;
  visibleCount: number; // how many "next" tasks Strike shows (default 3)
  multitask: boolean; // allow several tasks in progress at once
  saved: SavedPlan[];
};

/** After finishing a task (or a break) you get this long to pick — otherwise a random task starts. */
export const DECIDE_SECONDS = 60;

export const PRIORITIES = [1, 2, 3];
export const PRIORITY_LABELS: Record<number, string> = { 1: "High", 2: "Medium", 3: "Low" };

// priority colours: 1 High = deep navy, 2 Medium = royal blue, 3 Low = pale ice blue
// bg = block colour, fg = main text on it, sub = softer secondary text on it
export const PRIORITY_COLORS: Record<number, { bg: string; fg: string; sub: string }> = {
  1: { bg: "#1E3A8A", fg: "#EFF6FF", sub: "#BFDBFE" },
  2: { bg: "#3B82F6", fg: "#FFFFFF", sub: "#DBEAFE" },
  3: { bg: "#93C5FD", fg: "#0B1E44", sub: "#1E3A8A" },
};

export function priorityStyle(p: number): CSSProperties {
  const c = PRIORITY_COLORS[p] ?? PRIORITY_COLORS[2];
  return { backgroundColor: c.bg, borderColor: c.bg, color: c.fg };
}
export const DEFAULT_TIMER = 15; // minutes
export const TIMER_PRESETS = [5, 10, 15, 25, 45, 60];

// Older saves sized tasks by class (A/B/C…) instead of minutes.
const OLD_CLASS_MINUTES: Record<string, number> = { A: 10, B: 20, C: 60, D: 60, E: 60 };

/** Seconds past the deadline after which a CRITICAL task starts flashing. */
export const FLASH_AFTER_SECONDS = 30 * 60;

const KEY = "jodo-state-v2";
const OLD_KEYS = ["jodo-state", "jodo-tasks"]; // single-list versions

const DEFAULT_PLAN: Plan = { id: "default", name: "Today", tasks: [], locked: false, createdAt: 0 };
const EMPTY: JodoState = {
  plans: [DEFAULT_PLAN],
  activePlanId: "default",
  visibleCount: 3,
  multitask: false,
  saved: [],
};

// ---------- parsing / migration ----------

function normalizeTask(raw: unknown): Task | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  if (typeof t.id !== "string" || typeof t.action !== "string") return null;

  const minutesNum = Number(t.minutes ?? t.allotment);
  const minutes =
    minutesNum > 0 ? Math.round(minutesNum) : (OLD_CLASS_MINUTES[String(t.time)] ?? DEFAULT_TIMER);
  const status: Status = t.status === "active" || t.status === "done" ? t.status : "todo";

  return {
    id: t.id,
    action: t.action,
    priority: Math.min(3, Math.max(1, Number(t.priority) || 2)), // old 4s and 5s become 3 (low)
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
  const between = p.between as { at?: unknown; picking?: unknown } | undefined;
  return {
    id: p.id,
    name: typeof p.name === "string" && p.name.trim() ? p.name : "Untitled",
    tasks: normalizeTasks(p.tasks),
    locked: Boolean(p.locked),
    pause:
      pause && typeof pause.startedAt === "number" && typeof pause.until === "number"
        ? { startedAt: pause.startedAt, until: pause.until, thenNext: Boolean(pause.thenNext) || undefined }
        : undefined,
    between:
      between && typeof between.at === "number"
        ? { at: between.at, picking: Boolean(between.picking) || undefined }
        : undefined,
    shuffle: typeof p.shuffle === "number" ? p.shuffle : undefined,
    createdAt: Number(p.createdAt) || 0,
  };
}

function normalizeSaved(raw: unknown): SavedPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.id !== "string") return null;
  const tasks = (Array.isArray(s.tasks) ? s.tasks : [])
    .filter((t): t is Record<string, unknown> => Boolean(t) && typeof (t as SavedTask).action === "string")
    .map((t) => ({
      action: String(t.action),
      priority: Math.min(3, Math.max(1, Number(t.priority) || 2)),
      minutes: Math.max(1, Math.round(Number(t.minutes)) || DEFAULT_TIMER),
    }));
  return {
    id: s.id,
    name: typeof s.name === "string" && s.name.trim() ? s.name : "Untitled",
    tasks,
    createdAt: Number(s.createdAt) || 0,
  };
}

function settings(data: Record<string, unknown> | null) {
  const count = Number(data?.visibleCount);
  return {
    visibleCount: count >= 1 ? Math.min(3, Math.round(count)) : 3,
    multitask: Boolean(data?.multitask),
    saved: Array.isArray(data?.saved)
      ? data.saved.map(normalizeSaved).filter((s: SavedPlan | null): s is SavedPlan => s !== null)
      : [],
  };
}

function parseCurrent(raw: string): JodoState {
  try {
    const data = JSON.parse(raw);
    const plans = Array.isArray(data?.plans)
      ? data.plans.map(normalizePlan).filter((p: Plan | null): p is Plan => p !== null)
      : [];
    if (plans.length === 0) return { ...EMPTY, ...settings(data), plans: EMPTY.plans };
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
  updatePlan((p) => ({ ...p, tasks: [], locked: false, pause: undefined, between: undefined }), id);
}

/** Commit to a plan: from now on it can't be edited until every task is done. */
export function lockPlan(id: string) {
  updatePlan(
    (p) => (p.locked || !p.tasks.some((t) => t.status !== "done") ? p : { ...p, locked: true, shuffle: newSeed() }),
    id,
  );
}

/** Deal Strike's tasks out in a fresh random order. */
export function shuffleTasks(planId?: string) {
  updatePlan((p) => ({ ...p, shuffle: newSeed() }), planId);
}

// ---------- task actions (active plan) ----------

export function addTask(input: { action: string; priority: number; minutes: number }) {
  const action = input.action.trim();
  if (!action) return;
  updatePlan((p) => {
    if (p.locked) return p;
    const task: Task = {
      id: crypto.randomUUID(),
      action,
      priority: Math.min(3, Math.max(1, input.priority)),
      minutes: Math.max(1, Math.round(input.minutes) || DEFAULT_TIMER),
      status: "todo",
      createdAt: Date.now(),
    };
    return { ...p, tasks: [...p.tasks, task] };
  });
}

export function updateTask(id: string, patch: Partial<Pick<Task, "action" | "priority" | "minutes">>) {
  updatePlan((p) => (p.locked ? p : { ...p, tasks: p.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
}

export function deleteTask(id: string) {
  updatePlan((p) => (p.locked ? p : { ...p, tasks: p.tasks.filter((t) => t.id !== id) }));
}

/** Start a task's timer (locks the plan). Blocked during a break, and without multitask while another runs. */
function withStarted(p: Plan, id: string, at: number): Plan {
  return {
    ...p,
    locked: true,
    between: undefined,
    tasks: p.tasks.map((t) =>
      t.id === id && t.status === "todo" ? { ...t, status: "active", startedAt: at, pausedMs: 0 } : t,
    ),
  };
}

/** Start a task's timer (locks the plan). Blocked during a break, and without multitask while another runs. */
export function startTask(id: string) {
  updatePlan((p, s) => {
    if (p.pause) return p;
    if (!s.multitask && p.tasks.some((t) => t.status === "active")) return p;
    return withStarted(p, id, Date.now());
  });
}

export function completeTask(id: string) {
  updatePlan((p) => {
    const now = Date.now();
    const tasks = p.tasks.map((t) => (t.id === id ? { ...t, status: "done" as const, completedAt: now } : t));
    const allDone = tasks.every((t) => t.status === "done");
    // keep the momentum: if there's more to do and nothing else running, open the
    // "next task or break?" countdown
    const between =
      !allDone && !tasks.some((t) => t.status === "active") && tasks.some((t) => t.status === "todo")
        ? { at: now }
        : undefined;
    // finishing the last task releases the lock
    return {
      ...p,
      tasks,
      locked: allDone ? false : p.locked,
      pause: allDone ? undefined : p.pause,
      between,
    };
  });
}

/**
 * From the between-tasks pop-up: "Continue" → back to the next-task choices to pick one.
 * The decide clock keeps running, so picking nothing still ends in the automatic break.
 */
export function continueStrike() {
  updatePlan((p) => (p.between && !p.between.picking ? { ...p, between: { ...p.between, picking: true } } : p));
}

/** From the between-tasks countdown: take a break. When it ends you pick your next task again. */
export function breakThenNext(minutes: number, startedAt = Date.now()) {
  updatePlan((p) => ({
    ...p,
    between: undefined,
    pause: { startedAt, until: startedAt + Math.max(1, minutes) * 60_000, thenNext: true },
  }));
}

/**
 * Didn't pick a task or a break in time → a random one of the tasks on offer starts,
 * timed from the moment the countdown ran out.
 */
export function settleBetween(now = Date.now()) {
  updatePlan((p, s) => {
    if (!p.between || p.pause) return p;
    const deadline = p.between.at + DECIDE_SECONDS * 1000;
    if (now < deadline) return p;
    const offered = strikeQueue(p).slice(0, Math.max(1, s.visibleCount));
    if (offered.length === 0) return { ...p, between: undefined };
    const pick = offered[Math.floor(Math.random() * offered.length)];
    return withStarted(p, pick.id, deadline);
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
    const resumed: Plan = {
      ...p,
      pause: undefined,
      tasks: p.tasks.map((t) => {
        if (t.status !== "active" || t.startedAt === undefined) return t;
        const frozen = Math.max(0, end - Math.max(pause.startedAt, t.startedAt));
        return { ...t, pausedMs: (t.pausedMs ?? 0) + frozen };
      }),
    };
    // after a between-tasks break you choose again — the one-minute pick clock starts when the break ends
    if (pause.thenNext && !resumed.tasks.some((t) => t.status === "active") && strikeQueue(resumed).length > 0) {
      return { ...resumed, between: { at: end, picking: true } };
    }
    return resumed;
  });
}

// ---------- saved plans (reusable routines) ----------

/** Save a plan's tasks for reuse. Saving again under the same name replaces the old copy. */
export function savePlan(planId: string) {
  update((s) => {
    const plan = s.plans.find((p) => p.id === planId);
    if (!plan || plan.tasks.length === 0) return s;
    const tasks: SavedTask[] = [...plan.tasks]
      .sort(byImportance)
      .map(({ action, priority, minutes }) => ({ action, priority, minutes }));
    const same = s.saved.find((x) => x.name.trim().toLowerCase() === plan.name.trim().toLowerCase());
    if (same) {
      return { ...s, saved: s.saved.map((x) => (x.id === same.id ? { ...x, name: plan.name, tasks } : x)) };
    }
    const saved: SavedPlan = { id: crypto.randomUUID(), name: plan.name, tasks, createdAt: Date.now() };
    return { ...s, saved: [...s.saved, saved] };
  });
}

export function deleteSaved(id: string) {
  update((s) => ({ ...s, saved: s.saved.filter((x) => x.id !== id) }));
}

/**
 * Bring a saved plan back. With `intoPlanId` (an unlocked plan) its tasks are added there;
 * otherwise it opens as a fresh plan tab.
 */
export function applySaved(id: string, intoPlanId?: string) {
  update((s) => {
    const saved = s.saved.find((x) => x.id === id);
    if (!saved) return s;
    const now = Date.now();
    const fresh = saved.tasks.map(
      (t, i): Task => ({ id: crypto.randomUUID(), ...t, status: "todo", createdAt: now + i }),
    );
    const target = intoPlanId ? s.plans.find((p) => p.id === intoPlanId && !p.locked) : undefined;
    if (target) {
      return {
        ...s,
        activePlanId: target.id,
        plans: s.plans.map((p) => (p.id === target.id ? { ...p, tasks: [...p.tasks, ...fresh] } : p)),
      };
    }
    const plan: Plan = { id: crypto.randomUUID(), name: saved.name, tasks: fresh, locked: false, createdAt: now };
    return { ...s, plans: [...s.plans, plan], activePlanId: plan.id };
  });
}

// ---------- settings ----------

export function setVisibleCount(n: number) {
  update((s) => ({ ...s, visibleCount: Math.min(3, Math.max(1, n)) }));
}

export function setMultitask(on: boolean) {
  update((s) => ({ ...s, multitask: on }));
}

// ---------- helpers ----------

function newSeed() {
  return Math.floor(Math.random() * 2 ** 31);
}

/** Small deterministic hash, so a shuffle stays put between re-renders and reloads. */
function hash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Put tasks in the random order given by `seed` (same seed → same order). */
export function shuffled<T extends { id: string }>(tasks: T[], seed: number): T[] {
  return [...tasks].sort((a, b) => hash(`${seed}:${a.id}`) - hash(`${seed}:${b.id}`) || a.id.localeCompare(b.id));
}

/** The plan's shuffle seed (plans locked before shuffling existed get a fixed one). */
export function planSeed(p: Plan) {
  return p.shuffle ?? hash(p.id);
}

/** The to-do tasks in the random order Strike deals them out. */
export function strikeQueue(p: Plan): Task[] {
  return shuffled(
    p.tasks.filter((t) => t.status === "todo"),
    planSeed(p),
  );
}

/** Most important first; ties go to the quicker task, then the older one. */
export function byImportance(a: Task, b: Task) {
  return a.priority - b.priority || a.minutes - b.minutes || a.createdAt - b.createdAt;
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
