import { normalizeText } from "./course_parser.js";

export const detectPageType = (locationLike) => {
  const path = locationLike.pathname;
  if (path === "/mis/student/es/elective.do") return "OVERVIEW";
  if (path === "/mis/student/es/eleDetail.do") return "DETAIL";
  return "UNKNOWN";
};

const rowText = (row) => Array.from(row.cells ?? []).map((cell) => normalizeText(cell.textContent)).join(" ");

const detectCategory = (text) => {
  const normalized = normalizeText(text).toUpperCase();
  if (normalized.includes("MAJOR ELECTIVE") || /(^|\s)ME($|\s)/.test(normalized)) return "ME";
  if (/(^|\s)FE($|\s)/.test(normalized)) return "FE";
  return null;
};

export const findCategoryDetailLinks = (document, locationLike) => {
  const result = {};
  for (const table of document.querySelectorAll("table")) {
    let currentCategory = null;
    for (const row of table.rows) {
      currentCategory = detectCategory(rowText(row)) ?? currentCategory;
      if (!currentCategory) continue;
      const candidates = Array.from(row.querySelectorAll('a[href*="eleDetail.do"]'));
      if (candidates.length !== 1) continue;
      result[currentCategory] = new URL(candidates[0].getAttribute("href"), locationLike.href).href;
    }
  }
  return result;
};

export const parseWaitlistCount = (document) => {
  const container = document.querySelector("#viewDialogBody, [data-waitlist-dialog]");
  if (!container) return null;
  const candidates = [];
  for (const row of container.querySelectorAll("tr")) {
    const cells = Array.from(row.cells).map((cell) => normalizeText(cell.textContent));
    if (!cells.some((text) => /wait|queue|轮候|排队/i.test(text))) continue;
    const numbers = cells.flatMap((text) => text.match(/\b\d+\b/g) ?? []).map(Number);
    if (numbers.length === 1) candidates.push(numbers[0]);
  }
  if (candidates.length === 1) return candidates[0];
  const text = normalizeText(container.textContent);
  const fallback = text.match(/(?:wait(?:ing)?(?: list)?|queue|轮候|排队)[^0-9]{0,40}(\d+)/i);
  return fallback ? Number(fallback[1]) : null;
};
