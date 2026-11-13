// Reads a photographed GAINS answer sheet (lib/omr-sheet.ts) -- pure pixel
// math over a grayscale buffer, no DOM, so it runs the same in the browser
// scanner and in lib/omr-scan.test.ts.
//
// 1. findSheetCorners: adaptive threshold -> connected components -> the four
//    solid corner squares (picked by size consistency and sheet proportions).
// 2. Orientation: of the corner orderings that give a portrait sheet, keep the
//    one where the top-centre orientation bar is dark.
// 3. A homography maps sheet millimetres to image pixels; each bubble's
//    interior is sampled and compared with the other bubbles in its row (so a
//    shadow across the sheet doesn't read as shading).

import {
  BUBBLE_RADIUS,
  MARKER_CENTERS,
  MARKER_SIZE,
  ORIENTATION_BAR,
  SHEET_OPTIONS,
  bubbleCenter,
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
      compactness: (4 * Math.PI * area) / (perimeter * perimeter),
    });
  }
  return blobs;
}

const SHEET_SIDE_RATIO = (MARKER_CENTERS[1].x - MARKER_CENTERS[0].x) / (MARKER_CENTERS[3].y - MARKER_CENTERS[0].y);
const MARKER_TO_LONG_SIDE = MARKER_SIZE / (MARKER_CENTERS[3].y - MARKER_CENTERS[0].y);

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

// The four corner-square centres in clockwise image order (top-left-ish
// first), or null. Orientation is decided later by readSheet.
export function findSheetCorners(g: Gray): Point[] | null {
  const candidates = darkBlobs(g)
    .filter((b) => b.compactness >= 0.5 && b.w / b.h > 0.5 && b.w / b.h < 2 && b.area / (b.w * b.h) > 0.45)
    .sort((a, b) => b.area - a.area)
    .slice(0, 16);
  if (candidates.length < 4) return null;
  const largest = candidates[0].area;

  let best: { score: number; pts: Point[] } | null = null;
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
            sideError + markerError * 0.3 + Math.log(sizeSpread) * 0.2 + (meanArea < largest * 0.4 ? 0.5 : 0);
          if (!best || score < best.score) best = { score, pts };
        }
  return best?.pts ?? null;
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
  marks: ItemMark[];
  answers: string;
};

// Minimum darkening (relative to the brightest bubble in the row) that counts as shaded.
export const FILL_THRESHOLD = 0.3;

// corners: from findSheetCorners (in this image's pixel coordinates).
export function readSheet(
  g: Gray,
  corners: Point[],
  itemCount: number,
  optionCount = SHEET_OPTIONS.length,
): SheetRead | null {
  // Try each rotation that gives a portrait sheet; keep the one with a dark orientation bar.
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
  if (!best || best.contrast < 0.25) return null;
  const { H } = best;

  const marks: ItemMark[] = [];
  for (let item = 1; item <= itemCount; item++) {
    const means = Array.from({ length: optionCount }, (_, o) => bubbleMean(g, H, bubbleCenter(item, o)));
    const paper = Math.max(...means, 1);
    const fill = means.map((m) => Math.max(0, (paper - m) / paper));
    const order = fill.map((f, o) => ({ f, o })).sort((a, b) => b.f - a.f);
    const shaded = order.filter((x) => x.f >= FILL_THRESHOLD);
    let answer = "-";
    let status: ItemMark["status"] = "blank";
    if (shaded.length === 1 || (shaded.length > 1 && shaded[0].f >= shaded[1].f * 1.6)) {
      answer = SHEET_OPTIONS[shaded[0].o];
      status = "ok";
    } else if (shaded.length > 1) {
      status = "multiple";
    }
    marks.push({
      item,
      answer,
      status,
      fill: fill.map((f) => Math.round(f * 100) / 100),
    });
  }
  return {
    corners: best.corners,
    homography: H,
    marks,
    answers: marks.map((m) => m.answer).join(""),
  };
}
