"use client";

import { useEffect, useState } from "react";
import { UserSearch } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

export function DiscoverabilitySetting({
  initialDiscoverable,
  userId,
}: {
  initialDiscoverable: boolean;
  userId: string;
}) {
  const [enabled, setEnabled] = useState(initialDiscoverable);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createSupabaseBrowserClient();

    void supabase
      .from("profiles")
      .select("is_discoverable")
      .eq("id", userId)
      .maybeSingle<{ is_discoverable: boolean }>()
      .then(({ data }) => {
        if (!cancelled && data) setEnabled(data.is_discoverable);
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function toggleDiscoverability() {
    if (saving) return;

    const previous = enabled;
    const next = !previous;
    setEnabled(next);
    setSaving(true);
    setError(null);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error: updateError } = await supabase.rpc(
        "set_profile_discoverability",
        { next_is_discoverable: next },
      );

      if (updateError) throw updateError;
    } catch {
      setEnabled(previous);
      setError("Could not update discoverability.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-3 py-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgb(255_255_255/0.045)] text-[var(--color-mac-yellow)]">
          <UserSearch aria-hidden size={19} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">Discoverable</span>
          <span className="block text-sm text-[var(--color-text-muted)]">
            Let people find you when adding friends.
          </span>
        </span>
        <button
          aria-checked={enabled}
          aria-label="Allow people to find you"
          className={cn(
            "mac-focus relative h-8 w-14 shrink-0 rounded-full border transition disabled:opacity-55",
            enabled
              ? "border-[var(--color-mac-yellow)] bg-[var(--color-mac-yellow)]"
              : "border-[var(--color-border)] bg-[var(--color-surface-raised)]",
          )}
          disabled={saving}
          onClick={() => void toggleDiscoverability()}
          role="switch"
          type="button"
        >
          <span
            aria-hidden
            className={cn(
              "absolute left-1 top-1 h-6 w-6 rounded-full bg-white shadow transition-transform",
              enabled ? "translate-x-6" : "translate-x-0",
            )}
          />
        </button>
      </div>
      {error ? (
        <p className="mt-2 pl-[3.25rem] text-xs text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
