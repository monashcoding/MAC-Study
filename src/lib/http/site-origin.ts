export function getSiteOrigin(fallbackOrigin: string) {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (configuredSiteUrl) {
    try {
      const siteUrl = new URL(configuredSiteUrl);

      if (siteUrl.protocol === "http:" || siteUrl.protocol === "https:") {
        return siteUrl.origin;
      }
    } catch {
      // Fall back to the request origin when the optional setting is invalid.
    }
  }

  return fallbackOrigin;
}
