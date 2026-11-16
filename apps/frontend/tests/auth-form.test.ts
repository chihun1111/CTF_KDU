import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { AuthForm } from "../app/components/auth-form";
import { passwordSchema } from "../app/lib/auth-validation";

const router: AppRouterInstance = {
  back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {}, bfcacheId: "test",
};

test("login and registration inputs preserve the accepted ASCII password boundaries", () => {
  const passwords = ["A".repeat(8), "0".repeat(8), "AbCd1234", "a".repeat(128), "0".repeat(128)];
  for (const mode of ["login", "register"] as const) {
    const html = renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: router }, createElement(AuthForm, { mode })));
    const field = html.match(/<input\b[^>]*\bname="password"[^>]*>/)?.[0];
    assert.ok(field, `${mode} password field is rendered`);
    const maximum = field.match(/\bmaxLength="(\d+)"/i)?.[1];
    assert.equal(maximum, "128", "the rendered input uses the documented maximum");
    assert.match(field, /pattern="\[A-Za-z0-9\]\{8,128\}"/);
    for (const password of passwords) {
      assert.equal(passwordSchema.safeParse(password).success, true);
      assert.ok(maximum === undefined || password.length <= Number(maximum),
        `${mode} must not truncate an accepted ${password.length}-unit password`);
    }
  }
});
