"use client";

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Inter } from "next/font/google";
import {
  DECIDE_SECONDS,
  PRIORITY_COLORS,
  activePlan,
  breakThenNext,
  completeTask,
  continueStrike,
  formatClock,
  pausePlan,
  resumePlan,
  secondsLeft,
  settleBetween,
  startTask,
  strikeQueue,
  useJodo,
  type JodoState,
  type Task,
} from "../lib/jodo";

/**
 * A small always-on-top timer window (like a desk timer that floats over every app).
 *
 *  - Chrome / Edge / Arc / Brave: Document Picture-in-Picture — a real mini Jodo window with buttons.
 *  - Safari: the timer is painted onto a canvas and floated as a picture-in-picture "video" (no buttons).
 *  - Everywhere: the countdown also shows in the browser tab title.
 *
 * Lives in the root layout so it keeps floating while you move between pages.
 */

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });

const BREAK_OPTIONS = [2, 5, 10, 15];
// default size: a small landscape rectangle (it can still be resized by dragging its edges)
const WIDTH = 240;
const HEIGHT = 150;

type Mode = "window" | "video" | null;

type FloatCtx = {
  mode: Mode; // what this browser can do
  open: boolean;
  toggle: () => void;
  now: number; // shared clock, ticks from the floating window when it's open (never throttled)
};

const Ctx = createContext<FloatCtx>({ mode: null, open: false, toggle: () => {}, now: 0 });

export function useFloat() {
  return useContext(Ctx);
}

// ---------- what the timer is showing ----------

type View =
  | { kind: "run"; task: Task; seconds: number; more: number }
  | { kind: "break"; seconds: number; total: number; thenPick: boolean; task?: Task; taskSeconds?: number }
  | { kind: "decide"; seconds: number }
  | { kind: "pick"; seconds: number; offered: Task[] }
  | { kind: "ready"; offered: Task[] }
  | { kind: "idle"; label: string };

function viewOf(state: JodoState, now: number): View {
  const plan = activePlan(state);
  const { pause } = plan;
  if (pause) {
    // the task you paused (if any), with its frozen time
    const paused = plan.tasks
      .filter((t) => t.status === "active")
      .map((t) => ({ t, s: secondsLeft(t, now, pause) }))
      .sort((a, b) => a.s - b.s)[0];
    return {
      kind: "break",
      seconds: Math.max(0, Math.round((pause.until - now) / 1000)),
      total: Math.max(1, Math.round((pause.until - pause.startedAt) / 1000)),
      thenPick: Boolean(pause.thenNext),
      task: paused?.t,
      taskSeconds: paused?.s,
    };
  }

  const running = plan.tasks
    .filter((t) => t.status === "active")
    .map((t) => ({ t, s: secondsLeft(t, now) }))
    .sort((a, b) => a.s - b.s);
  if (running.length > 0) return { kind: "run", task: running[0].t, seconds: running[0].s, more: running.length - 1 };

  const offered = strikeQueue(plan).slice(0, Math.max(1, state.visibleCount));
  if (plan.between) {
    const seconds = Math.min(DECIDE_SECONDS, Math.max(0, Math.ceil((plan.between.at + DECIDE_SECONDS * 1000 - now) / 1000)));
    return plan.between.picking ? { kind: "pick", seconds, offered } : { kind: "decide", seconds };
  }
  if (offered.length > 0) return { kind: "ready", offered };
  if (plan.tasks.length > 0) return { kind: "idle", label: "All struck ✓" };
  return { kind: "idle", label: "No tasks yet" };
}

function tabTitle(v: View) {
  switch (v.kind) {
    case "run":
      return `${v.seconds < 0 ? "🔴" : "⏱"} ${formatClock(v.seconds)} · ${v.task.action}`;
    case "break":
      return `☕ ${formatClock(v.seconds)} · Break left`;
    case "decide":
    case "pick":
      return `⏳ ${formatClock(v.seconds)} · Pick next task`;
    default:
      return null;
  }
}

// ---------- browser support ----------

type DocPiP = { requestWindow: (o: { width: number; height: number }) => Promise<Window>; window: Window | null };

function docPiP(): DocPiP | undefined {
  return (window as unknown as { documentPictureInPicture?: DocPiP }).documentPictureInPicture;
}

function detectVideo() {
  return (
    document.pictureInPictureEnabled &&
    typeof HTMLCanvasElement.prototype.captureStream === "function" &&
    typeof HTMLVideoElement.prototype.requestPictureInPicture === "function"
  );
}

function detectMode(): Mode {
  if (docPiP()) return "window";
  return detectVideo() ? "video" : null;
}

const noSubscribe = () => () => {};

function copyStyles(target: Document) {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const style = target.createElement("style");
      style.textContent = Array.from(sheet.cssRules)
        .map((r) => r.cssText)
        .join("\n");
      target.head.appendChild(style);
    } catch {
      if (sheet.href) {
        const link = target.createElement("link");
        link.rel = "stylesheet";
        link.href = sheet.href;
        target.head.appendChild(link);
      }
    }
  }
}

// ---------- provider ----------

export function FloatProvider({ children }: { children: ReactNode }) {
  const state = useJodo();
  const mode = useSyncExternalStore(noSubscribe, detectMode, () => null);
  const [pip, setPip] = useState<Window | null>(null);
  const [videoOn, setVideoOn] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const baseTitle = useRef<string | null>(null);

  // One clock for the app. A visible floating window keeps ticking at full speed even when
  // the Jodo tab is in the background (where the browser slows timers down).
  useEffect(() => {
    const host = pip ?? window;
    const id = host.setInterval(() => setNow(Date.now()), 1000);
    return () => host.clearInterval(id);
  }, [pip]);

  const view = viewOf(state, now);

  // Keep the strike moving even when you're not on the Strike page
  // (both are no-ops if the Strike page already handled it).
  const plan = activePlan(state);
  useEffect(() => {
    if (plan.pause && now >= plan.pause.until) resumePlan();
    else if (plan.between && now >= plan.between.at + DECIDE_SECONDS * 1000) settleBetween(now);
  });

  // countdown in the tab title
  useEffect(() => {
    const t = tabTitle(view);
    if (t) {
      if (baseTitle.current === null) baseTitle.current = document.title;
      document.title = t;
    } else if (baseTitle.current !== null) {
      document.title = baseTitle.current;
      baseTitle.current = null;
    }
  });

  // Safari: repaint the floating "video" every tick
  useEffect(() => {
    if (videoOn && canvasRef.current) paint(canvasRef.current, view);
  });

  async function openWindow() {
    const api = docPiP();
    if (!api) return;
    const w = await api.requestWindow({ width: WIDTH, height: HEIGHT });
    copyStyles(w.document);
    w.document.documentElement.className = document.documentElement.className;
    w.document.title = "Jodo timer";
    w.document.body.className = `${inter.className} m-0 bg-neutral-950 text-neutral-100 antialiased`;
    w.addEventListener("pagehide", () => setPip(null), { once: true });
    setPip(w);
  }

  async function openVideo() {
    const canvas = document.createElement("canvas");
    canvas.width = WIDTH * 2;
    canvas.height = HEIGHT * 2;
    canvasRef.current = canvas;
    paint(canvas, view);
    let video = videoRef.current;
    if (!video) {
      video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      // must be in the page (but out of sight) for Safari to float it
      video.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;bottom:0;left:0";
      document.body.appendChild(video);
      video.addEventListener("leavepictureinpicture", () => setVideoOn(false));
      videoRef.current = video;
    }
    video.srcObject = canvas.captureStream(4);
    await video.play();
    await video.requestPictureInPicture();
    setVideoOn(true);
  }

  function toggle() {
    if (pip) {
      pip.close();
      setPip(null);
      return;
    }
    if (videoOn) {
      void document.exitPictureInPicture().catch(() => {});
      setVideoOn(false);
      return;
    }
    const ignore = () => {
      /* the user dismissed it or the browser refused */
    };
    if (mode === "window") {
      // some Chromium-based apps expose the API but can't make the window — fall back to the timer-only float
      openWindow().catch(() => {
        if (detectVideo()) openVideo().catch(ignore);
      });
    } else if (mode === "video") openVideo().catch(ignore);
  }

  // close the floating window if Jodo itself goes away
  useEffect(() => () => pip?.close(), [pip]);

  return (
    <Ctx.Provider value={{ mode, open: Boolean(pip) || videoOn, toggle, now }}>
      {children}
      {pip && createPortal(<FloatCard view={view} onClose={toggle} />, pip.document.body)}
    </Ctx.Provider>
  );
}

// ---------- the mini window (Chrome / Edge) ----------

function FloatCard({ view, onClose }: { view: View; onClose: () => void }) {
  const [breakFor, setBreakFor] = useState<string | null>(null);
  // the break chooser belongs to the moment it was opened for, and closes itself if that moment passes
  const momentKey = view.kind === "run" ? `run:${view.task.id}` : view.kind;
  const choosingBreak = breakFor === momentKey && (view.kind === "decide" || view.kind === "pick" || view.kind === "run");

  const shell = "flex h-screen w-screen flex-col gap-1.5 px-2.5 py-2 select-none overflow-hidden";
  const btn = "rounded-md px-2.5 py-1 text-xs font-bold transition-colors";
  // same sky-blue outline as the break buttons on the Strike page
  const breakBtn = "border-2 border-sky-400/70 text-sky-300 hover:bg-sky-400 hover:text-neutral-950";
  const clockStyle = { fontSize: "min(25vw, 42vh)" };

  const close = (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close floating timer"
      className="absolute right-1.5 top-1 rounded px-1 text-sm leading-none opacity-50 hover:opacity-100"
    >
      ×
    </button>
  );

  if (choosingBreak) {
    return (
      <div className={`${shell} relative items-center justify-center bg-neutral-900`}>
        {close}
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-300">Break for</p>
        <div className="grid w-full grid-cols-4 gap-1.5">
          {BREAK_OPTIONS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                if (view.kind === "run") pausePlan(m);
                else breakThenNext(m);
                setBreakFor(null);
              }}
              className={`${btn} bg-sky-400 px-0 py-2 text-neutral-950 hover:bg-sky-300`}
            >
              {m}m
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setBreakFor(null)} className="text-xs text-neutral-400 underline">
          Back
        </button>
      </div>
    );
  }

  if (view.kind === "run") {
    const over = view.seconds < 0;
    const c = PRIORITY_COLORS[view.task.priority] ?? PRIORITY_COLORS[2];
    const bg = over ? "#DC2626" : c.bg;
    const fg = over ? "#FFFFFF" : c.fg;
    return (
      <div className={`${shell} relative`} style={{ backgroundColor: bg, color: fg }}>
        {close}
        <p className="truncate pr-5 text-xs font-bold leading-tight">{view.task.action}</p>
        <div className="flex flex-1 items-center justify-center font-mono font-extrabold tabular-nums leading-none" style={clockStyle}>
          {formatClock(view.seconds)}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => completeTask(view.task.id)}
            className={`${btn} flex-1 bg-neutral-950 text-white hover:bg-black`}
          >
            Done ✓
          </button>
          <button
            type="button"
            onClick={() => setBreakFor(momentKey)}
            className={`${btn} bg-black/20 hover:bg-black/30`}
          >
            Pause
          </button>
          {view.more > 0 && <span className="shrink-0 text-[10px] opacity-75">+{view.more}</span>}
        </div>
      </div>
    );
  }

  if (view.kind === "break") {
    // same colours as the PAUSED screen on the site: sky → yellow in the last 30s → red in the last 10s
    const urgent = view.seconds <= 10;
    const color = urgent ? "#ef4444" : view.seconds <= 30 ? "#facc15" : "#7dd3fc";
    return (
      <div className={`${shell} relative bg-neutral-900`}>
        {close}
        <p className="pr-5 text-xs font-extrabold uppercase tracking-[0.2em] text-sky-300">
          ☕ Paused <span className="font-semibold tracking-[0.1em] text-neutral-400">· break left</span>
        </p>
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
          <div
            className={`font-mono font-extrabold tabular-nums leading-none ${urgent ? "animate-pulse" : ""}`}
            style={{ fontSize: "min(22vw, 30vh)", color }}
          >
            {formatClock(view.seconds)}
          </div>
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-neutral-800">
            <div
              className="h-full rounded-full"
              style={{ width: `${(view.seconds / view.total) * 100}%`, background: color, transition: "width 1s linear, background 0.3s" }}
            />
          </div>
          {view.task && view.taskSeconds !== undefined && (
            <p className="mt-1 flex w-full items-center justify-between gap-2 text-[11px] leading-tight text-neutral-400">
              <span className="truncate">⏸ {view.task.action}</span>
              <span className="shrink-0 font-mono tabular-nums">{formatClock(view.taskSeconds)}</span>
            </p>
          )}
        </div>
        <button type="button" onClick={() => resumePlan()} className={`${btn} bg-neutral-100 text-neutral-950 hover:bg-white`}>
          {view.thenPick ? "I'm back — pick next" : "I'm back — resume"}
        </button>
      </div>
    );
  }


  if (view.kind === "decide") {
    return (
      <div className={`${shell} relative bg-neutral-900`}>
        {close}
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-green-400">✓ Struck</p>
        <div
          className={`flex flex-1 items-center justify-center font-mono font-extrabold tabular-nums leading-none ${
            view.seconds <= 10 ? "text-red-400" : ""
          }`}
          style={clockStyle}
        >
          {formatClock(view.seconds)}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => continueStrike()} className={`${btn} flex-1 bg-[#3B82F6] text-white hover:bg-[#2563EB]`}>
            Continue
          </button>
          <button type="button" onClick={() => setBreakFor(momentKey)} className={`${btn} ${breakBtn} flex-1`}>
            Break
          </button>
        </div>
      </div>
    );
  }

  if (view.kind === "pick" || view.kind === "ready") {
    return (
      <div className={`${shell} relative bg-neutral-900`}>
        {close}
        {view.kind === "pick" ? (
          <div className="pr-5">
            <div className="flex items-center justify-between gap-2">
              <div className="shrink-0 leading-tight">
                <p className="whitespace-nowrap text-[11px] font-bold uppercase tracking-[0.08em] text-[#93C5FD]">Pick next</p>
                <p className="whitespace-nowrap text-[9px] text-neutral-400">or auto-picked</p>
              </div>
              <span
                className={`font-mono text-[22px] font-extrabold leading-none tabular-nums ${
                  view.seconds <= 10 ? "text-red-400" : "text-white"
                }`}
              >
                {formatClock(view.seconds).replace(/^0/, "")}
              </span>
              <button
                type="button"
                onClick={() => setBreakFor(momentKey)}
                className={`${btn} ${breakBtn} shrink-0 px-2 py-0.5 text-[11px]`}
              >
                Break
              </button>
            </div>
            {/* the minute draining away */}
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-neutral-800">
              <div
                className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${
                  view.seconds <= 10 ? "bg-red-400" : "bg-[#3B82F6]"
                }`}
                style={{ width: `${(view.seconds / DECIDE_SECONDS) * 100}%` }}
              />
            </div>
          </div>
        ) : (
          <p className="pr-5 text-[11px] font-bold uppercase tracking-[0.15em] text-[#93C5FD]">Pick next</p>
        )}
        <div className="flex min-h-0 flex-1 flex-col justify-center gap-1 overflow-hidden">
          {view.offered.map((t) => {
            const c = PRIORITY_COLORS[t.priority] ?? PRIORITY_COLORS[2];
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => startTask(t.id)}
                style={{ backgroundColor: c.bg, color: c.fg }}
                className="flex shrink-0 items-center justify-between gap-2 rounded-md px-2.5 py-1 text-left text-xs font-semibold hover:brightness-110"
              >
                <span className="truncate">{t.action}</span>
                <span className="shrink-0 text-xs" style={{ color: c.sub }}>
                  {t.minutes}m
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className={`${shell} relative items-center justify-center bg-neutral-900`}>
      {close}
      <p className="text-2xl font-extrabold tracking-tight">JODO</p>
      <p className="text-sm text-neutral-400">{view.label}</p>
    </div>
  );
}

// ---------- the floating "video" (Safari) ----------

function paint(canvas: HTMLCanvasElement, v: View) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  let bg = "#171717";
  let fg = "#F5F5F5";
  let top = "JODO";
  let clock: string | null = null;
  let bottom = "";

  switch (v.kind) {
    case "run": {
      const c = PRIORITY_COLORS[v.task.priority] ?? PRIORITY_COLORS[2];
      bg = v.seconds < 0 ? "#DC2626" : c.bg;
      fg = v.seconds < 0 ? "#FFFFFF" : c.fg;
      top = v.task.action;
      clock = formatClock(v.seconds);
      bottom = v.seconds < 0 ? "Over time" : v.more > 0 ? `+${v.more} more running` : "";
      break;
    }
    case "break":
      top = "☕ Paused · break left";
      clock = formatClock(v.seconds);
      bottom = v.task && v.taskSeconds !== undefined ? `⏸ ${v.task.action} · ${formatClock(v.taskSeconds)}` : v.thenPick ? "Then pick your next task" : "";
      break;
    case "decide":
      top = "✓ Struck";
      clock = formatClock(v.seconds);
      bottom = "Continue or take a break";
      break;
    case "pick":
      top = "Pick your next task";
      clock = formatClock(v.seconds);
      bottom = "Or one is picked for you";
      break;
    case "ready":
      top = "Ready to strike";
      bottom = `${v.offered.length} task${v.offered.length === 1 ? "" : "s"} up next`;
      break;
    case "idle":
      bottom = v.label;
      break;
  }

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const sans = "system-ui, -apple-system, sans-serif";

  ctx.font = `700 ${W * 0.075}px ${sans}`;
  ctx.fillText(fit(ctx, top, W * 0.88), W / 2, H * 0.17);

  if (clock) {
    ctx.font = `800 ${Math.min(W * (clock.length > 6 ? 0.19 : 0.25), H * 0.42)}px ui-monospace, Menlo, monospace`;
    ctx.fillText(clock, W / 2, H * 0.52);
  } else {
    ctx.font = `800 ${W * 0.16}px ${sans}`;
    ctx.fillText("JODO", W / 2, H * 0.5);
  }

  if (bottom) {
    ctx.globalAlpha = 0.75;
    ctx.font = `500 ${W * 0.06}px ${sans}`;
    ctx.fillText(fit(ctx, bottom, W * 0.88), W / 2, H * 0.85);
    ctx.globalAlpha = 1;
  }
}

function fit(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > max) t = t.slice(0, -1);
  return t + "…";
}
