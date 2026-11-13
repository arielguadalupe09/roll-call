import { loadAnswerSheetData } from "./load";
import PrintAnswerSheets from "./print-answer-sheets";

export default async function AnswerSheetsPage({ params }: { params: Promise<{ classSlug: string; examId: string }> }) {
  const { classSlug, examId } = await params;
  const { classRow, exam, students } = await loadAnswerSheetData(classSlug, examId);
  return (
    <PrintAnswerSheets
      classSlug={classSlug}
      classTitle={[classRow.name, classRow.subject].filter(Boolean).join(" · ")}
      exam={exam}
      students={students}
    />
  );
}
