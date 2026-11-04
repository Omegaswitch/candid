"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Kinetic grid background (adapted): a grid that warps toward the pointer and ripples on click.
 * Changes from the original: it fills its own container (not the window), draws in the theme's
 * ink colour only (black/white, like the logo), uses a transparent ground, draws once and stops
 * under prefers-reduced-motion, and pauses while the tab is hidden.
 */
type Point = { x: number; y: number };
type Ripple = { x: number; y: number; radius: number; opacity: number; born: number };

const CELL_SIZE = 55;
const INFLUENCE_RADIUS = 260;
const MAX_WARP = 24;
const DOT_SPACING = 28;
const LERP_SPEED = 0.08;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export default function KineticGrid({ children, className }: { children?: ReactNode; className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!wrap || !canvas || !ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mouse: Point = { x: -9999, y: -9999 };
    const target: Point = { x: -9999, y: -9999 };
    const ripples: Ripple[] = [];
    let w = 0;
    let h = 0;
    let raf = 0;
    // Ink comes from the theme: near-white on dark, near-black on light.
    let ink = "255,255,255";
    const readInk = () => {
      const fg = getComputedStyle(document.documentElement).getPropertyValue("--foreground").trim();
      ink = /^#?f|fafafa|255/i.test(fg) || document.documentElement.classList.contains("dark") ? "255,255,255" : "10,10,10";
    };

    const warp = (gx: number, gy: number, col: number, row: number, cols: number, rows: number) => {
      const m = 1.5;
      const pin = Math.min(col / m, (cols - 1 - col) / m, 1) ** 2 * Math.min(row / m, (rows - 1 - row) / m, 1) ** 2;
      const dx = gx - mouse.x;
      const dy = gy - mouse.y;
      const dist = Math.hypot(dx, dy);
      const proximity = Math.max(0, 1 - dist / INFLUENCE_RADIUS) * pin;
      let rx = 0;
      let ry = 0;
      for (const r of ripples) {
        const rdx = gx - r.x;
        const rdy = gy - r.y;
        const diff = Math.hypot(rdx, rdy) - r.radius;
        if (Math.abs(diff) < 55) {
          const s = (1 - Math.abs(diff) / 55) * r.opacity * 18 * pin * (diff < 0 ? 1 : -1);
          const a = Math.atan2(rdy, rdx);
          rx += Math.cos(a) * s;
          ry += Math.sin(a) * s;
        }
      }
      if (dist < INFLUENCE_RADIUS && dist > 0 && pin > 0) {
        const t = dist / INFLUENCE_RADIUS;
        const amt = (1 - t) * (1 - t) * Math.min(1, dist / 60) * MAX_WARP * pin;
        const a = Math.atan2(dy, dx);
        return { x: gx - Math.cos(a) * amt + rx, y: gy - Math.sin(a) * amt + ry, p: proximity };
      }
      return { x: gx + rx, y: gy + ry, p: proximity };
    };

    const draw = (now: number) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = `rgba(${ink},0.05)`;
      for (let x = DOT_SPACING / 2; x < w; x += DOT_SPACING)
        for (let y = DOT_SPACING / 2; y < h; y += DOT_SPACING) ctx.fillRect(x - 0.6, y - 0.6, 1.2, 1.2);

      for (let i = ripples.length - 1; i >= 0; i--) {
        const age = (now - ripples[i].born) / 1000;
        ripples[i].radius = Math.max(0, age * 400);
        ripples[i].opacity = Math.max(0, 1 - age * 1.2);
        if (ripples[i].opacity <= 0) ripples.splice(i, 1);
      }

      const cols = Math.max(2, Math.ceil(w / CELL_SIZE)) + 1;
      const rows = Math.max(2, Math.ceil(h / CELL_SIZE)) + 1;
      const cw = w / (cols - 1);
      const ch = h / (rows - 1);
      const pts = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => warp(c * cw, r * ch, c, r, cols, rows)));

      const seg = (a: { x: number; y: number; p: number }, b: { x: number; y: number; p: number }) => {
        const avg = (a.p + b.p) / 2;
        const t = avg * avg * (3 - 2 * avg);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = `rgba(${ink},${lerp(0.1, 0.75, t).toFixed(3)})`;
        ctx.lineWidth = lerp(0.8, 1.5, t);
        ctx.stroke();
      };
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols - 1; c++) seg(pts[r][c], pts[r][c + 1]);
      for (let c = 0; c < cols; c++) for (let r = 0; r < rows - 1; r++) seg(pts[r][c], pts[r + 1][c]);

      for (const row of pts)
        for (const pt of row) {
          const t = pt.p * pt.p * (3 - 2 * pt.p);
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, lerp(1.6, 3, t), 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${ink},${lerp(0.18, 0.95, t).toFixed(3)})`;
          ctx.fill();
        }

      for (const r of ripples) {
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${ink},${(r.opacity * 0.25).toFixed(3)})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    };

    const loop = (now: number) => {
      mouse.x = lerp(mouse.x, target.x, LERP_SPEED);
      mouse.y = lerp(mouse.y, target.y, LERP_SPEED);
      draw(now);
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      cancelAnimationFrame(raf);
      if (reduce) draw(performance.now());
      else if (!document.hidden) raf = requestAnimationFrame(loop);
    };

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      readInk();
      if (reduce) draw(performance.now());
    };
    const local = (e: MouseEvent) => {
      const r = wrap.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onMove = (e: MouseEvent) => Object.assign(target, local(e));
    const onLeave = () => Object.assign(target, { x: -9999, y: -9999 });
    const onClick = (e: MouseEvent) => !reduce && ripples.push({ ...local(e), radius: 0, opacity: 1, born: performance.now() });
    const onVis = () => (document.hidden ? cancelAnimationFrame(raf) : start());
    const themeObs = new MutationObserver(() => {
      readInk();
      if (reduce) draw(performance.now());
    });

    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    wrap.addEventListener("mousemove", onMove);
    wrap.addEventListener("mouseleave", onLeave);
    wrap.addEventListener("click", onClick);
    document.addEventListener("visibilitychange", onVis);
    resize();
    start();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      themeObs.disconnect();
      wrap.removeEventListener("mousemove", onMove);
      wrap.removeEventListener("mouseleave", onLeave);
      wrap.removeEventListener("click", onClick);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <div ref={wrapRef} className={cn("relative overflow-hidden", className)}>
      <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute inset-0 z-0 size-full" />
      <div className="relative z-10 size-full">{children}</div>
    </div>
  );
}
