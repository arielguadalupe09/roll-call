import { Card, CardHeader } from "./card";
import { Table } from "./table";

// The "gradebook" list/table treatment every per-class or per-student
// analytics list uses: one card, a header with a serif title + muted
// description + an optional legend on the right, and the shared Table
// (navy header, zebra rows, hairline dividers) underneath -- instead of a
// bare list of bars or a table with no surrounding card context.
export function GradebookTable({
  title,
  description,
  legend,
  className = "",
  children,
}: {
  title: string;
  description?: string;
  legend?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={className}>
      <CardHeader title={title} subtitle={description} actions={legend} />
      <Table bordered={false}>{children}</Table>
    </Card>
  );
}
