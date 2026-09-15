// Thin styled wrappers around plain <table> markup -- "printed academic
// record" look (navy header, serif header text, hairline dividers,
// alternating row tint) shared across every data table in the app instead
// of each screen hand-rolling its own border/shading classes.

export function Table({
  bordered = true,
  className = "",
  children,
}: {
  // Set false when nesting inside another bordered container (e.g.
  // GradebookTable's Card) so the border doesn't double up.
  bordered?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`overflow-x-auto ${bordered ? "rounded-[10px] border border-line" : ""} ${className}`}>
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export function TableHead({ children }: { children: React.ReactNode }) {
  return <thead className="bg-navy">{children}</thead>;
}

export function TableBody({ children }: { children: React.ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function TableRow({
  striped = false,
  className = "",
  children,
}: {
  striped?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <tr className={`border-b border-line last:border-b-0 ${striped ? "odd:bg-paper/60" : ""} ${className}`}>
      {children}
    </tr>
  );
}

const ALIGN_CLASSES = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
} as const;

export function TableHeaderCell({
  align = "left",
  className = "",
  children,
}: {
  align?: keyof typeof ALIGN_CLASSES;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <th
      className={`whitespace-nowrap px-3 py-2.5 font-display text-[13px] font-medium text-card ${ALIGN_CLASSES[align]} ${className}`}
    >
      {children}
    </th>
  );
}

export function TableCell({
  align = "left",
  tabular = false,
  colSpan,
  className = "",
  children,
}: {
  align?: keyof typeof ALIGN_CLASSES;
  tabular?: boolean;
  colSpan?: number;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <td
      colSpan={colSpan}
      className={`px-3 py-2 text-ink ${ALIGN_CLASSES[align]} ${tabular ? "font-mono" : ""} ${className}`}
    >
      {children}
    </td>
  );
}
