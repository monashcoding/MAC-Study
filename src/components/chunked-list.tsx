"use client";

import { useState, type ReactNode } from "react";
import { InfiniteScrollSentinel } from "@/components/infinite-scroll-sentinel";

// Renders one long list, revealing the next chunk as the end scrolls into
// view, so everything stays reachable by scrolling instead of paging.
export function ChunkedList<T>({
  chunkSize = 24,
  className,
  items,
  renderItem,
  resetKey,
}: ChunkedListProps<T>) {
  return (
    <ChunkedListContent
      chunkSize={chunkSize}
      className={className}
      items={items}
      key={resetKey}
      renderItem={renderItem}
    />
  );
}

type ChunkedListProps<T> = {
  chunkSize?: number;
  className?: string;
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  resetKey?: string;
};

function ChunkedListContent<T>({
  chunkSize,
  className,
  items,
  renderItem,
}: Omit<ChunkedListProps<T>, "chunkSize" | "resetKey"> & {
  chunkSize: number;
}) {
  const [visibleCount, setVisibleCount] = useState(chunkSize);
  const visibleItems = items.slice(0, visibleCount);

  return (
    <>
      <div className={className}>{visibleItems.map(renderItem)}</div>
      {/* Keyed by count so a sentinel still in view after a chunk renders
          gets a fresh observer and reveals the next chunk too. */}
      <InfiniteScrollSentinel
        hasMore={visibleCount < items.length}
        isLoading={false}
        key={visibleCount}
        onLoadMore={() => setVisibleCount((count) => count + chunkSize)}
      />
    </>
  );
}
