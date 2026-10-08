import Image from "next/image";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { getMascotSrc, type MascotKey } from "@/lib/mascots";

// Shared empty state: a mascot, what this screen is for in one sentence,
// what you get, and the one action that fills it.
export function EmptyStateCta({
  action,
  description,
  mascot,
  points = [],
  title,
}: {
  action: ReactNode;
  description: string;
  mascot: MascotKey;
  points?: { icon: LucideIcon; label: string }[];
  title: string;
}) {
  return (
    <div className="flex flex-col items-center px-5 py-8 text-center">
      <Image
        alt=""
        className="h-20 w-20 object-contain"
        height={80}
        src={getMascotSrc(mascot)}
        width={80}
      />
      <h2 className="mt-3 text-lg font-semibold tracking-[-0.015em]">
        {title}
      </h2>
      <p className="mt-1 max-w-sm text-sm leading-5 text-[var(--color-text-muted)]">
        {description}
      </p>
      {points.length ? (
        <ul className="mt-4 flex flex-wrap justify-center gap-1.5">
          {points.map(({ icon: Icon, label }) => (
            <li
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[rgb(255_255_255/0.05)] px-3 text-xs font-medium text-[var(--color-text)]"
              key={label}
            >
              <Icon
                aria-hidden
                className="text-[var(--color-mac-yellow)]"
                size={14}
              />
              {label}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-5 w-full sm:w-auto">{action}</div>
    </div>
  );
}
