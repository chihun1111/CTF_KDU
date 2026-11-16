import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FlagResultList } from "../app/components/flag-result-list";

test("partial submissions distinguish unsubmitted flags from incorrect flags without relying on color", () => {
  const html = renderToStaticMarkup(createElement(FlagResultList, {
    results: { "FLAG-01": { correct: true }, "FLAG-02": { correct: false } },
  }));
  assert.match(html, /01번<\/span> <strong>일치<\/strong>/);
  assert.match(html, /02번<\/span> <strong>불일치<\/strong>/);
  assert.match(html, /03번<\/span> <strong>미제출<\/strong>/);
  assert.equal((html.match(/class="resultBad"/g) ?? []).length, 1);
  assert.equal((html.match(/class="resultUnsubmitted"/g) ?? []).length, 6);
});

test("a flag matched in a different input slot appears under its actual result number", () => {
  const html = renderToStaticMarkup(createElement(FlagResultList, { results: { "FLAG-08": { correct: true } } }));
  assert.match(html, /01번<\/span> <strong>미제출<\/strong>/);
  assert.match(html, /08번<\/span> <strong>일치<\/strong>/);
});
