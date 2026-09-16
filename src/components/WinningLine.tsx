import { useEffect, useRef, useState } from "react";
import type { SymbolKind } from "../types";

interface WinningLineProps {
  containerEl: HTMLElement | null;
  startEl: HTMLElement | null;
  endEl: HTMLElement | null;
  symbol: SymbolKind;
  active: boolean;
}

interface LineGeometry {
  width: number;
  height: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export default function WinningLine({ containerEl, startEl, endEl, symbol, active }: WinningLineProps) {
  const [geometry, setGeometry] = useState<LineGeometry | null>(null);
  const pathRef = useRef<SVGLineElement | null>(null);

  useEffect(() => {
    if (!active || !containerEl || !startEl || !endEl) {
      setGeometry(null);
      return;
    }

    const measure = () => {
      const containerRect = containerEl.getBoundingClientRect();
      const startRect = startEl.getBoundingClientRect();
      const endRect = endEl.getBoundingClientRect();

      const pad = Math.min(startRect.width, startRect.height) * 0.28;
      const cx1 = startRect.left + startRect.width / 2 - containerRect.left;
      const cy1 = startRect.top + startRect.height / 2 - containerRect.top;
      const cx2 = endRect.left + endRect.width / 2 - containerRect.left;
      const cy2 = endRect.top + endRect.height / 2 - containerRect.top;

      // Extend the line slightly past the outer symbols' centers for a
      // confident, natural-looking strike-through.
      const dx = cx2 - cx1;
      const dy = cy2 - cy1;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;

      setGeometry({
        width: containerRect.width,
        height: containerRect.height,
        x1: cx1 - ux * pad,
        y1: cy1 - uy * pad,
        x2: cx2 + ux * pad,
        y2: cy2 + uy * pad,
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(containerEl);
    window.addEventListener("orientationchange", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("orientationchange", measure);
    };
  }, [active, containerEl, startEl, endEl]);

  useEffect(() => {
    const el = pathRef.current;
    if (!el || !geometry) return;
    const length = Math.hypot(geometry.x2 - geometry.x1, geometry.y2 - geometry.y1);
    el.style.strokeDasharray = `${length}`;
    el.style.strokeDashoffset = `${length}`;
    el.getBoundingClientRect();
    const raf = requestAnimationFrame(() => {
      el.style.transition = "stroke-dashoffset 0.55s cubic-bezier(0.22,0.8,0.25,1) 0.05s";
      el.style.strokeDashoffset = "0";
    });
    return () => cancelAnimationFrame(raf);
  }, [geometry]);

  if (!geometry) return null;

  const color = symbol === "X" ? "var(--accent-x)" : "var(--accent-o)";

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-20 h-full w-full overflow-visible"
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
      aria-hidden="true"
    >
      <line
        ref={pathRef}
        x1={geometry.x1}
        y1={geometry.y1}
        x2={geometry.x2}
        y2={geometry.y2}
        stroke={color}
        strokeWidth={Math.max(4, geometry.width * 0.018)}
        strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 10px ${color})` }}
      />
    </svg>
  );
}
