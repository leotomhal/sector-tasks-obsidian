"use strict";

// The plugin bundle does `require("obsidian")` at load time and extends a few
// Obsidian base classes. Obsidian isn't installed in CI, so stub the module
// with a Proxy that hands back a throwaway class/function for any symbol the
// bundle touches while loading. Only the pure helpers under __testables are
// exercised here — none of them call into Obsidian.
const Module = require("node:module");
const test = require("node:test");
const assert = require("node:assert/strict");

const obsidianStub = new Proxy(
  {},
  {
    get(cache, prop) {
      if (prop === "normalizePath") return (p) => p;
      if (prop === "setIcon") return () => {};
      if (!(prop in cache)) cache[prop] = class {};
      return cache[prop];
    }
  }
);

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "obsidian") return obsidianStub;
  return originalLoad.call(this, request, parent, isMain);
};
let testables;
try {
  ({ __testables: testables } = require("../main.js"));
} finally {
  Module._load = originalLoad;
}

const {
  parseTaskLine,
  serializeTaskLine,
  ensureTaskMarker,
  ensureSectorInLine,
  parseTasksRecurrence,
  serializeTasksRecurrence,
  normalizeLabelName,
  extractTags
} = testables;

test("__testables are exported", () => {
  assert.equal(typeof parseTaskLine, "function");
  assert.equal(typeof serializeTaskLine, "function");
});

test("parses a basic task line", () => {
  const { task } = parseTaskLine("- [ ] Buy milk #task #01this-week 📅 2026-07-15", "id1", 0);
  assert.equal(task.title, "Buy milk");
  assert.equal(task.project, "01this-week");
  assert.equal(task.due, "2026-07-15");
  assert.equal(task.completed, false);
  assert.equal(task.priority, "none");
  assert.equal(task.id, "id1");
});

test("non-task lines return null", () => {
  assert.equal(parseTaskLine("## A heading", "id", 0), null);
  assert.equal(parseTaskLine("Just some prose", "id", 0), null);
});

test("serialized line contains the marker, sector, due date and id", () => {
  const { task } = parseTaskLine("- [ ] Buy milk #task #01this-week 📅 2026-07-15", "id1", 0);
  const line = serializeTaskLine(task);
  assert.match(line, /#task/);
  assert.match(line, /#01this-week/);
  assert.match(line, /📅 2026-07-15/);
  assert.match(line, /🆔 id1/);
  assert.match(line, /^- \[ \] /);
});

test("priority emoji maps to P1 and round-trips", () => {
  const { task } = parseTaskLine("- [ ] Urgent #task ⏫ 📅 2026-07-15", "id1", 0);
  assert.equal(task.priority, "P1");
  assert.match(serializeTaskLine(task), /⏫/);
});

test("completed task keeps its done date", () => {
  const { task } = parseTaskLine("- [x] Done thing #task ✅ 2026-07-01 🆔 abc", "fallback", 0);
  assert.equal(task.completed, true);
  assert.equal(task.completedDate, "2026-07-01");
  assert.equal(task.id, "abc");
  assert.match(serializeTaskLine(task), /\[x\].*✅ 2026-07-01/);
});

test("existing id is preserved over the fallback", () => {
  const { task } = parseTaskLine("- [ ] Keep id #task 🆔 keepme", "fallback", 0);
  assert.equal(task.id, "keepme");
});

test("foreign tags are preserved as labels, sector/marker are not", () => {
  const { task } = parseTaskLine("- [ ] Tagged #task #01this-week #work #home", "id1", 0);
  assert.deepEqual(task.labels.sort(), ["home", "work"]);
  const line = serializeTaskLine(task);
  assert.match(line, /#work/);
  assert.match(line, /#home/);
});

test("free-text recurrence is preserved verbatim", () => {
  const { task } = parseTaskLine("- [ ] Yearly #task 🔁 every 15 july 📅 2026-07-15", "id1", 0);
  assert.ok(task.repeat);
  assert.match(serializeTaskLine(task), /🔁 every 15 july/);
});

test("parse → serialize → parse is stable (idempotent)", () => {
  const lines = [
    "- [ ] Buy milk #task #01this-week 📅 2026-07-15",
    "- [x] Done #task #02next-week ✅ 2026-07-01 🆔 xyz",
    "- [ ] Repeating #task 🔁 every week 📅 2026-07-20 ⏫ #home",
    "- [ ] Bare task #task"
  ];
  for (const line of lines) {
    const first = parseTaskLine(line, "genid", 3).task;
    const second = parseTaskLine(serializeTaskLine(first), "genid", 3).task;
    assert.deepEqual(second, first, `not stable for: ${line}`);
  }
});

test("ensureTaskMarker adds #task only when missing", () => {
  assert.match(ensureTaskMarker("- [ ] No marker"), /#task/);
  const already = "- [ ] Has marker #task";
  assert.equal(ensureTaskMarker(already), already);
});

test("ensureSectorInLine adds the sector tag after the marker, once", () => {
  const withSector = ensureSectorInLine("- [ ] Task #task", "01this-week");
  assert.match(withSector, /#task #01this-week/);
  // idempotent
  assert.equal(ensureSectorInLine(withSector, "01this-week"), withSector);
  // no-op without a sector
  assert.equal(ensureSectorInLine("- [ ] Task #task", ""), "- [ ] Task #task");
});

test("recurrence parse/serialize for common patterns", () => {
  const cases = [
    ["every day", "daily"],
    ["every 2 weeks on monday", "weekly"],
    ["every month on the 5", "monthly"],
    ["every weekday", "weekdays"]
  ];
  for (const [raw, frequency] of cases) {
    const rule = parseTasksRecurrence(raw);
    assert.equal(rule.frequency, frequency, `frequency for "${raw}"`);
    // raw is preserved on serialize
    assert.equal(serializeTasksRecurrence(rule), raw);
  }
});

test("normalizeLabelName lowercases and slugifies", () => {
  assert.equal(normalizeLabelName("#My Label"), "my-label");
  assert.equal(normalizeLabelName("  spaced  out  "), "spaced-out");
});

test("extractTags finds hashtags", () => {
  assert.deepEqual(extractTags("a #task #01this-week b #work"), ["task", "01this-week", "work"]);
});
