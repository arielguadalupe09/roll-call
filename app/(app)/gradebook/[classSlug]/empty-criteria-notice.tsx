import { Card } from "@/app/_components/card";
import { StatusPill } from "@/app/_components/status-pill";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/app/_components/table";
import { TileIcon } from "@/app/_components/tile-icon";

const ICON_ALERT = "M8 2.5 14 13H2L8 2.5zM8 6.5v3M8 11.2v.1";

export type EmptyCriteriaTerm = {
  period: string;
  label: string;
  items: { label: string; weight: number }[];
};

// Weighted criteria with no items count as 0 under the DHVSU rule; one table
// row per term, so the notice stays short however many terms are affected.
export default function EmptyCriteriaNotice({ terms }: { terms: EmptyCriteriaTerm[] }) {
  const count = terms.reduce((sum, term) => sum + term.items.length, 0);

  return (
    <Card variant="accent" className="mb-4">
      <div className="flex items-start gap-3">
        <TileIcon path={ICON_ALERT} tone="warning" />
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold text-ink">
            {count} weighted {count === 1 ? "criterion has" : "criteria have"} no items yet
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            An empty criterion counts as 0, so it lowers every student&apos;s term grade by up to its weight. Add an
            item, or set its weight to 0% in Setup.
          </p>
        </div>
      </div>

      <Table className="mt-4">
        <TableHead>
          <TableRow>
            <TableHeaderCell>Term</TableHeaderCell>
            <TableHeaderCell>Criteria with no items</TableHeaderCell>
            <TableHeaderCell align="right">Grade impact</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {terms.map((term) => (
            <TableRow key={term.period}>
              <TableCell className="whitespace-nowrap font-medium">{term.label}</TableCell>
              <TableCell>
                <div className="flex min-w-[12rem] flex-wrap gap-1.5">
                  {term.items.map((item) => (
                    <StatusPill key={item.label} tone="navy">
                      {item.label}
                      <span className="font-mono font-normal tabular-nums text-navy/70">{item.weight}%</span>
                    </StatusPill>
                  ))}
                </div>
              </TableCell>
              <TableCell align="right" tabular className="whitespace-nowrap font-semibold text-warning-text!">
                up to −{term.items.reduce((sum, item) => sum + item.weight, 0)} pts
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <p className="mt-3 text-xs text-muted">
        This is the DHVSU class record&apos;s rule; the exported file computes the same.
      </p>
    </Card>
  );
}
