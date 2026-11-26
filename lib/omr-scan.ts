// Reads a photographed GAINS answer sheet (lib/omr-sheet.ts) -- pure pixel
// math over a grayscale buffer, no DOM, so it runs the same in the browser
// scanner and in lib/omr-scan.test.ts.
//
// 1. findSheetCorners: adaptive threshold -> connected components -> the four
//    solid corner squares (picked by size consistency and sheet proportions).
// 2. Orientation: of the corner orderings that give a portrait sheet, keep the
//    one where the top-centre orientation bar is dark.
// 3. The layout-code squares along the bottom edge say how the item columns
//    are spaced (none = a sheet printed before they existed).
// 4. A homography maps sheet millimetres to image pixels; each item row is
//    then slid (up to a few mm) onto its printed rings, since a sheet that
//    isn't perfectly flat bends away from the corner-square fit. Each bubble's
//    interior is sampled and compared with the other bubbles in its row (so a
//    shadow across the sheet doesn't read as shading).

import {
  BUBBLE_RADIUS,
  LAYOUT_MARK,
  LAYOUT_MARK_SLOTS,
  LEGACY_COLUMNS,
  MARKER_CENTERS,
  MARKER_SIZE,
  ITEMS_PER_COLUMN,
  ORIENTATION_BAR,
  SHEET_OPTIONS,
  bubbleCenter,
  layoutMarkRect,
  type Point,
} from "./omr-sheet";

export type Gray = { width: number; height: number; data: Uint8Array };

export function rgbaToGray(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Gray {
  const data = new Uint8Array(width * height);
  for (let i = 0, j = 0; i < data.length; i++, j += 4) {
    data[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
  }
  return { width, height, data };
}

// Box-filter downscale so the longest side is at most maxSide.
export function downscale(g: Gray, maxSide: number): { gray: Gray; scale: number } {
  const f = Math.ceil(Math.max(g.width, g.height) / maxSide);
  if (f <= 1) return { gray: g, scale: 1 };
  const w = Math.floor(g.width / f);
  const h = Math.floor(g.height / f);
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let dy = 0; dy < f; dy++) {
        const row = (y * f + dy) * g.width + x * f;
        for (let dx = 0; dx < f; dx++) sum += g.data[row + dx];
      }
      data[y * w + x] = sum / (f * f);
    }
  }
  return { gray: { width: w, height: h, data }, scale: 1 / f };
}

type Blob = {
  area: number;
  cx: number;
  cy: number;
  w: number;
  h: number;
  minX: number;
  minY: number;
  compactness: number;
};

// Dark pixels (darker than 75% of the local mean) grouped into 4-connected blobs.
function darkBlobs(g: Gray): Blob[] {
  const { width: w, height: h, data } = g;
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      rowSum += data[y * w + x];
      integral[(y + 1) * (w + 1) + x + 1] = integral[y * (w + 1) + x + 1] + rowSum;
    }
  }
  const r = Math.max(8, Math.round(Math.min(w, h) / 12));
  const dark = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      const sum =
        integral[y1 * (w + 1) + x1] -
        integral[y0 * (w + 1) + x1] -
        integral[y1 * (w + 1) + x0] +
        integral[y0 * (w + 1) + x0];
      const mean = sum / ((x1 - x0) * (y1 - y0));
      dark[y * w + x] = data[y * w + x] < mean * 0.75 ? 1 : 0;
    }
  }

  const label = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  const blobs: Blob[] = [];
  let next = 1;
  for (let start = 0; start < w * h; start++) {
    if (!dark[start] || label[start]) continue;
    let sp = 0;
    stack[sp++] = start;
    label[start] = next;
    let area = 0;
    let sx = 0;
    let sy = 0;
    let perimeter = 0;
    let minX = w;
    let maxX = 0;
    let minY = h;
    let maxY = 0;
    while (sp > 0) {
      const p = stack[--sp];
      const x = p % w;
      const y = (p - x) / w;
      area++;
      sx += x;
      sy += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      let edge = false;
      const neighbours = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
      for (const q of neighbours) {
        if (q < 0 || !dark[q]) {
          edge = true;
          continue;
        }
        if (!label[q]) {
          label[q] = next;
          stack[sp++] = q;
        }
      }
      if (edge) perimeter++;
    }
    next++;
    if (area < 20) continue;
    blobs.push({
      area,
      cx: sx / area,
      cy: sy / area,
      w: maxX - minX + 1,
      h: maxY - minY + 1,
      minX,
      minY,
      compactness: (4 * Math.PI * area) / (perimeter * perimeter),
    });
  }
  return blobs;
}

const SHEET_SIDE_RATIO = (MARKER_CENTERS[1].x - MARKER_CENTERS[0].x) / (MARKER_CENTERS[3].y - MARKER_CENTERS[0].y);
const MARKER_TO_LONG_SIDE = MARKER_SIZE / (MARKER_CENTERS[3].y - MARKER_CENTERS[0].y);

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

// Mean brightness of an axis-aligned pixel rectangle (clamped to the image), sampled on a grid.
function boxMean(g: Gray, x0: number, y0: number, x1: number, y1: number): number {
  x0 = Math.max(0, Math.floor(x0));
  y0 = Math.max(0, Math.floor(y0));
  x1 = Math.min(g.width - 1, Math.ceil(x1));
  y1 = Math.min(g.height - 1, Math.ceil(y1));
  if (x1 < x0 || y1 < y0) return 255;
  const step = Math.max(1, Math.floor(Math.min(x1 - x0, y1 - y0) / 6));
  let sum = 0;
  let count = 0;
  for (let y = y0; y <= y1; y += step)
    for (let x = x0; x <= x1; x += step) {
      sum += g.data[y * g.width + x];
      count++;
    }
  return count ? sum / count : 255;
}

// A corner marker is a solid black square printed on white paper: its core is
// much darker than a ring of paper around it. Keyboard keys, phone edges, dark
// desk patterns etc. sit on dark surroundings and fail this.
function onBrightPaper(g: Gray, b: Blob): boolean {
  const core = boxMean(g, b.cx - b.w / 4, b.cy - b.h / 4, b.cx + b.w / 4, b.cy + b.h / 4);
  const gap = Math.max(2, Math.round(Math.max(b.w, b.h) * 0.35));
  const band = Math.max(2, Math.round(Math.max(b.w, b.h) * 0.3));
  const x0 = b.minX - gap;
  const y0 = b.minY - gap;
  const x1 = b.minX + b.w - 1 + gap;
  const y1 = b.minY + b.h - 1 + gap;
  // Four strips just outside the square; the brightest three must be paper
  // (one side may run off the sheet edge or into a shadow).
  const sides = [
    boxMean(g, x0 - band, y0 - band, x1 + band, y0),
    boxMean(g, x0 - band, y1, x1 + band, y1 + band),
    boxMean(g, x0 - band, y0, x0, y1),
    boxMean(g, x1, y0, x1 + band, y1),
  ].sort((p, q) => q - p);
  return sides[2] > core * 1.6 + 25;
}

// Interior angle at b of the polyline a-b-c, in degrees.
function angleAt(a: Point, b: Point, c: Point): number {
  const v1x = a.x - b.x;
  const v1y = a.y - b.y;
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;
  const cos = (v1x * v2x + v1y * v2y) / Math.max(1e-9, Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y));
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

// Of the four rotations giving a portrait sheet, the one whose top orientation
// bar is darkest relative to the paper beside it.
function orient(g: Gray, corners: Point[]): { H: number[]; corners: Point[]; contrast: number } | null {
  let best: { H: number[]; corners: Point[]; contrast: number } | null = null;
  for (let k = 0; k < 4; k++) {
    const ordered = [0, 1, 2, 3].map((i) => corners[(i + k) % 4]);
    const top = (dist(ordered[0], ordered[1]) + dist(ordered[3], ordered[2])) / 2;
    const side = (dist(ordered[1], ordered[2]) + dist(ordered[0], ordered[3])) / 2;
    if (top >= side) continue;
    const H = homography([...MARKER_CENTERS], ordered);
    const bar = ORIENTATION_BAR;
    const barMean = rectMean(g, H, bar.x + 1, bar.y + 1, bar.w - 2, bar.h - 2);
    // Blank paper right beside the bar, between it and the top-left marker.
    const paperMean = rectMean(g, H, MARKER_SIZE + 6, 2, bar.x - MARKER_SIZE - 10, bar.h);
    const contrast = (paperMean - barMean) / Math.max(1, paperMean);
    if (!best || contrast > best.contrast) best = { H, corners: ordered, contrast };
  }
  return best;
}

const MIN_BAR_CONTRAST = 0.25;

// The four corner-square centres in clockwise image order (top-left-ish
// first), or null. Every returned set has passed the orientation-bar check,
// so a stray dark square on the desk can't stand in for a corner.
export function findSheetCorners(g: Gray): Point[] | null {
  const candidates = darkBlobs(g)
    .filter((b) => b.compactness >= 0.5 && b.w / b.h > 0.5 && b.w / b.h < 2 && b.area / (b.w * b.h) > 0.45)
    .filter((b) => onBrightPaper(g, b))
    .sort((a, b) => b.area - a.area)
    .slice(0, 24);
  if (candidates.length < 4) return null;
  const largest = candidates[0].area;

  const quads: { score: number; pts: Point[] }[] = [];
  const n = candidates.length;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++) {
          const set = [candidates[a], candidates[b], candidates[c], candidates[d]];
          const areas = set.map((s) => s.area);
          const sizeSpread = Math.max(...areas) / Math.min(...areas);
          if (sizeSpread > 3) continue;
          const mx = set.reduce((s, p) => s + p.cx, 0) / 4;
          const my = set.reduce((s, p) => s + p.cy, 0) / 4;
          const pts = set
            .map((s) => ({
              x: s.cx,
              y: s.cy,
              ang: Math.atan2(s.cy - my, s.cx - mx),
            }))
            .sort((p, q) => p.ang - q.ang)
            .map(({ x, y }) => ({ x, y }));
          if (!isConvex(pts)) continue;
          // A photographed rectangle: every corner roughly square, diagonals
          // roughly equal, opposite sides roughly equal.
          let angleError = 0;
          for (let i = 0; i < 4; i++) {
            angleError = Math.max(angleError, Math.abs(angleAt(pts[(i + 3) % 4], pts[i], pts[(i + 1) % 4]) - 90));
          }
          if (angleError > 35) continue;
          const diag = dist(pts[0], pts[2]) / dist(pts[1], pts[3]);
          if (diag < 0.7 || diag > 1 / 0.7) continue;
          const opp1 = dist(pts[0], pts[1]) / dist(pts[2], pts[3]);
          const opp2 = dist(pts[1], pts[2]) / dist(pts[3], pts[0]);
          if (Math.abs(Math.log(opp1)) > 0.45 || Math.abs(Math.log(opp2)) > 0.45) continue;
          const s1 = (dist(pts[0], pts[1]) + dist(pts[2], pts[3])) / 2;
          const s2 = (dist(pts[1], pts[2]) + dist(pts[3], pts[0])) / 2;
          const short = Math.min(s1, s2);
          const long = Math.max(s1, s2);
          const sideError = Math.abs(short / long - SHEET_SIDE_RATIO);
          if (sideError > 0.22) continue;
          const markerRatio = Math.sqrt(areas.reduce((s, v) => s + v, 0) / 4) / long;
          const markerError = Math.abs(Math.log(markerRatio / MARKER_TO_LONG_SIDE));
          if (markerError > 0.8) continue;
          const meanArea = areas.reduce((s, v) => s + v, 0) / 4;
          const score =
            sideError +
            markerError * 0.3 +
            Math.log(sizeSpread) * 0.2 +
            angleError / 180 +
            (meanArea < largest * 0.4 ? 0.5 : 0);
          quads.push({ score, pts });
        }
  quads.sort((p, q) => p.score - q.score);
  // Confirm the best few against the printed orientation bar.
  for (const q of quads.slice(0, 8)) {
    const o = orient(g, q.pts);
    if (o && o.contrast >= MIN_BAR_CONTRAST) return q.pts;
  }
  return null;
}

function isConvex(pts: Point[]): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % 4];
    const c = pts[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    const s = Math.sign(cross);
    if (s === 0) return false;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

// Homography H (row-major 3x3, h33 = 1) mapping each src point to its dst point.
export function homography(src: Point[], dst: Point[]): number[] {
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  // Gaussian elimination with partial pivoting on the 8x9 augmented matrix.
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let r = col + 1; r < 8; r++) if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r;
    [A[col], A[pivot]] = [A[pivot], A[col]];
    for (let r = 0; r < 8; r++) {
      if (r === col) continue;
      const f = A[r][col] / A[col][col];
      for (let k = col; k < 9; k++) A[r][k] -= f * A[col][k];
    }
  }
  const h = A.map((row, i) => row[8] / row[i]);
  return [...h, 1];
}

export function project(H: number[], p: Point): Point {
  const z = H[6] * p.x + H[7] * p.y + H[8];
  return {
    x: (H[0] * p.x + H[1] * p.y + H[2]) / z,
    y: (H[3] * p.x + H[4] * p.y + H[5]) / z,
  };
}

function sampleAt(g: Gray, p: Point): number {
  const x = Math.min(g.width - 2, Math.max(0, p.x));
  const y = Math.min(g.height - 2, Math.max(0, p.y));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const i = y0 * g.width + x0;
  const top = g.data[i] * (1 - fx) + g.data[i + 1] * fx;
  const bottom = g.data[i + g.width] * (1 - fx) + g.data[i + g.width + 1] * fx;
  return top * (1 - fy) + bottom * fy;
}

// Mean brightness inside a sheet-coordinate rectangle.
function rectMean(g: Gray, H: number[], x: number, y: number, w: number, h: number): number {
  let sum = 0;
  let count = 0;
  for (let i = 0; i <= 6; i++)
    for (let j = 0; j <= 4; j++) {
      sum += sampleAt(g, project(H, { x: x + (w * i) / 6, y: y + (h * j) / 4 }));
      count++;
    }
  return sum / count;
}

// Mean brightness of a bubble's interior (inner 55% of the radius, clear of the printed ring).
function bubbleMean(g: Gray, H: number[], c: Point): number {
  const r = BUBBLE_RADIUS * 0.55;
  let sum = 0;
  let count = 0;
  for (let i = -2; i <= 2; i++)
    for (let j = -2; j <= 2; j++) {
      if (i * i + j * j > 5) continue;
      sum += sampleAt(g, project(H, { x: c.x + (i * r) / 2, y: c.y + (j * r) / 2 }));
      count++;
    }
  return sum / count;
}

// Brightness of the bare paper just above and below a bubble (rows are 7 mm
// apart, so this strip touches no other bubble or the item number). Dividing a bubble by its own paper cancels a shadow edge
// running through the row.
function paperBeside(g: Gray, H: number[], c: Point): number {
  const dy = BUBBLE_RADIUS + 0.9;
  let best = 0;
  for (const sy of [-dy, dy]) {
    let sum = 0;
    for (let i = -2; i <= 2; i++) sum += sampleAt(g, project(H, { x: c.x + i * 0.6, y: c.y + sy }));
    // The brighter side: one side may catch a stray pencil stroke.
    best = Math.max(best, sum / 5);
  }
  return Math.max(1, best);
}

// ---- Local alignment -------------------------------------------------------
// The homography comes from the four corner squares only, so it's exact only
// for paper lying perfectly flat. A sheet that bows or curls by a millimetre
// or two (held in a hand, fresh from a stack, a wavy desk) moves the middle
// of the sheet off the predicted bubbles -- which then sample the printed
// ring or the paper beside it. So before reading, each item row is slid onto
// its printed circles: the offset (in sheet mm) where the rings are darkest
// against the paper just outside them.

const RING_ANGLES = Array.from({ length: 16 }, (_, i) => (i * Math.PI * 2) / 16);
const RING_IN = RING_ANGLES.map((a) => ({ x: Math.cos(a) * BUBBLE_RADIUS, y: Math.sin(a) * BUBBLE_RADIUS }));
const RING_OUT = RING_ANGLES.map((a) => ({
  x: Math.cos(a) * (BUBBLE_RADIUS + 0.9),
  y: Math.sin(a) * (BUBBLE_RADIUS + 0.9),
}));

type Offset = { x: number; y: number };

// How strongly a printed bubble ring sits at c (paper outside minus ring).
// A shaded bubble scores too: its ring is dark, the paper outside it isn't.
function ringScore(g: Gray, H: number[], c: Point): number {
  let ring = 0;
  let out = 0;
  for (let i = 0; i < RING_IN.length; i++) {
    ring += sampleAt(g, project(H, { x: c.x + RING_IN[i].x, y: c.y + RING_IN[i].y }));
    out += sampleAt(g, project(H, { x: c.x + RING_OUT[i].x, y: c.y + RING_OUT[i].y }));
  }
  return (out - ring) / RING_IN.length;
}

// Best offset within +-range of `around` for a set of bubble centres, coarse
// grid then a finer one around the winner.
function bestOffset(
  g: Gray,
  H: number[],
  centers: Point[],
  around: Offset,
  range: number,
  step: number,
): { offset: Offset; score: number } {
  const scoreAt = (o: Offset) => {
    let s = 0;
    for (const c of centers) s += ringScore(g, H, { x: c.x + o.x, y: c.y + o.y });
    return s / centers.length;
  };
  let best = { offset: around, score: scoreAt(around) };
  const search = (center: Offset, r: number, st: number) => {
    for (let dx = -r; dx <= r + 1e-9; dx += st)
      for (let dy = -r; dy <= r + 1e-9; dy += st) {
        const o = { x: center.x + dx, y: center.y + dy };
        const s = scoreAt(o);
        if (s > best.score) best = { offset: o, score: s };
      }
  };
  search(around, range, step);
  search(best.offset, step, step / 2);
  return best;
}

const median = (v: number[]) => {
  const s = [...v].sort((p, q) => p - q);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Search window for a whole column of items, then for each row within it.
// Both stay under half the bubble pitch (6.2 mm) and half the row pitch, so
// a row can't snap onto its neighbouring bubble or row.
const COLUMN_SEARCH_MM = 2.5;
const ROW_SEARCH_MM = 1.25;
// A column whose rings are this faint (grey levels, ring vs paper) is too
// blurred to align against; it's read where the homography puts it.
const MIN_RING_SCORE = 4;

// Per-item offset (sheet mm) to add to every bubble centre of that item.
function alignItems(g: Gray, H: number[], itemCount: number, optionCount: number, columns: number): Offset[] {
  const offsets: Offset[] = Array.from({ length: itemCount }, () => ({ x: 0, y: 0 }));
  const centersOf = (item: number) =>
    Array.from({ length: optionCount }, (_, o) => bubbleCenter(item, o, columns));
  for (let first = 1; first <= itemCount; first += ITEMS_PER_COLUMN) {
    const items = Array.from({ length: Math.min(ITEMS_PER_COLUMN, itemCount - first + 1) }, (_, i) => first + i);
    // Whole column first (every other row is plenty), then each row near it.
    const column = bestOffset(
      g,
      H,
      items.filter((_, i) => i % 2 === 0).flatMap(centersOf),
      { x: 0, y: 0 },
      COLUMN_SEARCH_MM,
      0.5,
    );
    if (column.score < MIN_RING_SCORE) continue;
    const rows = items.map((item) => bestOffset(g, H, centersOf(item), column.offset, ROW_SEARCH_MM, 0.25).offset);
    // Paper bends smoothly: a row's offset is the median of its neighbours',
    // so one row with a stray mark or glare can't wander off on its own.
    rows.forEach((_, i) => {
      const near = rows.slice(Math.max(0, i - 2), i + 3);
      offsets[items[i] - 1] = { x: median(near.map((o) => o.x)), y: median(near.map((o) => o.y)) };
    });
  }
  return offsets;
}

export type ItemMark = {
  item: number;
  // Chosen letter, or "-" for blank / unreadable multiple marks.
  answer: string;
  status: "ok" | "blank" | "multiple";
  // Per option, 0 = paper white .. 1 = fully dark relative to the row.
  fill: number[];
};

export type SheetRead = {
  // Image-pixel corners of the sheet's markers, in sheet order TL, TR, BR, BL.
  corners: Point[];
  homography: number[];
  // Column layout the bubbles were read with (see itemRowOrigin): the sheet's
  // layout code, or LEGACY_COLUMNS for a sheet printed without one.
  columns: number;
  // Per item, how far (sheet mm) its row was found from where the corner
  // squares predicted it -- see alignItems. Add to bubbleCenter when drawing.
  offsets: { x: number; y: number }[];
  marks: ItemMark[];
  answers: string;
};

// Minimum darkening (relative to the brightest bubble in the row) that counts
// as shaded on a sharp photo. A blurry or low-resolution image (a live video
// frame) washes pencil shading out towards grey while blank bubbles stay near
// 0, so the threshold drops with the sheet's own typical shading -- see
// sheetThreshold.
export const FILL_THRESHOLD = 0.3;
const MIN_FILL_THRESHOLD = 0.15;
// A row whose darkest bubble is under this is treated as unshaded when
// measuring the sheet's typical shading.
const MARKED_ROW_FILL = 0.12;

function sheetThreshold(fills: number[][]): number {
  const marked = fills
    .map((f) => Math.max(...f))
    .filter((m) => m >= MARKED_ROW_FILL)
    .sort((p, q) => p - q);
  if (!marked.length) return FILL_THRESHOLD;
  const typical = marked[Math.floor(marked.length / 2)];
  return Math.min(FILL_THRESHOLD, Math.max(MIN_FILL_THRESHOLD, typical * 0.5));
}

function classify(item: number, fill: number[], threshold: number): ItemMark {
  const order = fill.map((f, o) => ({ f, o })).sort((a, b) => b.f - a.f);
  const shaded = order.filter((x) => x.f >= threshold);
  let answer = "-";
  let status: ItemMark["status"] = "blank";
  if (shaded.length === 1 || (shaded.length > 1 && shaded[0].f >= shaded[1].f * 1.6)) {
    answer = SHEET_OPTIONS[shaded[0].o];
    status = "ok";
  } else if (shaded.length > 1) {
    status = "multiple";
  }
  return { item, answer, status, fill: fill.map((f) => Math.round(f * 100) / 100) };
}

function classifyAll(fills: number[][]): ItemMark[] {
  const threshold = sheetThreshold(fills);
  return fills.map((f, i) => classify(i + 1, f, threshold));
}

// How far darker than the paper beside it the first layout-code square must
// be; the others count when at least half as dark as the first.
const LAYOUT_MARK_CONTRAST = 0.3;

// The sheet's column layout from its layout-code squares (one per column);
// none = a sheet printed before the code existed. Each square is looked for
// within 1.5 mm of where it should be (a bowed sheet moves it) -- the gap to
// the next square is 2 mm, so a search never reaches a neighbour.
function layoutColumns(g: Gray, H: number[]): number {
  const m = LAYOUT_MARK;
  // Blank paper between the last bubble row and the squares.
  const paper = rectMean(g, H, m.x, m.y - 7, LAYOUT_MARK_SLOTS * m.pitch, 3);
  const contrasts = Array.from({ length: LAYOUT_MARK_SLOTS }, (_, i) => {
    const r = layoutMarkRect(i);
    let darkest = 255;
    for (let dx = -1.5; dx <= 1.5; dx += 0.5)
      for (let dy = -1.5; dy <= 1.5; dy += 0.5)
        darkest = Math.min(darkest, rectMean(g, H, r.x + 0.8 + dx, r.y + 0.8 + dy, r.size - 1.6, r.size - 1.6));
    return (paper - darkest) / Math.max(1, paper);
  });
  if (contrasts[0] < LAYOUT_MARK_CONTRAST) return LEGACY_COLUMNS;
  let count = 1;
  while (count < LAYOUT_MARK_SLOTS && contrasts[count] >= contrasts[0] * 0.5) count++;
  return count;
}

// corners: from findSheetCorners (in this image's pixel coordinates).
export function readSheet(
  g: Gray,
  corners: Point[],
  itemCount: number,
  optionCount = SHEET_OPTIONS.length,
): SheetRead | null {
  const best = orient(g, corners);
  if (!best || best.contrast < MIN_BAR_CONTRAST) return null;
  const { H } = best;
  const columns = layoutColumns(g, H);
  const offsets = alignItems(g, H, itemCount, optionCount, columns);

  const fills: number[][] = [];
  for (let item = 1; item <= itemCount; item++) {
    // Each bubble relative to the paper right beside it (shadow-proof), then
    // relative to the brightest bubble in the row (cancels the printed letter).
    const ratios = Array.from({ length: optionCount }, (_, o) => {
      const p = bubbleCenter(item, o, columns);
      const c = { x: p.x + offsets[item - 1].x, y: p.y + offsets[item - 1].y };
      return bubbleMean(g, H, c) / paperBeside(g, H, c);
    });
    const paper = Math.max(...ratios, 1e-6);
    fills.push(ratios.map((r) => Math.max(0, (paper - r) / paper)));
  }
  const marks = classifyAll(fills);
  return {
    corners: best.corners,
    homography: H,
    columns,
    offsets,
    marks,
    answers: marks.map((m) => m.answer).join(""),
  };
}

// Where a read found a bubble (sheet mm): the printed layout plus its row's
// alignment offset. For drawing the reading back onto the photo.
export function readBubbleCenter(read: SheetRead, item: number, option: number): Point {
  const c = bubbleCenter(item, option, read.columns);
  const o = read.offsets[item - 1] ?? { x: 0, y: 0 };
  return { x: c.x + o.x, y: c.y + o.y };
}

// Combines reads of the same sheet from several video frames: each bubble's
// darkness is averaged across frames before classifying, so one blurred or
// glare-hit frame can't flip an answer. Geometry comes from the first read.
export function mergeReads(all: SheetRead[]): SheetRead {
  const [first] = all;
  // A frame that read a different column layout sampled other spots.
  const reads = all.filter((r) => r.columns === first.columns);
  if (reads.length === 1) return first;
  const fills = first.marks.map((m, i) =>
    m.fill.map((_, o) => reads.reduce((s, r) => s + (r.marks[i]?.fill[o] ?? 0), 0) / reads.length),
  );
  const marks = classifyAll(fills);
  return { ...first, marks, answers: marks.map((m) => m.answer).join("") };
}
