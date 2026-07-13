// ==UserScript==
// @name         Yang 抢课脚本 DOM Diagnostic (Read Only)
// @namespace    https://github.com/Yang1107-wzy/yang-bnbu-course-assistant
// @version      1.1.0
// @description  Read-only DOM capture helper for Yang 抢课脚本
// @match        https://mis.bnbu.edu.cn/mis/student/es/elective.do*
// @match        https://mis.bnbu.edu.cn/mis/student/es/eleDetail.do*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  "use strict";
  const targets = [["AI3133", "1001"], ["COMP4213", "1001"], ["EBIS3113", "1002"]];
  const safeText = (value) => String(value ?? "")
    .replace(/\b\d{9,12}\b/g, "[REDACTED_ID]")
    .replace(/(student\s*id|name)\s*:\s*[^|\n]+/gi, "$1:[REDACTED]")
    .replace(/\s+/g, " ")
    .trim();
  const actionName = (href) => href?.match(/^javascript:([A-Za-z_$][\w$]*)\(/)?.[1] ?? null;
  const rows = Array.from(document.querySelectorAll("tr")).map((row) => {
    const text = safeText(row.textContent);
    const target = targets.find(([code, section]) => text.includes(code) && text.includes(`(${section})`));
    if (!target) return null;
    return {
      courseCode: target[0],
      section: target[1],
      text,
      actions: Array.from(row.querySelectorAll("a[href^='javascript:']"))
        .map((link) => actionName(link.getAttribute("href")))
        .filter(Boolean)
    };
  }).filter(Boolean);
  const report = {
    capturedAt: new Date().toISOString(),
    path: location.pathname,
    title: safeText(document.title),
    targets: rows,
    tableCount: document.querySelectorAll("table").length
  };
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = `Yang 只读诊断：${rows.length}/3`;
  Object.assign(button.style, {
    position: "fixed", left: "18px", bottom: "18px", zIndex: "2147483647",
    padding: "10px 14px", border: "0", borderRadius: "10px", color: "white",
    background: "#1957a6", cursor: "pointer", fontWeight: "700"
  });
  button.addEventListener("click", async () => {
    const json = JSON.stringify(report, null, 2);
    console.info("[Yang DOM Diagnostic]", report);
    try {
      await navigator.clipboard.writeText(json);
      button.textContent = "诊断 JSON 已复制（无任何选课动作）";
    } catch {
      window.prompt("复制只读诊断 JSON", json);
    }
  });
  document.body.append(button);
})();
