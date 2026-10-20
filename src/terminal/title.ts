export function workspaceTitle(name: string | null) {
  // Titles are terminal control payloads; do not permit control characters.
  const clean = Array.from((name ?? "").replace(/\p{Cc}/gu, "").trim())
    .slice(0, 80)
    .join("");
  return clean ? `crew · ${clean}` : "crew";
}
