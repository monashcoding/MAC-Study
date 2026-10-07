export const MASCOT_KEYS = [
  "max-arms-up",
  "max-arms-up-happy",
  "max-arms-down",
  "max-angry",
  "max-angry-scheme",
  "min-arms-up",
  "min-arms-down",
  "min-wave",
  "min-angry",
  "min-sad",
  "min-artist",
  "min-volleyball",
] as const;

export type MascotKey = (typeof MASCOT_KEYS)[number];

export function isMascotKey(
  value: string | null | undefined,
): value is MascotKey {
  return MASCOT_KEYS.includes(value as MascotKey);
}

export function getMascotSrc(key: MascotKey) {
  return `/mascots/${key}.svg`;
}

// Stable per-user pick: same id always gets the same mascot, no storage needed.
export function getMascotForId(id: string): MascotKey {
  let hash = 0;

  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }

  return MASCOT_KEYS[hash % MASCOT_KEYS.length];
}

// A chosen mascot wins; legacy desk icons fall back to the stable random pick.
export function resolveMascot(icon: string | null | undefined, id: string) {
  return isMascotKey(icon) ? icon : getMascotForId(id);
}
