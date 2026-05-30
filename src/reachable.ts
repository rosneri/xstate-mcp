// ---------------------------------------------------------------------------
// xstate-mcp — reachable state analysis and path finding
// ---------------------------------------------------------------------------

import type { MachineInspection, StateNodeInfo, EventTransition } from "./types.js";
import type { ReachableStatesResult, PathResult } from "./types.js";
import { findStateNode, collectAncestorEvents } from "./inspect.js";

// ---------------------------------------------------------------------------
// Target resolution
// ---------------------------------------------------------------------------

function resolveTarget(target: string, parentPath: string): string {
  // Absolute: #machineId.foo.bar or #machineId (root)
  if (target.startsWith("#")) {
    const withoutHash = target.slice(1);
    const dotIdx = withoutHash.indexOf(".");
    if (dotIdx < 0) return ""; // root reference
    return withoutHash.slice(dotIdx + 1);
  }
  // Dot-prefixed: ".login.editing" = root-relative absolute path
  if (target.startsWith(".")) return target.slice(1);
  // Sibling: resolve relative to parent
  if (!parentPath) return target;
  return `${parentPath}.${target}`;
}

function parentOf(dotPath: string): string {
  const idx = dotPath.lastIndexOf(".");
  return idx < 0 ? "" : dotPath.slice(0, idx);
}

// ---------------------------------------------------------------------------
// State graph construction (internal helpers use closure over graph)
// ---------------------------------------------------------------------------

type GraphEdge = {
  readonly eventType: string;
  readonly target: string;
  readonly hasGuard: boolean;
};

type StateGraph = Map<string, readonly GraphEdge[]>;

function nodeEdges(node: StateNodeInfo, nodePath: string): GraphEdge[] {
  const parent = parentOf(nodePath);
  return node.events.flatMap((ev) =>
    ev.targets.length === 0
      ? [{ eventType: ev.type, target: nodePath, hasGuard: ev.hasGuard }]
      : ev.targets.map((t) => ({ eventType: ev.type, target: resolveTarget(t, parent), hasGuard: ev.hasGuard })),
  );
}

function buildFullGraph(inspection: MachineInspection): StateGraph {
  const graph: StateGraph = new Map();

  function addNodes(nodes: Record<string, StateNodeInfo>, parentPath: string): void {
    for (const [name, node] of Object.entries(nodes)) {
      const fullPath = parentPath ? `${parentPath}.${name}` : name;
      graph.set(fullPath, nodeEdges(node, fullPath));
      if (Object.keys(node.children).length > 0) addNodes(node.children, fullPath);
    }
  }

  addNodes(inspection.states, "");
  return graph;
}

function rootEdges(inspection: MachineInspection): GraphEdge[] {
  return inspection.rootEvents.flatMap((ev) =>
    ev.targets.map((t) => ({ eventType: ev.type, target: resolveTarget(t, ""), hasGuard: ev.hasGuard })),
  );
}

// ---------------------------------------------------------------------------
// get_reachable_states
// ---------------------------------------------------------------------------

export function getReachableStates(
  inspection: MachineInspection,
  stateValue: string,
): ReachableStatesResult {
  const node = findStateNode(inspection, stateValue);
  if (!node) {
    throw new Error(
      `State '${stateValue}' not found in machine '${inspection.name}'. Use inspect_machine to see valid state paths.`,
    );
  }

  const parent = parentOf(stateValue);
  const ancestorEvents = collectAncestorEvents(inspection, stateValue);
  const ownEvents = node.events;

  // Deduplicate by event type — child events take precedence over ancestors
  const seen = new Set<string>();
  const deduped: EventTransition[] = [];
  for (const ev of [...ownEvents, ...ancestorEvents]) {
    if (!seen.has(ev.type)) {
      seen.add(ev.type);
      deduped.push(ev);
    }
  }

  const transitions = deduped.map((ev) => ({
    eventType: ev.type,
    resolvedTargets: ev.targets.map((t) => resolveTarget(t, parent)),
    hasGuard: ev.hasGuard,
  }));

  const allReachableStates = [
    ...new Set(transitions.flatMap((t) => t.resolvedTargets).filter(Boolean)),
  ].sort();

  return {
    machineName: inspection.name,
    fromState: stateValue,
    transitions,
    allReachableStates,
  };
}

// ---------------------------------------------------------------------------
// find_path (BFS over static graph)
// ---------------------------------------------------------------------------

type BfsNode = {
  readonly state: string;
  readonly events: readonly string[];
  readonly states: readonly string[];
};

type FindPathInput = {
  readonly inspection: MachineInspection;
  readonly fromState: string;
  readonly toState: string;
};

type MissingArgs = { readonly input: FindPathInput; readonly missing: string; readonly which: "fromState" | "toState" };

function missingStateResult({ input, missing, which }: MissingArgs): PathResult {
  return {
    machineName: input.inspection.name,
    fromState: input.fromState,
    toState: input.toState,
    found: false,
    eventSequence: [],
    stateSequence: [],
    note: `${which} '${missing}' not found in machine. Use inspect_machine to see valid state paths.`,
  };
}

type HasGuardArgs = { readonly result: BfsNode; readonly graph: StateGraph; readonly extras: readonly GraphEdge[] };

function pathHasGuard({ result, graph, extras }: HasGuardArgs): boolean {
  return result.events.some((evType, i) => {
    const src = result.states[i] ?? "";
    return [...(graph.get(src) ?? []), ...extras].some((e) => e.eventType === evType && e.hasGuard);
  });
}

export function findPath({ inspection, fromState, toState }: FindPathInput): PathResult {
  const graph = buildFullGraph(inspection);
  const extras = rootEdges(inspection);

  if (!graph.has(fromState)) return missingStateResult({ input: { inspection, fromState, toState }, missing: fromState, which: "fromState" });
  if (!graph.has(toState)) return missingStateResult({ input: { inspection, fromState, toState }, missing: toState, which: "toState" });

  const visited = new Set<string>([fromState]);
  const queue: BfsNode[] = [{ state: fromState, events: [], states: [fromState] }];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;

    if (current.state === toState) {
      return {
        machineName: inspection.name,
        fromState,
        toState,
        found: true,
        eventSequence: current.events,
        stateSequence: current.states,
        note: pathHasGuard({ result: current, graph, extras })
          ? "Path passes through one or more guarded transitions — guards may block this path at runtime."
          : "",
      };
    }

    for (const edge of [...(graph.get(current.state) ?? []), ...extras]) {
      if (edge.target && !visited.has(edge.target)) {
        visited.add(edge.target);
        queue.push({
          state: edge.target,
          events: [...current.events, edge.eventType],
          states: [...current.states, edge.target],
        });
      }
    }
  }

  return {
    machineName: inspection.name,
    fromState,
    toState,
    found: false,
    eventSequence: [],
    stateSequence: [],
    note: "No path found. The target state may only be reachable via guarded transitions or async actor completions that static analysis cannot follow.",
  };
}
