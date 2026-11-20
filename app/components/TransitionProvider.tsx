"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * Page transitions that live in the root layout, so they keep playing while the
 * route underneath changes.
 *
 *  - "warp":  the current page is sucked into a spiral vortex, then we land on the new page.
 *  - "slash": two sword strikes — one through JODO, one across the whole screen — and the
 *             new page opens up out of the light.
 *  - "slide": minimal — the current page slides away and the new one slides in behind it.
 *
 * Each works from a frozen copy (innerHTML snapshot) of the page you are leaving, drawn
 * on top while the real navigation happens underneath.
 */

export type TransitionKind = "warp" | "slash" | "slide";

type Active = {
  id: number;
  kind: TransitionKind;
  href: string;
  html: string;
  scrollY: number;
  cx: number;
  cy: number;
};

type OverlayProps = {
  html: string;
  scrollY: number;
  cx: number;
  cy: number;
  readyRef: React.RefObject<boolean>;
  onDone: () => void;
};

const Ctx = createContext<{ go: (href: string, kind: TransitionKind) => void }>({ go: () => {} });

export function useJodoTransition() {
  return useContext(Ctx);
}

export default function TransitionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);
  const readyRef = useRef(false); // true once the new route is on screen under the overlay
  const [active, setActive] = useState<Active | null>(null);

  useEffect(() => {
    readyRef.current = active !== null && pathname === active.href;
  }, [active, pathname]);

  const go = useCallback(
    (href: string, kind: TransitionKind) => {
      if (busyRef.current || window.location.pathname === href) return;
      const root = rootRef.current;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!root || reduced) {
        router.push(href);
        return;
      }
      busyRef.current = true;

      // Where should the sword strike? Through the JODO word if the page has one.
      const rect = document.querySelector("[data-slash-target]")?.getBoundingClientRect();
      const onScreen = rect && rect.top > 0 && rect.bottom < window.innerHeight;
      setActive({
        id: Date.now(),
        kind,
        href,
        // autofocus on the copy would steal focus from the real next page
        html: root.innerHTML.replace(/\sautofocus(="[^"]*")?/g, ""),
        scrollY: window.scrollY,
        cx: onScreen ? rect.left + rect.width / 2 : window.innerWidth / 2,
        cy: onScreen ? rect.top + rect.height / 2 : window.innerHeight / 2,
      });
      router.push(href);
    },
    [router],
  );

  const finish = useCallback(() => {
    busyRef.current = false;
    setActive(null);
  }, []);

  const value = useMemo(() => ({ go }), [go]);

  return (
    <Ctx.Provider value={value}>
      <div ref={rootRef} className="flex flex-1 flex-col">
        {children}
      </div>
      {active?.kind === "warp" && <WarpOverlay key={active.id} {...active} readyRef={readyRef} onDone={finish} />}
      {active?.kind === "slash" && <SlashOverlay key={active.id} {...active} readyRef={readyRef} onDone={finish} />}
      {active?.kind === "slide" && (
        <SlideOverlay key={active.id} {...active} readyRef={readyRef} onDone={finish} pageRef={rootRef} />
      )}
    </Ctx.Provider>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function PageCopy({ html, scrollY }: { html: string; scrollY: number }) {
  return (
    <div
      className="absolute left-0 w-full"
      style={{ top: -scrollY }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
const easeInOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

const MAX_WAIT_MS = 5000; // never hang if the route is slow

function setupCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  return { w, h };
}

// ---------------------------------------------------------------------------
// WARP — whirlwind that starts on top of the page you are leaving
// ---------------------------------------------------------------------------

const TWIST_MS = 800; // old page shrinks and spins away
const FLASH_AT = 1300; // everything washes out to cream
const FLASH_MS = 250;
const FADE_MS = 400; // cream dissolves into the new page
const STAR_COUNT = 520;
const COLORS = ["#F2E9DC", "#C9A27E", "#E8B27D", "#fff6e6", "#a88b72"];

type Star = { a: number; d: number; v: number; color: string; px: number; py: number };

function WarpOverlay({ html, scrollY, readyRef, onDone }: OverlayProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const skipRef = useRef<() => void>(() => {});

  useEffect(() => {
    const box = boxRef.current;
    const page = pageRef.current;
    const bg = bgRef.current;
    const canvas = canvasRef.current;
    const flash = flashRef.current;
    const ctx = canvas?.getContext("2d");
    if (!box || !page || !bg || !canvas || !flash || !ctx) {
      const t = setTimeout(onDone, 0);
      return () => clearTimeout(t);
    }

    const { w, h } = setupCanvas(canvas, ctx);
    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.hypot(cx, cy);

    const place = (s: Star, rot: number) => {
      s.px = cx + Math.cos(s.a + rot) * s.d * maxR;
      s.py = cy + Math.sin(s.a + rot) * s.d * maxR;
    };

    const stars: Star[] = Array.from({ length: STAR_COUNT }, () => {
      const s: Star = {
        a: Math.random() * Math.PI * 2,
        d: Math.random(),
        v: 0.6 + Math.random() * 0.9,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        px: 0,
        py: 0,
      };
      place(s, 0);
      return s;
    });

    let start = performance.now();
    let last = start;
    let fadeStart: number | null = null;
    let raf = 0;
    skipRef.current = () => {
      start = Math.min(start, performance.now() - FLASH_AT);
    };

    const frame = (now: number) => {
      const t = now - start;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      const p = clamp01(t / FLASH_AT);
      const tw = clamp01(t / TWIST_MS);
      const e = tw * tw;

      // the page you were on gets pulled into the vortex
      page.style.transform = `scale(${1 - 0.6 * e}) rotate(${e * 45}deg)`;
      page.style.borderRadius = `${e * 48}px`;
      page.style.opacity = String(1 - clamp01((tw - 0.2) / 0.8));
      bg.style.opacity = String(clamp01(t / (TWIST_MS * 0.9)));

      // particles: transparent canvas, old strokes erased gradually to leave trails
      ctx.globalCompositeOperation = "destination-out";
      ctx.globalAlpha = 1;
      ctx.fillStyle = `rgba(0, 0, 0, ${0.2 + 0.1 * p})`;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";

      const rot = p * p * 3;
      const boost = 0.6 + 7 * p * p;
      const intro = clamp01(t / 350);

      for (const s of stars) {
        const ox = s.px;
        const oy = s.py;
        s.d += dt * s.v * (0.08 + s.d) * boost;
        s.a += dt * (1.2 + 6 * p) * (0.5 / (s.d + 0.15));

        if (s.d > 1.15) {
          s.d = 0.01 + Math.random() * 0.05;
          s.a = Math.random() * Math.PI * 2;
          place(s, rot);
          continue;
        }

        place(s, rot);
        ctx.globalAlpha = Math.min(1, 0.25 + s.d * 1.6) * intro;
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 0.8 + s.d * 3;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        ctx.lineTo(s.px, s.py);
        ctx.stroke();
      }

      // swelling portal in the middle
      ctx.globalAlpha = intro;
      const glowR = 30 + p * p * maxR * 0.7;
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
      glow.addColorStop(0, `rgba(255, 246, 230, ${0.25 + 0.6 * p})`);
      glow.addColorStop(0.4, `rgba(201, 162, 126, ${0.12 + 0.3 * p})`);
      glow.addColorStop(1, "rgba(201, 162, 126, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      flash.style.opacity = String(clamp01((t - FLASH_AT) / FLASH_MS));

      if (t > FLASH_AT + FLASH_MS && fadeStart === null && (readyRef.current || t > MAX_WAIT_MS)) {
        fadeStart = now;
      }
      if (fadeStart !== null) {
        const f = (now - fadeStart) / FADE_MS;
        box.style.opacity = String(Math.max(0, 1 - f));
        if (f >= 1) {
          onDone();
          return;
        }
      }
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [onDone, readyRef]);

  return (
    <div
      ref={boxRef}
      role="presentation"
      onClick={() => skipRef.current()}
      className="fixed inset-0 z-[100] cursor-pointer overflow-hidden"
    >
      <div ref={bgRef} className="absolute inset-0 bg-[#2a1c14]" style={{ opacity: 0 }} />
      <div ref={pageRef} className="absolute inset-0 overflow-hidden bg-neutral-950">
        <PageCopy html={html} scrollY={scrollY} />
      </div>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <p
        className="warp-text absolute inset-x-0 bottom-[18%] text-center text-sm font-semibold uppercase tracking-[0.5em] text-[#F2E9DC]"
        style={{ animationDuration: "1.5s" }}
      >
        Entering Plan
      </p>
      <div ref={flashRef} className="absolute inset-0 bg-[#F2E9DC]" style={{ opacity: 0 }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// SLASH — one sword, two strikes. It cuts through JODO and slows into view at the
// lower-left, flips overhead around its hilt, then tears across the whole screen
// left → right. That second cut's light engulfs everything, and the Strike page
// opens cleanly out of it.
// ---------------------------------------------------------------------------

const SWORD_SCALE = 1.45;
const HILT = 234 * SWORD_SCALE; // tip → crossguard distance (the sword pivots here)
const SLASH_MS = 560; // strike one (eased: visible entry, fast cut, visible landing)
const CRACK_MS = 220; // the cut parts slightly
const WINDUP_MS = 320; // sword flips overhead for strike two
const SWEEP_MS = 380; // strike two
const SWEEP_AT = SLASH_MS + WINDUP_MS;
const ENGULF_DELAY = 100; // light starts swelling behind the second blade
const ENGULF_MS = 430; // ...until it fills the screen
const REVEAL_MS = 380; // light fades away to the new page
const SLASH_ANGLE = (32 * Math.PI) / 180;
const SWEEP_ANGLE = -0.32; // strike two rises gently to the right

type Spark = { x: number; y: number; vx: number; vy: number; life: number };
type Pose = { x: number; y: number; a: number };

/** Time fraction at which easeInOutCubic reaches `target`. */
function invEaseInOut(target: number) {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (easeInOutCubic(mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function SlashOverlay({ html, scrollY, cx, cy, readyRef, onDone }: OverlayProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const halfARef = useRef<HTMLDivElement>(null);
  const halfBRef = useRef<HTMLDivElement>(null);
  const bandRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const box = boxRef.current;
    const halfA = halfARef.current;
    const halfB = halfBRef.current;
    const band = bandRef.current;
    const canvas = canvasRef.current;
    const flash = flashRef.current;
    const ctx = canvas?.getContext("2d");
    if (!box || !halfA || !halfB || !band || !canvas || !flash || !ctx) {
      const t = setTimeout(onDone, 0);
      return () => clearTimeout(t);
    }

    const { w, h } = setupCanvas(canvas, ctx);
    const L = Math.hypot(w, h);

    // ---- strike one: u runs along the cut (toward upper-right), n is perpendicular ----
    const ux = Math.cos(SLASH_ANGLE);
    const uy = -Math.sin(SLASH_ANGLE);
    const nx = Math.sin(SLASH_ANGLE);
    const ny = Math.cos(SLASH_ANGLE);
    const pt = (s: number, o: number) => `${cx + ux * s + nx * o}px ${cy + uy * s + ny * o}px`;

    halfA.style.clipPath = `polygon(${pt(-L, 0)}, ${pt(L, 0)}, ${pt(L, L)}, ${pt(-L, L)})`;
    halfB.style.clipPath = `polygon(${pt(-L, 0)}, ${pt(L, 0)}, ${pt(L, -L)}, ${pt(-L, -L)})`;
    halfA.style.transformOrigin = halfB.style.transformOrigin = `${cx}px ${cy}px`;

    // the sword's tip enters at the upper-right edge and lands just inside the lower-left edge
    const entryS = Math.min((w - cx) / ux, cy / Math.sin(SLASH_ANGLE));
    const exitS = Math.min(cx / ux, (h - cy) / Math.sin(SLASH_ANGLE));
    const sStart = entryS + 40;
    const sEnd = -Math.max(exitS * 0.5, exitS - 70);
    const tHit = invEaseInOut(sStart / (sStart - sEnd)) * SLASH_MS; // tip crosses JODO
    const a1 = Math.atan2(-uy, -ux); // pointing the way it cuts (down-left)

    // ---- the flip: pivot around the hilt, swinging up and over to point right ----
    const tipEnd = { x: cx + ux * sEnd, y: cy + uy * sEnd };
    const hilt = { x: tipEnd.x - Math.cos(a1) * HILT, y: tipEnd.y - Math.sin(a1) * HILT };
    const flip = (((SWEEP_ANGLE - a1) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2); // via overhead

    // ---- strike two: from where the flip leaves the tip, straight across to the right ----
    const vx = Math.cos(SWEEP_ANGLE);
    const vy = Math.sin(SWEEP_ANGLE);
    const t2 = { x: hilt.x + vx * HILT, y: hilt.y + vy * HILT };
    const sweepTravel = Math.max(0, (w - t2.x) / vx) + 340 * SWORD_SCALE; // until the sword is gone

    const sparks: Spark[] = [];
    const burst = (x: number, y: number, n: number, speed: number) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = speed * (0.3 + Math.random());
        sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, life: 1 });
      }
    };

    const ghosts: Pose[] = [];
    const start = performance.now();
    let revealStart: number | null = null;
    let covered = false;
    let raf = 0;

    const drawSword = (x: number, y: number, angle: number, alpha: number, glow: boolean) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, y);
      ctx.rotate(angle); // +x points where the tip is aimed
      ctx.scale(SWORD_SCALE, SWORD_SCALE);
      if (glow) {
        ctx.shadowColor = "rgba(255, 60, 60, 0.9)";
        ctx.shadowBlur = 22;
      }
      const blade = ctx.createLinearGradient(0, -9, 0, 9);
      blade.addColorStop(0, "#ffffff");
      blade.addColorStop(0.5, "#d8dde6");
      blade.addColorStop(1, "#8b93a1");
      ctx.fillStyle = blade;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-30, -7);
      ctx.lineTo(-230, -9);
      ctx.lineTo(-230, 9);
      ctx.lineTo(-30, 7);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(120, 128, 140, 0.8)"; // fuller groove
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-40, 0);
      ctx.lineTo(-222, 0);
      ctx.stroke();
      ctx.fillStyle = "#c9a227"; // crossguard
      ctx.fillRect(-240, -32, 12, 64);
      ctx.fillStyle = "#3b2416"; // grip
      ctx.fillRect(-304, -6, 64, 12);
      ctx.strokeStyle = "#5a3a24";
      ctx.lineWidth = 1.5;
      for (let g = -296; g < -244; g += 8) {
        ctx.beginPath();
        ctx.moveTo(g, -6);
        ctx.lineTo(g + 5, 6);
        ctx.stroke();
      }
      ctx.fillStyle = "#c9a227"; // pommel
      ctx.beginPath();
      ctx.arc(-310, 0, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const drawGlint = (x: number, y: number, size: number, alpha: number) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = "#fff";
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.moveTo(x, y - size);
      ctx.lineTo(x + size * 0.18, y - size * 0.18);
      ctx.lineTo(x + size, y);
      ctx.lineTo(x + size * 0.18, y + size * 0.18);
      ctx.lineTo(x, y + size);
      ctx.lineTo(x - size * 0.18, y + size * 0.18);
      ctx.lineTo(x - size, y);
      ctx.lineTo(x - size * 0.18, y - size * 0.18);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };

    const frame = (now: number) => {
      const t = now - start;
      ctx.clearRect(0, 0, w, h);

      // ================= where is the sword? =================
      let pose: Pose | null = null;
      let flipP = 0;
      if (t < SLASH_MS) {
        const s = sStart + (sEnd - sStart) * easeInOutCubic(t / SLASH_MS);
        pose = { x: cx + ux * s, y: cy + uy * s, a: a1 };
      } else if (t < SWEEP_AT) {
        flipP = easeInOutCubic((t - SLASH_MS) / WINDUP_MS);
        const a = a1 + flip * flipP;
        pose = { x: hilt.x + Math.cos(a) * HILT, y: hilt.y + Math.sin(a) * HILT, a };
      } else if (t < SWEEP_AT + SWEEP_MS) {
        const d = sweepTravel * Math.pow((t - SWEEP_AT) / SWEEP_MS, 1.6);
        pose = { x: t2.x + vx * d, y: t2.y + vy * d, a: SWEEP_ANGLE };
      }

      // ================= strike one: the cut it leaves =================
      const trailAlpha = t < SLASH_MS ? 1 : 1 - clamp01((t - SLASH_MS) / 300);
      if (trailAlpha > 0) {
        const s = t < SLASH_MS ? sStart + (sEnd - sStart) * easeInOutCubic(t / SLASH_MS) : sEnd;
        const hx = cx + ux * s;
        const hy = cy + uy * s;
        const tx = cx + ux * sStart;
        const ty = cy + uy * sStart;
        const g = ctx.createLinearGradient(tx, ty, hx, hy);
        g.addColorStop(0, "rgba(255, 60, 60, 0)");
        g.addColorStop(1, "rgba(255, 255, 255, 1)");
        ctx.save();
        ctx.globalAlpha = trailAlpha;
        ctx.lineCap = "round";
        ctx.shadowColor = "#ff2a2a";
        ctx.shadowBlur = 26;
        ctx.strokeStyle = g;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(hx, hy);
        ctx.stroke();
        ctx.restore();
      }
      if (t > tHit - 60 && t < tHit + 260) burst(cx, cy, 6, 450);

      const sinceHit = t - tHit;
      flash.style.opacity = sinceHit >= 0 ? String(Math.max(0, 0.75 - sinceHit / 170)) : "0";

      const sinceEngulf = t - (SWEEP_AT + ENGULF_DELAY);
      const shake1 = sinceHit >= 0 && sinceHit < 280 ? 11 * (1 - sinceHit / 280) : 0;
      const shake2 = sinceEngulf >= 0 && sinceEngulf < 300 ? 9 * (1 - sinceEngulf / 300) : 0;
      const shake = Math.max(shake1, shake2);
      const sx = (Math.random() - 0.5) * 2 * shake;
      const sy = (Math.random() - 0.5) * 2 * shake;
      const crack = 7 * easeOutCubic(clamp01((sinceHit - 60) / CRACK_MS));
      if (!covered) {
        halfA.style.transform = `translate(${nx * crack + sx}px, ${ny * crack + sy}px)`;
        halfB.style.transform = `translate(${-nx * crack + sx}px, ${-ny * crack + sy}px)`;
        const bandH = 6 + 2 * crack + Math.sin(t / 60) * 1.5;
        band.style.height = `${bandH}px`;
        band.style.top = `${cy - bandH / 2 + sy}px`;
        band.style.opacity = sinceHit >= 0 ? "1" : "0";
      }

      // ================= strike two: light swelling behind the blade =================
      if (t >= SWEEP_AT) {
        const q = clamp01((t - SWEEP_AT) / SWEEP_MS);
        const d = sweepTravel * Math.pow(q, 1.6);
        const e = clamp01(sinceEngulf / ENGULF_MS);
        const thick = 8 + Math.pow(e, 2.2) * 2.3 * L;
        const back = -HILT * 1.1 - e * L * 2; // reaches back past the left edge as it grows

        ctx.save();
        ctx.translate(t2.x + sx, t2.y + sy);
        ctx.rotate(SWEEP_ANGLE);
        const g = ctx.createLinearGradient(0, -thick / 2, 0, thick / 2);
        g.addColorStop(0, "rgba(255, 40, 40, 0)");
        g.addColorStop(0.12, "#ff2a2a");
        g.addColorStop(0.32, "#ff6a4a");
        g.addColorStop(0.5, "#fff6ea");
        g.addColorStop(0.68, "#ff6a4a");
        g.addColorStop(0.88, "#ff2a2a");
        g.addColorStop(1, "rgba(255, 40, 40, 0)");
        ctx.fillStyle = g;
        if (thick < 90) {
          ctx.shadowColor = "#ff2a2a";
          ctx.shadowBlur = 28;
        }
        ctx.beginPath();
        ctx.moveTo(back, -thick / 2);
        ctx.lineTo(d, -thick / 2);
        ctx.lineTo(d + Math.min(thick * 0.5, 160), 0);
        ctx.lineTo(d, thick / 2);
        ctx.lineTo(back, thick / 2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        if (pose && pose.x > 0 && pose.x < w) burst(pose.x, pose.y, 3, 380);

        if (e >= 1 && !covered) {
          covered = true; // the old page is fully hidden by the light now
          halfA.style.visibility = "hidden";
          halfB.style.visibility = "hidden";
          band.style.visibility = "hidden";
        }
      }

      // ================= the sword itself, with afterimages =================
      if (pose) {
        ghosts.push(pose);
        if (ghosts.length > 6) ghosts.shift();
        ghosts.forEach((g, i) => {
          if (i < ghosts.length - 1) drawSword(g.x, g.y, g.a, 0.08 + (i / ghosts.length) * 0.2, false);
        });
        drawSword(pose.x, pose.y, pose.a, 1, true);
        // a glint runs along the blade as it flips overhead
        if (flipP > 0.25 && flipP < 0.85) {
          const k = (flipP - 0.25) / 0.6;
          const along = HILT * (0.25 + 0.6 * k);
          drawGlint(
            hilt.x + Math.cos(pose.a) * along,
            hilt.y + Math.sin(pose.a) * along,
            22,
            Math.sin(k * Math.PI),
          );
        }
      } else {
        ghosts.length = 0;
      }

      // ================= sparks =================
      ctx.save();
      ctx.lineCap = "round";
      for (let i = sparks.length - 1; i >= 0; i--) {
        const sp = sparks[i];
        sp.life -= 0.035;
        if (sp.life <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        const nx2 = sp.x + sp.vx * 0.016;
        const ny2 = sp.y + sp.vy * 0.016;
        sp.vy += 900 * 0.016;
        ctx.globalAlpha = sp.life;
        ctx.strokeStyle = sp.life > 0.6 ? "#fff6d8" : "#ff7a2a";
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(sp.x, sp.y);
        ctx.lineTo(nx2, ny2);
        ctx.stroke();
        sp.x = nx2;
        sp.y = ny2;
      }
      ctx.restore();

      // ================= the Strike page opens =================
      if (covered && revealStart === null && (readyRef.current || t > MAX_WAIT_MS)) revealStart = now;
      if (revealStart !== null) {
        const f = (now - revealStart) / REVEAL_MS;
        box.style.opacity = String(1 - clamp01(f));
        if (f >= 1) {
          onDone();
          return;
        }
      }
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [cx, cy, onDone, readyRef]);

  return (
    <div ref={boxRef} role="presentation" className="fixed inset-0 z-[100] overflow-hidden">
      <div
        ref={bandRef}
        className="absolute"
        style={{
          left: cx - 3000,
          width: 6000,
          opacity: 0,
          transform: `rotate(${-32}deg)`,
          // bright hot edges that glow inward, clear in the middle so the new page shows through
          background:
            "linear-gradient(to bottom, #fff4e0 0, #ff3b3b 5px, rgba(255,40,40,0.35) 36px, rgba(255,40,40,0) 130px, rgba(255,40,40,0) calc(100% - 130px), rgba(255,40,40,0.35) calc(100% - 36px), #ff3b3b calc(100% - 5px), #fff4e0 100%)",
          boxShadow: "0 0 40px 8px rgba(255, 40, 40, 0.55)",
        }}
      />
      <div ref={halfARef} className="absolute inset-0 overflow-hidden bg-neutral-950">
        <PageCopy html={html} scrollY={scrollY} />
      </div>
      <div ref={halfBRef} className="absolute inset-0 overflow-hidden bg-neutral-950">
        <PageCopy html={html} scrollY={scrollY} />
      </div>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div ref={flashRef} className="absolute inset-0 bg-white" style={{ opacity: 0 }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// SLIDE — minimal: the page you're on slides off to the right while home
// glides in from the left underneath it.
// ---------------------------------------------------------------------------

const SLIDE_MS = 650;

function SlideOverlay({
  html,
  scrollY,
  readyRef,
  onDone,
  pageRef,
}: OverlayProps & { pageRef: React.RefObject<HTMLDivElement | null> }) {
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sheet = sheetRef.current;
    const page = pageRef.current;
    if (!sheet) {
      const t = setTimeout(onDone, 0);
      return () => clearTimeout(t);
    }

    const mounted = performance.now();
    let start: number | null = null;
    let raf = 0;

    const frame = (now: number) => {
      // hold still until the new page is actually underneath
      if (start === null) {
        if (!readyRef.current && now - mounted < MAX_WAIT_MS) {
          raf = requestAnimationFrame(frame);
          return;
        }
        start = now;
      }
      const p = clamp01((now - start) / SLIDE_MS);
      const e = easeInOutCubic(p);
      sheet.style.transform = `translateX(${e * 100}%)`;
      if (page) page.style.transform = `translateX(${(e - 1) * 25}%)`;
      if (p >= 1) {
        if (page) page.style.transform = "";
        onDone();
        return;
      }
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      if (page) page.style.transform = "";
    };
  }, [onDone, pageRef, readyRef]);

  return (
    <div role="presentation" className="fixed inset-0 z-[100] overflow-hidden pointer-events-none">
      <div
        ref={sheetRef}
        className="absolute inset-0 overflow-hidden bg-neutral-950"
        style={{ boxShadow: "-24px 0 60px rgba(0, 0, 0, 0.55)" }}
      >
        <PageCopy html={html} scrollY={scrollY} />
      </div>
    </div>
  );
}
