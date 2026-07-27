import type { ReactNode } from "react";

export function EmptyStateCta({
  action,
  description,
  icon,
  title,
}: {
  action: ReactNode;
  description: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <div className="rounded-lg border border-[rgb(255_255_255/0.07)] bg-[rgb(255_255_255/0.025)] p-4 sm:flex sm:items-center sm:gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[rgb(255_227_48/0.1)] text-[var(--color-mac-yellow)]">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="font-semibold">{title}</p>
          <p className="mt-0.5 text-sm text-[var(--color-text-muted)]">
            {description}
          </p>
        </div>
      </div>
      <div className="mt-3 sm:ml-auto sm:mt-0 sm:shrink-0">{action}</div>
    </div>
  );
}
