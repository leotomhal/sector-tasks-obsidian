import { addDaysIso, todayIso } from "./dateUtils";
import { normalizeTaskProject } from "./projects";

export function findWaitingSector(sectors) {
  return sectors.find((s) => s.isWaiting) || sectors.find((s) => s.tag.toLowerCase() === "waiting") || null;
}
export function normalizeReviewSession(raw) {
  if (!raw || typeof raw !== "object") return null;
  const validTypes = ["monthly", "inbox-only", "daily", "weekly"];
  const type = validTypes.includes(raw.type) ? raw.type : null;
  if (!type || !Array.isArray(raw.steps)) return null;
  const steps = [];
  for (const step of raw.steps) {
    if (!step || typeof step !== "object") return null;
    if (step.kind !== "inbox" && step.kind !== "sector" && step.kind !== "waiting" && step.kind !== "date") return null;
    if (!Array.isArray(step.taskIds)) return null;
    const taskIds = step.taskIds.filter((id) => typeof id === "string");
    const doneTasks = Number.isInteger(step.doneTasks) && step.doneTasks >= 0 ? step.doneTasks : 0;
    const totalTasks = Number.isInteger(step.totalTasks) && step.totalTasks >= doneTasks + taskIds.length ? step.totalTasks : doneTasks + taskIds.length;
    steps.push({
      kind: step.kind,
      tag: typeof step.tag === "string" ? step.tag : void 0,
      label: typeof step.label === "string" ? step.label : "",
      taskIds,
      totalTasks,
      doneTasks
    });
  }
  const stepIndex = Number.isInteger(raw.stepIndex) && raw.stepIndex >= 0 ? raw.stepIndex : 0;
  const taskIndex = Number.isInteger(raw.taskIndex) && raw.taskIndex >= 0 ? raw.taskIndex : 0;
  if (steps.length === 0 || stepIndex >= steps.length) return null;
  const completedSteps = Number.isInteger(raw.completedSteps) && raw.completedSteps >= 0 ? raw.completedSteps : 0;
  const totalSteps = Number.isInteger(raw.totalSteps) && raw.totalSteps >= completedSteps + steps.length ? raw.totalSteps : completedSteps + steps.length;
  return { type, totalSteps, completedSteps, steps, stepIndex, taskIndex };
}
export function buildReviewSteps(type, sectors, tasks) {
  const active = tasks.filter((t) => !t.completed);
  const bySector = (tag) => active.filter((t) => {
    const project = normalizeTaskProject(t.project);
    return project && project.toLowerCase() === tag.toLowerCase();
  }).map((t) => t.id);
  const inboxIds = active.filter((t) => !normalizeTaskProject(t.project)).map((t) => t.id);
  const steps = [];
  if (inboxIds.length) {
    steps.push({ kind: "inbox", label: "Inbox", taskIds: inboxIds, totalTasks: inboxIds.length, doneTasks: 0 });
  }
  if (type === "inbox-only") {
    return steps;
  }
  if (type === "daily") {
    const today = todayIso();
    const tomorrow = addDaysIso(1);
    const dueToday = active.filter((t) => t.due === today).map((t) => t.id);
    const dueTomorrowOrOverdue = active.filter((t) => t.due && t.due !== today && t.due <= tomorrow).map((t) => t.id);
    if (dueToday.length) {
      steps.push({ kind: "date", label: "Due today", taskIds: dueToday, totalTasks: dueToday.length, doneTasks: 0 });
    }
    if (dueTomorrowOrOverdue.length) {
      steps.push({
        kind: "date",
        label: "Due tomorrow or overdue",
        taskIds: dueTomorrowOrOverdue,
        totalTasks: dueTomorrowOrOverdue.length,
        doneTasks: 0
      });
    }
    return steps;
  }
  const waitingSector = findWaitingSector(sectors);
  const nonWaiting = sectors.filter((s) => s !== waitingSector);
  let orderedSectors;
  if (type === "monthly") {
    const monthlyOnly = nonWaiting.filter((s) => s.inMonthly && !s.inWeekly);
    const monthlyAndWeekly = nonWaiting.filter((s) => s.inMonthly && s.inWeekly);
    orderedSectors = [...monthlyOnly, ...monthlyAndWeekly];
  } else {
    orderedSectors = nonWaiting.filter((s) => s.inWeekly);
  }
  for (const sector of orderedSectors) {
    const ids = bySector(sector.tag);
    if (ids.length) {
      steps.push({ kind: "sector", tag: sector.tag, label: sector.label, taskIds: ids, totalTasks: ids.length, doneTasks: 0 });
    }
  }
  if (waitingSector) {
    const ids = bySector(waitingSector.tag);
    if (ids.length) {
      steps.push({ kind: "waiting", tag: waitingSector.tag, label: waitingSector.label, taskIds: ids, totalTasks: ids.length, doneTasks: 0 });
    }
  }
  return steps;
}
export function pruneReviewSession(session, tasks) {
  if (!session) return null;
  const validIds = new Set(tasks.filter((t) => !t.completed).map((t) => t.id));
  const steps = [];
  for (let i = session.stepIndex; i < session.steps.length; i++) {
    const original = session.steps[i];
    const fromIndex = i === session.stepIndex ? session.taskIndex : 0;
    const keptIds = original.taskIds.slice(fromIndex).filter((id) => validIds.has(id));
    if (keptIds.length) {
      steps.push({
        ...original,
        taskIds: keptIds,
        doneTasks: (original.doneTasks || 0) + fromIndex
      });
    }
  }
  if (!steps.length) return null;
  return {
    ...session,
    completedSteps: (session.completedSteps || 0) + session.stepIndex,
    steps,
    stepIndex: 0,
    taskIndex: 0
  };
}
export function reviewSectorNeighbors(tag, sectors, type) {
  const waitingSector = findWaitingSector(sectors);
  const nonWaiting = sectors.filter((s) => s !== waitingSector);
  let core;
  if (type === "monthly") {
    const monthlyOnly = nonWaiting.filter((s) => s.inMonthly && !s.inWeekly);
    const monthlyAndWeekly = nonWaiting.filter((s) => s.inMonthly && s.inWeekly);
    core = [...monthlyOnly, ...monthlyAndWeekly];
  } else {
    core = nonWaiting.filter((s) => s.inWeekly);
  }
  const idx = core.findIndex((s) => s.tag.toLowerCase() === tag.toLowerCase());
  if (idx === -1) return { prev: null, next: null };
  return {
    prev: idx > 0 ? core[idx - 1] : null,
    next: idx < core.length - 1 ? core[idx + 1] : null
  };
}
export function reviewTypeLabel(type) {
  if (type === "monthly") return "Monthly Review";
  if (type === "daily") return "Daily Review";
  if (type === "inbox-only") return "Inbox Process";
  return "Weekly Review";
}
