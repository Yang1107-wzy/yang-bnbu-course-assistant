import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

import { detectPageType, findCategoryDetailLinks, parseWaitlistCount } from "../src/course_page_adapter.js";

const fixture = async (name, url) => {
  const html = await readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
  return new JSDOM(html, { url });
};

test("detects overview and detail pages from exact MIS paths", async () => {
  const overview = await fixture("overview.html", "https://mis.bnbu.edu.cn/mis/student/es/elective.do");
  const detail = await fixture("selectable.html", "https://mis.bnbu.edu.cn/mis/student/es/eleDetail.do?id=x");
  assert.equal(detectPageType(overview.window.location), "OVERVIEW");
  assert.equal(detectPageType(detail.window.location), "DETAIL");
  assert.equal(detectPageType(new URL("https://mis.bnbu.edu.cn/mis/home.do")), "UNKNOWN");
});

test("discovers ME and FE detail URLs without hardcoding category ids", async () => {
  const dom = await fixture("overview.html", "https://mis.bnbu.edu.cn/mis/student/es/elective.do");
  const links = findCategoryDetailLinks(dom.window.document, dom.window.location);
  assert.equal(links.ME, "https://mis.bnbu.edu.cn/mis/student/es/eleDetail.do?id=me-category");
  assert.equal(links.FE, "https://mis.bnbu.edu.cn/mis/student/es/eleDetail.do?id=fe-category");
});

test("parses a visible waitlist count and rejects ambiguous text", async () => {
  const dom = await fixture("waitlist_overlay.html", "https://mis.bnbu.edu.cn/mis/student/es/eleDetail.do?id=x");
  assert.equal(parseWaitlistCount(dom.window.document), 4);
  dom.window.document.querySelector("#viewDialogBody").textContent = "Waiting queue unavailable";
  assert.equal(parseWaitlistCount(dom.window.document), null);
});
