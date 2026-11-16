import Link from "next/link";
import { adminPageHref, type AdminPageKey, type AdminPages } from "../lib/admin-pagination";
import type { AdminListResponse } from "../lib/types";

export function AdminPagination({
  list,
  pages,
  pageKey,
  section,
  label,
}: {
  list: Pick<AdminListResponse<unknown>, "page" | "pageSize" | "totalCount">;
  pages: AdminPages;
  pageKey: AdminPageKey;
  section: string;
  label: string;
}) {
  const pageCount = Math.max(1, Math.ceil(list.totalCount / list.pageSize));
  return (
    <nav className="adminPagination" aria-label={`${label} 페이지 이동`}>
      <span>전체 {list.totalCount}개 · {list.page} / {pageCount} 페이지</span>
      <div>
        {list.page > 1 ? (
          <>
            <Link prefetch={false} href={adminPageHref(pages, pageKey, 1, section)}>처음</Link>
            <Link prefetch={false} href={adminPageHref(pages, pageKey, list.page - 1, section)}>이전</Link>
          </>
        ) : null}
        {list.page < pageCount && list.page < 100_000 ? (
          <Link prefetch={false} href={adminPageHref(pages, pageKey, list.page + 1, section)}>다음</Link>
        ) : null}
      </div>
    </nav>
  );
}
