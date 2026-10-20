import type { ServiceDefinition } from "../config/types";
export function createWorkspace(services: ServiceDefinition[]) {
  return {
    selected: services[0]?.id ?? (null as string | null),
    focus: "terminal" as "terminal" | "sidebar" | "dialog",
    collapsed: new Set<string>(),
    select(id: string) {
      this.selected = id;
      this.focus = "terminal";
    },
    toggleRepo(repo: string) {
      if (this.collapsed.has(repo)) this.collapsed.delete(repo);
      else this.collapsed.add(repo);
    },
    setFocus(focus: "terminal" | "sidebar" | "dialog") {
      this.focus = focus;
    },
    canSendInput(id: string) {
      return this.focus === "terminal" && this.selected === id;
    },
    reconcile(definitions: ServiceDefinition[]) {
      if (!definitions.some((d) => d.id === this.selected))
        this.selected = definitions[0]?.id ?? null;
    },
  };
}
