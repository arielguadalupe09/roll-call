import type { AttendanceStatus, ClassRow, GradingConfig, Student, Teacher } from "@/lib/types";
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
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden border border-black bg-gray-200">
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

function DateGridBox({ title, entries }: { title: string; entries: GridEntry[] }) {
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

function MajorExamBox({ title, data }: { title: string; data: MajorExamData }) {
  return (
    <div className="border border-black">
      <p className="border-b border-black bg-gray-100 px-2 py-1 text-center text-xs font-bold uppercase text-black">
        {title}
      </p>
      <table className="w-full border-collapse text-xs">
        <tbody>
          <tr>
            <td className="border border-black px-2 py-1 font-semibold uppercase">Midterm</td>
            <td className="border border-black px-2 py-1 text-center">
              {data.midtermScore != null ? `${data.midtermScore}/${data.midtermMax}` : ""}
            </td>
          </tr>
          <tr>
            <td className="border border-black px-2 py-1 font-semibold uppercase">Finals</td>
            <td className="border border-black px-2 py-1 text-center">
              {data.finalsScore != null ? `${data.finalsScore}/${data.finalsMax}` : ""}
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

function TwoRowBox({ title }: { title: string }) {
  return (
    <div className="border border-black">
      <p className="border-b border-black bg-gray-100 px-2 py-1 text-center text-xs font-bold uppercase text-black">
        {title}
      </p>
      <table className="w-full border-collapse text-xs">
        <tbody>
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

function SignatureRemarksRow() {
  return (
    <div className="mt-3 grid grid-cols-2 gap-3">
      <TwoRowBox title="Instructor's signature" />
      <TwoRowBox title="Remarks" />
    </div>
  );
}

function AttendanceBox({ title, entries }: { title: string; entries: AttendanceEntry[] }) {
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
  const { student, assignmentEntries, recitationEntries, quizEntries, writtenEntries, labEntries, majorExam, attendanceEntries } =
    data;

  const showBySection: Record<RecordCardSectionKey, boolean> = {
    assignment: config.show_assignment,
    recitation: config.show_recitation,
    quiz: config.show_quiz,
    major_exam: config.show_major_exam,
    written: config.show_written,
    laboratory: config.show_laboratory,
    attendance: config.show_attendance,
  };

  const visibleSections = resolveSectionOrder(config.record_card_layout).filter(
    (key) => showBySection[key],
  );

  function renderSection(key: RecordCardSectionKey) {
    const title = sectionTitle(config.record_card_layout, key);
    switch (key) {
      case "assignment":
        return <DateGridBox key={key} title={title} entries={assignmentEntries} />;
      case "recitation":
        return <DateGridBox key={key} title={title} entries={recitationEntries} />;
      case "quiz":
        return <DateGridBox key={key} title={title} entries={quizEntries} />;
      case "written":
        return <DateGridBox key={key} title={title} entries={writtenEntries} />;
      case "laboratory":
        return <DateGridBox key={key} title={title} entries={labEntries} />;
      case "major_exam":
        return <MajorExamBox key={key} title={title} data={majorExam} />;
      case "attendance":
        return (
          <div key={key} className="col-span-3">
            <AttendanceBox title={title} entries={attendanceEntries} />
          </div>
        );
    }
  }

  return (
    <div className={`record-card-page ${breakBeforePage ? "record-card-page-break" : ""}`}>
      <Header classRow={classRow} teacher={teacher} student={student} logoUrl={logoUrl} />

      {visibleSections.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {visibleSections.map((key) => renderSection(key))}
        </div>
      )}

      <SignatureRemarksRow />
    </div>
  );
}
