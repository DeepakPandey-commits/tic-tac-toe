import type { Point, Stroke, SymbolKind } from "../types";

/**
 * Forgiving hand-drawn symbol recognition.
 *
 * All strokes are expected in normalized [0,1] x [0,1] coordinates, relative
 * to the cell the player drew in — this keeps recognition independent of
 * actual pixel/cell size, DPI, or viewport.
 */

export interface RecognitionResult {
  valid: boolean;
  confidence: number;
}

const INVALID: RecognitionResult = { valid: false, confidence: 0 };

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pathLength(stroke: Stroke): number {
  let len = 0;
  for (let i = 1; i < stroke.length; i++) len += dist(stroke[i - 1], stroke[i]);
  return len;
}

function boundingBox(points: Point[]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
}

function centroid(points: Point[]): Point {
  let sx = 0;
  let sy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / points.length, y: sy / points.length };
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Angle of the line a->b, in degrees, folded into [0, 180). */
function lineAngleDeg(a: Point, b: Point): number {
  const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  const folded = ((deg % 180) + 180) % 180;
  return folded;
}

/** Smallest difference between two angles that live on a [0,180) line (mod-180 circle). */
function angleDiff180(a: number, b: number): number {
  const d = Math.abs(a - b) % 180;
  return Math.min(d, 180 - d);
}

// ---------------------------------------------------------------------------
// O recognition — an approximately closed / mostly-swept circular stroke.
// ---------------------------------------------------------------------------

export function recognizeO(strokes: Stroke[]): RecognitionResult {
  const candidates = strokes.filter((s) => s.length >= 4);
  if (candidates.length === 0) return INVALID;

  // Use the longest stroke as the circle attempt.
  const stroke = candidates.reduce((a, b) => (pathLength(a) >= pathLength(b) ? a : b));

  const len = pathLength(stroke);
  if (len < 0.18) return INVALID;

  const box = boundingBox(stroke);
  if (box.width < 0.22 || box.height < 0.22) return INVALID;

  const aspect = box.width / box.height;
  if (aspect < 0.35 || aspect > 2.8) return INVALID;

  const c = centroid(stroke);
  const radii = stroke.map((p) => dist(p, c));
  const avgRadius = mean(radii);
  if (avgRadius < 0.08) return INVALID;

  const radiusStd = Math.sqrt(mean(radii.map((r) => (r - avgRadius) ** 2)));
  const radiusVariance = radiusStd / avgRadius;

  // Total angular sweep around the centroid — a full circle sweeps ~360deg.
  let sweep = 0;
  let prevAngle = Math.atan2(stroke[0].y - c.y, stroke[0].x - c.x);
  for (let i = 1; i < stroke.length; i++) {
    const angle = Math.atan2(stroke[i].y - c.y, stroke[i].x - c.x);
    let delta = angle - prevAngle;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    sweep += delta;
    prevAngle = angle;
  }
  const sweepDeg = Math.abs((sweep * 180) / Math.PI);

  const start = stroke[0];
  const end = stroke[stroke.length - 1];
  const closure = dist(start, end) / Math.max(box.width, box.height, 0.001);

  const isClosedEnough = closure < 0.6 || sweepDeg > 300;
  const isSweptEnough = sweepDeg > 210;
  const isRoundEnough = radiusVariance < 0.65;

  if (!isSweptEnough || !isRoundEnough || !isClosedEnough) return INVALID;

  const sweepScore = Math.min(1, sweepDeg / 340);
  const roundScore = Math.min(1, Math.max(0, 1 - radiusVariance));
  const confidence = sweepScore * 0.6 + roundScore * 0.4;

  return { valid: true, confidence };
}

// ---------------------------------------------------------------------------
// X recognition — two roughly-opposing diagonal strokes that cross.
// ---------------------------------------------------------------------------

function splitAtSharpestCorner(stroke: Stroke): [Stroke, Stroke] | null {
  if (stroke.length < 6) return null;

  let bestIndex = -1;
  let bestScore = -Infinity;

  // Look at the turning angle at each interior point using a small window,
  // skipping the very ends where noise dominates.
  const margin = Math.max(2, Math.floor(stroke.length * 0.15));
  for (let i = margin; i < stroke.length - margin; i++) {
    const a = stroke[Math.max(0, i - margin)];
    const b = stroke[i];
    const c = stroke[Math.min(stroke.length - 1, i + margin)];
    const v1 = { x: b.x - a.x, y: b.y - a.y };
    const v2 = { x: c.x - b.x, y: c.y - b.y };
    const l1 = Math.hypot(v1.x, v1.y);
    const l2 = Math.hypot(v2.x, v2.y);
    if (l1 < 0.02 || l2 < 0.02) continue;
    const cos = (v1.x * v2.x + v1.y * v2.y) / (l1 * l2);
    const turn = Math.acos(Math.min(1, Math.max(-1, cos)));
    if (turn > bestScore) {
      bestScore = turn;
      bestIndex = i;
    }
  }

  // Require a genuinely sharp turn (roughly > 50deg) to consider it a corner.
  if (bestIndex === -1 || bestScore < (50 * Math.PI) / 180) return null;

  return [stroke.slice(0, bestIndex + 1), stroke.slice(bestIndex)];
}

function diagonalCandidate(segment: Stroke) {
  const box = boundingBox(segment);
  const start = segment[0];
  const end = segment[segment.length - 1];
  const length = dist(start, end);
  const angle = lineAngleDeg(start, end);
  const center = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
  return { box, length, angle, center };
}

export function recognizeX(strokes: Stroke[]): RecognitionResult {
  const meaningful = strokes.filter((s) => s.length >= 2 && pathLength(s) > 0.05);
  if (meaningful.length === 0) return INVALID;

  let segA: Stroke;
  let segB: Stroke;

  if (meaningful.length === 1) {
    const split = splitAtSharpestCorner(meaningful[0]);
    if (!split) return INVALID;
    [segA, segB] = split;
  } else {
    const sorted = [...meaningful].sort((a, b) => pathLength(b) - pathLength(a));
    segA = sorted[0];
    segB = sorted[1];
  }

  const a = diagonalCandidate(segA);
  const b = diagonalCandidate(segB);

  if (a.length < 0.16 || b.length < 0.16) return INVALID;

  // Each stroke should run roughly diagonally (not near-horizontal/vertical).
  const diagonalTolerance = 38; // degrees of slack around 45/135
  const nearDiagonal = (deg: number) =>
    angleDiff180(deg, 45) < diagonalTolerance || angleDiff180(deg, 135) < diagonalTolerance;
  if (!nearDiagonal(a.angle) || !nearDiagonal(b.angle)) return INVALID;

  // The two strokes must cross, i.e. run in opposing diagonal directions.
  const crossAngle = angleDiff180(a.angle, b.angle);
  if (crossAngle < 45 || crossAngle > 135) return INVALID;

  // The two diagonals should spatially overlap near a shared center, rather
  // than being two unrelated marks in opposite corners.
  const centerDrift = dist(a.center, b.center);
  if (centerDrift > 0.45) return INVALID;

  const lengthScore = Math.min(1, (a.length + b.length) / 2 / 0.5);
  const angleScore = Math.min(1, crossAngle / 90);
  const overlapScore = Math.max(0, 1 - centerDrift / 0.45);
  const confidence = lengthScore * 0.4 + angleScore * 0.35 + overlapScore * 0.25;

  return { valid: true, confidence };
}

export function isValidSymbol(strokes: Stroke[], symbol: SymbolKind): RecognitionResult {
  if (strokes.length === 0 || strokes.every((s) => s.length < 2)) return INVALID;
  return symbol === "X" ? recognizeX(strokes) : recognizeO(strokes);
}
