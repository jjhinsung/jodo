"use client";

import { useEffect, useRef } from "react";

/**
 * Living background for the Plan page:
 *  - the dirt is a field of specks that ripples like water wherever the cursor goes
 *  - moving or clicking over bare dirt kicks up little clods
 *  - a strip of grass along the bottom sways in a gentle breeze
 */

const GRASS_HEIGHT = 120; // px
const BACK_GRASS = ["#3c5420", "#45612a", "#4f6b28"];
const FRONT_GRASS = ["#6b9438", "#7ea443", "#93b955", "#a7c768"];
const SPECK_COLORS = ["#3d2a1d", "#4a3424", "#1c120c", "#57402d"];
const CLOD_COLORS = ["#5a4030", "#4a3424", "#6b4d38", "#3a281c"];

const RIPPLE_SPEED = 230; // px/s the ring travels outward
const RIPPLE_LIFE = 1.8; // s
const RIPPLE_WIDTH = 26; // px, thickness of the moving wave
const SPAWN_EVERY = 26; // px of cursor travel between ripples

type Blade = { x: number; h: number; w: number; color: string; phase: number; stiff: number };
type Ripple = { x: number; y: number; t0: number; amp: number };
type Clod = { x: number; y: number; vx: number; vy: number; life: number; r: number; color: string };

function fitCanvas(canvas: HTMLCanvasElement, w: number, h: number) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext("2d");
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function makeBlades(width: number): Blade[] {
  const blades: Blade[] = [];
  for (let x = -10; x < width + 10; x += 5 + Math.random() * 3) {
    blades.push({
      x,
      h: 28 + Math.random() * 55,
      w: 3 + Math.random() * 3,
      color: BACK_GRASS[Math.floor(Math.random() * BACK_GRASS.length)],
      phase: Math.random() * Math.PI * 2,
      stiff: 0.6 + Math.random() * 0.8,
    });
  }
  for (let x = -10; x < width + 10; x += 3.5 + Math.random() * 3) {
    const tall = Math.random() < 0.08;
    blades.push({
      x,
      h: tall ? 80 + Math.random() * 30 : 20 + Math.random() * 50,
      w: 2.5 + Math.random() * 3,
      color: FRONT_GRASS[Math.floor(Math.random() * FRONT_GRASS.length)],
      phase: Math.random() * Math.PI * 2,
      stiff: 0.6 + Math.random() * 0.8,
    });
  }
  return blades;
}

/** Dirt specks, stored flat and grouped by colour so each colour is one fill call. */
function makeSpecks(w: number, h: number) {
  const n = Math.round((w * h) / 650);
  const xs = new Float32Array(n);
  const ys = new Float32Array(n);
  const size = new Float32Array(n);
  const groups: number[][] = SPECK_COLORS.map(() => []);
  for (let i = 0; i < n; i++) {
    xs[i] = Math.random() * w;
    ys[i] = Math.random() * h;
    size[i] = 1.4 + Math.random() * 1.4;
    groups[Math.floor(Math.random() * SPECK_COLORS.length)].push(i);
  }
  return { xs, ys, size, groups };
}

export default function PlanScenery() {
  const dirtRef = useRef<HTMLCanvasElement>(null);
  const grassRef = useRef<HTMLCanvasElement>(null);
  const toolRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const dirtCanvas = dirtRef.current;
    const grassCanvas = grassRef.current;
    const toolCanvas = toolRef.current;
    if (!dirtCanvas || !grassCanvas || !toolCanvas) return;

    let w = window.innerWidth;
    let h = window.innerHeight;
    let dctx = fitCanvas(dirtCanvas, w, h);
    let gctx = fitCanvas(grassCanvas, w, GRASS_HEIGHT);
    let tctx = fitCanvas(toolCanvas, w, h);
    let blades = makeBlades(w);
    let specks = makeSpecks(w, h);

    const onResize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      dctx = fitCanvas(dirtCanvas, w, h);
      gctx = fitCanvas(grassCanvas, w, GRASS_HEIGHT);
      tctx = fitCanvas(toolCanvas, w, h);
      blades = makeBlades(w);
      specks = makeSpecks(w, h);
    };
    window.addEventListener("resize", onResize);

    const drawGrass = (t: number) => {
      if (!gctx) return;
      const H = GRASS_HEIGHT;
      gctx.clearRect(0, 0, w, H);
      for (const b of blades) {
        const gust = Math.sin(t * 0.7 - b.x * 0.004) * 0.22 + Math.sin(t * 1.9 + 1.3 - b.x * 0.01) * 0.07;
        const angle = gust * b.stiff + Math.sin(t * 2.2 + b.phase) * 0.06;
        const tipX = b.x + Math.sin(angle) * b.h;
        const tipY = H - Math.cos(angle) * b.h;
        const ctrlX = b.x + Math.sin(angle) * b.h * 0.35;
        const ctrlY = H - b.h * 0.55;
        gctx.fillStyle = b.color;
        gctx.beginPath();
        gctx.moveTo(b.x - b.w / 2, H);
        gctx.quadraticCurveTo(ctrlX - b.w * 0.3, ctrlY, tipX, tipY);
        gctx.quadraticCurveTo(ctrlX + b.w * 0.3, ctrlY, b.x + b.w / 2, H);
        gctx.closePath();
        gctx.fill();
      }
    };

    const ripples: Ripple[] = [];

    const drawDirt = (now: number) => {
      if (!dctx) return;
      dctx.clearRect(0, 0, w, h);
      const sec = now / 1000;
      for (let i = ripples.length - 1; i >= 0; i--) {
        if (sec - ripples[i].t0 > RIPPLE_LIFE) ripples.splice(i, 1);
      }

      // each speck is pushed outward as a wave front passes it, like water
      const { xs, ys, size, groups } = specks;
      for (let g = 0; g < groups.length; g++) {
        dctx.fillStyle = SPECK_COLORS[g];
        dctx.beginPath();
        for (const i of groups[g]) {
          let x = xs[i];
          let y = ys[i];
          for (const r of ripples) {
            const age = Math.max(0, sec - r.t0);
            const dx = x - r.x;
            const dy = y - r.y;
            const d = Math.hypot(dx, dy) || 1;
            const off = d - RIPPLE_SPEED * age;
            if (off > RIPPLE_WIDTH * 3 || off < -RIPPLE_WIDTH * 3) continue;
            const wave =
              r.amp * Math.exp(-age * 1.6) * Math.exp(-(off * off) / (2 * RIPPLE_WIDTH * RIPPLE_WIDTH)) * Math.cos(off * 0.16);
            x += (dx / d) * wave;
            y += (dy / d) * wave;
          }
          dctx.rect(x, y, size[i], size[i]);
        }
        dctx.fill();
      }

      // faint glinting rings so the ripples read clearly
      for (const r of ripples) {
        // a ripple can be born a hair after this frame's timestamp — never let age go negative
        const age = Math.max(0, sec - r.t0);
        const fade = Math.exp(-age * 2) * (r.amp / 10);
        dctx.lineWidth = 2.2;
        dctx.strokeStyle = `rgba(214, 178, 140, ${Math.min(0.6, 0.42 * fade)})`;
        dctx.beginPath();
        dctx.arc(r.x, r.y, RIPPLE_SPEED * age, 0, Math.PI * 2);
        dctx.stroke();
        dctx.lineWidth = 1.4;
        dctx.strokeStyle = `rgba(214, 178, 140, ${Math.min(0.35, 0.2 * fade)})`;
        dctx.beginPath();
        dctx.arc(r.x, r.y, RIPPLE_SPEED * age * 0.6, 0, Math.PI * 2);
        dctx.stroke();
      }
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      drawDirt(0);
      drawGrass(0);
      return () => window.removeEventListener("resize", onResize);
    }

    // ---- cursor: ripples everywhere, a digging shovel over bare dirt ----
    const cursor = { x: -999, y: -999 };
    let lastSpawn = { x: -999, y: -999 };
    let overDirt = false;
    const clods: Clod[] = [];

    const isDirt = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y);
      return Boolean(el && (el as HTMLElement).dataset?.dirt !== undefined);
    };

    const kick = (x: number, y: number, n: number, power: number) => {
      for (let i = 0; i < n; i++) {
        clods.push({
          x,
          y,
          vx: (Math.random() - 0.5) * 160 * power,
          vy: -(80 + Math.random() * 160) * power,
          life: 1,
          r: 1.5 + Math.random() * 2.5,
          color: CLOD_COLORS[Math.floor(Math.random() * CLOD_COLORS.length)],
        });
      }
    };

    const onMove = (e: PointerEvent) => {
      cursor.x = e.clientX;
      cursor.y = e.clientY;
      overDirt = isDirt(cursor.x, cursor.y);
      if (Math.hypot(cursor.x - lastSpawn.x, cursor.y - lastSpawn.y) > SPAWN_EVERY) {
        ripples.push({ x: cursor.x, y: cursor.y, t0: performance.now() / 1000, amp: 10 });
        lastSpawn = { x: cursor.x, y: cursor.y };
        if (overDirt) kick(cursor.x, cursor.y, 2, 0.8);
      }
    };
    const onDown = (e: PointerEvent) => {
      ripples.push({ x: e.clientX, y: e.clientY, t0: performance.now() / 1000, amp: 22 });
      if (isDirt(e.clientX, e.clientY)) kick(e.clientX, e.clientY, 14, 1.4);
    };
    const onLeave = () => {
      overDirt = false;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerdown", onDown);
    document.addEventListener("mouseleave", onLeave);

    const drawTool = (dt: number) => {
      if (!tctx) return;
      tctx.clearRect(0, 0, w, h);

      // clods arc out and fall back into the dirt
      for (let i = clods.length - 1; i >= 0; i--) {
        const c = clods[i];
        c.life -= dt * 1.6;
        if (c.life <= 0) {
          clods.splice(i, 1);
          continue;
        }
        c.vy += 600 * dt;
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        tctx.globalAlpha = Math.min(1, c.life * 1.5);
        tctx.fillStyle = c.color;
        tctx.beginPath();
        tctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
        tctx.fill();
      }
      tctx.globalAlpha = 1;
    };

    let last = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      drawDirt(now);
      drawGrass(now / 1000);
      drawTool(dt);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      document.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  return (
    <>
      <canvas ref={dirtRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 h-full w-full" />
      <canvas
        ref={grassRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[15] w-full"
        style={{ height: GRASS_HEIGHT }}
      />
      <canvas ref={toolRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-30 h-full w-full" />
    </>
  );
}
