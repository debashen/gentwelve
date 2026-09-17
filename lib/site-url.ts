/** This module contains public URL configuration only; never add secrets here. */
export function resolveSiteUrl(environment: Record<string, string | undefined>) {
  const explicit = environment.NEXT_PUBLIC_SITE_URL?.trim();
  const host = environment.VERCEL_PROJECT_PRODUCTION_URL || environment.VERCEL_URL;
  const candidate = explicit || (host ? `https://${host}` : "http://localhost:3000");
  try {
    const url = new URL(candidate);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error();
    return url.origin;
  } catch {
    throw new Error("NEXT_PUBLIC_SITE_URL must be an absolute http(s) URL without credentials.");
  }
}

export const siteUrl = resolveSiteUrl(process.env);
