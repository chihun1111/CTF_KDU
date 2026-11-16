/** Reject malformed or ambiguous token cookies instead of throwing a URIError. */
export function readTokenCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader || cookieHeader.length > 16_384) {
    return null;
  }

  let token: string | null = null;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) {
      continue;
    }
    // Multiple values can be interpreted differently by proxies and applications.
    if (token !== null) {
      return null;
    }
    const encoded = part.slice(separator + 1).trim();
    if (!encoded || encoded.length > 512) {
      return null;
    }
    try {
      const decoded = decodeURIComponent(encoded);
      if (!/^[A-Za-z0-9_-]+$/.test(decoded)) {
        return null;
      }
      token = decoded;
    } catch {
      return null;
    }
  }
  return token;
}
