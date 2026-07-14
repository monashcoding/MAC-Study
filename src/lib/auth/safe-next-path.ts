const DEFAULT_NEXT_PATH = "/app";

export function getSafeNextPath(
  value: string | null | undefined,
  fallback = DEFAULT_NEXT_PATH,
) {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return fallback;
  }

  return value;
}
