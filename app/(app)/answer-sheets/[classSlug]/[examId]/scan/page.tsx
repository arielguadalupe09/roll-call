import { loadAnswerSheetData } from "../load";
import ScanAnswerSheets from "./scan-answer-sheets";

export default async function ScanAnswerSheetsPage({
  params,
}: {
  params: Promise<{ classSlug: string; examId: string }>;
}) {
  const { classSlug, examId } = await params;
  const { classRow, exam, students, responses } = await loadAnswerSheetData(classSlug, examId);
  return (
    <ScanAnswerSheets
      classSlug={classSlug}
      className={classRow.name}
      exam={exam}
      students={students}
      initialResponses={responses}
    />
  );
}
