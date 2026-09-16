import { describe, expect, it } from "vitest";
import type { Point, Stroke } from "../types";
import { isPendingXStroke, isValidSymbol, recognizeO, recognizeX } from "./recognition";

function line(a: Point, b: Point, steps = 12): Stroke {
  const stroke: Stroke = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    stroke.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return stroke;
}

function circle(center: Point, radius: number, steps = 24): Stroke {
  const stroke: Stroke = [];
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    stroke.push({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius });
  }
  return stroke;
}

const backslash = () => line({ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.8 });
const forwardSlash = () => line({ x: 0.8, y: 0.2 }, { x: 0.2, y: 0.8 });

describe("recognizeX", () => {
  it("accepts two opposing diagonal strokes forming an X", () => {
    const result = recognizeX([backslash(), forwardSlash()]);
    expect(result.valid).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.42);
  });

  it("accepts the strokes drawn in either order", () => {
    const result = recognizeX([forwardSlash(), backslash()]);
    expect(result.valid).toBe(true);
  });

  it("tolerates realistic human angle variation and uneven lengths", () => {
    const wobblyBackslash = line({ x: 0.18, y: 0.24 }, { x: 0.78, y: 0.7 });
    const shorterForwardSlash = line({ x: 0.72, y: 0.22 }, { x: 0.3, y: 0.62 });
    const result = recognizeX([wobblyBackslash, shorterForwardSlash]);
    expect(result.valid).toBe(true);
  });

  it("rejects a single diagonal stroke alone (not yet a full X)", () => {
    const result = recognizeX([backslash()]);
    expect(result.valid).toBe(false);
  });

  it("rejects two strokes drawn in the same diagonal direction (no crossing)", () => {
    const result = recognizeX([backslash(), line({ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.75 })]);
    expect(result.valid).toBe(false);
  });

  it("rejects an arbitrary scribble", () => {
    const scribble: Stroke = [
      { x: 0.5, y: 0.5 },
      { x: 0.52, y: 0.48 },
      { x: 0.49, y: 0.51 },
      { x: 0.51, y: 0.49 },
      { x: 0.5, y: 0.5 },
    ];
    const result = recognizeX([scribble]);
    expect(result.valid).toBe(false);
  });
});

describe("isPendingXStroke", () => {
  it("is true after a single plausible diagonal stroke", () => {
    expect(isPendingXStroke([backslash()])).toBe(true);
    expect(isPendingXStroke([forwardSlash()])).toBe(true);
  });

  it("is false once a second stroke has been drawn", () => {
    expect(isPendingXStroke([backslash(), forwardSlash()])).toBe(false);
  });

  it("is false for a stroke that isn't plausibly diagonal", () => {
    const horizontal = line({ x: 0.2, y: 0.5 }, { x: 0.8, y: 0.5 });
    expect(isPendingXStroke([horizontal])).toBe(false);
  });

  it("is false for a too-short nub of a stroke", () => {
    const tiny = line({ x: 0.5, y: 0.5 }, { x: 0.52, y: 0.52 });
    expect(isPendingXStroke([tiny])).toBe(false);
  });

  it("is false when there are no strokes yet", () => {
    expect(isPendingXStroke([])).toBe(false);
  });
});

describe("recognizeO", () => {
  it("accepts a swept circular stroke", () => {
    const result = recognizeO([circle({ x: 0.5, y: 0.5 }, 0.35)]);
    expect(result.valid).toBe(true);
  });

  it("rejects a straight line", () => {
    const result = recognizeO([line({ x: 0.2, y: 0.5 }, { x: 0.8, y: 0.5 })]);
    expect(result.valid).toBe(false);
  });

  it("rejects a tiny, barely-swept mark", () => {
    const result = recognizeO([circle({ x: 0.5, y: 0.5 }, 0.03)]);
    expect(result.valid).toBe(false);
  });
});

describe("isValidSymbol", () => {
  it("dispatches to recognizeX for X", () => {
    expect(isValidSymbol([backslash(), forwardSlash()], "X").valid).toBe(true);
  });

  it("dispatches to recognizeO for O", () => {
    expect(isValidSymbol([circle({ x: 0.5, y: 0.5 }, 0.35)], "O").valid).toBe(true);
  });

  it("rejects empty strokes", () => {
    expect(isValidSymbol([], "X").valid).toBe(false);
    expect(isValidSymbol([], "O").valid).toBe(false);
  });
});
