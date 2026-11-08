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
  extractTags,
  completionUndoPatch,
  reconcileWaitingSince,
  reconcileSectorSince,
  stuckWeeks,
  stripListMarker,
  formFromRule,
  ruleFromForm,
  ordinal,
  TaskStore,
  entriesForYear,
  upcomingEntries,
  isMissedMilestone,
  buildReviewSummary,
  snapshotForReview,
  snapshotDeletion,
  reinsertDeletedTask,
  parseChangelog,
  compareVersions,
  releaseNotesSince
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

// The undo patch has to cover exactly the fields toggleComplete writes, or an
// undone completion leaves part of the change behind.
test("completionUndoPatch captures every field a completion changes", () => {
  const { task } = parseTaskLine("- [ ] Water plants #task 📅 2026-07-15 🔁 every week", "id1", 0);
  const patch = completionUndoPatch(task);
  assert.deepEqual(Object.keys(patch).sort(), [
    "completed",
    "completedDate",
    "completedOccurrences",
    "due",
    "repeat",
    "scheduled",
    "start",
    "status"
  ]);
  assert.equal(patch.completed, false);
  assert.equal(patch.completedDate, undefined);
  assert.equal(patch.due, "2026-07-15");
  assert.equal(patch.repeat.frequency, "weekly");
});

test("completionUndoPatch copies repeat and occurrences instead of sharing them", () => {
  const { task } = parseTaskLine("- [ ] Water plants #task 🔁 every week", "id1", 0);
  task.completedOccurrences = ["2026-07-01"];
  const patch = completionUndoPatch(task);
  patch.completedOccurrences.push("2026-07-08");
  patch.repeat.frequency = "daily";
  assert.deepEqual(task.completedOccurrences, ["2026-07-01"]);
  assert.equal(task.repeat.frequency, "weekly");
});

// Undo for a deleted task has to put the line back where it was, or the task
// silently moves under a different heading in the user's file.
function deletionFixture() {
  const lines = [
    "# Tasks",
    "## Work",
    "- [ ] A #task",
    "- [ ] B #task",
    "## Home",
    "- [ ] C #task"
  ];
  const tasks = [];
  const blocks = lines.map((line, i) => {
    const parsed = parseTaskLine(line, "id" + i, tasks.length);
    if (!parsed) return { type: "raw", line };
    tasks.push(parsed.task);
    return { type: "task", taskId: parsed.task.id };
  });
  return { blocks, tasks };
}
function deleteFrom(state, id) {
  return {
    blocks: state.blocks.filter((b) => b.taskId !== id),
    tasks: state.tasks.filter((t) => t.id !== id)
  };
}
const ids = (blocks) => blocks.map((b) => b.taskId || b.line);

test("undoing a delete restores the exact position when the file is unchanged", () => {
  const before = deletionFixture();
  const snap = snapshotDeletion(before.blocks, before.tasks, "id3"); // B
  const restored = reinsertDeletedTask(deleteFrom(before, "id3").blocks, deleteFrom(before, "id3").tasks, snap);
  assert.deepEqual(ids(restored.blocks), ids(before.blocks));
  assert.deepEqual(restored.tasks.map((t) => t.id), before.tasks.map((t) => t.id));
  assert.deepEqual(restored.tasks.map((t) => t.order), [0, 1, 2]);
});

test("undoing a delete keeps the task under its heading after lines were added above", () => {
  const before = deletionFixture();
  const snap = snapshotDeletion(before.blocks, before.tasks, "id5"); // C, under "## Home"
  const after = deleteFrom(before, "id5");
  after.blocks.unshift({ type: "raw", line: "" }, { type: "raw", line: "Notes" });
  const restored = reinsertDeletedTask(after.blocks, after.tasks, snap);
  const order = ids(restored.blocks);
  assert.equal(order[order.indexOf("## Home") + 1], "id5");
});

test("undoing a delete of the first line puts it back at the top", () => {
  const before = deletionFixture();
  before.blocks.shift(); // make the task list start with "## Work"
  before.blocks.unshift({ type: "task", taskId: before.tasks[0].id });
  before.blocks.splice(before.blocks.findIndex((b, i) => i > 0 && b.taskId === before.tasks[0].id), 1);
  const firstId = before.blocks[0].taskId;
  const snap = snapshotDeletion(before.blocks, before.tasks, firstId);
  assert.equal(snap.prevBlock, null);
  const after = deleteFrom(before, firstId);
  const restored = reinsertDeletedTask(after.blocks, after.tasks, snap);
  assert.equal(restored.blocks[0].taskId, firstId);
});

// Release notes after an update come from the bundled CHANGELOG.md.
const fs = require("node:fs");
const path = require("node:path");

test("compareVersions orders numerically, not as text", () => {
  assert.ok(compareVersions("1.3.10", "1.3.9") > 0);
  assert.ok(compareVersions("1.4.0", "1.3.13") > 0);
  assert.equal(compareVersions("1.3.13", "1.3.13"), 0);
});

test("parseChangelog finds every version in the real CHANGELOG.md", () => {
  const md = fs.readFileSync(path.join(__dirname, "..", "CHANGELOG.md"), "utf8");
  const entries = parseChangelog(md);
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8"));
  assert.equal(entries[0].version, manifest.version, "the newest changelog entry matches manifest.json");
  assert.ok(entries.every((e) => e.body.length > 0), "no empty entries");
  assert.ok(!/^## \d/m.test(entries[0].body), "an entry's body stops at the next version heading");
});

test("releaseNotesSince shows every skipped version, newest first", () => {
  const entries = parseChangelog("## 1.3.13\n- c\n## 1.3.12\n- b\n## 1.3.11\n- a\n## 1.3.10\n- old");
  assert.deepEqual(releaseNotesSince(entries, "1.3.10", "1.3.13").map((e) => e.version), ["1.3.13", "1.3.12", "1.3.11"]);
  assert.deepEqual(releaseNotesSince(entries, "1.3.12", "1.3.13").map((e) => e.version), ["1.3.13"]);
  assert.deepEqual(releaseNotesSince(entries, "", "1.3.13").map((e) => e.version), ["1.3.13"], "unknown previous version: only the current one");
  assert.deepEqual(releaseNotesSince(entries, "1.3.13", "1.3.13"), [], "nothing new");
});

test("scheduled, start and cancelled dates survive a save", () => {
  const line = "- [ ] Plan trip #task #01this-week ➕ 2026-07-01 🛫 2026-07-10 ⏳ 2026-07-12 📅 2026-07-15 🆔 abc";
  const { task } = parseTaskLine(line, "x", 0);
  assert.equal(task.scheduled, "2026-07-12");
  assert.equal(task.start, "2026-07-10");
  assert.equal(task.title, "Plan trip");
  assert.equal(serializeTaskLine(task), line);
  const cancelled = parseTaskLine("- [-] Dropped #task ❌ 2026-07-03 🆔 c1", "x", 0).task;
  assert.equal(serializeTaskLine(cancelled), "- [-] Dropped #task ❌ 2026-07-03 🆔 c1");
});

test("in-progress and cancelled status are written back, completing wins", () => {
  const { task } = parseTaskLine("- [/] Writing #task 🆔 w1", "x", 0);
  assert.equal(task.completed, false);
  assert.match(serializeTaskLine(task), /^- \[\/\] /);
  assert.match(serializeTaskLine({ ...task, completed: true, completedDate: "2026-07-04" }), /^- \[x\] /);
  assert.equal(completionUndoPatch(task).status, "/", "undo restores the in-progress status");
});

test("waiting since: new waiting tasks start today, leavers are dropped", () => {
  const t = (line) => parseTaskLine(line, "x", 0).task;
  const tasks = [
    t("- [ ] Reply from Anna #task #waiting ➕ 2026-10-01 🆔 a"),
    t("- [ ] Quote #task #waiting 🆔 b"),
    t("- [ ] Not waiting #task #01this-week 🆔 c"),
    t("- [x] Done waiting #task #waiting ✅ 2026-11-01 🆔 d")
  ];
  const first = reconcileWaitingSince({}, tasks, "waiting", "2026-11-04", true);
  assert.deepEqual(first, { a: "2026-10-01", b: "2026-11-04" }, "first run seeds from ➕ created, else today");
  assert.equal(reconcileWaitingSince(first, tasks, "waiting", "2026-11-05", false), null, "nothing changes on later days");
  const moved = reconcileWaitingSince(first, tasks.slice(1), "waiting", "2026-11-05", false);
  assert.deepEqual(moved, { b: "2026-11-04" }, "a task that left the sector loses its date");
  const later = reconcileWaitingSince({}, tasks, "waiting", "2026-11-04", false);
  assert.equal(later.a, "2026-11-04", "after the first run, a task entering waiting starts today, not at its created date");
  assert.equal(reconcileWaitingSince(first, [], "waiting", "2026-11-05", false), null, "an empty file never wipes the record");
});

test("review summary lists done, moved, deleted, new and waiting tasks", () => {
  const t = (line) => parseTaskLine(line, "x", 0).task;
  const sectors = [
    { tag: "01this-week", label: "This week" },
    { tag: "02next-week", label: "Next week" },
    { tag: "waiting", label: "Waiting", isWaiting: true }
  ];
  const before = [
    t("- [ ] Slides #task #01this-week 🆔 s"),
    t("- [ ] Old idea #task #02next-week 🆔 o"),
    t("- [ ] Reply from Anna #task #waiting 🆔 a")
  ];
  const snapshot = snapshotForReview(before);
  const after = [
    t("- [ ] Slides #task #02next-week 🆔 s"),
    t("- [ ] Reply from Anna #task #waiting 🆔 a"),
    t("- [x] Budget #task #01this-week ✅ 2026-11-03 🆔 b"),
    t("- [ ] Call Ben #task ➕ 2026-11-02 📅 2026-11-01 🆔 c")
  ];
  const md = buildReviewSummary({
    type: "weekly", periodKey: "2026-W45", today: "2026-11-04", tasks: after, sectors, snapshot,
    waitingSince: { a: "2026-10-23" }
  });
  assert.match(md, /^---\ntype: weekly-review\ndate: 2026-11-04\nperiod: 2026-W45\n---\n# Weekly review 2026-W45/);
  assert.match(md, /## Done recently \(1\)\n- Budget · This week/);
  assert.match(md, /## Moved during the review \(1\)\n- Slides: This week → Next week/);
  assert.match(md, /## Deleted during the review \(1\)\n- Old idea/);
  assert.match(md, /## New recently \(1\)\n- Call Ben · Inbox/);
  assert.match(md, /## Waiting \(1\)\n- Reply from Anna · waiting 12 days/);
  assert.match(md, /\| Inbox \| 1 \| 1 \|/);
  assert.ok(!/- \[[ x]\]/.test(md), "no checkbox lines that Tasks queries would pick up");
});

test("planning entries: parsed apart from tasks, written back unchanged", () => {
  const line = "- [ ] Senat und Hauptausschuss #task #planning 🛫 2026-09-16 📅 2026-09-17 🆔 p1";
  const { task } = parseTaskLine(line, "x", 0);
  assert.equal(task.planning, true);
  assert.equal(task.milestone, undefined);
  assert.equal(task.project, undefined);
  assert.deepEqual(task.labels, []);
  assert.equal(serializeTaskLine(task), line);
  const ms = parseTaskLine("- [x] Jahresbericht freigegeben #task #planning #milestone 📅 2026-02-20 ✅ 2026-02-19 🆔 m1", "x", 0).task;
  assert.equal(ms.milestone, true);
  assert.equal(serializeTaskLine(ms), "- [x] Jahresbericht freigegeben #task #planning #milestone 📅 2026-02-20 ✅ 2026-02-19 🆔 m1");
  const plain = parseTaskLine("- [ ] Ship v2 #task #milestone 🆔 t1", "x", 0).task;
  assert.equal(plain.planning, undefined);
  assert.deepEqual(plain.labels, ["milestone"], "#milestone on an ordinary task stays a label");
});

test("planning entries go under ## Planning in date order; tasks stay above it", () => {
  const store = new TaskStore({}, { tasksFilePath: "Tasks.md" });
  const content = [
    "# Tasks",
    "- [ ] Write report #task #01this-week 🆔 a",
    "",
    "## Planning",
    "- [ ] Spring #task #planning 📅 2026-03-01 🆔 p1",
    "- [ ] Autumn #task #planning 📅 2026-10-01 🆔 p2"
  ].join("\n");
  const parsed = store.parseContent(content);
  store.fileModel = { blocks: parsed.blocks };
  store.tasks = parsed.tasks;
  const add = (line) => {
    const task = parseTaskLine(line, "n" + store.tasks.length, store.tasks.length).task;
    store.tasks.push(task);
    store.insertTaskBlock(task);
  };
  add("- [ ] Summer #task #planning 📅 2026-07-01 🆔 p3");
  add("- [ ] Call Ben #task 🆔 b");
  const ids = store.fileModel.blocks.map((b) => b.type === "task" ? b.taskId : JSON.stringify(b.line));
  assert.deepEqual(ids, ['"# Tasks"', "a", "b", '""', '"## Planning"', "p1", "p3", "p2"]);
  assert.deepEqual(store.getTasks().map((t) => t.id), ["a", "b"], "getTasks never returns planning entries");
  assert.deepEqual(store.getPlanningEntries().map((t) => t.id).sort(), ["p1", "p2", "p3"]);
});

test("the Planning heading is created at the end on first use", () => {
  const store = new TaskStore({}, { tasksFilePath: "Tasks.md" });
  const parsed = store.parseContent("- [ ] Task #task 🆔 a");
  store.fileModel = { blocks: parsed.blocks };
  store.tasks = parsed.tasks;
  const entry = parseTaskLine("- [ ] Kickoff #task #planning 📅 2027-01-10 🆔 k", "k", 1).task;
  store.tasks.push(entry);
  store.insertTaskBlock(entry);
  assert.deepEqual(store.fileModel.blocks.map((b) => b.taskId || b.line), ["a", "", "## Planning", "k"]);
});

test("year plan helpers: year, upcoming window, missed milestones", () => {
  const t = (line) => parseTaskLine(line, "x", 0).task;
  const entries = [
    t("- [ ] New year #task #planning 📅 2027-01-02 🆔 a"),
    t("- [ ] Fair #task #planning 🛫 2026-12-30 📅 2027-01-01 🆔 b"),
    t("- [ ] Brochure #task #planning #milestone 📅 2026-06-30 🆔 c"),
    t("- [ ] Senat #task #planning 🛫 2026-11-03 📅 2026-11-05 🆔 d")
  ];
  assert.deepEqual(entriesForYear(entries, 2027).map((e) => e.id), ["b", "a"], "an entry spanning new year shows in both years");
  assert.deepEqual(entriesForYear(entries, 2026).map((e) => e.id), ["c", "d", "b"]);
  assert.deepEqual(upcomingEntries(entries, "2026-11-04", 7).map((e) => e.id), ["d"], "running entries count as upcoming");
  assert.equal(isMissedMilestone(entries[2], "2026-11-04"), true);
  assert.equal(isMissedMilestone({ ...entries[2], completed: true }, "2026-11-04"), false);
});

test("editor recurrence: form ↔ rule round-trips through the Tasks text", () => {
  const cases = [
    ["- [ ] A #task 🔁 every week on monday 📅 2026-11-09", "every week on monday"],
    ["- [ ] B #task 🔁 every 2 weeks on friday when done 📅 2026-11-13", "every 2 weeks on friday when done"],
    ["- [ ] C #task 🔁 every month on the 1st 📅 2026-12-01", "every month on the 1st"],
    ["- [ ] D #task 🔁 every weekday 📅 2026-11-05", "every weekday"],
    ["- [ ] E #task 🔁 every 3 days 📅 2026-11-05", "every 3 days"]
  ];
  for (const [line, text] of cases) {
    const task = parseTaskLine(line, "x", 0).task;
    const rebuilt = ruleFromForm(formFromRule(task.repeat, task.due));
    assert.equal(serializeTasksRecurrence(rebuilt), text, line);
    assert.deepEqual(parseTasksRecurrence(serializeTasksRecurrence(rebuilt)).frequency, task.repeat.frequency);
  }
  assert.equal(ruleFromForm({ frequency: "none", interval: 1, weekday: 1, dayOfMonth: 1, whenDone: false }), undefined);
  const fresh = formFromRule(undefined, "2026-11-04");
  assert.equal(fresh.weekday, 3, "a new weekly rule defaults to the due date's weekday (Wednesday)");
  assert.equal(fresh.dayOfMonth, 4);
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(ordinal), ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "31st"]);
});

test("month and quarter planning entries: tag, period start, and no day", () => {
  const month = parseTaskLine("- [ ] CCE startet #task #planning/month 📅 2026-01-20 🆔 c", "x", 0).task;
  assert.equal(month.planning, true);
  assert.equal(month.precision, "month");
  assert.equal(month.due, "2026-01-01", "the date snaps to the month's first day");
  assert.deepEqual(month.labels, [], "#planning/month is not a label");
  assert.equal(serializeTaskLine(month), "- [ ] CCE startet #task #planning/month 📅 2026-01-01 🆔 c");
  const quarter = parseTaskLine("- [ ] Strategy #task #planning/quarter #milestone 🛫 2026-04-02 📅 2026-05-20 🆔 q", "x", 0).task;
  assert.equal(quarter.precision, "quarter");
  assert.equal(quarter.due, "2026-04-01");
  assert.equal(quarter.start, undefined, "a period entry has no start day");
  assert.equal(serializeTaskLine(quarter), "- [ ] Strategy #task #planning/quarter #milestone 📅 2026-04-01 🆔 q");
  const other = parseTaskLine("- [ ] Note #task #planning/notes 🆔 n", "x", 0).task;
  assert.equal(other.planning, undefined, "only month and quarter are planning precisions");
  assert.deepEqual(other.labels, ["planning/notes"]);
});

test("period entries are past only after their period, and stay out of day strips", () => {
  const t = (line) => parseTaskLine(line, "x", 0).task;
  const entries = [
    t("- [ ] Spring push #task #planning/quarter #milestone 📅 2026-04-01 🆔 q"),
    t("- [ ] November thing #task #planning/month 📅 2026-11-01 🆔 m"),
    t("- [ ] Senat #task #planning 📅 2026-11-06 🆔 d")
  ];
  assert.equal(isMissedMilestone(entries[0], "2026-06-30"), false, "Q2 isn't over on 30 June");
  assert.equal(isMissedMilestone(entries[0], "2026-07-01"), true);
  assert.deepEqual(upcomingEntries(entries, "2026-11-04", 7).map((e) => e.id), ["d"], "Today/Upcoming strips skip month/quarter entries");
  assert.deepEqual(upcomingEntries(entries, "2026-11-04", 366, true).map((e) => e.id), ["m", "d"], "the Overview list includes a running month");
  assert.deepEqual(entriesForYear(entries, 2026).map((e) => e.id), ["q", "m", "d"], "a month entry sorts before the days of its month");
});

test("lines with non-breaking spaces (copied on a phone) are still read", () => {
  const nb = "\u00a0";
  for (const line of [
    `- [${nb}] Fair #task #planning 📅 2026-11-20`,
    `-${nb}[ ] Fair #task #planning 📅 2026-11-20`,
    `-${nb}[${nb}]${nb}Fair${nb}#task${nb}#planning${nb}📅${nb}2026-11-20`
  ]) {
    const parsed = parseTaskLine(line, "x", 0);
    assert.ok(parsed, JSON.stringify(line));
    assert.equal(parsed.task.planning, true);
    assert.equal(parsed.task.due, "2026-11-20");
    assert.equal(parsed.task.title, "Fair");
    assert.equal(parsed.task.completed, false);
    assert.match(serializeTaskLine(parsed.task), /^- \[ \] Fair #task #planning 📅 2026-11-20 🆔 /, "written back with plain spaces");
  }
});

test("sector stays: new and moved tasks restart, others keep their date", () => {
  const t = (line) => parseTaskLine(line, "x", 0).task;
  const tasks = [t("- [ ] Report #task #01this-week 🆔 a"), t("- [ ] Idea #task #05longterm 🆔 b"), t("- [ ] Inbox item #task 🆔 c")];
  const first = reconcileSectorSince({}, tasks, "2026-11-01");
  assert.deepEqual(first, { a: { sector: "01this-week", since: "2026-11-01" }, b: { sector: "05longterm", since: "2026-11-01" } }, "Inbox tasks have no sector and aren't tracked");
  assert.equal(reconcileSectorSince(first, tasks, "2026-11-08"), null, "nothing changes while tasks stay put");
  const moved = [t("- [ ] Report #task #02next-week 🆔 a"), tasks[1]];
  assert.deepEqual(reconcileSectorSince(first, moved, "2026-11-08").a, { sector: "02next-week", since: "2026-11-08" }, "a move restarts the clock");
  assert.equal(reconcileSectorSince(first, [], "2026-11-08"), null, "an empty file never wipes the record");
});

test("stuck weeks: only weekly-review sectors, not recurring, from the threshold on", () => {
  const t = (line) => parseTaskLine(line, "x", 0).task;
  const sectors = [
    { tag: "01this-week", label: "This week", inWeekly: true },
    { tag: "05longterm", label: "Long term", inWeekly: false },
    { tag: "waiting", label: "Waiting", isWaiting: true, inWeekly: true }
  ];
  const report = t("- [ ] Report #task #01this-week 🆔 a");
  const stay = { sector: "01this-week", since: "2026-10-01" };
  assert.equal(stuckWeeks(report, stay, sectors, "2026-10-21", 3), 0, "2 weeks and 6 days is not 3 weeks");
  assert.equal(stuckWeeks(report, stay, sectors, "2026-10-22", 3), 3);
  assert.equal(stuckWeeks(report, stay, sectors, "2026-10-22", 0), 0, "0 turns it off");
  const idea = t("- [ ] Idea #task #05longterm 🆔 b");
  assert.equal(stuckWeeks(idea, { sector: "05longterm", since: "2026-01-01" }, sectors, "2026-10-22", 3), 0, "long term isn't in the weekly review");
  const routine = t("- [ ] Water plants #task #01this-week 🔁 every week 📅 2026-10-23 🆔 r");
  assert.equal(stuckWeeks(routine, stay, sectors, "2026-10-22", 3), 0, "recurring tasks never count");
  const waiting = t("- [ ] Reply #task #waiting 🆔 w");
  assert.equal(stuckWeeks(waiting, { sector: "waiting", since: "2026-01-01" }, sectors, "2026-10-22", 3), 0, "the waiting sector has its own age");
});

test("review summary lists tasks still stuck after the review", () => {
  const t = (line) => parseTaskLine(line, "x", 0).task;
  const sectors = [{ tag: "01this-week", label: "This week", inWeekly: true }];
  const tasks = [t("- [ ] Report #task #01this-week 🆔 a"), t("- [ ] Fresh #task #01this-week 🆔 b")];
  const md = buildReviewSummary({
    type: "weekly", periodKey: "2026-W45", today: "2026-11-07", tasks, sectors, snapshot: {}, waitingSince: {},
    sectorSince: { a: { sector: "01this-week", since: "2026-10-10" }, b: { sector: "01this-week", since: "2026-11-05" } },
    stuckThresholdWeeks: 3
  });
  assert.match(md, /## Stuck \(1\)\n- Report · 4 weeks in This week/);
});

test("pasted list lines lose their list markers", () => {
  assert.equal(stripListMarker("- Buy milk"), "Buy milk");
  assert.equal(stripListMarker("  * Call Ben #work"), "Call Ben #work");
  assert.equal(stripListMarker("3. Draft agenda"), "Draft agenda");
  assert.equal(stripListMarker("2) Book room"), "Book room");
  assert.equal(stripListMarker("- [ ] Send slides 📅 2026-11-10"), "Send slides 📅 2026-11-10");
  assert.equal(stripListMarker("Plain line"), "Plain line");
  assert.equal(stripListMarker("-3 degrees tomorrow"), "-3 degrees tomorrow", "a dash without a space is text");
});
