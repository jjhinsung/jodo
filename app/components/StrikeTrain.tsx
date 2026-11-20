"use client";

import { useEffect, useRef } from "react";
import { byImportance, secondsLeft, type Pause, type Task } from "../lib/jodo";

/**
 * A little steam train along the bottom of the Strike page that shows how far
 * through the plan you are.
 *
 *  - It leaves from START, stops at one station per task, and ends at a pile of gold.
 *  - Station spacing follows each task's time; while a task runs, the train rolls
 *    toward its station in step with the timer.
 *  - Mark a task done early and the train zooms straight to that station.
 *  - If the timer runs out, the train sits in the station shaking, with smoke
 *    billowing out of it, until you mark the task done.
 *  - On a break, everything freezes where it is.
 */

const H = 150; // strip height (px)
const TRACK_Y = H - 26; // rail top
const START_X = 150; // leaves room for the carriages behind the engine

type Props = { tasks: Task[]; pause?: Pause };
type Puff = { x: number; y: number; vx: number; vy: number; r: number; grow: number; life: number; dark: boolean };
type Coin = { x: number; y: number; vx: number; vy: number; life: number; spin: number };

/** Route order: finished stations first, then whatever is running, then what's next. */
function route(tasks: Task[]) {
  const done = tasks.filter((t) => t.status === "done").sort((a, b) => (a.completedAt ?? 0) - (b.completedAt ?? 0));
  const active = tasks.filter((t) => t.status === "active").sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0));
  const todo = tasks.filter((t) => t.status === "todo").sort(byImportance);
  return [...done, ...active, ...todo];
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export default function StrikeTrain({ tasks, pause }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latest = useRef({ tasks, pause });

  useEffect(() => {
    latest.current = { tasks, pause };
  }, [tasks, pause]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let w = 0;
    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      canvas.width = w * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);

    const font = getComputedStyle(canvas).fontFamily || "sans-serif";
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let pos: number | null = null; // where the engine is drawn
    let lastCount = 0;
    let vel = 0;
    let wheel = 0;
    let lastPuff = 0;
    let lastStationPuff = 0;
    let goldBurst = false;
    const puffs: Puff[] = [];
    const coins: Coin[] = [];
    let last = performance.now();
    let raf = 0;

    const puff = (x: number, y: number, dark: boolean, big = false) => {
      puffs.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 14 - (dark ? 0 : 10),
        vy: -(dark ? 28 : 22) - Math.random() * 14,
        r: big ? 7 + Math.random() * 4 : 4 + Math.random() * 3,
        grow: big ? 16 : 9,
        life: 1,
        dark,
      });
    };

    const fitLabel = (text: string, maxW: number) => {
      if (ctx.measureText(text).width <= maxW) return text;
      let s = text;
      while (s.length > 1 && ctx.measureText(s + "…").width > maxW) s = s.slice(0, -1);
      return s + "…";
    };

    const drawSign = (x: number, label: string, maxW: number, bg: string, fg: string) => {
      ctx.font = `600 11px ${font}`;
      const text = fitLabel(label, Math.max(24, maxW - 12));
      const tw = ctx.measureText(text).width + 12;
      const y = TRACK_Y - 66;
      ctx.fillStyle = "#3f3f46"; // post
      ctx.fillRect(x - 1, y + 18, 2, 10);
      ctx.fillStyle = bg;
      roundRect(ctx, x - tw / 2, y, tw, 18, 5);
      ctx.fill();
      ctx.fillStyle = fg;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, x, y + 9.5);
    };

    const drawStation = (x: number, wall: string, roof: string) => {
      ctx.fillStyle = wall;
      ctx.fillRect(x - 20, TRACK_Y - 30, 40, 26);
      ctx.fillStyle = roof;
      ctx.beginPath();
      ctx.moveTo(x - 25, TRACK_Y - 29);
      ctx.lineTo(x, TRACK_Y - 40);
      ctx.lineTo(x + 25, TRACK_Y - 29);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255, 240, 200, 0.55)"; // lit windows
      ctx.fillRect(x - 13, TRACK_Y - 24, 7, 7);
      ctx.fillRect(x + 6, TRACK_Y - 24, 7, 7);
      ctx.fillStyle = "#27272a"; // platform
      ctx.fillRect(x - 26, TRACK_Y - 5, 52, 5);
    };

    const drawGold = (x: number, t: number, arrived: boolean) => {
      if (arrived) {
        const g = ctx.createRadialGradient(x, TRACK_Y - 14, 2, x, TRACK_Y - 14, 70);
        g.addColorStop(0, "rgba(250, 204, 21, 0.45)");
        g.addColorStop(1, "rgba(250, 204, 21, 0)");
        ctx.fillStyle = g;
        ctx.fillRect(x - 70, TRACK_Y - 84, 140, 84);
      }
      const rows = [6, 5, 4, 3, 2];
      rows.forEach((count, row) => {
        for (let i = 0; i < count; i++) {
          const cx = x + (i - (count - 1) / 2) * 10;
          const cy = TRACK_Y - 5 - row * 7;
          ctx.fillStyle = "#facc15";
          ctx.strokeStyle = "#a16207";
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.ellipse(cx, cy, 5.5, 4, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      });
      ctx.fillStyle = "#fde047"; // gold bar on top
      ctx.strokeStyle = "#a16207";
      ctx.fillRect(x - 8, TRACK_Y - 46, 16, 7);
      ctx.strokeRect(x - 8, TRACK_Y - 46, 16, 7);
      // twinkles
      for (let i = 0; i < 4; i++) {
        const a = Math.max(0, Math.sin(t * 2.4 + i * 1.7));
        if (a < 0.3) continue;
        const sx = x - 22 + i * 15;
        const sy = TRACK_Y - 30 - (i % 2) * 14;
        const s = 3 + a * (arrived ? 6 : 3);
        ctx.strokeStyle = `rgba(255, 255, 240, ${a})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(sx - s, sy);
        ctx.lineTo(sx + s, sy);
        ctx.moveTo(sx, sy - s);
        ctx.lineTo(sx, sy + s);
        ctx.stroke();
      }
    };

    const drawWheel = (x: number, y: number, r: number) => {
      ctx.fillStyle = "#18181b";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#a1a1aa";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(x, y, r - 1.5, 0, Math.PI * 2);
      ctx.stroke();
      for (let s = 0; s < 3; s++) {
        const a = wheel + (s * Math.PI) / 3;
        ctx.beginPath();
        ctx.moveTo(x - Math.cos(a) * (r - 2), y - Math.sin(a) * (r - 2));
        ctx.lineTo(x + Math.cos(a) * (r - 2), y + Math.sin(a) * (r - 2));
        ctx.stroke();
      }
    };

    const drawCar = (x: number, y: number, color: string) => {
      ctx.fillStyle = color;
      roundRect(ctx, x - 17, y - 26, 34, 18, 3);
      ctx.fill();
      ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
      ctx.fillRect(x - 17, y - 12, 34, 3);
      drawWheel(x - 9, y - 6, 5.5);
      drawWheel(x + 9, y - 6, 5.5);
    };

    const drawTrain = (x: number, y: number) => {
      // couplings
      ctx.strokeStyle = "#52525b";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 118, y - 12);
      ctx.lineTo(x - 36, y - 12);
      ctx.stroke();
      drawCar(x - 98, y, "#a16207");
      drawCar(x - 58, y, "#facc15");
      // engine: cab
      ctx.fillStyle = "#b91c1c";
      ctx.fillRect(x - 36, y - 40, 18, 32);
      ctx.fillStyle = "#7f1d1d";
      ctx.fillRect(x - 38, y - 43, 22, 4);
      ctx.fillStyle = "#fde68a";
      ctx.fillRect(x - 31, y - 35, 8, 8);
      // boiler
      ctx.fillStyle = "#F2E9DC";
      roundRect(ctx, x - 20, y - 30, 34, 20, 6);
      ctx.fill();
      ctx.fillStyle = "#b91c1c";
      ctx.fillRect(x - 6, y - 30, 4, 20);
      // chimney + dome
      ctx.fillStyle = "#27272a";
      ctx.fillRect(x + 4, y - 42, 7, 13);
      ctx.fillRect(x + 2, y - 44, 11, 4);
      ctx.fillStyle = "#c9a227";
      ctx.beginPath();
      ctx.arc(x - 10, y - 30, 4, Math.PI, 0);
      ctx.fill();
      // cowcatcher + lamp
      ctx.fillStyle = "#52525b";
      ctx.beginPath();
      ctx.moveTo(x + 14, y - 16);
      ctx.lineTo(x + 22, y - 4);
      ctx.lineTo(x + 14, y - 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#fef3c7";
      ctx.beginPath();
      ctx.arc(x + 15, y - 24, 2.5, 0, Math.PI * 2);
      ctx.fill();
      // wheels
      drawWheel(x - 27, y - 7, 6.5);
      drawWheel(x - 8, y - 8, 8);
      drawWheel(x + 9, y - 8, 8);
    };

    const frame = (perfNow: number) => {
      const dt = Math.min((perfNow - last) / 1000, 0.05);
      last = perfNow;
      const t = perfNow / 1000;
      const now = Date.now();
      const { tasks: all, pause: brk } = latest.current;
      const list = route(all);
      const n = list.length;

      // ---- the route: station spacing follows each task's time ----
      const goldX = Math.max(START_X + 160, w - 60);
      const lastX = goldX - 80;
      const weights = list.map((tk) => tk.minutes);
      const avg = n ? weights.reduce((a, b) => a + b, 0) / n : 1;
      const spans = weights.map((m) => Math.max(m, avg * 0.6));
      const total = spans.reduce((a, b) => a + b, 0) || 1;
      let acc = 0;
      const xs = [START_X, ...spans.map((s) => START_X + ((lastX - START_X) * (acc += s)) / total)];

      // ---- where should the train be? ----
      const doneCount = list.filter((tk) => tk.status === "done").length;
      const current = list[doneCount];
      let target = xs[Math.min(doneCount, n)];
      let stuck = false;
      let running = false;
      if (n > 0 && doneCount === n) {
        target = goldX;
      } else if (current?.status === "active") {
        const left = secondsLeft(current, now, brk);
        const frac = Math.min(1, Math.max(0, 1 - left / (current.minutes * 60)));
        target = xs[doneCount] + (xs[doneCount + 1] - xs[doneCount]) * frac;
        stuck = left <= 0;
        running = !brk && !stuck;
      }

      // first real data: start in place rather than zooming in from START
      if (pos === null || (lastCount === 0 && n > 0)) pos = target;
      lastCount = n;
      const prev = pos;
      if (reduced) pos = target;
      else {
        const gap = target - pos;
        pos += gap * Math.min(1, (Math.abs(gap) > 40 ? 4.5 : 8) * dt);
      }
      const v = dt > 0 ? (pos - prev) / dt : 0;
      vel = vel * 0.85 + v * 0.15;
      wheel += (pos - prev) / 7;

      ctx.clearRect(0, 0, w, H);

      // ---- ground + rails ----
      ctx.fillStyle = "#171717";
      ctx.fillRect(0, TRACK_Y + 3, w, H - TRACK_Y);
      ctx.fillStyle = "#3f3f46";
      for (let x = 0; x < w; x += 14) ctx.fillRect(x, TRACK_Y + 2, 8, 4); // sleepers
      ctx.fillStyle = "#a1a1aa";
      ctx.fillRect(0, TRACK_Y, w, 2.5);
      // stretch of track already travelled
      ctx.fillStyle = "rgba(250, 204, 21, 0.55)";
      ctx.fillRect(START_X, TRACK_Y, Math.max(0, pos - START_X), 2.5);

      // ---- stations ----
      const spacing = (k: number) => {
        const left = k > 0 ? xs[k] - xs[k - 1] : 140;
        const right = k < xs.length - 1 ? xs[k + 1] - xs[k] : goldX - xs[k];
        return Math.min(150, left, right + 40);
      };
      drawStation(START_X, "#44403c", "#78716c");
      drawSign(START_X, "START", 80, "#F2E9DC", "#18181b");

      const flashOn = Math.floor(t * 3) % 2 === 0;
      for (let k = 1; k <= n; k++) {
        const tk = list[k - 1];
        const x = xs[k];
        const isDone = tk.status === "done";
        const isNext = k === doneCount + 1 && tk.status === "active";
        const isStuck = isNext && stuck;
        if (isDone) drawStation(x, "#14532d", "#166534");
        else if (isStuck) drawStation(x, flashOn ? "#991b1b" : "#7f1d1d", "#dc2626");
        else if (isNext) drawStation(x, "#713f12", "#ca8a04");
        else drawStation(x, "#27272a", "#3f3f46");
        const label = (isDone ? "✓ " : "") + tk.action;
        if (isDone) drawSign(x, label, spacing(k), "#166534", "#dcfce7");
        else if (isStuck) drawSign(x, label, spacing(k), flashOn ? "#dc2626" : "#991b1b", "#fff");
        else if (isNext) drawSign(x, label, spacing(k), "#facc15", "#18181b");
        else drawSign(x, label, spacing(k), "#27272a", "#d4d4d8");
      }

      const arrived = n > 0 && doneCount === n && Math.abs(pos - goldX) < 6;
      drawGold(goldX, t, arrived);
      if (arrived && !goldBurst) {
        goldBurst = true;
        for (let i = 0; i < 36; i++) {
          coins.push({
            x: goldX,
            y: TRACK_Y - 30,
            vx: (Math.random() - 0.5) * 260,
            vy: -(180 + Math.random() * 220),
            life: 1,
            spin: Math.random() * 6,
          });
        }
      }
      if (!(n > 0 && doneCount === n)) goldBurst = false;

      // ---- smoke ----
      const shakeX = stuck && !brk && !reduced ? (Math.random() - 0.5) * 3.5 : 0;
      const shakeY = stuck && !brk && !reduced ? (Math.random() - 0.5) * 2 : 0;
      const engineX = pos + shakeX;
      const chimney = { x: engineX + 7, y: TRACK_Y - 44 + shakeY };
      if (!reduced && !brk) {
        const zooming = Math.abs(vel) > 120;
        const every = stuck ? 0.07 : zooming ? 0.05 : running ? 0.22 : 1.1;
        if (t - lastPuff > every) {
          puff(chimney.x, chimney.y, stuck, stuck);
          lastPuff = t;
        }
        if (stuck && t - lastStationPuff > 0.06) {
          const sx = xs[doneCount + 1];
          puff(sx + (Math.random() - 0.5) * 30, TRACK_Y - 38, true, true);
          lastStationPuff = t;
        }
      }
      for (let i = puffs.length - 1; i >= 0; i--) {
        const p = puffs[i];
        if (!brk) {
          p.life -= dt * (p.dark ? 0.45 : 0.7);
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.r += p.grow * dt;
        }
        if (p.life <= 0) {
          puffs.splice(i, 1);
          continue;
        }
        ctx.fillStyle = p.dark ? `rgba(64, 64, 70, ${p.life * 0.75})` : `rgba(231, 229, 228, ${p.life * 0.45})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // ---- speed lines when it zooms to a station ----
      if (Math.abs(vel) > 160) {
        const a = Math.min(0.6, (Math.abs(vel) - 160) / 600);
        ctx.strokeStyle = `rgba(242, 233, 220, ${a})`;
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 5; i++) {
          const ly = TRACK_Y - 10 - i * 7;
          const len = 30 + ((i * 37) % 40);
          ctx.beginPath();
          ctx.moveTo(engineX - 130 - len, ly);
          ctx.lineTo(engineX - 125, ly);
          ctx.stroke();
        }
      }

      drawTrain(engineX, TRACK_Y + shakeY);

      // ---- gold coins flying when the train arrives ----
      for (let i = coins.length - 1; i >= 0; i--) {
        const c = coins[i];
        c.life -= dt * 0.7;
        if (c.life <= 0) {
          coins.splice(i, 1);
          continue;
        }
        c.vy += 520 * dt;
        c.x += c.vx * dt;
        c.y = Math.min(TRACK_Y - 3, c.y + c.vy * dt);
        ctx.globalAlpha = Math.min(1, c.life * 2);
        ctx.fillStyle = "#facc15";
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, 4, Math.abs(Math.cos(t * 8 + c.spin)) * 4 + 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="block w-full" style={{ height: H }} />;
}
