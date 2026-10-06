"use client";

import { useEffect, useState } from "react";
import { UserSearch } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Switch } from "@/components/ui/switch";

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
    <div className="px-4 py-3 lg:px-5">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgb(255_227_48/0.1)] text-[var(--color-mac-yellow)]">
          <UserSearch aria-hidden size={19} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">Discoverable</span>
          <span className="block text-sm text-[var(--color-text-muted)]">
            Let people find you when adding friends.
          </span>
        </span>
        <Switch
          aria-label="Allow people to find you"
          checked={enabled}
          disabled={saving}
          onCheckedChange={() => void toggleDiscoverability()}
        />
      </div>
      {error ? (
        <p className="mt-2 pl-[3.25rem] text-xs text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
