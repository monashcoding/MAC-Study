import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

// A labelled slice of a list, e.g. pinned groups above the rest.
export function ListSection({
  children,
  icon: Icon,
  title,
}: {
  children: ReactNode;
  icon?: LucideIcon;
  title?: string | null;
}) {
  return (
    <section className="space-y-2.5">
      {title ? (
        <h2 className="flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
          {Icon ? <Icon aria-hidden size={13} /> : null}
          {title}
        </h2>
      ) : null}
      {children}
    </section>
  );
}
