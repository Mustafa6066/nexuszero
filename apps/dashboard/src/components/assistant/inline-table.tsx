'use client';

interface Column {
  key: string;
  label: string;
}

interface InlineTableProps {
  columns: Column[];
  rows: Array<Record<string, unknown>>;
}

/** Renders a data table inline within an assistant message */
export function InlineTable({ columns, rows }: InlineTableProps) {
  if (!rows || rows.length === 0) {
    return (
      <div className="rounded-lg border border-border/40 bg-secondary/30 p-4 my-2">
        <p className="text-xs text-muted-foreground">No data to display</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/40 bg-secondary/30 overflow-hidden my-2">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/40">
              {columns.map((col) => (
                <th key={col.key} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 20).map((row, i) => (
              <tr key={i} className="border-b border-border/20 last:border-0 hover:bg-secondary/30">
                {columns.map((col) => (
                  <td key={col.key} className="px-3 py-1.5 text-foreground whitespace-nowrap">
                    {formatCellValue(row[col.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 20 && (
        <div className="px-3 py-1.5 text-xs text-muted-foreground border-t border-border/40">
          Showing 20 of {rows.length} rows
        </div>
      )}
    </div>
  );
}

function formatCellValue(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'number') {
    return value % 1 === 0 ? value.toLocaleString() : value.toFixed(2);
  }
  return String(value);
}
