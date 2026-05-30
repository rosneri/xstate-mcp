// ---------------------------------------------------------------------------
// xstate-mcp — static machine config inspection
// ---------------------------------------------------------------------------

import type { AnyStateMachine } from "xstate";
import type { EventTransition, MachineInspection, StateNodeInfo } from "./types.js";

// ---------------------------------------------------------------------------
// Raw config shape (machine.config before XState resolves it)
// ---------------------------------------------------------------------------

// Exported so guards.ts can reuse them instead of duplicating.
// Array member is mutable (not readonly) so Array.isArray narrows correctly.

export type RawTransitionObject = {
  readonly target?: string | string[];
  readonly guard?: unknown;
};

export type RawTransitionEntry =
  | string
  | RawTransitionObject
  | (string | RawTransitionObject)[];

export type RawStateConfig = {
  readonly type?: "atomic" | "compound" | "parallel" | "final" | "history";
  readonly initial?: string;
  readonly tags?: readonly string[];
  readonly on?: Record<string, RawTransitionEntry>;
  readonly always?: RawTransitionEntry;
  readonly states?: Record<string, RawStateConfig>;
};

export type RawMachineConfig = {
  readonly id?: string;
  readonly initial?: string;
  readonly on?: Record<string, RawTransitionEntry>;
  readonly states?: Record<string, RawStateConfig>;
};

// ---------------------------------------------------------------------------
// Transition helpers
// ---------------------------------------------------------------------------

function extractTargetsFromObject(obj: RawTransitionObject): string[] {
  if (!obj.target) return [];
  return Array.isArray(obj.target) ? obj.target : [obj.target];
}

export function extractRawTransitionTargets(entry: RawTransitionEntry): string[] {
  if (typeof entry === "string") return [entry];
  if (Array.isArray(entry)) {
    return entry.flatMap((e) => (typeof e === "string" ? [e] : extractTargetsFromObject(e)));
  }
  return extractTargetsFromObject(entry);
}

function hasGuard(entry: RawTransitionEntry): boolean {
  if (typeof entry === "string") return false;
  if (Array.isArray(entry)) {
    return entry.some((e) => typeof e !== "string" && e.guard !== undefined);
  }
  return entry.guard !== undefined;
}

function buildTransition(eventType: string, entry: RawTransitionEntry): EventTransition {
  return {
    type: eventType,
    targets: extractRawTransitionTargets(entry),
    hasGuard: hasGuard(entry),
  };
}

function buildEvents(on: Record<string, RawTransitionEntry> | undefined): EventTransition[] {
  if (!on) return [];
  return Object.entries(on).map(([eventType, entry]) => buildTransition(eventType, entry));
}

// ---------------------------------------------------------------------------
// State tree traversal
// ---------------------------------------------------------------------------

function classifyStateType(config: RawStateConfig): StateNodeInfo["stateType"] {
  if (config.type) return config.type;
  if (config.states) return "compound";
  return "atomic";
}

function buildStateNodeInfo(config: RawStateConfig): StateNodeInfo {
  const children: Record<string, StateNodeInfo> = {};
  if (config.states) {
    for (const [childName, childConfig] of Object.entries(config.states)) {
      children[childName] = buildStateNodeInfo(childConfig);
    }
  }

  const base: Omit<StateNodeInfo, "initial"> = {
    stateType: classifyStateType(config),
    tags: config.tags ?? [],
    events: buildEvents(config.on),
    children,
  };

  if (config.initial !== undefined) {
    return { ...base, initial: config.initial };
  }
  return base;
}

function countStates(nodes: Record<string, StateNodeInfo>): number {
  let count = 0;
  for (const node of Object.values(nodes)) {
    count += 1 + countStates(node.children);
  }
  return count;
}

function collectEventTypes(
  nodes: Record<string, StateNodeInfo>,
  rootEvents: readonly EventTransition[],
): string[] {
  const types = new Set<string>(rootEvents.map((e) => e.type));
  const walk = (nodeMap: Record<string, StateNodeInfo>): void => {
    for (const node of Object.values(nodeMap)) {
      for (const ev of node.events) types.add(ev.type);
      walk(node.children);
    }
  };
  walk(nodes);
  return [...types].sort();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

type InspectMachineInput = {
  readonly name: string;
  readonly description: string;
  readonly machine: AnyStateMachine;
};

function rawConfig(machine: AnyStateMachine): RawMachineConfig {
  return machine.config as RawMachineConfig;
}

export function inspectMachine({ name, description, machine }: InspectMachineInput): MachineInspection {
  const config = rawConfig(machine);
  const states: Record<string, StateNodeInfo> = {};

  if (config.states) {
    for (const [stateName, stateConfig] of Object.entries(config.states)) {
      states[stateName] = buildStateNodeInfo(stateConfig);
    }
  }

  const rootEvents = buildEvents(config.on);
  const machineId = config.id ?? name;
  const initial = config.initial ?? "";
  const totalStateCount = countStates(states);
  const allEventTypes = collectEventTypes(states, rootEvents);

  return { name, description, machineId, initial, rootEvents, states, totalStateCount, allEventTypes };
}

export function findStateNode(
  inspection: MachineInspection,
  dotPath: string,
): StateNodeInfo | null {
  const parts = dotPath.split(".");
  let current: Record<string, StateNodeInfo> = inspection.states;
  let node: StateNodeInfo | undefined;

  for (const part of parts) {
    node = current[part];
    if (!node) return null;
    current = node.children;
  }

  return node ?? null;
}

export function collectAncestorEvents(
  inspection: MachineInspection,
  dotPath: string,
): EventTransition[] {
  const parts = dotPath.split(".");
  const result: EventTransition[] = [...inspection.rootEvents];
  let current: Record<string, StateNodeInfo> = inspection.states;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (part === undefined) break;
    const node = current[part];
    if (!node) break;
    result.push(...node.events);
    current = node.children;
  }

  return result;
}
