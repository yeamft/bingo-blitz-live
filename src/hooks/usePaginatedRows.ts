import { useMemo, useState } from "react";

export type SortDirection = "asc" | "desc";

export type UsePaginatedRowsOptions<T> = {
  rows: T[];
  pageSize?: number;
  /** Return a string used for case-insensitive search matching. */
  searchAccessor?: (row: T) => string;
  /** Return the value used for sorting. */
  sortAccessor?: (row: T, key: string) => string | number;
  initialSortKey?: string;
  initialSortDirection?: SortDirection;
};

export function usePaginatedRows<T>({
  rows,
  pageSize = 15,
  searchAccessor,
  sortAccessor,
  initialSortKey,
  initialSortDirection = "desc",
}: UsePaginatedRowsOptions<T>) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState(initialSortKey ?? "");
  const [sortDirection, setSortDirection] = useState<SortDirection>(initialSortDirection);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    let result = rows;
    if (query && searchAccessor) {
      result = result.filter((row) => searchAccessor(row).toLowerCase().includes(query));
    }
    if (sortKey && sortAccessor) {
      result = [...result].sort((a, b) => {
        const left = sortAccessor(a, sortKey);
        const right = sortAccessor(b, sortKey);
        if (left < right) return sortDirection === "asc" ? -1 : 1;
        if (left > right) return sortDirection === "asc" ? 1 : -1;
        return 0;
      });
    }
    return result;
  }, [rows, search, searchAccessor, sortKey, sortAccessor, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);

  const paginated = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage, pageSize]);

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
    setPage(1);
  }

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  return {
    search,
    setSearch: updateSearch,
    page: safePage,
    setPage,
    pageSize,
    totalPages,
    totalRows: filtered.length,
    rows: paginated,
    sortKey,
    sortDirection,
    toggleSort,
  };
}
