import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden
      style={style}
      className={cn(
        "block animate-pulse rounded bg-[rgb(255_255_255/0.07)] motion-reduce:animate-none",
        className,
      )}
    />
  );
}

// Announces loading once for a group of placeholder shapes.
export function SkeletonGroup({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <div aria-busy aria-label={label} className={className} role="status">
      {children}
      <span className="sr-only">{label}…</span>
    </div>
  );
}

// Mirrors the card rows used by the friends, groups and messages lists.
export function ListRowSkeleton({
  avatar = false,
  className,
  trailing = true,
}: {
  avatar?: boolean;
  className?: string;
  trailing?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid items-center gap-3 rounded-lg border border-[rgb(255_255_255/0.055)] bg-[rgb(255_255_255/0.028)] px-3 py-3 lg:min-h-20 lg:px-4",
        avatar
          ? "grid-cols-[auto_minmax(0,1fr)_auto]"
          : "grid-cols-[minmax(0,1fr)_auto]",
        className,
      )}
    >
      {avatar ? <Skeleton className="h-10 w-10 rounded-full" /> : null}
      <div className="min-w-0 space-y-2">
        <Skeleton className="h-4 w-32 max-w-full" />
        <Skeleton className="h-3 w-20 max-w-full bg-[rgb(255_255_255/0.05)]" />
      </div>
      {trailing ? (
        <Skeleton className="h-7 w-12 bg-[rgb(255_255_255/0.05)]" />
      ) : (
        <span />
      )}
    </div>
  );
}

export function ListSkeleton({
  avatar,
  className = "grid gap-2 lg:grid-cols-2 lg:gap-3",
  count = 4,
  label,
  trailing,
}: {
  avatar?: boolean;
  className?: string;
  count?: number;
  label: string;
  trailing?: boolean;
}) {
  return (
    <SkeletonGroup className={className} label={label}>
      {Array.from({ length: count }, (_, index) => (
        <ListRowSkeleton avatar={avatar} key={index} trailing={trailing} />
      ))}
    </SkeletonGroup>
  );
}
