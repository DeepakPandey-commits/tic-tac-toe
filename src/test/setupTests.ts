// jsdom doesn't implement these; useCellDrawing relies on them for redraw
// scheduling and cell-size measurement during drawing.
if (typeof window !== "undefined" && !window.requestAnimationFrame) {
  window.requestAnimationFrame = (cb: FrameRequestCallback) =>
    window.setTimeout(() => cb(performance.now()), 16) as unknown as number;
  window.cancelAnimationFrame = (id: number) => window.clearTimeout(id);
}

// jsdom has no canvas backend; stub getContext so useCellDrawing's
// (already-null-safe) canvas setup doesn't spam "not implemented" noise.
if (typeof HTMLCanvasElement !== "undefined") {
  HTMLCanvasElement.prototype.getContext = (() => null) as HTMLCanvasElement["getContext"];
}

if (typeof window !== "undefined" && !("ResizeObserver" in window)) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  // @ts-expect-error jsdom test polyfill
  window.ResizeObserver = ResizeObserverStub;
}
