import { useLayoutEffect, useRef, useState } from "react";
import type { Stroke, SymbolKind } from "../types";

interface SymbolGlyphProps {
  symbol: SymbolKind;
  /** Actual recorded strokes (normalized 0..1) to preserve the player's own drawing. */
  strokes?: Stroke[];
  animate?: boolean;
  className?: string;
  strokeWidth?: number;
}

// Slightly organic, hand-drawn-feeling canonical paths used for tap placement.
const GENERATED_PATHS: Record<SymbolKind, string[]> = {
  X: ["M23,25 C34,38 52,54 77,77", "M77,24 C63,39 42,57 23,76"],
  O: ["M64,21 C84,27 90,46 88,58 C85,76 68,86 50,85 C30,84 15,71 15,52 C15,33 31,18 51,18 C56,18 60,19 63,21"],
};

function strokeToPath(stroke: Stroke): string {
  if (stroke.length === 0) return "";
  const scaled = stroke.map((p) => `${(p.x * 100).toFixed(1)},${(p.y * 100).toFixed(1)}`);
  return `M${scaled[0]} L${scaled.slice(1).join(" ")}`;
}

function DrawnOrGeneratedPath({
  d,
  animate,
  delay,
}: {
  d: string;
  animate: boolean;
  delay: number;
}) {
  const ref = useRef<SVGPathElement | null>(null);
  const [ready, setReady] = useState(!animate);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !animate) return;
    const length = el.getTotalLength();
    el.style.strokeDasharray = `${length}`;
    el.style.strokeDashoffset = `${length}`;
    el.getBoundingClientRect(); // force reflow before transition kicks in
    const raf = requestAnimationFrame(() => {
      el.style.transition = `stroke-dashoffset 0.38s cubic-bezier(0.3,0.7,0.2,1) ${delay}s`;
      el.style.strokeDashoffset = "0";
    });
    const readyTimer = setTimeout(() => setReady(true), delay * 1000 + 60);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(readyTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate, d, delay]);

  return (
    <path
      ref={ref}
      d={d}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={!animate ? undefined : { opacity: ready || !animate ? 1 : 1 }}
    />
  );
}

export default function SymbolGlyph({ symbol, strokes, animate = false, className, strokeWidth = 9 }: SymbolGlyphProps) {
  const paths =
    strokes && strokes.length > 0
      ? strokes.filter((s) => s.length > 1).map(strokeToPath)
      : GENERATED_PATHS[symbol];

  const colorVar = symbol === "X" ? "var(--accent-x)" : "var(--accent-o)";

  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      style={{ stroke: colorVar, strokeWidth, overflow: "visible" }}
      aria-hidden="true"
    >
      {paths.map((d, i) => (
        <DrawnOrGeneratedPath key={i} d={d} animate={animate} delay={i * 0.12} />
      ))}
    </svg>
  );
}
