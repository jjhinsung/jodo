"use client";

import { useEffect, useRef } from "react";

const RADIUS = 130; // how far the cursor's "wind" reaches (px)
const STIFFNESS = 55; // how hard each blade springs back upright
const DAMPING = 4.2; // low = keeps swaying after the wind passes
const MAX_ANGLE = 40; // degrees

type Props = {
  text: string;
  className?: string;
  /** Marks this text as the thing the sword slash cuts through. */
  slashTarget?: boolean;
};

/**
 * Text that behaves like grass. Every letter is a blade rooted at its baseline with its
 * own spring; the cursor is the wind (its speed pushes the letters, and standing near
 * them leans them away). A faint idle breeze keeps everything gently moving.
 */
export default function SwayText({ text, className, slashTarget }: Props) {
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const blades = Array.from(root.querySelectorAll<HTMLElement>("[data-blade]")).map((el, i) => ({
      el,
      a: 0, // lean angle (deg)
      w: 0, // angular velocity (deg/s)
      phase: i * 0.45 + Math.random() * 2,
    }));

    const wind = { x: -9999, y: -9999, vx: 0, t: 0, seen: false };
    const onMove = (e: PointerEvent) => {
      const now = performance.now();
      if (wind.seen) {
        const dt = Math.max((now - wind.t) / 1000, 0.008);
        wind.vx = wind.vx * 0.5 + ((e.clientX - wind.x) / dt) * 0.5;
      }
      wind.x = e.clientX;
      wind.y = e.clientY;
      wind.t = now;
      wind.seen = true;
    };
    const onLeave = () => {
      wind.x = wind.y = -9999;
    };
    window.addEventListener("pointermove", onMove);
    document.addEventListener("mouseleave", onLeave);

    let last = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.033);
      last = now;
      wind.vx *= Math.pow(0.03, dt); // gusts die down when the cursor stops
      const sec = now / 1000;
      const cursorNear = wind.x > -9000;

      for (const b of blades) {
        // idle breeze
        let force = Math.sin(sec * 1.5 + b.phase) * 12 + Math.sin(sec * 0.6 + b.phase * 0.3) * 8;

        if (cursorNear) {
          const r = b.el.getBoundingClientRect();
          const dx = r.left + r.width / 2 - wind.x;
          const dy = r.top + r.height * 0.6 - wind.y;
          const dist = Math.hypot(dx, dy);
          if (dist < RADIUS) {
            const f = (1 - dist / RADIUS) ** 2;
            force += f * (wind.vx * 0.24 + (dx / (dist || 1)) * 520);
          }
        }

        b.w += (-STIFFNESS * b.a - DAMPING * b.w + force) * dt;
        b.a = Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, b.a + b.w * dt));
        b.el.style.transform = `translateX(${b.a * 0.25}px) skewX(${-b.a}deg)`;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  const tokens = text.split(/(\s+)/).filter((t) => t !== "");

  return (
    <span ref={rootRef} className={className} data-slash-target={slashTarget ? "" : undefined}>
      <span className="sr-only">{text}</span>
      {tokens.map((tok, i) =>
        /^\s+$/.test(tok) ? (
          " "
        ) : (
          <span key={i} aria-hidden="true" className="inline-block whitespace-nowrap">
            {Array.from(tok).map((ch, j) => (
              <span key={j} data-blade className="inline-block origin-bottom will-change-transform">
                {ch}
              </span>
            ))}
          </span>
        ),
      )}
    </span>
  );
}
