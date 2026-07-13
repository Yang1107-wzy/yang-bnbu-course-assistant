export const CourseStatus = Object.freeze({
  SELECTABLE: "SELECTABLE",
  WAITLIST_AVAILABLE: "WAITLIST_AVAILABLE",
  WAITING: "WAITING",
  REGISTERED: "REGISTERED",
  TIME_CONFLICT: "TIME_CONFLICT",
  CREDIT_LIMIT: "CREDIT_LIMIT",
  NOT_ELIGIBLE: "NOT_ELIGIBLE",
  FULL_NO_WAITLIST: "FULL_NO_WAITLIST",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  UNKNOWN: "UNKNOWN"
});

export const normalizeText = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const normalizeCourseName = (value) => normalizeText(value).replace(/\s*\(\d{4}\)\s*$/, "").toLowerCase();

const headerKey = (value) => normalizeText(value).toLowerCase();

const mapHeaders = (row) => {
  const map = new Map();
  Array.from(row.cells).forEach((cell, index) => {
    const key = headerKey(cell.textContent);
    if (key.includes("course code") || key.includes("课程编码")) map.set("courseCode", index);
    else if (key.startsWith("course") || key.includes("科目")) map.set("courseName", index);
    else if (key.includes("curriculum") || key.includes("课程类别")) map.set("category", index);
    else if (key.includes("teacher") || key.includes("教师")) map.set("teacher", index);
    else if (key.includes("time") || key.includes("时间")) map.set("schedule", index);
    else if (key.includes("selection") || key.includes("operator") || key.includes("操作")) map.set("action", index);
  });
  return map;
};

const parseJavascriptAction = (element) => {
  if (!element) return null;
  const href = element.getAttribute("href") ?? "";
  const match = href.match(/^javascript:([A-Za-z_$][\w$]*)\(\s*['"]([^'"]+)['"]/);
  if (!match) return null;
  return { element, functionName: match[1], argument: match[2] };
};

const parseAllActions = (row) => Array.from(row.querySelectorAll("a[href]"))
  .map(parseJavascriptAction)
  .filter(Boolean);

const findAction = (row, allowedFunctions) => {
  for (const link of row.querySelectorAll("a[href]")) {
    const action = parseJavascriptAction(link);
    if (action && allowedFunctions.includes(action.functionName)) return action;
  }
  return null;
};

const textAt = (row, headers, key) => {
  const index = headers.get(key);
  return index === undefined || !row.cells[index] ? "" : normalizeText(row.cells[index].textContent);
};

const rowTextContent = (row) => Array.from(row.cells).map((cell) => normalizeText(cell.textContent)).join(" ");

export const parseCourseRows = (document) => {
  const parsed = [];
  for (const table of document.querySelectorAll("table")) {
    const rows = Array.from(table.rows);
    const headerRow = rows.find((row) => {
      const text = headerKey(row.textContent);
      return text.includes("course code") || text.includes("课程编码");
    });
    if (!headerRow) continue;
    const headers = mapHeaders(headerRow);
    for (const row of rows.slice(headerRow.rowIndex + 1)) {
      const courseCode = textAt(row, headers, "courseCode").toUpperCase();
      const courseName = textAt(row, headers, "courseName");
      const section = courseName.match(/\((\d{4})\)/)?.[1] ?? null;
      if (!courseCode || !section) continue;
      const rowText = rowTextContent(row);
      const actions = parseAllActions(row);
      const selectAction = findAction(row, ["selectItem", "selectItemFromWaiting"]);
      const joinWaitingAction = findAction(row, ["joinWaiting"]);
      const wasWaiting = /\bWaiting\b/i.test(rowText) && !/Join Waiting List/i.test(rowText);
      let status = CourseStatus.UNKNOWN;
      if (selectAction) status = CourseStatus.SELECTABLE;
      else if (joinWaitingAction) status = CourseStatus.WAITLIST_AVAILABLE;
      else if (/\bSelected\b/i.test(rowText)) status = CourseStatus.REGISTERED;
      else if (/\bClash\b/i.test(rowText)) status = CourseStatus.TIME_CONFLICT;
      else if (wasWaiting) status = CourseStatus.WAITING;
      parsed.push({
        courseCode,
        courseName,
        section,
        category: textAt(row, headers, "category"),
        teacher: textAt(row, headers, "teacher"),
        scheduleText: textAt(row, headers, "schedule"),
        status,
        wasWaiting,
        selectAction,
        joinWaitingAction,
        searchAction: findAction(row, ["viewElective"]),
        forbiddenActions: actions.filter((action) => ["replaceItem", "dropItem", "exitWaiting"].includes(action.functionName)),
        rowElement: row,
        confidence: status === CourseStatus.UNKNOWN ? 0.5 : 1,
        reasons: status === CourseStatus.UNKNOWN ? ["no-known-action"] : [`status:${status}`]
      });
    }
  }
  return parsed;
};

export const findUniqueCourse = (rows, target) => {
  const expectedName = normalizeCourseName(target.courseName);
  const matches = rows.filter((row) => row.courseCode === target.courseCode.toUpperCase()
    && row.section === target.section
    && (!expectedName || normalizeCourseName(row.courseName) === expectedName));
  return matches.length === 1 ? matches[0] : null;
};

const categoryFromText = (text) => {
  const normalized = normalizeText(text).toUpperCase();
  if (normalized.includes("MAJOR ELECTIVE") || /(^|\s)ME($|\s)/.test(normalized)) return "ME";
  if (/(^|\s)FE($|\s)/.test(normalized)) return "FE";
  return null;
};

const numberAfter = (text, label) => {
  const match = text.match(new RegExp(`${label}\\s*([0-9]+(?:\\.[0-9]+)?)`, "i"));
  return match ? Number(match[1]) : null;
};

const creditsFromIcons = (row) => {
  const values = {};
  for (const image of row.querySelectorAll("img")) {
    const src = (image.getAttribute("src") ?? "").toLowerCase();
    const semantic = `${src} ${image.getAttribute("alt") ?? ""} ${image.getAttribute("title") ?? ""}`.toLowerCase();
    const cellText = normalizeText(image.closest("td")?.textContent);
    const value = Number(cellText.match(/\b\d+(?:\.\d+)?\b/)?.[0]);
    if (!Number.isFinite(value)) continue;
    if (/\/67\.png(?:$|[?#])/.test(src)) values.assigned = value;
    else if (/\/16\.png(?:$|[?#])/.test(src)) values.waiting = value;
    else if (/\/68\.png(?:$|[?#])/.test(src)) values.selected = value;
    else if (/green|selected/.test(semantic)) values.selected = value;
    else if (/yellow|sun|waiting/.test(semantic)) values.waiting = value;
    else if (/blue|assigned/.test(semantic)) values.assigned = value;
  }
  return [values.selected, values.waiting, values.assigned].every(Number.isFinite) ? values : null;
};

export const parseCreditSummaries = (document) => {
  const result = {};
  for (const table of document.querySelectorAll("table")) {
    let currentCategory = null;
    for (const row of table.rows) {
      const text = rowTextContent(row);
      currentCategory = categoryFromText(text) ?? currentCategory;
      if (!currentCategory || !/Status:|Units Selected|Units Waiting|Units Assigned/i.test(text)) continue;
      const iconCredits = creditsFromIcons(row);
      if (iconCredits) {
        result[currentCategory] = iconCredits;
        continue;
      }
      let selected = numberAfter(text, "Units Selected");
      let waiting = numberAfter(text, "Units Waiting");
      let assigned = numberAfter(text, "Units Assigned");
      if ([selected, waiting, assigned].some((value) => value === null)) {
        const values = text.match(/\b\d+(?:\.\d+)?\b/g)?.map(Number) ?? [];
        if (values.length >= 3) [selected, waiting, assigned] = values.slice(-3);
      }
      if ([selected, waiting, assigned].every((value) => Number.isFinite(value))) {
        result[currentCategory] = { selected, waiting, assigned };
      }
    }
  }
  return result;
};

export const detectSessionExpired = (document) => {
  const text = normalizeText(document.body?.textContent).toLowerCase();
  const hasLoginForm = Boolean(document.querySelector('input[type="password"], form[action*="login"]'));
  return hasLoginForm && /session expired|login|sign in|登录/.test(text);
};
