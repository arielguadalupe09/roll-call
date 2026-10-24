import type { AttendanceStatus, ClassRow, GradingConfig, Student, Teacher } from "@/lib/types";
import { CLASS_STANDING_SLOTS, criterionLabel, isCriterionActive, type CriterionKey } from "@/lib/grading-criteria";
import { parseStudentName } from "@/lib/name-format";
import type {
  AttendanceEntry,
  GridEntry,
  MajorExamData,
  RecordCardStudentData,
} from "@/lib/record-card-data";
import {
  resolveSectionOrder,
  sectionTitle,
  type RecordCardSectionKey,
} from "@/lib/record-card-layout";

const STATUS_LETTER: Record<AttendanceStatus, string> = {
  present: "P",
  absent: "A",
  excused: "E",
  late: "L",
};

function Header({
  classRow,
  teacher,
  student,
  logoUrl,
}: {
  classRow: ClassRow;
  teacher: Teacher | null;
  student: Student;
  logoUrl: string | null;
}) {
  const { lastName, firstName, mi } = parseStudentName(student.name);

  return (
    <div className="mb-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden ${
              logoUrl ? "" : "border border-black bg-gray-200"
            }`}
          >
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="School logo" className="h-full w-full object-contain" />
            )}
          </div>
          <div>
            <p className="font-display text-lg font-bold uppercase leading-tight text-black">
              {teacher?.card_school_name || "School name not set"}
            </p>
            <p className="text-xs uppercase text-black/70">
              {teacher?.card_campus_line || ""}
            </p>
          </div>
        </div>
        <table className="border-collapse text-xs">
          <tbody>
            <tr>
              <td className="border border-black px-2 py-1 font-semibold uppercase">
                Subject
              </td>
              <td className="border border-black px-2 py-1">{classRow.subject || ""}</td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 font-semibold uppercase">
                Instructor
              </td>
              <td className="border border-black px-2 py-1">
                {teacher?.full_name || teacher?.email || ""}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-center font-display text-xl font-bold uppercase text-black">
        Student Individual Record Card
      </p>

      <table className="mt-3 w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className="border border-black px-2 py-1 font-semibold uppercase">
              First name
            </th>
            <th className="border border-black px-2 py-1 font-semibold uppercase">
              Last name
            </th>
            <th className="border border-black px-2 py-1 font-semibold uppercase">
              M.I
            </th>
            <th className="border border-black px-2 py-1 font-semibold uppercase">
              Year &amp; section
            </th>
            <th className="border border-black px-2 py-1 font-semibold uppercase">
              Student number
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border border-black px-2 py-1 text-center">{firstName}</td>
            <td className="border border-black px-2 py-1 text-center">{lastName}</td>
            <td className="border border-black px-2 py-1 text-center">{mi}</td>
            <td className="border border-black px-2 py-1 text-center">{classRow.name}</td>
            <td className="border border-black px-2 py-1 text-center">{student.code}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function DateGridBox({
  title,
  entries,
  usePrelims,
}: {
  title: string;
  entries: GridEntry[];
  usePrelims: boolean;
}) {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="border border-black">
      <p className="border-b border-black bg-gray-100 px-2 py-1 text-center text-xs font-bold uppercase text-black">
        {title}
      </p>
      {sorted.length === 0 ? (
        <p className="px-2 py-3 text-center text-xs text-black/50">No records yet</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <tbody>
              <tr>
                <td className="border border-black px-1 py-1 font-semibold uppercase">Date</td>
                {sorted.map((e, i) => (
                  <td key={i} className="border border-black px-1 py-1 text-center whitespace-nowrap">
                    {e.date}
                  </td>
                ))}
              </tr>
              {usePrelims && (
                <tr>
                  <td className="border border-black px-1 py-1 font-semibold uppercase">Prelim</td>
                  {sorted.map((e, i) => (
                    <td key={i} className="border border-black px-1 py-1 text-center whitespace-nowrap">
                      {e.period === "prelim" && e.score != null
                        ? `${e.score}/${e.maxScore}`
                        : ""}
                    </td>
                  ))}
                </tr>
              )}
              <tr>
                <td className="border border-black px-1 py-1 font-semibold uppercase">Midterm</td>
                {sorted.map((e, i) => (
                  <td key={i} className="border border-black px-1 py-1 text-center whitespace-nowrap">
                    {e.period === "midterm" && e.score != null
                      ? `${e.score}/${e.maxScore}`
                      : ""}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="border border-black px-1 py-1 font-semibold uppercase">Finals</td>
                {sorted.map((e, i) => (
                  <td key={i} className="border border-black px-1 py-1 text-center whitespace-nowrap">
                    {e.period === "finals" && e.score != null
                      ? `${e.score}/${e.maxScore}`
                      : ""}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MajorExamBox({
  title,
  data,
  usePrelims,
}: {
  title: string;
  data: MajorExamData;
  usePrelims: boolean;
}) {
  return (
    <div className="border border-black">
      <p className="border-b border-black bg-gray-100 px-2 py-1 text-center text-xs font-bold uppercase text-black">
        {title}
      </p>
      <table className="w-full border-collapse text-xs">
        <tbody>
          {usePrelims && (
            <tr>
              <td className="border border-black px-2 py-1 font-semibold uppercase">Prelim</td>
              <td className="border border-black px-2 py-1 text-center">
                {data.prelimScore != null ? `${data.prelimScore}/${data.prelimMax}` : ""}
                {data.lab?.prelim && (
                  <span className="block">
                    Lab {data.lab.prelim.score != null ? `${data.lab.prelim.score}/${data.lab.prelim.max}` : ""}
                  </span>
                )}
              </td>
            </tr>
          )}
          <tr>
            <td className="border border-black px-2 py-1 font-semibold uppercase">Midterm</td>
            <td className="border border-black px-2 py-1 text-center">
              {data.midtermScore != null ? `${data.midtermScore}/${data.midtermMax}` : ""}
                {data.lab?.midterm && (
                  <span className="block">
                    Lab {data.lab.midterm.score != null ? `${data.lab.midterm.score}/${data.lab.midterm.max}` : ""}
                  </span>
                )}
            </td>
          </tr>
          <tr>
            <td className="border border-black px-2 py-1 font-semibold uppercase">Finals</td>
            <td className="border border-black px-2 py-1 text-center">
              {data.finalsScore != null ? `${data.finalsScore}/${data.finalsMax}` : ""}
                {data.lab?.finals && (
                  <span className="block">
                    Lab {data.lab.finals.score != null ? `${data.lab.finals.score}/${data.lab.finals.max}` : ""}
                  </span>
                )}
            </td>
          </tr>
          <tr>
            <td className="border border-black px-2 py-1 font-semibold uppercase">Average</td>
            <td className="border border-black px-2 py-1 text-center">
              {data.average != null ? data.average.toFixed(2) : ""}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function TwoRowBox({ title, usePrelims }: { title: string; usePrelims: boolean }) {
  return (
    <div className="border border-black">
      <p className="border-b border-black bg-gray-100 px-2 py-1 text-center text-xs font-bold uppercase text-black">
        {title}
      </p>
      <table className="w-full border-collapse text-xs">
        <tbody>
          {usePrelims && (
            <tr>
              <td className="border border-black px-2 py-2 font-semibold uppercase">Prelim</td>
              <td className="border border-black px-2 py-2" />
            </tr>
          )}
          <tr>
            <td className="border border-black px-2 py-2 font-semibold uppercase">Midterm</td>
            <td className="border border-black px-2 py-2" />
          </tr>
          <tr>
            <td className="border border-black px-2 py-2 font-semibold uppercase">Finals</td>
            <td className="border border-black px-2 py-2" />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function SignatureRemarksRow({ usePrelims }: { usePrelims: boolean }) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-3">
      <TwoRowBox title="Instructor's signature" usePrelims={usePrelims} />
      <TwoRowBox title="Remarks" usePrelims={usePrelims} />
    </div>
  );
}

function AttendanceBox({
  title,
  entries,
  usePrelims,
}: {
  title: string;
  entries: AttendanceEntry[];
  usePrelims: boolean;
}) {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="border border-black">
      <p className="border-b border-black bg-gray-100 px-2 py-1 text-center text-xs font-bold uppercase text-black">
        {title}
      </p>
      {sorted.length === 0 ? (
        <p className="px-2 py-3 text-center text-xs text-black/50">
          No class sessions recorded yet
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <tbody>
              <tr>
                <td className="border border-black px-1 py-1 font-semibold uppercase">Date</td>
                {sorted.map((e, i) => (
                  <td key={i} className="border border-black px-1 py-1 text-center whitespace-nowrap">
                    {e.date}
                  </td>
                ))}
              </tr>
              {usePrelims && (
                <tr>
                  <td className="border border-black px-1 py-1 font-semibold uppercase">Prelim</td>
                  {sorted.map((e, i) => (
                    <td key={i} className="border border-black px-1 py-1 text-center whitespace-nowrap">
                      {e.period === "prelim" ? STATUS_LETTER[e.status] : ""}
                    </td>
                  ))}
                </tr>
              )}
              <tr>
                <td className="border border-black px-1 py-1 font-semibold uppercase">Midterm</td>
                {sorted.map((e, i) => (
                  <td key={i} className="border border-black px-1 py-1 text-center whitespace-nowrap">
                    {e.period === "midterm" ? STATUS_LETTER[e.status] : ""}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="border border-black px-1 py-1 font-semibold uppercase">Finals</td>
                {sorted.map((e, i) => (
                  <td key={i} className="border border-black px-1 py-1 text-center whitespace-nowrap">
                    {e.period === "finals" ? STATUS_LETTER[e.status] : ""}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Renders one student's full Record Card as a single printable page.
// `breakBeforePage` forces a fresh printed page before this sheet — used
// when stacking multiple students' sheets back-to-back for a bulk print.
export default function RecordCardSheet({
  classRow,
  teacher,
  data,
  config,
  logoUrl,
  breakBeforePage = false,
}: {
  classRow: ClassRow;
  teacher: Teacher | null;
  data: RecordCardStudentData;
  config: GradingConfig;
  logoUrl: string | null;
  breakBeforePage?: boolean;
}) {
  const { student, recitationEntries, quizEntries, writtenEntries, labEntries, otherEntries, majorExam, attendanceEntries } =
    data;

  const showBySection: Record<RecordCardSectionKey, boolean> = {
    recitation: config.show_recitation,
    quiz: config.show_quiz,
    major_exam: config.show_major_exam,
    written: config.show_written,
    laboratory: config.show_laboratory,
    other: (config.show_other ?? true) && isCriterionActive(config, "other"),
    attendance: config.show_attendance,
  };

  const visibleSections = resolveSectionOrder(config.record_card_layout).filter(
    (key) => showBySection[key],
  );

  // Attendance always gets its own full-width row; everything else fills
  // up to 3 per row. Grouping into rows here (rather than one flat grid)
  // means a partial row's boxes stretch evenly to fill the width instead
  // of leaving a gap where a hidden section used to be.
  const rows: RecordCardSectionKey[][] = [];
  let currentRow: RecordCardSectionKey[] = [];
  for (const key of visibleSections) {
    if (key === "attendance") {
      if (currentRow.length > 0) {
        rows.push(currentRow);
        currentRow = [];
      }
      rows.push([key]);
      continue;
    }
    currentRow.push(key);
    if (currentRow.length === 3) {
      rows.push(currentRow);
      currentRow = [];
    }
  }
  if (currentRow.length > 0) rows.push(currentRow);

  function renderSectionContent(key: RecordCardSectionKey) {
    // A criterion's default title is the name chosen for it in Setup.
    const isCriterion = CLASS_STANDING_SLOTS.some((s) => s.key === key);
    const title =
      config.record_card_layout?.titles?.[key]?.trim() ||
      (isCriterion ? criterionLabel(config, key as CriterionKey) : sectionTitle(config.record_card_layout, key));
    switch (key) {
      case "recitation":
        return <DateGridBox title={title} entries={recitationEntries} usePrelims={config.use_prelims} />;
      case "quiz":
        return <DateGridBox title={title} entries={quizEntries} usePrelims={config.use_prelims} />;
      case "written":
        return <DateGridBox title={title} entries={writtenEntries} usePrelims={config.use_prelims} />;
      case "laboratory":
        return <DateGridBox title={title} entries={labEntries} usePrelims={config.use_prelims} />;
      case "other":
        return <DateGridBox title={title} entries={otherEntries} usePrelims={config.use_prelims} />;
      case "major_exam":
        return <MajorExamBox title={title} data={majorExam} usePrelims={config.use_prelims} />;
      case "attendance":
        return <AttendanceBox title={title} entries={attendanceEntries} usePrelims={config.use_prelims} />;
    }
  }

  return (
    <div className={`record-card-page ${breakBeforePage ? "record-card-page-break" : ""}`}>
      <Header classRow={classRow} teacher={teacher} student={student} logoUrl={logoUrl} />

      {rows.map((row, i) => (
        <div key={i} className={`flex gap-2 ${i > 0 ? "mt-2" : ""}`}>
          {row.map((key) => (
            <div key={key} className="min-w-0 flex-1">
              {renderSectionContent(key)}
            </div>
          ))}
        </div>
      ))}

      <SignatureRemarksRow usePrelims={config.use_prelims} />
    </div>
  );
}
