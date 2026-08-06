import type { AttendanceStatus, ClassRow, Student, Teacher } from "@/lib/types";
import { parseStudentName } from "@/lib/name-format";
import type {
  AttendanceEntry,
  GridEntry,
  MajorExamData,
  RecordCardStudentData,
} from "@/lib/record-card-data";

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
}: {
  classRow: ClassRow;
  teacher: Teacher | null;
  student: Student;
}) {
  const { lastName, firstName, mi } = parseStudentName(student.name);

  return (
    <div className="mb-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-16 w-16 shrink-0 border border-black bg-gray-200" />
          <div>
            <p className="font-display text-lg font-bold uppercase leading-tight text-black">
              Pampanga State University
            </p>
            <p className="text-xs uppercase text-black/70">Mexico Campus</p>
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

function MajorExamBox({ data }: { data: MajorExamData }) {
  return (
    <div className="border border-black">
      <p className="border-b border-black bg-gray-100 px-2 py-1 text-center text-xs font-bold uppercase text-black">
        Major exam
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

function AttendanceBox({ entries }: { entries: AttendanceEntry[] }) {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="border border-black">
      <p className="border-b border-black bg-gray-100 px-2 py-1 text-center text-xs font-bold uppercase text-black">
        Attendance
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
  breakBeforePage = false,
}: {
  classRow: ClassRow;
  teacher: Teacher | null;
  data: RecordCardStudentData;
  breakBeforePage?: boolean;
}) {
  const { student, assignmentEntries, recitationEntries, quizEntries, writtenEntries, labEntries, majorExam, attendanceEntries } =
    data;

  return (
    <div className={`record-card-page ${breakBeforePage ? "record-card-page-break" : ""}`}>
      <Header classRow={classRow} teacher={teacher} student={student} />

      <div className="grid grid-cols-3 gap-2">
        <DateGridBox title="Assignment" entries={assignmentEntries} />
        <DateGridBox title="Recitation" entries={recitationEntries} />
        <DateGridBox title="Quizzes" entries={quizEntries} />
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2">
        <MajorExamBox data={majorExam} />
        <DateGridBox title="Written activities" entries={writtenEntries} />
        <DateGridBox title="Lab activities" entries={labEntries} />
      </div>

      <div className="mt-2">
        <AttendanceBox entries={attendanceEntries} />
      </div>

      <SignatureRemarksRow />
    </div>
  );
}
