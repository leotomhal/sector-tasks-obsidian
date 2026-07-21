export const PRIORITY_COLORS = {
  P1: { name: "Priority 1", color: "#E03E3E", light: "#FBE4E3" },
  P2: { name: "Priority 2", color: "#D9730D", light: "#FAEBDD" },
  P3: { name: "Priority 3", color: "#0C6E99", light: "#DDEBF1" },
  P4: { name: "Priority 4", color: "#878B82", light: "#EBECED" },
  none: {
    name: "Priority",
    color: "var(--belki-muted)",
    light: "transparent"
  }
};
export function getPriorityColor(priority) {
  return PRIORITY_COLORS[priority] || PRIORITY_COLORS.none;
}
export function getPriorityLabel(priority) {
  return getPriorityColor(priority).name;
}
export function getPriorityClass(priority) {
  return `priority-${priority.toLowerCase()}`;
}
