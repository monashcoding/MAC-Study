"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function PaginatedList<T>({
  className,
  items,
  pageSize = 12,
  renderItem,
  resetKey,
}: PaginatedListProps<T>) {
  return (
    <PaginatedListContent
      className={className}
      items={items}
      key={resetKey}
      pageSize={pageSize}
      renderItem={renderItem}
    />
  );
}

type PaginatedListProps<T> = {
  className?: string;
  items: T[];
  pageSize?: number;
  renderItem: (item: T, index: number, absoluteIndex: number) => ReactNode;
  resetKey?: string;
};

function PaginatedListContent<T>({
  className,
  items,
  pageSize,
  renderItem,
}: Omit<PaginatedListProps<T>, "pageSize" | "resetKey"> & {
  pageSize: number;
}) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const startIndex = (safePage - 1) * pageSize;
  const visibleItems = useMemo(
    () => items.slice(startIndex, startIndex + pageSize),
    [items, pageSize, startIndex],
  );

  return (
    <>
      <div className={className}>
        {visibleItems.map((item, index) =>
          renderItem(item, index, startIndex + index),
        )}
      </div>
      {pageCount > 1 ? (
        <nav
          aria-label="Pagination"
          className="mt-3 flex items-center justify-center gap-3"
        >
          <button
            aria-label="Previous page"
            className="mac-focus inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-text-muted)] disabled:opacity-35"
            disabled={safePage === 1}
            onClick={() => setPage(Math.max(1, safePage - 1))}
            type="button"
          >
            <ChevronLeft aria-hidden size={17} />
          </button>
          <span className="min-w-20 text-center text-xs font-medium text-[var(--color-text-muted)]">
            {safePage} of {pageCount}
          </span>
          <button
            aria-label="Next page"
            className="mac-focus inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-text-muted)] disabled:opacity-35"
            disabled={safePage === pageCount}
            onClick={() => setPage(Math.min(pageCount, safePage + 1))}
            type="button"
          >
            <ChevronRight aria-hidden size={17} />
          </button>
        </nav>
      ) : null}
    </>
  );
}
