import assert from "node:assert/strict";
import { test } from "node:test";
import { adminPageHref, parseAdminPages } from "../app/lib/admin-pagination";

test("administrator pagination validates page parameters before sending them to the API", () => {
  assert.deepEqual(parseAdminPages({
    participantsPage: "2",
    submissionsPage: "100000",
    clearsPage: "999999",
    auditPage: ["1", "2"],
  }), { participantsPage: 2, submissionsPage: 100000, clearsPage: 1, auditPage: 1 });
  for (const value of ["-1", "0", "1.5", "Infinity", "1e2", "1&admin=true", ""]) {
    assert.equal(parseAdminPages({ participantsPage: value }).participantsPage, 1);
  }
});

test("changing one list page preserves other lists and keeps the audit dialog open", () => {
  const pages = parseAdminPages({ participantsPage: "3", submissionsPage: "2", auditPage: "4" });
  assert.equal(adminPageHref(pages, "auditPage", 5, "audit-logs-modal"),
    "/admin/operations?participantsPage=3&submissionsPage=2&auditPage=5#audit-logs-modal");
  assert.equal(adminPageHref(parseAdminPages({}), "participantsPage", 1, "participants"),
    "/admin/operations#participants");
});
