import { QRCodeSVG } from "qrcode.react";
import {
  BUBBLE_RADIUS,
  ITEMS_PER_COLUMN,
  MARKER_CENTERS,
  MARKER_SIZE,
  ORIENTATION_BAR,
  QR_BOX,
  SHEET_H,
  SHEET_OPTIONS,
  SHEET_W,
  bubbleCenter,
  itemRowOrigin,
  LEGACY_COLUMNS,
  layoutMarkRect,
  sheetColumns,
} from "@/lib/omr-sheet";

// One printable bubble answer sheet, drawn in millimetres from lib/omr-sheet.ts
// so the scanner (lib/omr-scan.ts) finds every bubble where it was printed.
// filled / fillShade: optional answers to pre-shade, and their colour (tests only).
// legacyLayout: draw a sheet as printed before the layout code (tests only).
export default function AnswerSheetSvg({
  itemCount,
  optionCount,
  title,
  examLabel,
  studentName,
  studentCode,
  qrValue,
  answerKeySheet = false,
  filled,
  fillShade = "#222",
  legacyLayout = false,
}: {
  itemCount: number;
  optionCount: number;
  title: string;
  examLabel: string;
  studentName?: string;
  studentCode?: string;
  qrValue?: string;
  // The teacher's sheet: shaded with the correct answers and scanned first as the key.
  answerKeySheet?: boolean;
  filled?: string;
  fillShade?: string;
  legacyLayout?: boolean;
}) {
  const items = Array.from({ length: itemCount }, (_, i) => i + 1);
  // The item columns are spread evenly across the sheet; the layout-code
  // squares (one per column) tell the scanner which spacing this sheet uses.
  const columns = legacyLayout ? LEGACY_COLUMNS : sheetColumns(itemCount);
  const markCount = legacyLayout ? 0 : columns;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${SHEET_W} ${SHEET_H}`}
      width={`${SHEET_W}mm`}
      height={`${SHEET_H}mm`}
      fontFamily="Arial, Helvetica, sans-serif"
      style={{ display: "block", background: "#fff" }}
    >
      <rect x={0} y={0} width={SHEET_W} height={SHEET_H} fill="#fff" />
      {MARKER_CENTERS.map((c, i) => (
        <rect
          key={i}
          x={c.x - MARKER_SIZE / 2}
          y={c.y - MARKER_SIZE / 2}
          width={MARKER_SIZE}
          height={MARKER_SIZE}
          fill="#000"
        />
      ))}
      <rect
        x={ORIENTATION_BAR.x}
        y={ORIENTATION_BAR.y}
        width={ORIENTATION_BAR.w}
        height={ORIENTATION_BAR.h}
        fill="#000"
      />
      {Array.from({ length: markCount }, (_, i) => {
        const r = layoutMarkRect(i);
        return <rect key={`layout-${i}`} x={r.x} y={r.y} width={r.size} height={r.size} fill="#000" />;
      })}

      <text x={14} y={17} fontSize={4.6} fontWeight={700} fill="#000">
        {answerKeySheet ? "ANSWER KEY" : "ANSWER SHEET"}
      </text>
      <text x={14} y={22.5} fontSize={3} fill="#333">
        {title.length > 70 ? `${title.slice(0, 69)}…` : title}
      </text>
      <text x={14} y={27} fontSize={3} fill="#333">
        {examLabel} · {itemCount} items
      </text>

      {answerKeySheet ? (
        <>
          <text x={14} y={35} fontSize={3.6} fontWeight={700} fill="#000">
            TEACHER&apos;S ANSWER KEY — do not hand out
          </text>
          <text x={14} y={41.5} fontSize={3} fill="#000">
            Shade the correct answer for every item, then scan this sheet first.
          </text>
        </>
      ) : (
        <>
          <text x={14} y={34.5} fontSize={3} fill="#000">
            Name:
          </text>
          {studentName ? (
            <text x={25} y={34.5} fontSize={3.6} fontWeight={700} fill="#000">
              {studentName.length > 48 ? `${studentName.slice(0, 47)}…` : studentName}
            </text>
          ) : (
            <line x1={25} y1={35.2} x2={138} y2={35.2} stroke="#000" strokeWidth={0.25} />
          )}
          <text x={14} y={41.5} fontSize={3} fill="#000">
            Code:
          </text>
          {studentCode ? (
            <text x={25} y={41.5} fontSize={3.2} fontFamily="Courier New, monospace" fill="#000">
              {studentCode}
            </text>
          ) : (
            <line x1={25} y1={42.2} x2={70} y2={42.2} stroke="#000" strokeWidth={0.25} />
          )}
          <text x={80} y={41.5} fontSize={3} fill="#000">
            Score:
          </text>
          <line x1={92} y1={42.2} x2={110} y2={42.2} stroke="#000" strokeWidth={0.25} />
          <text x={111} y={41.5} fontSize={3} fill="#000">
            / {itemCount}
          </text>
        </>
      )}
      {qrValue ? (
        <QRCodeSVG value={qrValue} size={QR_BOX.size} x={QR_BOX.x} y={QR_BOX.y} marginSize={2} level="M" />
      ) : (
        <g>
          <rect
            x={QR_BOX.x}
            y={QR_BOX.y}
            width={QR_BOX.size}
            height={QR_BOX.size}
            fill="none"
            stroke="#999"
            strokeWidth={0.25}
            strokeDasharray="1 1"
          />
          <text
            x={QR_BOX.x + QR_BOX.size / 2}
            y={QR_BOX.y + QR_BOX.size / 2 + 1}
            fontSize={2.6}
            fill="#999"
            textAnchor="middle"
          >
            Blank sheet
          </text>
        </g>
      )}

      <text x={14} y={49.5} fontSize={2.6} fill="#333">
        Use a pencil or black pen. Shade ONE circle per item completely. Erase cleanly to change an answer.
      </text>
      {Array.from({ length: Math.ceil(itemCount / ITEMS_PER_COLUMN) }, (_, c) => (
        <line
          key={c}
          x1={itemRowOrigin(c * ITEMS_PER_COLUMN + 1, columns).x - 2}
          y1={52.5}
          x2={itemRowOrigin(c * ITEMS_PER_COLUMN + 1, columns).x + 39}
          y2={52.5}
          stroke="#bbb"
          strokeWidth={0.2}
        />
      ))}

      {items.map((item) => {
        const o = itemRowOrigin(item, columns);
        return (
          <g key={item}>
            <text x={o.x + 7.5} y={o.y + 1.1} fontSize={3} fontWeight={700} fill="#000" textAnchor="end">
              {item}
            </text>
            {Array.from({ length: optionCount }, (_, k) => {
              const c = bubbleCenter(item, k, columns);
              const shaded = filled?.[item - 1] === SHEET_OPTIONS[k];
              return (
                <g key={k}>
                  <circle
                    cx={c.x}
                    cy={c.y}
                    r={BUBBLE_RADIUS}
                    fill={shaded ? fillShade : "#fff"}
                    stroke="#000"
                    strokeWidth={0.25}
                  />
                  {!shaded && (
                    <text x={c.x} y={c.y + 0.8} fontSize={2.2} fill="#a0a0a0" textAnchor="middle">
                      {SHEET_OPTIONS[k]}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}
