export function normalizeLabelName(label) {
  return label.trim().replace(/^#+\s*/, "").toLocaleLowerCase("tr").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
}
export function displayLabel(label) {
  const normalized = normalizeLabelName(label);
  return normalized ? `#${normalized}` : "#";
}
export function dedupeLabels(labels) {
  const seen = /* @__PURE__ */ new Set();
  const normalizedLabels = [];
  for (const label of labels) {
    const normalized = normalizeLabelName(label);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    normalizedLabels.push(normalized);
  }
  return normalizedLabels;
}
