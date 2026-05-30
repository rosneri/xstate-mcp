import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { AnyStateMachine } from "xstate";
import { z } from "zod";

import { inspectMachine, findStateNode, collectAncestorEvents } from "./inspect.js";
import { simulateEvents, validateEventSequence } from "./simulate.js";
import { getReachableStates, findPath } from "./reachable.js";
import { listGuardConditions } from "./guards.js";
import { exportStateDiagram } from "./diagram.js";
import type {
  MachineSummary,
  MachineInspection,
  SuggestedCapabilities,
  SimulationResult,
  ReachableStatesResult,
  ValidationResult,
  PathResult,
  GuardConditionsResult,
} from "./types.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type MachineEntry = {
  readonly name: string;
  readonly description: string;
  readonly machine: AnyStateMachine;
  readonly supportsSimulation: boolean;
};

export type { MachineSummary, MachineInspection, SuggestedCapabilities, SimulationResult };
export type { ReachableStatesResult, ValidationResult, PathResult, GuardConditionsResult };
export type { MachineInspection as InspectionResult };

// Re-export lower-level utilities for consumers who want to build custom tools
export { inspectMachine, findStateNode, collectAncestorEvents } from "./inspect.js";
export { simulateEvents, validateEventSequence } from "./simulate.js";
export { getReachableStates, findPath } from "./reachable.js";
export { listGuardConditions } from "./guards.js";
export { exportStateDiagram } from "./diagram.js";

// ---------------------------------------------------------------------------
// Server internals
// ---------------------------------------------------------------------------

type XStateMcpToolResponse = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

function ok(value: unknown): XStateMcpToolResponse {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

function errResponse(message: string): XStateMcpToolResponse {
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}

async function run(fn: () => unknown): Promise<XStateMcpToolResponse> {
  try {
    return ok(await Promise.resolve(fn()));
  } catch (e) {
    return errResponse(e instanceof Error ? e.message : String(e));
  }
}

function requireMachine(registry: readonly MachineEntry[], machineName: string): MachineEntry {
  const entry = registry.find((e) => e.name === machineName);
  if (!entry) {
    throw new Error(
      `Unknown machine '${machineName}'. Available: ${registry.map((e) => e.name).join(", ")}`,
    );
  }
  return entry;
}

// ---------------------------------------------------------------------------
// createXstateMcpServer — main entry point
// ---------------------------------------------------------------------------

export async function createXstateMcpServer(registry: readonly MachineEntry[]): Promise<void> {
  const server = new McpServer({ name: "xstate-mcp", version: "0.1.0" });

  function require(machineName: string): MachineEntry {
    return requireMachine(registry, machineName);
  }

  // list_machines
  server.registerTool(
    "list_machines",
    {
      description:
        "List all XState machines registered in this codebase. Returns name, description, initial state, all top-level state names, total state count, every event type the machine handles, and whether the machine can be simulated. Use this first to discover machine names for inspect_machine and simulate_events.",
    },
    () =>
      run((): MachineSummary[] =>
        registry.map((entry) => {
          const inspection = inspectMachine(entry);
          return {
            name: entry.name,
            description: entry.description,
            machineId: inspection.machineId,
            initial: inspection.initial,
            topLevelStates: Object.keys(inspection.states),
            totalStateCount: inspection.totalStateCount,
            allEventTypes: inspection.allEventTypes,
            supportsSimulation: entry.supportsSimulation,
          };
        }),
      ),
  );

  // inspect_machine
  server.registerTool(
    "inspect_machine",
    {
      description:
        "Deep inspection of a single XState machine. Returns the full state tree with every state's type (atomic/compound/parallel/final), tags, and outgoing transitions (event type → target states + whether a guard is present). Also returns root-level event handlers that apply in all states. Use this to understand exactly which events can be sent in which states and where they go.",
      inputSchema: {
        machineName: z.string().describe("Machine name from list_machines"),
      },
    },
    ({ machineName }) =>
      run((): MachineInspection => inspectMachine(require(machineName))),
  );

  // simulate_events
  server.registerTool(
    "simulate_events",
    {
      description:
        "Simulate sending a sequence of events to a machine, starting from its initial state. Each step returns the new state value, status (active/done/error), and active tags. Synchronous transitions are applied immediately; async actors appear as pending. Only works for machines where supportsSimulation=true; others require complex input.",
      inputSchema: {
        machineName: z.string().describe("Machine name — check supportsSimulation from list_machines first"),
        events: z
          .array(
            z.object({
              type: z.string(),
              payload: z.record(z.string(), z.unknown()).optional(),
            }),
          )
          .describe("Events to send in order"),
        input: z.record(z.string(), z.unknown()).optional().describe("Machine input for machines that require it"),
      },
    },
    ({ machineName, events, input }) =>
      run((): SimulationResult => {
        const entry = require(machineName);
        if (!entry.supportsSimulation && input === undefined) {
          throw new Error(`Machine '${machineName}' requires input to simulate.`);
        }
        const flatEvents = events.map(({ type, payload }) =>
          payload !== undefined ? { type, ...payload } : { type },
        );
        return simulateEvents({ machineName: entry.name, machine: entry.machine, events: flatEvents, input });
      }),
  );

  // suggest_capabilities
  server.registerTool(
    "suggest_capabilities",
    {
      description:
        "Given a machine name and a current state (dot-separated path), return every event that can be sent: events on that state, inherited from ancestors, and root-level events.",
      inputSchema: {
        machineName: z.string().describe("Machine name from list_machines"),
        stateValue: z.string().describe("Dot-separated state path, e.g. 'login.editing'"),
      },
    },
    ({ machineName, stateValue }) =>
      run((): SuggestedCapabilities => {
        const entry = require(machineName);
        const inspection = inspectMachine(entry);
        const node = findStateNode(inspection, stateValue);
        if (!node) {
          throw new Error(`State '${stateValue}' not found in machine '${machineName}'.`);
        }
        const ancestorEvents = collectAncestorEvents(inspection, stateValue);
        const stateEvents = node.events;
        const allAvailableEvents = [
          ...new Set([...ancestorEvents.map((e) => e.type), ...stateEvents.map((e) => e.type)]),
        ].sort();
        return { machineName, stateValue, stateEvents, ancestorEvents, allAvailableEvents };
      }),
  );

  // get_reachable_states
  server.registerTool(
    "get_reachable_states",
    {
      description:
        "Given a machine and a current state (dot-separated path), returns every event available from that state and the states each event leads to — computed statically from the machine config.",
      inputSchema: {
        machineName: z.string().describe("Machine name from list_machines"),
        stateValue: z.string().describe("Dot-separated state path, e.g. 'login.editing'"),
      },
    },
    ({ machineName, stateValue }) =>
      run((): ReachableStatesResult => {
        const entry = require(machineName);
        return getReachableStates(inspectMachine(entry), stateValue);
      }),
  );

  // validate_event_sequence
  server.registerTool(
    "validate_event_sequence",
    {
      description:
        "Simulate sending a list of events to a machine without stopping on invalid/ignored events. Reports per-step whether each event is defined, whether state changed, and any error.",
      inputSchema: {
        machineName: z.string().describe("Machine name — check supportsSimulation from list_machines first"),
        events: z
          .array(z.object({ type: z.string(), payload: z.record(z.string(), z.unknown()).optional() }))
          .describe("Full event sequence to validate"),
        input: z.record(z.string(), z.unknown()).optional().describe("Machine input for machines that require it"),
      },
    },
    ({ machineName, events, input }) =>
      run((): ValidationResult => {
        const entry = require(machineName);
        if (!entry.supportsSimulation && input === undefined) {
          throw new Error(`Machine '${machineName}' requires input to simulate.`);
        }
        const inspection = inspectMachine(entry);
        const flatEvents = events.map(({ type, payload }) =>
          payload !== undefined ? { type, ...payload } : { type },
        );
        return validateEventSequence({
          machineName: entry.name,
          machine: entry.machine,
          allEventTypes: inspection.allEventTypes,
          events: flatEvents,
          input,
        });
      }),
  );

  // find_path
  server.registerTool(
    "find_path",
    {
      description:
        "Find the shortest event sequence to get from one state to another (BFS over the static state graph). Returns events to send and states passed through. Annotates guarded paths.",
      inputSchema: {
        machineName: z.string().describe("Machine name from list_machines"),
        fromState: z.string().describe("Starting state, dot-separated, e.g. 'login.editing'"),
        toState: z.string().describe("Target state, dot-separated, e.g. 'login.success'"),
      },
    },
    ({ machineName, fromState, toState }) =>
      run((): PathResult => findPath({ inspection: inspectMachine(require(machineName)), fromState, toState })),
  );

  // list_guard_conditions
  server.registerTool(
    "list_guard_conditions",
    {
      description:
        "List every transition that has a guard condition in a machine. Returns state path, event type, targets, and a description of the guard.",
      inputSchema: {
        machineName: z.string().describe("Machine name from list_machines"),
      },
    },
    ({ machineName }) =>
      run((): GuardConditionsResult => {
        const entry = require(machineName);
        return listGuardConditions(entry.machine, entry.name);
      }),
  );

  // export_state_diagram
  server.registerTool(
    "export_state_diagram",
    {
      description:
        "Export a machine as a Mermaid stateDiagram-v2 diagram. Returns a string you can paste into any Mermaid renderer.",
      inputSchema: {
        machineName: z.string().describe("Machine name from list_machines"),
      },
    },
    ({ machineName }) =>
      run((): string => exportStateDiagram(inspectMachine(require(machineName)))),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
