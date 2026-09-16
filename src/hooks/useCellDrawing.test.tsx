import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Stroke, SymbolKind } from "../types";
import { useCellDrawing } from "./useCellDrawing";

// The hook measures the cell in real pixels via getBoundingClientRect(),
// which jsdom always reports as all-zero. Stub a fixed 100x100 cell so
// clientX/clientY in the 0-100 range map onto the 0-1 normalized space the
// recognizer expects.
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    right: 100,
    bottom: 100,
    width: 100,
    height: 100,
    x: 0,
    y: 0,
    toJSON() {},
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

interface HarnessProps {
  active: boolean;
  symbol: SymbolKind;
  onTap: () => void;
  onDrawSuccess: (strokes: Stroke[]) => void;
  onInvalid: () => void;
}

function Harness({ active, symbol, onTap, onDrawSuccess, onInvalid }: HarnessProps) {
  const { containerRef, canvasRef, handlers } = useCellDrawing({ active, symbol, onTap, onDrawSuccess, onInvalid });
  return (
    <div ref={containerRef} data-testid="cell" {...handlers}>
      <canvas ref={canvasRef} />
    </div>
  );
}

function setup(symbol: SymbolKind = "X", active = true) {
  const onTap = vi.fn();
  const onDrawSuccess = vi.fn();
  const onInvalid = vi.fn();
  const utils = render(<Harness active={active} symbol={symbol} onTap={onTap} onDrawSuccess={onDrawSuccess} onInvalid={onInvalid} />);
  const cell = utils.getByTestId("cell") as HTMLDivElement;
  return { ...utils, cell, onTap, onDrawSuccess, onInvalid };
}

let nextPointerId = 1;

function stroke(
  cell: HTMLDivElement,
  points: Array<{ x: number; y: number }>,
  opts: { pointerType?: string; pointerId?: number; end?: "up" | "cancel" } = {},
) {
  const pointerId = opts.pointerId ?? nextPointerId++;
  const pointerType = opts.pointerType ?? "mouse";
  const end = opts.end ?? "up";
  const common = { pointerId, pointerType, button: 0 };

  fireEvent.pointerDown(cell, { ...common, clientX: points[0].x, clientY: points[0].y });
  for (const p of points.slice(1)) {
    fireEvent.pointerMove(cell, { ...common, clientX: p.x, clientY: p.y });
  }
  if (end === "up") {
    fireEvent.pointerUp(cell, { ...common, clientX: points[points.length - 1].x, clientY: points[points.length - 1].y });
  } else {
    fireEvent.pointerCancel(cell, { ...common, clientX: points[points.length - 1].x, clientY: points[points.length - 1].y });
  }
  return pointerId;
}

// A diagonal line from (20,20) to (80,80) normalizes to the classic X leg.
const BACKSLASH = [
  { x: 20, y: 20 },
  { x: 40, y: 40 },
  { x: 60, y: 60 },
  { x: 80, y: 80 },
];
const FORWARD_SLASH = [
  { x: 80, y: 20 },
  { x: 60, y: 40 },
  { x: 40, y: 60 },
  { x: 20, y: 80 },
];

describe("useCellDrawing: tap vs draw", () => {
  it("a quick tap places the symbol immediately", () => {
    const { cell, onTap, onDrawSuccess, onInvalid } = setup();
    fireEvent.pointerDown(cell, { pointerId: 1, pointerType: "mouse", button: 0, clientX: 50, clientY: 50 });
    fireEvent.pointerUp(cell, { pointerId: 1, pointerType: "mouse", button: 0, clientX: 50, clientY: 50 });
    expect(onTap).toHaveBeenCalledTimes(1);
    expect(onDrawSuccess).not.toHaveBeenCalled();
    expect(onInvalid).not.toHaveBeenCalled();
  });

  it("click/touch with meaningful movement enters drawing mode, not a tap", () => {
    vi.useFakeTimers();
    const { cell, onTap } = setup();
    stroke(cell, BACKSLASH);
    stroke(cell, FORWARD_SLASH);
    expect(onTap).not.toHaveBeenCalled();
  });
});

describe("useCellDrawing: two-stroke X", () => {
  it("does not invalidate or consume a turn after the first stroke alone", () => {
    vi.useFakeTimers();
    const { cell, onInvalid, onDrawSuccess } = setup("X");
    stroke(cell, BACKSLASH);
    // Advance past the old 480ms window and the new default idle window —
    // a single plausible diagonal must still be pending, not invalid.
    act(() => vi.advanceTimersByTime(1200));
    expect(onInvalid).not.toHaveBeenCalled();
    expect(onDrawSuccess).not.toHaveBeenCalled();
  });

  it("recognizes a completed X from two strokes (\\ then /)", () => {
    vi.useFakeTimers();
    const { cell, onDrawSuccess, onInvalid } = setup("X");
    stroke(cell, BACKSLASH);
    act(() => vi.advanceTimersByTime(1200));
    stroke(cell, FORWARD_SLASH);
    expect(onDrawSuccess).toHaveBeenCalledTimes(1);
    expect(onInvalid).not.toHaveBeenCalled();
  });

  it("recognizes a completed X regardless of stroke order (/ then \\)", () => {
    vi.useFakeTimers();
    const { cell, onDrawSuccess, onInvalid } = setup("X");
    stroke(cell, FORWARD_SLASH);
    act(() => vi.advanceTimersByTime(1200));
    stroke(cell, BACKSLASH);
    expect(onDrawSuccess).toHaveBeenCalledTimes(1);
    expect(onInvalid).not.toHaveBeenCalled();
  });

  it("eventually invalidates a lone diagonal stroke if no second stroke ever arrives", () => {
    vi.useFakeTimers();
    const { cell, onInvalid, onDrawSuccess } = setup("X");
    stroke(cell, BACKSLASH);
    act(() => vi.advanceTimersByTime(4500));
    expect(onInvalid).toHaveBeenCalledTimes(1);
    expect(onDrawSuccess).not.toHaveBeenCalled();
  });

  it("still rejects a genuine invalid stroke (clearly non-diagonal, not a tap)", () => {
    vi.useFakeTimers();
    const { cell, onInvalid, onDrawSuccess } = setup("X");
    // A long horizontal drag: enough movement to rule out a tap, but not
    // remotely diagonal, so it must not be treated as a pending X leg.
    stroke(cell, [
      { x: 15, y: 50 },
      { x: 30, y: 50 },
      { x: 45, y: 50 },
      { x: 60, y: 50 },
      { x: 75, y: 50 },
      { x: 85, y: 50 },
    ]);
    act(() => vi.advanceTimersByTime(1200));
    expect(onInvalid).toHaveBeenCalledTimes(1);
    expect(onDrawSuccess).not.toHaveBeenCalled();
  });
});

describe("useCellDrawing: pointer lifecycle robustness", () => {
  it("pointercancel preserves prior strokes and does not invalidate or consume a turn", () => {
    vi.useFakeTimers();
    const { cell, onInvalid, onDrawSuccess } = setup("X");
    stroke(cell, BACKSLASH);
    // Second attempt gets cancelled mid-draw (e.g. trackpad gesture interrupts it).
    const pid = nextPointerId++;
    fireEvent.pointerDown(cell, { pointerId: pid, pointerType: "mouse", button: 0, clientX: 80, clientY: 20 });
    fireEvent.pointerMove(cell, { pointerId: pid, pointerType: "mouse", button: 0, clientX: 60, clientY: 40 });
    fireEvent.pointerCancel(cell, { pointerId: pid, pointerType: "mouse", button: 0, clientX: 60, clientY: 40 });
    expect(onInvalid).not.toHaveBeenCalled();
    expect(onDrawSuccess).not.toHaveBeenCalled();
  });

  it("a second stroke can be started after pointercancel interrupts an in-progress one", () => {
    vi.useFakeTimers();
    const { cell, onDrawSuccess } = setup("X");
    stroke(cell, BACKSLASH);
    const pid = nextPointerId++;
    fireEvent.pointerDown(cell, { pointerId: pid, pointerType: "mouse", button: 0, clientX: 80, clientY: 20 });
    fireEvent.pointerMove(cell, { pointerId: pid, pointerType: "mouse", button: 0, clientX: 60, clientY: 40 });
    fireEvent.pointerCancel(cell, { pointerId: pid, pointerType: "mouse", button: 0, clientX: 60, clientY: 40 });

    // A fresh, complete second stroke should still be accepted.
    stroke(cell, FORWARD_SLASH);
    expect(onDrawSuccess).toHaveBeenCalledTimes(1);
  });

  it("pointerleave without capture loss does not end the drawing (no handler wired to it)", () => {
    vi.useFakeTimers();
    const { cell, onInvalid, onDrawSuccess } = setup("X");
    const pid = nextPointerId++;
    fireEvent.pointerDown(cell, { pointerId: pid, pointerType: "mouse", button: 0, clientX: 20, clientY: 20 });
    fireEvent.pointerMove(cell, { pointerId: pid, pointerType: "mouse", button: 0, clientX: 40, clientY: 40 });
    fireEvent.pointerLeave(cell, { pointerId: pid, pointerType: "mouse", button: 0, clientX: 40, clientY: 40 });
    fireEvent.pointerOut(cell, { pointerId: pid, pointerType: "mouse", button: 0, clientX: 40, clientY: 40 });
    // Drawing continues uninterrupted: finishing the stroke normally still works.
    fireEvent.pointerMove(cell, { pointerId: pid, pointerType: "mouse", button: 0, clientX: 80, clientY: 80 });
    fireEvent.pointerUp(cell, { pointerId: pid, pointerType: "mouse", button: 0, clientX: 80, clientY: 80 });
    act(() => vi.advanceTimersByTime(1200));
    expect(onDrawSuccess).not.toHaveBeenCalled();
    expect(onInvalid).not.toHaveBeenCalled(); // still pending, one plausible diagonal only
  });

  it("lostpointercapture without a prior pointerup still releases the pointer id for the next stroke", () => {
    vi.useFakeTimers();
    const { cell, onDrawSuccess } = setup("X");
    const pid1 = nextPointerId++;
    fireEvent.pointerDown(cell, { pointerId: pid1, pointerType: "mouse", button: 0, clientX: 20, clientY: 20 });
    fireEvent.pointerMove(cell, { pointerId: pid1, pointerType: "mouse", button: 0, clientX: 80, clientY: 80 });
    // Simulate a browser dropping capture without ever delivering pointerup/cancel:
    // pointerIdRef would stay stuck on pid1 forever without the safety-net handler.
    act(() => {
      cell.dispatchEvent(new PointerEvent("lostpointercapture", { pointerId: pid1, bubbles: true }));
    });

    // If pid1 were still stuck tracked, every subsequent pointerdown would be
    // silently ignored (onPointerDown bails when pointerIdRef.current !== null)
    // and this complete, valid X would never resolve.
    stroke(cell, BACKSLASH, { pointerType: "mouse" });
    stroke(cell, FORWARD_SLASH, { pointerType: "mouse" });
    expect(onDrawSuccess).toHaveBeenCalledTimes(1);
  });
});

describe("useCellDrawing: input methods", () => {
  it("draws with mouse click-and-drag", () => {
    vi.useFakeTimers();
    const { cell, onDrawSuccess } = setup("X");
    stroke(cell, BACKSLASH, { pointerType: "mouse" });
    stroke(cell, FORWARD_SLASH, { pointerType: "mouse" });
    expect(onDrawSuccess).toHaveBeenCalledTimes(1);
  });

  it("draws with touch", () => {
    vi.useFakeTimers();
    const { cell, onDrawSuccess } = setup("X");
    stroke(cell, BACKSLASH, { pointerType: "touch" });
    stroke(cell, FORWARD_SLASH, { pointerType: "touch" });
    expect(onDrawSuccess).toHaveBeenCalledTimes(1);
  });

  it("draws with stylus (pen)", () => {
    vi.useFakeTimers();
    const { cell, onDrawSuccess } = setup("X");
    stroke(cell, BACKSLASH, { pointerType: "pen" });
    stroke(cell, FORWARD_SLASH, { pointerType: "pen" });
    expect(onDrawSuccess).toHaveBeenCalledTimes(1);
  });

  it("ignores a second concurrent pointer (basic multi-touch guard)", () => {
    vi.useFakeTimers();
    const { cell, onTap } = setup("X");
    fireEvent.pointerDown(cell, { pointerId: 1, pointerType: "touch", clientX: 20, clientY: 20 });
    // A second finger touching down mid-gesture must be ignored entirely —
    // not tracked, not able to trigger its own tap/draw or clobber pointer 1.
    fireEvent.pointerDown(cell, { pointerId: 2, pointerType: "touch", clientX: 60, clientY: 60 });
    fireEvent.pointerUp(cell, { pointerId: 2, pointerType: "touch", clientX: 60, clientY: 60 });
    // Pointer 1's own tap still completes cleanly, exactly once.
    fireEvent.pointerUp(cell, { pointerId: 1, pointerType: "touch", clientX: 20, clientY: 20 });
    expect(onTap).toHaveBeenCalledTimes(1);
  });
});

describe("useCellDrawing: O recognition unaffected", () => {
  it("still resolves a single continuous circular stroke as O", () => {
    vi.useFakeTimers();
    const { cell, onDrawSuccess } = setup("O");
    const points = Array.from({ length: 25 }, (_, i) => {
      const angle = (i / 24) * Math.PI * 2;
      return { x: 50 + Math.cos(angle) * 35, y: 50 + Math.sin(angle) * 35 };
    });
    stroke(cell, points, { pointerType: "mouse" });
    expect(onDrawSuccess).toHaveBeenCalledTimes(1);
  });
});
