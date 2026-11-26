import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import jsQR from "jsqr";
import AnswerSheetSvg from "@/app/_components/answer-sheet-svg";
import { AnswerKeyPhotoError, readAnswerKeyPhoto } from "./answer-key-photo";
import { downscale, findSheetCorners, homography, mergeReads, project, readSheet, rgbaToGray, type Gray } from "./omr-scan";
import {
  BUBBLE_RADIUS,
  LEGACY_COLUMNS,
  SHEET_OPTIONS,
  bubbleCenter,
  itemRowOrigin,
  sheetColumns,
  SHEET_H,
  SHEET_W,
  answerKeyQrValue,
  keyTextToLetters,
  lettersToKeyText,
  parseSheetQr,
  sheetQrValue,
  type Point,
} from "./omr-sheet";

// Renders the real printed sheet, then fakes a phone photo of it: perspective
// tilt on a desk-coloured background, a shadow across half the sheet, noise
// and blur. Returns RGBA so the QR decoder can run on it too.
async function photographSheet(
  answers: string,
  {
    corners,
    shadow = 0.45,
    upsideDown = false,
    blank = false,
    fillShade,
    keySheet = false,
    clutter = false,
    blur = 1.2,
    legacyLayout = false,
    overflow = 0,
    curl = 0,
  }: {
    corners: Point[];
    shadow?: number;
    upsideDown?: boolean;
    blank?: boolean;
    fillShade?: string;
    keySheet?: boolean;
    // A keyboard of dark keys beside the sheet plus loose dark squares on the
    // desk -- things a live camera frame picks up around the paper.
    clutter?: boolean;
    blur?: number;
    legacyLayout?: boolean;
    // Real pencil shading spills past the printed ring: shaded bubbles get a
    // dark disc this many mm wider than the bubble's radius.
    overflow?: number;
    // Paper that doesn't lie flat: the middle of the sheet bows by this many
    // mm, so the corner-marker homography is off there.
    curl?: number;
  },
): Promise<{ rgba: Uint8ClampedArray; width: number; height: number }> {
  const svg = renderToStaticMarkup(
    createElement(AnswerSheetSvg, {
      itemCount: answers.length,
      optionCount: 5,
      title: "BSIT 2A · Data Structures",
      examLabel: "Midterm written exam",
      studentName: blank ? undefined : "Dela Cruz, Juan P.",
      studentCode: blank ? undefined : "ABC123",
      qrValue: keySheet ? answerKeyQrValue("exam-1") : blank ? undefined : sheetQrValue("exam-1", "ABC123"),
      answerKeySheet: keySheet,
      filled: answers,
      fillShade,
      legacyLayout,
    }),
  );
  const columns = legacyLayout ? LEGACY_COLUMNS : sheetColumns(answers.length);
  const shadedCenters = [...answers].flatMap((ch, i) => {
    const o = SHEET_OPTIONS.indexOf(ch as (typeof SHEET_OPTIONS)[number]);
    return o >= 0 ? [bubbleCenter(i + 1, o, columns)] : [];
  });
  const pxPerMm = 6;
  const { data: sheet, info } = await sharp(Buffer.from(svg), {
    density: 25.4 * pxPerMm,
  })
    .flatten({ background: "#fff" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const W = 1200;
  const H = 1600;
  // Maps photo pixels -> sheet mm, so each photo pixel samples the sheet.
  // The page extends MARGIN mm past the printed sheet (printer margins).
  const MARGIN = 10;
  const sheetCorners = [
    { x: -MARGIN, y: -MARGIN },
    { x: SHEET_W + MARGIN, y: -MARGIN },
    { x: SHEET_W + MARGIN, y: SHEET_H + MARGIN },
    { x: -MARGIN, y: SHEET_H + MARGIN },
  ];
  const photoCorners = upsideDown ? [corners[2], corners[3], corners[0], corners[1]] : corners;
  const toSheet = homography(photoCorners, sheetCorners);
  const gray = new Uint8Array(W * H);
  let seed = 7;
  const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const p = project(toSheet, { x, y });
      let v = 95; // desk
      if (clutter) {
        if (x > 900 && y > 300 && y < 1300) {
          v = 50; // keyboard body
          if (x % 60 > 10 && (y - 300) % 60 > 10) v = 22; // keys
        }
        for (const [qx, qy] of [
          [60, 120],
          [1000, 120],
          [80, 1450],
          [700, 1450],
        ]) {
          if (x >= qx && x < qx + 30 && y >= qy && y < qy + 30) v = 15;
        }
      }
      if (p.x >= -MARGIN && p.y >= -MARGIN && p.x < SHEET_W + MARGIN && p.y < SHEET_H + MARGIN) {
        v = 255 * 0.85;
      }
      if (curl) {
        p.x += curl * Math.sin((Math.PI * p.y) / SHEET_H) * Math.sin((Math.PI * p.x) / SHEET_W);
        p.y += curl * Math.sin((Math.PI * p.x) / SHEET_W) * Math.sin((Math.PI * p.y) / SHEET_H);
      }
      if (p.x >= 0 && p.y >= 0 && p.x < SHEET_W && p.y < SHEET_H) {
        const sx = Math.min(info.width - 1, Math.floor((p.x * info.width) / SHEET_W));
        const sy = Math.min(info.height - 1, Math.floor((p.y * info.height) / SHEET_H));
        v = sheet[sy * info.width + sx] * 0.85; // paper isn't pure white in a photo
        if (overflow) {
          for (const c of shadedCenters) {
            if (Math.hypot(p.x - c.x, p.y - c.y) < BUBBLE_RADIUS + overflow) v = Math.min(v, 60);
          }
        }
      }
      if (x > W * 0.55) v *= 1 - shadow; // phone/hand shadow on the right
      gray[y * W + x] = Math.max(0, Math.min(255, v + (rand() - 0.5) * 30));
    }
  const blurred = await sharp(Buffer.from(gray), {
    raw: { width: W, height: H, channels: 1 },
  })
    .blur(blur)
    .ensureAlpha()
    .raw()
    .toBuffer();
  if (process.env.OMR_DEBUG_DIR) {
    await sharp(blurred, { raw: { width: W, height: H, channels: 4 } })
      .png()
      .toFile(`${process.env.OMR_DEBUG_DIR}/photo-${upsideDown ? "flip" : "up"}-${corners[0].x}-${shadow}.png`);
  }
  return { rgba: new Uint8ClampedArray(blurred), width: W, height: H };
}

// Corners on an 800 px copy, bubbles on the full image -- as the scanner does.
function scan(photo: { rgba: Uint8ClampedArray; width: number; height: number } | { gray: Gray }, items: number) {
  const full: Gray = "gray" in photo ? photo.gray : rgbaToGray(photo.rgba, photo.width, photo.height);
  const { gray: small, scale } = downscale(full, 800);
  const corners = findSheetCorners(small);
  if (!corners) return null;
  return readSheet(
    full,
    corners.map((c) => ({ x: c.x / scale, y: c.y / scale })),
    items,
  );
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

const ANSWERS = "ABCDEABCDE-BDACEEDCBA" + "CADBE".repeat(9) + "ABCD-"; // 71 items, two blank
const TILTED = [
  { x: 170, y: 140 },
  { x: 1050, y: 190 },
  { x: 1110, y: 1460 },
  { x: 110, y: 1500 },
];

describe("OMR scan of a printed sheet", () => {
  it("reads every bubble from a tilted, shadowed, noisy photo", async () => {
    const result = scan(await photographSheet(ANSWERS, { corners: TILTED }), ANSWERS.length);
    expect(result).not.toBeNull();
    expect(result!.answers).toBe(ANSWERS);
    expect(result!.marks.filter((m) => m.status === "blank").map((m) => m.item)).toEqual([11, 71]);
  }, 30000);

  it("reads an upside-down sheet the right way round", async () => {
    const result = scan(await photographSheet(ANSWERS, { corners: TILTED, upsideDown: true }), ANSWERS.length);
    expect(result!.answers).toBe(ANSWERS);
  }, 30000);

  it("reads a sheet photographed sideways", async () => {
    // Landscape-held phone: the sheet's top edge runs down the right of the photo.
    const sideways = [
      { x: 1120, y: 400 },
      { x: 1090, y: 1190 },
      { x: 80, y: 1160 },
      { x: 110, y: 430 },
    ];
    const result = scan(await photographSheet(ANSWERS.slice(0, 40), { corners: sideways }), 40);
    expect(result!.answers).toBe(ANSWERS.slice(0, 40));
  }, 30000);

  it("reads light pencil shading on a blank (no-name) sheet", async () => {
    const result = scan(
      await photographSheet(ANSWERS, {
        corners: TILTED,
        blank: true,
        fillShade: "#8a8a8a",
      }),
      ANSWERS.length,
    );
    expect(result!.answers).toBe(ANSWERS);
  }, 30000);

  it("decodes the sheet's QR code from the photo", async () => {
    const photo = await photographSheet(ANSWERS, {
      corners: TILTED,
      shadow: 0,
    });
    const qr = jsQR(photo.rgba, photo.width, photo.height);
    expect(qr && parseSheetQr(qr.data)).toEqual({
      kind: "student",
      majorExamId: "exam-1",
      studentCode: "ABC123",
    });
  }, 30000);

  it("reads a shaded answer-key sheet and its key QR code", async () => {
    const photo = await photographSheet(ANSWERS, { corners: TILTED, keySheet: true });
    expect(scan(photo, ANSWERS.length)!.answers).toBe(ANSWERS);
    const qr = jsQR(photo.rgba, photo.width, photo.height);
    expect(qr && parseSheetQr(qr.data)).toEqual({ kind: "key", majorExamId: "exam-1" });
  }, 30000);

  it("turns an uploaded photo of the key sheet into on-screen answers", async () => {
    const photo = await photographSheet(ANSWERS, { corners: TILTED, keySheet: true });
    const expected = [...ANSWERS].map((ch) => (ch === "-" ? "" : ch));
    const blanks = [...ANSWERS].flatMap((ch, i) => (ch === "-" ? [i + 1] : []));

    const known = readAnswerKeyPhoto(photo.rgba, photo.width, photo.height, ANSWERS.length, "exam-1");
    expect(known.letters).toEqual(expected);
    expect(known.blank).toEqual(blanks);
    expect(known.multiple).toEqual([]);
    expect(known.warning).toBeNull();

    // No item count yet: reads every row and stops at the last shaded item.
    const unknown = readAnswerKeyPhoto(photo.rgba, photo.width, photo.height, 0, "exam-1");
    expect(unknown.letters).toEqual(expected.slice(0, ANSWERS.replace(/-+$/, "").length));

    expect(readAnswerKeyPhoto(photo.rgba, photo.width, photo.height, ANSWERS.length, "exam-2").warning).toMatch(
      /different exam/,
    );
    const student = await photographSheet(ANSWERS, { corners: TILTED });
    expect(readAnswerKeyPhoto(student.rgba, student.width, student.height, ANSWERS.length, "exam-1").warning).toMatch(
      /student's answer sheet/,
    );
    const empty = new Uint8ClampedArray(400 * 300 * 4).fill(200);
    expect(() => readAnswerKeyPhoto(empty, 400, 300, 10, "exam-1")).toThrow(AnswerKeyPhotoError);
  }, 60000);

  it("reads the column layout from the sheet's layout code", async () => {
    // 71 items -> three columns spread over the full width.
    const result = scan(await photographSheet(ANSWERS, { corners: TILTED }), ANSWERS.length);
    expect(result!.columns).toBe(3);
    for (const answers of [ANSWERS.slice(0, 20), ANSWERS.slice(0, 40), ANSWERS + "ABCDEABCDEABCDEABCDEABCD"]) {
      const read = scan(await photographSheet(answers, { corners: TILTED }), answers.length);
      expect(read!.columns).toBe(sheetColumns(answers.length));
      expect(read!.answers).toBe(answers);
    }
  }, 60000);

  it("still reads sheets printed before the layout code", async () => {
    const photo = await photographSheet(ANSWERS, { corners: TILTED, legacyLayout: true });
    const read = scan(photo, ANSWERS.length);
    expect(read!.columns).toBe(LEGACY_COLUMNS);
    expect(read!.answers).toBe(ANSWERS);
    const upsideDown = scan(
      await photographSheet(ANSWERS, { corners: TILTED, legacyLayout: true, upsideDown: true }),
      ANSWERS.length,
    );
    expect(upsideDown!.answers).toBe(ANSWERS);
  }, 60000);

  it("spreads fewer than four columns evenly, keeping the 4-column layout as printed before", () => {
    expect([1, 2, 3, 4].map((col) => itemRowOrigin(col * 25 - 24, 4).x)).toEqual([12, 55, 98, 141]);
    const three = [1, 26, 51].map((item) => itemRowOrigin(item, 3).x);
    // Equal gaps, and the block is centred like the 4-column one.
    expect(three[1] - three[0]).toBeCloseTo(three[2] - three[1]);
    expect((three[0] + three[2]) / 2).toBeCloseTo((12 + 141) / 2);
    expect(itemRowOrigin(1, 1).x).toBeCloseTo((12 + 141) / 2);
  });

  it("ignores a keyboard and dark squares around the sheet in a live-sized frame", async () => {
    const corners = [
      { x: 240, y: 440 },
      { x: 860, y: 420 },
      { x: 880, y: 1250 },
      { x: 220, y: 1270 },
    ];
    const photo = await photographSheet(ANSWERS, { corners, clutter: true, shadow: 0.2 });
    const full = rgbaToGray(photo.rgba, photo.width, photo.height);
    // The live preview detects on a 640 px copy of the frame.
    const { gray: live, scale } = downscale(full, 640);
    const found = findSheetCorners(live);
    expect(found).not.toBeNull();
    const read = readSheet(full, found!.map((c) => ({ x: c.x / scale, y: c.y / scale })), ANSWERS.length);
    expect(read!.answers).toBe(ANSWERS);
    // TL, TR, BR, BL of the printed markers lie just inside the page corners.
    read!.corners.forEach((c, i) => expect(dist(c, corners[i])).toBeLessThan(90));
    expect(scan(photo, ANSWERS.length)!.answers).toBe(ANSWERS);
  }, 30000);

  it("reads light pencil from a blurry, low-resolution video frame", async () => {
    // A phone's live video frame is softer than a still photo: shading reads
    // grey, not black, and must still beat the blank bubbles.
    const photo = await photographSheet(ANSWERS, { corners: TILTED, fillShade: "#a0a0a0", blur: 6 });
    const full = rgbaToGray(photo.rgba, photo.width, photo.height);
    const { gray: frame } = downscale(full, 640);
    const corners = findSheetCorners(frame);
    const read = readSheet(frame, corners!, ANSWERS.length);
    expect(read!.answers).toBe(ANSWERS);
    // Averaging several frames gives the same reading.
    expect(mergeReads([read!, read!, read!]).answers).toBe(ANSWERS);
  }, 30000);

  it("reads a sheet that doesn't lie flat", async () => {
    // A bowed page moves the middle of the sheet a few mm off where the
    // corner squares put it; every row is slid back onto its printed rings.
    for (const answers of [ANSWERS, ANSWERS.slice(0, 50), ANSWERS.slice(0, 25)]) {
      const photo = await photographSheet(answers, { corners: TILTED, curl: 3 });
      expect(scan(photo, answers.length)!.answers).toBe(answers);
    }
    const legacy = await photographSheet(ANSWERS, { corners: TILTED, curl: 3, legacyLayout: true });
    expect(scan(legacy, ANSWERS.length)!.answers).toBe(ANSWERS);
    // Live-camera frame of a bowed sheet.
    const video = await photographSheet(ANSWERS, { corners: TILTED, curl: 3, blur: 3 });
    const full = rgbaToGray(video.rgba, video.width, video.height);
    const { gray: frame } = downscale(full, 1280);
    expect(scan({ gray: frame }, ANSWERS.length)!.answers).toBe(ANSWERS);
  }, 120000);

  it("reads shading that spills past the bubbles on a bowed sheet", async () => {
    const photo = await photographSheet(ANSWERS, { corners: TILTED, curl: 2, overflow: 0.8, blur: 4 });
    const full = rgbaToGray(photo.rgba, photo.width, photo.height);
    const { gray: frame } = downscale(full, 640);
    const read = readSheet(frame, findSheetCorners(frame)!, ANSWERS.length);
    expect(read!.answers).toBe(ANSWERS);
  }, 60000);

  it("tells answer-key QR codes from student ones", () => {
    expect(parseSheetQr(answerKeyQrValue("exam-1"))).toEqual({ kind: "key", majorExamId: "exam-1" });
    expect(parseSheetQr("ABC123")).toBeNull();
  });

  it("finds nothing in a photo without a sheet", () => {
    const g: Gray = {
      width: 400,
      height: 300,
      data: new Uint8Array(400 * 300).fill(120),
    };
    expect(findSheetCorners(g)).toBeNull();
  });
});

describe("on-screen answer key", () => {
  it("maps the key text box to one letter per item and back", () => {
    expect(keyTextToLetters("ab-d1 2", 7)).toEqual(["A", "B", "", "D", "A", "B", ""]);
    expect(lettersToKeyText(["A", "B", "", "D", "A", "B", "", ""])).toBe("AB-DA B");
    expect(lettersToKeyText(["", "", ""])).toBe("");
  });
});


