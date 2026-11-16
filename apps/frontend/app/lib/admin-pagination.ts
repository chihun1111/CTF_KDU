export const ADMIN_PAGE_KEYS = ["participantsPage", "submissionsPage", "clearsPage", "auditPage"] as const;
export type AdminPageKey = (typeof ADMIN_PAGE_KEYS)[number];
export type AdminPages = Record<AdminPageKey, number>;

export function parseAdminPages(params: Record<string, string | string[] | undefined>): AdminPages {
  return Object.fromEntries(ADMIN_PAGE_KEYS.map((key) => {
    const value = params[key];
    const page = typeof value === "string" && /^[1-9]\d{0,5}$/.test(value) ? Number(value) : 1;
    return [key, page <= 100_000 ? page : 1];
  })) as AdminPages;
}

export function adminPageHref(pages: AdminPages, key: AdminPageKey, page: number, section: string): string {
  const params = new URLSearchParams();
  for (const entry of ADMIN_PAGE_KEYS) {
    const value = entry === key ? page : pages[entry];
    if (value > 1) params.set(entry, String(value));
  }
  const query = params.toString();
  return `/admin/operations${query ? `?${query}` : ""}#${section}`;
}
