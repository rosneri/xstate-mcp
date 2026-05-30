// ---------------------------------------------------------------------------
// xstate-mcp — Mermaid stateDiagram-v2 export
// ---------------------------------------------------------------------------

import type { MachineInspection, StateNodeInfo } from "./types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mermaidTarget(target: string): string {
  if (target.startsWith("#")) {
    const dotIdx = target.indexOf(".");
    return dotIdx >= 0 ? target.slice(dotIdx + 1).replace(/\./g, "_") : "[*]";
  }
  return target.startsWith(".") ? target.slice(1).replace(/\./g, "_") : target.replace(/\./g, "_");
}

function mermaidId(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, "_");
}

// ---------------------------------------------------------------------------
// Recursive scope generator (closes over lines array to avoid passing it)
// ---------------------------------------------------------------------------

function generateScope(nodes: Record<string, StateNodeInfo>, indent: number): string[] {
  const lines: string[] = [];
  const pad = " ".repeat(indent);

  for (const [name, node] of Object.entries(nodes)) {
    const localId = mermaidId(name);
    const hasChildren = Object.keys(node.children).length > 0;

    if (hasChildren) {
      lines.push(`${pad}state ${localId} {`);
      if (node.initial) lines.push(`${pad}  [*] --> ${mermaidId(node.initial)}`);
      lines.push(...generateScope(node.children, indent + 2));
      lines.push(`${pad}}`);
    }

    if (node.stateType === "final") {
      lines.push(`${pad}${localId} --> [*]`);
    }

    for (const ev of node.events) {
      for (const target of ev.targets) {
        const guard = ev.hasGuard ? " [guard]" : "";
        lines.push(`${pad}${localId} --> ${mermaidTarget(target)}: ${ev.type}${guard}`);
      }
    }
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function exportStateDiagram(inspection: MachineInspection): string {
  const lines: string[] = ["stateDiagram-v2"];

  if (inspection.initial) {
    lines.push(`  [*] --> ${mermaidId(inspection.initial)}`);
  }

  if (inspection.rootEvents.length > 0) {
    const types = inspection.rootEvents.map((e) => e.type).join(", ");
    lines.push(`  %% Root events (available in all states): ${types}`);
  }

  lines.push(...generateScope(inspection.states, 2));

  return lines.join("\n");
}
