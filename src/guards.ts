// ---------------------------------------------------------------------------
// xstate-mcp — guard condition extraction (static analysis)
// ---------------------------------------------------------------------------

import type { AnyStateMachine } from "xstate";
import type { GuardInfo, GuardConditionsResult } from "./types.js";
import type { RawTransitionEntry, RawStateConfig, RawMachineConfig } from "./inspect.js";
import { extractRawTransitionTargets } from "./inspect.js";

// ---------------------------------------------------------------------------
// Guard description
// ---------------------------------------------------------------------------

function describeGuardObject(obj: object): string {
  const type = "type" in obj ? obj.type : undefined;
  const guards = "guards" in obj ? obj.guards : undefined;
  const nested = "guard" in obj ? obj.guard : undefined;
  if (typeof type === "string") {
    if (type === "and" && Array.isArray(guards)) return `and(${(guards as unknown[]).map(describeGuard).join(", ")})`;
    if (type === "or" && Array.isArray(guards)) return `or(${(guards as unknown[]).map(describeGuard).join(", ")})`;
    if (type === "not") return `not(${describeGuard(nested)})`;
    return `named: "${type}"`;
  }
  return `unknown object`;
}

function describeGuard(guard: unknown): string {
  if (guard === undefined || guard === null) return "none";
  if (typeof guard === "string") return `named: "${guard}"`;
  if (typeof guard === "function") {
    const fn = guard as { name?: string };
    return fn.name ? `inline function: ${fn.name}` : "inline function (anonymous)";
  }
  if (typeof guard === "object") return describeGuardObject(guard);
  return `unknown (${typeof guard})`;
}

// ---------------------------------------------------------------------------
// Guard collection — returns arrays instead of mutating a results list
// ---------------------------------------------------------------------------

type GuardCtx = { readonly eventType: string; readonly statePath: string };

function processTransitionEntry(entry: RawTransitionEntry, ctx: GuardCtx): GuardInfo[] {
  if (typeof entry === "string") return [];
  if (!Array.isArray(entry)) {
    if (entry.guard === undefined) return [];
    return [{ statePath: ctx.statePath, eventType: ctx.eventType, targets: extractRawTransitionTargets(entry), guardDescription: describeGuard(entry.guard) }];
  }
  const results: GuardInfo[] = [];
  for (const item of entry) {
    if (typeof item === "string") continue;
    if (item.guard === undefined) continue;
    results.push({ statePath: ctx.statePath, eventType: ctx.eventType, targets: extractRawTransitionTargets(item), guardDescription: describeGuard(item.guard) });
  }
  return results;
}

function collectGuardsFrom(on: Record<string, RawTransitionEntry> | undefined, statePath: string): GuardInfo[] {
  if (!on) return [];
  return Object.entries(on).flatMap(([eventType, entry]) => processTransitionEntry(entry, { eventType, statePath }));
}

function walkStates(states: Record<string, RawStateConfig> | undefined, parentPath: string): GuardInfo[] {
  if (!states) return [];
  const results: GuardInfo[] = [];
  for (const [name, config] of Object.entries(states)) {
    const fullPath = parentPath ? `${parentPath}.${name}` : name;
    results.push(...collectGuardsFrom(config.on, fullPath));
    results.push(...walkStates(config.states, fullPath));
  }
  return results;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function rawMachineConfig(machine: AnyStateMachine): RawMachineConfig {
  return machine.config as RawMachineConfig;
}

export function listGuardConditions(machine: AnyStateMachine, machineName: string): GuardConditionsResult {
  const config = rawMachineConfig(machine);
  const guards: GuardInfo[] = [
    ...collectGuardsFrom(config.on, "(root)"),
    ...walkStates(config.states, ""),
  ];

  return {
    machineName,
    totalGuards: guards.length,
    guards,
  };
}
