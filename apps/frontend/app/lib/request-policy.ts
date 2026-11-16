/** Use the configured public origin when the app runs behind a TLS reverse proxy. */
export function publicUrl(path: string, request: Request): URL {
  const origin = new URL(process.env.PUBLIC_BASE_URL ?? request.url).origin;
  return new URL(path, origin);
}

/** HTML form mutations must come from this origin, including on same-site subdomains. */
export function isSameOriginForm(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") {
    return false;
  }
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return false;
  }
  return origin === publicUrl("/", request).origin;
}

export function isPrefetchRequest(request: Request): boolean {
  return [request.headers.get("purpose"), request.headers.get("sec-purpose")]
    .some((value) => /prefetch|prerender/i.test(value ?? ""))
    || request.headers.get("next-router-prefetch") === "1";
}

/** One-use views are consumed only by top-level, same-origin browser navigation. */
export function isCertificateNavigation(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== publicUrl("/", request).origin) return false;

  const site = request.headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin" && site !== "none") return false;
  const destination = request.headers.get("sec-fetch-dest");
  if (destination !== null && destination !== "document") return false;
  const mode = request.headers.get("sec-fetch-mode");
  if (mode !== null && mode !== "navigate") return false;

  // CLI smoke checks do not send browser metadata; absence remains supported.
  return true;
}

export function noStoreHeaders(): Headers {
  return new Headers({
    "cache-control": "private, no-store, max-age=0",
    pragma: "no-cache",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  });
}
