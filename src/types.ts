// ---------------------------------------------------------------------------
// xstate-mcp — shared types
// ---------------------------------------------------------------------------

export type EventTransition = {
  readonly type: string;
  readonly targets: readonly string[];
  readonly hasGuard: boolean;
};

export type StateNodeInfo = {
  readonly stateType: "atomic" | "compound" | "parallel" | "final" | "history";
  readonly initial?: string;
  readonly tags: readonly string[];
  readonly events: readonly EventTransition[];
  readonly children: Record<string, StateNodeInfo>;
};

export type MachineInspection = {
  readonly name: string;
  readonly description: string;
  readonly machineId: string;
  readonly initial: string;
  readonly rootEvents: readonly EventTransition[];
  readonly states: Record<string, StateNodeInfo>;
  readonly totalStateCount: number;
  readonly allEventTypes: readonly string[];
};

export type MachineSummary = {
  readonly name: string;
  readonly description: string;
  readonly machineId: string;
  readonly initial: string;
  readonly topLevelStates: readonly string[];
  readonly totalStateCount: number;
  readonly allEventTypes: readonly string[];
  readonly supportsSimulation: boolean;
};

export type SimulationStep = {
  readonly eventSent: string;
  readonly stateValue: unknown;
  readonly status: "active" | "done" | "error" | "stopped";
  readonly tags: readonly string[];
  readonly error: string | null;
};

export type SimulationResult = {
  readonly machineName: string;
  readonly initialStateValue: unknown;
  readonly steps: readonly SimulationStep[];
  readonly finalStateValue: unknown;
  readonly finalStatus: string;
};

export type SuggestedCapabilities = {
  readonly machineName: string;
  readonly stateValue: string;
  readonly stateEvents: readonly EventTransition[];
  readonly ancestorEvents: readonly EventTransition[];
  readonly allAvailableEvents: readonly string[];
};

export type ReachableTransition = {
  readonly eventType: string;
  readonly resolvedTargets: readonly string[];
  readonly hasGuard: boolean;
};

export type ReachableStatesResult = {
  readonly machineName: string;
  readonly fromState: string;
  readonly transitions: readonly ReachableTransition[];
  readonly allReachableStates: readonly string[];
};

export type ValidationStep = {
  readonly eventType: string;
  readonly definedInMachine: boolean;
  readonly stateBefore: unknown;
  readonly stateAfter: unknown;
  readonly stateChanged: boolean;
  readonly error: string | null;
};

export type ValidationResult = {
  readonly machineName: string;
  readonly initialState: unknown;
  readonly steps: readonly ValidationStep[];
  readonly allValid: boolean;
};

export type PathResult = {
  readonly machineName: string;
  readonly fromState: string;
  readonly toState: string;
  readonly found: boolean;
  readonly eventSequence: readonly string[];
  readonly stateSequence: readonly string[];
  readonly note: string;
};

export type GuardInfo = {
  readonly statePath: string;
  readonly eventType: string;
  readonly targets: readonly string[];
  readonly guardDescription: string;
};

export type GuardConditionsResult = {
  readonly machineName: string;
  readonly totalGuards: number;
  readonly guards: readonly GuardInfo[];
};
