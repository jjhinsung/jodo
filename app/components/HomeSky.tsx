"use client";

import { useEffect, useRef } from "react";

/**
 * Night sky behind the home page: twinkling stars, the occasional shooting star,
 * and little rockets that fly across trailing flame and smoke.
 */

type Star = { x: number; y: number; r: number; base: number; amp: number; speed: number; phase: number; color: string };
type Puff = { x: number; y: number; vx: number; vy: number; life: number; r: number };
type Rocket = {
  p0: [number, number];
  p1: [number, number];
  p2: [number, number];
  t0: number;
  dur: number;
  scale: number;
  puffs: Puff[];
  done: boolean;
};
type Shooter = { x: number; y: number; vx: number; vy: number; t0: number };

const STAR_COLORS = ["#ffffff", "#F2E9DC", "#fff4d6", "#dfe8ff"];

function makeStars(w: number, h: number): Star[] {
  const n = Math.round((w * h) / 4200);
  return Array.from({ length: n }, () => {
    const big = Math.random() < 0.08;
    return {
      x: Math.random() * w,
      y: Math.random() * h,
      r: big ? 1.3 + Math.random() * 0.9 : 0.4 + Math.random() * 0.9,
      base: 0.25 + Math.random() * 0.45,
      amp: 0.15 + Math.random() * 0.4,
      speed: 0.6 + Math.random() * 2.2,
      phase: Math.random() * Math.PI * 2,
      color: STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)],
    };
  });
}

function makeRocket(w: number, h: number, now: number): Rocket {
  const ltr = Math.random() < 0.7; // mostly left → right
  const y0 = h * (0.45 + Math.random() * 0.45);
  const y2 = h * (0.05 + Math.random() * 0.35);
  const x0 = ltr ? -80 : w + 80;
  const x2 = ltr ? w + 80 : -80;
  return {
    p0: [x0, y0],
    p1: [w * (0.3 + Math.random() * 0.4), Math.min(y0, y2) - h * (0.05 + Math.random() * 0.2)],
    p2: [x2, y2],
    t0: now,
    dur: 6500 + Math.random() * 3500,
    scale: 0.9 + Math.random() * 0.6,
    puffs: [],
    done: false,
  };
}

function drawRocket(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, scale: number, t: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);

  // flame (flickers)
  const flick = 10 + Math.sin(t * 40) * 3 + Math.random() * 4;
  const flame = ctx.createLinearGradient(-20, 0, -20 - flick, 0);
  flame.addColorStop(0, "#fff3b0");
  flame.addColorStop(0.4, "#ffb347");
  flame.addColorStop(1, "rgba(255, 90, 40, 0)");
  ctx.fillStyle = flame;
  ctx.beginPath();
  ctx.moveTo(-19, -4.5);
  ctx.quadraticCurveTo(-20 - flick, 0, -19, 4.5);
  ctx.closePath();
  ctx.fill();

  // fins
  ctx.fillStyle = "#e0483e";
  ctx.beginPath();
  ctx.moveTo(-12, -6);
  ctx.lineTo(-22, -13);
  ctx.lineTo(-19, -5);
  ctx.closePath();
  ctx.moveTo(-12, 6);
  ctx.lineTo(-22, 13);
  ctx.lineTo(-19, 5);
  ctx.closePath();
  ctx.fill();

  // body
  ctx.fillStyle = "#F2E9DC";
  ctx.beginPath();
  ctx.moveTo(-20, -6);
  ctx.lineTo(8, -6.5);
  ctx.quadraticCurveTo(20, -5, 26, 0);
  ctx.quadraticCurveTo(20, 5, 8, 6.5);
  ctx.lineTo(-20, 6);
  ctx.closePath();
  ctx.fill();

  // nose cone
  ctx.fillStyle = "#e0483e";
  ctx.beginPath();
  ctx.moveTo(14, -5.4);
  ctx.quadraticCurveTo(21, -4, 26, 0);
  ctx.quadraticCurveTo(21, 4, 14, 5.4);
  ctx.closePath();
  ctx.fill();

  // window
  ctx.fillStyle = "#7cc4ff";
  ctx.strokeStyle = "#3b2416";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(3, 0, 3.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

export default function HomeSky() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let w = 0;
    let h = 0;
    let stars: Star[] = [];
    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      stars = makeStars(w, h);
    };
    fit();
    window.addEventListener("resize", fit);

    const drawStars = (t: number) => {
      for (const s of stars) {
        const a = Math.max(0, Math.min(1, s.base + s.amp * Math.sin(t * s.speed + s.phase)));
        ctx.globalAlpha = a;
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
        // big stars sparkle when they peak
        if (s.r > 1.3 && a > 0.7) {
          const len = s.r * 5 * (a - 0.7) * 3;
          ctx.globalAlpha = (a - 0.7) * 2.5;
          ctx.strokeStyle = s.color;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(s.x - len, s.y);
          ctx.lineTo(s.x + len, s.y);
          ctx.moveTo(s.x, s.y - len);
          ctx.lineTo(s.x, s.y + len);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      drawStars(0);
      return () => window.removeEventListener("resize", fit);
    }

    const rockets: Rocket[] = [];
    const shooters: Shooter[] = [];
    let nextRocket = performance.now() + 1200;
    let nextShooter = performance.now() + 2500 + Math.random() * 3000;
    let last = performance.now();
    let raf = 0;

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const t = now / 1000;
      ctx.clearRect(0, 0, w, h);
      drawStars(t);

      // shooting stars
      if (now > nextShooter) {
        shooters.push({ x: w * (0.3 + Math.random() * 0.7), y: h * Math.random() * 0.4, vx: -(600 + Math.random() * 300), vy: 260 + Math.random() * 160, t0: now });
        nextShooter = now + 4000 + Math.random() * 6000;
      }
      for (let i = shooters.length - 1; i >= 0; i--) {
        const s = shooters[i];
        const age = (now - s.t0) / 1000;
        if (age > 0.9) {
          shooters.splice(i, 1);
          continue;
        }
        const x = s.x + s.vx * age;
        const y = s.y + s.vy * age;
        const fade = Math.sin((age / 0.9) * Math.PI);
        const g = ctx.createLinearGradient(x, y, x - s.vx * 0.12, y - s.vy * 0.12);
        g.addColorStop(0, `rgba(255, 255, 255, ${fade})`);
        g.addColorStop(1, "rgba(255, 255, 255, 0)");
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.6;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - s.vx * 0.12, y - s.vy * 0.12);
        ctx.stroke();
      }

      // rockets
      if (now > nextRocket && rockets.filter((r) => !r.done).length < 2) {
        rockets.push(makeRocket(w, h, now));
        nextRocket = now + 4500 + Math.random() * 4500;
      }
      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        const u = (now - r.t0) / r.dur;
        if (u >= 1) r.done = true;

        // smoke first, so the rocket draws on top of it
        for (let j = r.puffs.length - 1; j >= 0; j--) {
          const p = r.puffs[j];
          p.life -= dt * 0.8;
          if (p.life <= 0) {
            r.puffs.splice(j, 1);
            continue;
          }
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.r += dt * 9;
          ctx.globalAlpha = p.life * 0.28;
          ctx.fillStyle = "#F2E9DC";
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;

        if (!r.done) {
          const a = 1 - u;
          const x = a * a * r.p0[0] + 2 * a * u * r.p1[0] + u * u * r.p2[0];
          const y = a * a * r.p0[1] + 2 * a * u * r.p1[1] + u * u * r.p2[1] + Math.sin(now * 0.004) * 3;
          const dx = 2 * a * (r.p1[0] - r.p0[0]) + 2 * u * (r.p2[0] - r.p1[0]);
          const dy = 2 * a * (r.p1[1] - r.p0[1]) + 2 * u * (r.p2[1] - r.p1[1]);
          const angle = Math.atan2(dy, dx);
          const tailX = x - Math.cos(angle) * 22 * r.scale;
          const tailY = y - Math.sin(angle) * 22 * r.scale;
          r.puffs.push({
            x: tailX,
            y: tailY,
            vx: -Math.cos(angle) * 25 + (Math.random() - 0.5) * 18,
            vy: -Math.sin(angle) * 25 + (Math.random() - 0.5) * 18,
            life: 1,
            r: 2 + Math.random() * 2,
          });
          drawRocket(ctx, x, y, angle, r.scale, t);
        } else if (r.puffs.length === 0) {
          rockets.splice(i, 1);
        }
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", fit);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 h-full w-full" />;
}
