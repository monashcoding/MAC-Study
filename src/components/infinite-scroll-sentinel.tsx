"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useRef } from "react";

// Calls onLoadMore when scrolled into view, for database-paged lists.
export function InfiniteScrollSentinel({
  hasMore,
  isLoading,
  onLoadMore,
}: {
  hasMore: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const onLoadMoreRef = useRef(onLoadMore);

  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || isLoading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onLoadMoreRef.current();
        }
      },
      { rootMargin: "160px 0px" },
    );
    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [hasMore, isLoading]);

  if (!hasMore && !isLoading) return null;

  return (
    <div
      className="flex h-12 items-center justify-center text-[var(--color-text-muted)]"
      ref={sentinelRef}
    >
      {isLoading ? (
        <LoaderCircle
          aria-label="Loading more"
          className="animate-spin"
          size={18}
        />
      ) : null}
    </div>
  );
}
