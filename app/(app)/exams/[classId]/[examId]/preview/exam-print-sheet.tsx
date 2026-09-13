import type { ClassRow, Exam, ExamOption, ExamQuestion, QuestionType, Teacher } from "@/lib/types";
import { optionLetter } from "@/lib/option-letters";

function Logo({ url, size = "h-16 w-16" }: { url: string | null; size?: string }) {
  return (
    <div className={`flex ${size} shrink-0 items-center justify-center overflow-hidden`}>
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-contain" />
      )}
    </div>
  );
}

// Repeats at the top of every printed page (see the parent's `<thead
// display: table-header-group>` wrapper) -- rendered inside a fixed-height
// box so the header band is identical on every page regardless of how much
// text the header itself happens to contain.
function Header({
  teacher,
  logoUrl,
  logoUrlSecondary,
}: {
  teacher: Teacher | null;
  logoUrl: string | null;
  logoUrlSecondary: string | null;
}) {
  return (
    <div className="bg-white">
      <div className="flex items-start justify-between gap-3">
        <div className="text-left">
          <p className="text-xs text-black">Republic of the Philippines</p>
          <p className="font-display text-xl font-bold uppercase text-black">
            {teacher?.card_school_name || "School name not set"}
          </p>
          <p className="text-xs italic text-black/70">
            (former Don Honorio Ventura State University)
          </p>
        </div>
        {/* The secondary logo slot is meant for a single pre-composed image
            (e.g. school seal + national logo side by side already merged
            into one file) -- shown alone, not stacked with the primary
            logo again, to avoid the seal appearing twice. */}
        <Logo url={logoUrlSecondary} />
      </div>
      {teacher?.card_campus_line && (
        <div className="mt-1 flex items-center gap-1.5 text-sm font-medium text-black">
          <Logo url={logoUrl} size="h-6 w-6" />
          {teacher.card_campus_line}
        </div>
      )}
      <div className="mt-2 border-b-2 border-black" />
    </div>
  );
}

// Repeats at the bottom of every printed page, same mechanism as Header above.
function Footer() {
  return (
    <div className="bg-white">
      <div className="border-t border-black/40 pt-2 text-center text-[10px]">
        <p className="font-bold text-danger">
          BACOLOR (MAIN) • MEXICO • PORAC • STO. TOMAS • LUBAO • CANDABA • APALIT • SAN FERNANDO
        </p>
        <p className="mt-1 text-black">
          <span className="font-bold">Office Address |</span> San Juan, Mexico, Pampanga, Philippines
        </p>
        <p className="mt-1 text-black">
          <span className="font-bold">Email Address |</span> mexicocampus@pampangastateu.edu.ph{" "}
          • <span className="font-bold">Telephone |</span> (045) 649-8050{" "}
          • <span className="font-bold">Website |</span> pampangastateu.edu.ph
        </p>
      </div>
    </div>
  );
}

function TitleBlock({ exam, classRow }: { exam: Exam; classRow: ClassRow }) {
  return (
    <div className="text-center">
      <p className="font-display text-lg font-bold uppercase text-black">{exam.title}</p>
      {classRow.semester && <p className="text-sm text-black">{classRow.semester}</p>}
      {classRow.academic_year && <p className="text-sm text-black">A.Y. {classRow.academic_year}</p>}
    </div>
  );
}

function StudentInfoFields({ classRow, teacher }: { classRow: ClassRow; teacher: Teacher | null }) {
  const rowClass = "flex items-baseline gap-2 border-b border-black/60 pb-0.5";
  return (
    <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2 text-sm text-black">
      <div className={rowClass}>
        <span className="shrink-0 font-semibold">Name:</span>
        <span className="flex-1">&nbsp;</span>
      </div>
      <div className={rowClass}>
        <span className="shrink-0 font-semibold">Score:</span>
        <span className="flex-1">&nbsp;</span>
      </div>
      <div className={rowClass}>
        <span className="shrink-0 font-semibold">Program:</span>
        <span className="flex-1">{classRow.program || " "}</span>
      </div>
      <div className={rowClass}>
        <span className="shrink-0 font-semibold">Date:</span>
        <span className="flex-1">&nbsp;</span>
      </div>
      <div className={rowClass}>
        <span className="shrink-0 font-semibold">Year &amp; Section:</span>
        <span className="flex-1">{classRow.name}</span>
      </div>
      <div className={rowClass}>
        <span className="shrink-0 font-semibold">Instructor:</span>
        <span className="flex-1">{teacher?.full_name || teacher?.email || " "}</span>
      </div>
    </div>
  );
}

function GeneralInstructions() {
  return (
    <div className="mt-4 text-sm text-black">
      <p className="font-bold uppercase">General Instructions</p>
      <ol className="mt-1 list-decimal pl-5">
        <li>
          Please read and answer the following set of questions carefully. You can only use black
          and blue ballpen. Erasures are wrong. Once finished, submit your paper to the front and go
          back to your seat properly.
        </li>
        <li>Any forms of misbehavior, noise, cheating, and the like will result in a remark of FAILED.</li>
      </ol>
    </div>
  );
}

function Directions({ questionTypes }: { questionTypes: Set<QuestionType> }) {
  const hasOnlyMultipleChoice =
    questionTypes.size === 1 && questionTypes.has("multiple_choice");
  return (
    <p className="mt-3 text-sm text-black">
      <span className="font-bold">Directions:</span>{" "}
      {hasOnlyMultipleChoice
        ? "Encircle the letter of the best answer."
        : "Encircle the letter of the best answer. For items with no choices, write your answer on the space provided."}
    </p>
  );
}

function QuestionItem({ question, options, number }: { question: ExamQuestion; options: ExamOption[]; number: number }) {
  return (
    <div className="mb-4 break-inside-avoid text-sm text-black">
      <p>
        <span className="font-semibold">{number}.</span> {question.prompt}
      </p>
      {question.type === "multiple_choice" ? (
        <ul className="mt-1 pl-4">
          {options.map((o, i) => (
            <li key={o.id}>
              {optionLetter(i)}. {o.label}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 border-b border-black/60 pb-3">&nbsp;</p>
      )}
    </div>
  );
}

// Matches Microsoft Word's built-in "Narrow" margin preset (0.5in on all
// four sides) rather than an arbitrary hand-picked value.
const PAGE_MARGIN_SIDE = "0.5in";
const PAGE_MARGIN_TOP_BOTTOM = "0.5in";

// Renders the official, student-facing quiz paper -- no answers marked,
// matching the university's standard exam-paper letterhead. This is
// deliberately separate from the on-screen preview above it (which shows
// the answer key for the teacher's own review) since a printed copy handed
// to students obviously can't reveal which option is correct.
//
// Header and footer repeat on every printed page via `<thead>`/`<tfoot>`
// with `display: table-header-group` / `table-footer-group` inside a
// `display: table` root -- this is the standard, reliable cross-browser
// technique for repeating print content. `position: fixed` was tried first
// (three separate attempts: plain top:0/bottom:0, then a negative-offset
// variant to compensate for an assumed content-vs-page-box anchoring
// mismatch) and every variant either clipped, duplicated, or overlapped
// content at page boundaries in Chrome's print engine -- verified by
// generating real PDFs and inspecting both the text layer and rendered
// page images, not just on-screen preview. table-header-group/footer-group
// sidesteps all of that: the browser paginates it like a real repeating
// table header, sized to its actual rendered height automatically.
export default function ExamPrintSheet({
  classRow,
  teacher,
  logoUrl,
  logoUrlSecondary,
  exam,
  questions,
  optionsByQuestion,
}: {
  classRow: ClassRow;
  teacher: Teacher | null;
  logoUrl: string | null;
  logoUrlSecondary: string | null;
  exam: Exam;
  questions: ExamQuestion[];
  optionsByQuestion: Map<string, ExamOption[]>;
}) {
  const questionTypes = new Set(questions.map((q) => q.type));

  return (
    <div className="bg-white text-black">
      <style>{`
        @page {
          size: letter;
          margin: ${PAGE_MARGIN_TOP_BOTTOM} ${PAGE_MARGIN_SIDE};
        }
      `}</style>
      <table className="w-full border-collapse">
        <thead style={{ display: "table-header-group" }}>
          <tr>
            {/* Sized to its own content, not a forced fixed height -- a
                reserved-but-empty 1.5in band left a large dead gap above
                the title block that didn't match the reference quiz paper,
                which keeps the title right under the header rule. */}
            <td>
              <Header teacher={teacher} logoUrl={logoUrl} logoUrlSecondary={logoUrlSecondary} />
              <div className="h-2" />
            </td>
          </tr>
        </thead>
        <tfoot style={{ display: "table-footer-group" }}>
          <tr>
            <td>
              <div className="h-2" />
              <Footer />
            </td>
          </tr>
        </tfoot>
        <tbody>
          <tr>
            <td>
              <TitleBlock exam={exam} classRow={classRow} />
              <StudentInfoFields classRow={classRow} teacher={teacher} />
              <GeneralInstructions />
              {exam.description && <p className="mt-2 text-sm text-black">{exam.description}</p>}
              <Directions questionTypes={questionTypes} />

              {/* Two-column layout, matching the reference quiz-paper format.
                  Uses CSS multicol -- the earlier content-loss bugs seen with
                  multicol/grid were specifically caused by combining them with
                  `position: fixed` headers (see git history); now that the
                  header/footer use table-header-group/table-footer-group
                  instead, that interaction no longer applies. */}
              <div className="mt-4" style={{ columnCount: 2, columnGap: "2rem" }}>
                {questions.map((q, i) => (
                  <QuestionItem key={q.id} question={q} options={optionsByQuestion.get(q.id) ?? []} number={i + 1} />
                ))}
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
