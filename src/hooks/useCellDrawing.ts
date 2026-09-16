import { useCallback, useEffect, useRef, useState } from "react";
import type { Point, Stroke, SymbolKind } from "../types";
import { isValidSymbol } from "../game/recognition";
import { ACCENT_HEX } from "../game/colors";

const TAP_MAX_DURATION_MS = 220;
const TAP_MAX_MOVEMENT_RATIO = 0.045; // relative to cell size
const IDLE_RECOGNITION_DELAY_MS = 480;
const CONFIDENCE_THRESHOLD = 0.42;
const MAX_STROKES_PER_SESSION = 5;
const MIN_STROKE_POINT_GAP = 0.006; // normalized units, throttles point capture

interface UseCellDrawingOptions {
  active: boolean;
  symbol: SymbolKind;
  onTap: () => void;
  onDrawSuccess: (strokes: Stroke[]) => void;
  onInvalid: () => void;
}

function setupCanvas(canvas: HTMLCanvasElement, width: number, height: number) {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, cellSize: number, color: string) {
  if (stroke.length < 2) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(3, cellSize * 0.075);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = color;
  ctx.shadowBlur = cellSize * 0.05;
  ctx.beginPath();
  ctx.moveTo(stroke[0].x * cellSize, stroke[0].y * cellSize);
  for (let i = 1; i < stroke.length; i++) {
    ctx.lineTo(stroke[i].x * cellSize, stroke[i].y * cellSize);
  }
  ctx.stroke();
  ctx.restore();
}

export function useCellDrawing({ active, symbol, onTap, onDrawSuccess, onInvalid }: UseCellDrawingOptions) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const cellSizeRef = useRef(0);

  const strokesRef = useRef<Stroke[]>([]);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const startTimeRef = useRef(0);
  const startClientRef = useRef<Point>({ x: 0, y: 0 });
  const maxMovementRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const idleTimerRef = useRef<number | null>(null);

  const [isDrawing, setIsDrawing] = useState(false);

  const symbolRef = useRef(symbol);
  symbolRef.current = symbol;
  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;
  const onDrawSuccessRef = useRef(onDrawSuccess);
  onDrawSuccessRef.current = onDrawSuccess;
  const onInvalidRef = useRef(onInvalid);
  onInvalidRef.current = onInvalid;

  const redraw = useCallback(() => {
    const ctx = ctxRef.current;
    const size = cellSizeRef.current;
    if (!ctx || !size) return;
    ctx.clearRect(0, 0, size, size);
    const color = ACCENT_HEX[symbolRef.current];
    for (const stroke of strokesRef.current) drawStroke(ctx, stroke, size, color);
    if (currentStrokeRef.current) drawStroke(ctx, currentStrokeRef.current, size, color);
  }, []);

  const scheduleRedraw = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      redraw();
    });
  }, [redraw]);

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current !== null) {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const resetSession = useCallback(() => {
    strokesRef.current = [];
    currentStrokeRef.current = null;
    pointerIdRef.current = null;
    clearIdleTimer();
    setIsDrawing(false);
    scheduleRedraw();
  }, [clearIdleTimer, scheduleRedraw]);

  // Resize observer keeps the canvas backing store matched to the cell's
  // actual rendered size (handles rotation, resize, board-size changes, DPI).
  useEffect(() => {
    const el = containerRef.current;
    const canvas = canvasRef.current;
    if (!el || !canvas) return;

    const applySize = () => {
      const rect = el.getBoundingClientRect();
      const size = Math.round(Math.min(rect.width, rect.height));
      if (size <= 0) return;
      cellSizeRef.current = size;
      ctxRef.current = setupCanvas(canvas, size, size);
      redraw();
    };

    applySize();
    const observer = new ResizeObserver(applySize);
    observer.observe(el);
    return () => observer.disconnect();
  }, [redraw]);

  // Clear any in-progress drawing if the cell stops being interactive
  // (turn changed, cell filled elsewhere, game ended).
  useEffect(() => {
    if (!active) resetSession();
  }, [active, resetSession]);

  const toNormalizedPoint = useCallback((clientX: number, clientY: number): Point => {
    const el = containerRef.current;
    const size = cellSizeRef.current || 1;
    const rect = el?.getBoundingClientRect();
    const x = rect ? (clientX - rect.left) / size : 0;
    const y = rect ? (clientY - rect.top) / size : 0;
    return { x, y };
  }, []);

  const runRecognition = useCallback(
    (final: boolean) => {
      const result = isValidSymbol(strokesRef.current, symbolRef.current);
      if (result.valid && (final || result.confidence >= CONFIDENCE_THRESHOLD)) {
        const finished = strokesRef.current.slice();
        resetSession();
        onDrawSuccessRef.current(finished);
        return true;
      }
      if (final) {
        resetSession();
        onInvalidRef.current();
        return true;
      }
      return false;
    },
    [resetSession],
  );

  const armIdleTimer = useCallback(() => {
    clearIdleTimer();
    idleTimerRef.current = window.setTimeout(() => {
      runRecognition(true);
    }, IDLE_RECOGNITION_DELAY_MS);
  }, [clearIdleTimer, runRecognition]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!active) return;
      if (pointerIdRef.current !== null) return; // already tracking a pointer (ignore multi-touch)
      if (e.button !== undefined && e.button !== 0 && e.pointerType === "mouse") return;

      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* capture unsupported/unavailable for this pointer — continue tracking manually */
      }
      pointerIdRef.current = e.pointerId;
      clearIdleTimer();
      startTimeRef.current = performance.now();
      startClientRef.current = { x: e.clientX, y: e.clientY };
      maxMovementRef.current = 0;
      currentStrokeRef.current = [toNormalizedPoint(e.clientX, e.clientY)];
      setIsDrawing(true);
      scheduleRedraw();
    },
    [active, clearIdleTimer, scheduleRedraw, toNormalizedPoint],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (pointerIdRef.current !== e.pointerId || !currentStrokeRef.current) return;

      const dx = e.clientX - startClientRef.current.x;
      const dy = e.clientY - startClientRef.current.y;
      maxMovementRef.current = Math.max(maxMovementRef.current, Math.hypot(dx, dy));

      const point = toNormalizedPoint(e.clientX, e.clientY);
      const stroke = currentStrokeRef.current;
      const last = stroke[stroke.length - 1];
      if (Math.hypot(point.x - last.x, point.y - last.y) >= MIN_STROKE_POINT_GAP) {
        stroke.push(point);
        scheduleRedraw();
      }
    },
    [scheduleRedraw, toNormalizedPoint],
  );

  const finishPointer = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
      if (pointerIdRef.current !== e.pointerId) return;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* pointer capture may already be released */
      }
      pointerIdRef.current = null;
      setIsDrawing(false);

      const stroke = currentStrokeRef.current;
      currentStrokeRef.current = null;

      if (cancelled) {
        scheduleRedraw();
        if (strokesRef.current.length > 0) armIdleTimer();
        return;
      }

      const duration = performance.now() - startTimeRef.current;
      const size = cellSizeRef.current || 1;
      const movementRatio = maxMovementRef.current / size;

      const isTap = strokesRef.current.length === 0 && duration < TAP_MAX_DURATION_MS && movementRatio < TAP_MAX_MOVEMENT_RATIO;

      if (isTap) {
        resetSession();
        onTapRef.current();
        return;
      }

      if (stroke && stroke.length >= 2) {
        strokesRef.current.push(stroke);
      }
      scheduleRedraw();

      if (strokesRef.current.length === 0) {
        armIdleTimer();
        return;
      }

      if (strokesRef.current.length >= MAX_STROKES_PER_SESSION) {
        runRecognition(true);
        return;
      }

      const resolved = runRecognition(false);
      if (!resolved) armIdleTimer();
    },
    [armIdleTimer, resetSession, runRecognition, scheduleRedraw],
  );

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => finishPointer(e, false), [finishPointer]);
  const onPointerCancel = useCallback((e: React.PointerEvent<HTMLDivElement>) => finishPointer(e, true), [finishPointer]);

  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    clearIdleTimer();
  }, [clearIdleTimer]);

  return {
    containerRef,
    canvasRef,
    isDrawing,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
  };
}
