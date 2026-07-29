import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Download, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { SortDirection } from "@/hooks/usePaginatedRows";

export type AdminColumn<T> = {
  key: string;
  header: string;
  sortable?: boolean;
  className?: string;
  render: (row: T) => React.ReactNode;
  /** Value used for CSV export when this column is included. */
  exportValue?: (row: T) => string | number;
};

type AdminDataTableProps<T> = {
  title?: string;
  description?: string;
  columns: AdminColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  page: number;
  totalPages: number;
  totalRows: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  sortKey?: string;
  sortDirection?: SortDirection;
  onSort?: (key: string) => void;
  onExport?: () => void;
  emptyMessage?: string;
  loading?: boolean;
};

export function AdminDataTable<T>({
  title,
  description,
  columns,
  rows,
  rowKey,
  search,
  onSearchChange,
  searchPlaceholder = "Search…",
  page,
  totalPages,
  totalRows,
  pageSize,
  onPageChange,
  sortKey,
  sortDirection,
  onSort,
  onExport,
  emptyMessage = "No records found.",
  loading = false,
}: AdminDataTableProps<T>) {
  const rangeStart = totalRows === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, totalRows);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      {(title || description || onExport) && (
        <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {title && <h3 className="text-base font-bold text-foreground">{title}</h3>}
            {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
          </div>
          {onExport && (
            <Button type="button" variant="outline" size="sm" onClick={onExport} className="gap-2 self-start">
              <Download className="h-4 w-4" /> Export CSV
            </Button>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3 border-b border-border bg-muted/20 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            className="border-border bg-background pl-9"
            aria-label="Search table"
          />
        </div>
        <p className="text-sm font-medium text-muted-foreground">
          {totalRows === 0 ? "0 results" : `${rangeStart}–${rangeEnd} of ${totalRows}`}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="admin-table w-full min-w-[720px] text-sm">
          <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className={cn("px-4 py-3 font-semibold", column.className)}>
                  {column.sortable && onSort ? (
                    <button
                      type="button"
                      onClick={() => onSort(column.key)}
                      className="inline-flex items-center gap-1 text-left hover:text-foreground"
                    >
                      {column.header}
                      {sortKey === column.key ? (
                        sortDirection === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-40" />
                      )}
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-muted-foreground">
                  Loading records…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-muted-foreground">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={rowKey(row)} className="transition-colors hover:bg-muted/30">
                  {columns.map((column) => (
                    <td key={column.key} className={cn("px-4 py-3 align-middle", column.className)}>
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border bg-muted/10 px-5 py-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="gap-1"
          >
            <ChevronLeft className="h-4 w-4" /> Previous
          </Button>
          <span className="text-sm font-medium text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="gap-1"
          >
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
