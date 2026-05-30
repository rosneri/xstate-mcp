// ---------------------------------------------------------------------------
// xstate-mcp — actor simulation (synchronous snapshot capture)
// ---------------------------------------------------------------------------
// Events are applied synchronously before any async actor callbacks fire
// (promises are microtasks — they don't run until the call stack clears).
// This means machines with fromPromise actors stay in their invoke state
// during simulation, which is exactly what we want to show.
// ---------------------------------------------------------------------------

import { createActor } from "xstate";
import type { AnyStateMachine } from "xstate";
import type { SimulationResult, SimulationStep, ValidationResult, ValidationStep } from "./types.js";

type EventInput = {
  readonly type: string;
  readonly [key: string]: unknown;
};

function snapshotStatus(
  status: string,
): "active" | "done" | "error" | "stopped" {
  if (status === "active" || status === "done" || status === "error" || status === "stopped") {
    return status;
  }
  return "active";
}

function extractSnapshotError(snapshot: { error?: unknown }): string | null {
  const err = snapshot.error;
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err !== undefined && err !== null) return JSON.stringify(err);
  return null;
}

function makeActor(machine: AnyStateMachine, input: Record<string, unknown> | undefined) {
  return input !== undefined ? createActor(machine, { input }) : createActor(machine);
}

// ---------------------------------------------------------------------------
// Options types (1 object param per convention)
// ---------------------------------------------------------------------------

type SimulateOptions = {
  readonly machineName: string;
  readonly machine: AnyStateMachine;
  readonly events: readonly EventInput[];
  readonly input: Record<string, unknown> | undefined;
};

type ValidateOptions = {
  readonly machineName: string;
  readonly machine: AnyStateMachine;
  readonly allEventTypes: readonly string[];
  readonly events: readonly EventInput[];
  readonly input: Record<string, unknown> | undefined;
};

// ---------------------------------------------------------------------------
// simulateEvents — stops on first send error
// ---------------------------------------------------------------------------

export function simulateEvents({ machineName, machine, events, input }: SimulateOptions): SimulationResult {
  const actor = makeActor(machine, input);
  actor.start();

  const initialSnap = actor.getSnapshot();
  const initialStateValue: unknown = initialSnap.value;
  const steps: SimulationStep[] = [];

  for (const event of events) {
    try {
      actor.send(event);
    } catch {
      const snap = actor.getSnapshot();
      steps.push({
        eventSent: event.type,
        stateValue: snap.value,
        status: snapshotStatus(snap.status),
        tags: [...snap.tags],
        error: `Failed to send event: ${event.type}`,
      });
      break;
    }

    const snap = actor.getSnapshot();
    steps.push({
      eventSent: event.type,
      stateValue: snap.value,
      status: snapshotStatus(snap.status),
      tags: [...snap.tags],
      error: extractSnapshotError(snap),
    });
  }

  const finalSnap = actor.getSnapshot();
  const finalStateValue: unknown = finalSnap.value;
  const finalStatus = finalSnap.status;

  actor.stop();

  return {
    machineName,
    initialStateValue,
    steps,
    finalStateValue,
    finalStatus,
  };
}

// ---------------------------------------------------------------------------
// validateEventSequence — continues on invalid/ignored events
// ---------------------------------------------------------------------------

export function validateEventSequence({ machineName, machine, allEventTypes, events, input }: ValidateOptions): ValidationResult {
  const actor = makeActor(machine, input);
  actor.start();

  const initialSnap = actor.getSnapshot();
  const eventTypeSet = new Set(allEventTypes);
  const steps: ValidationStep[] = [];

  for (const event of events) {
    const snapBefore = actor.getSnapshot();
    const stateBefore: unknown = snapBefore.value;
    let error: string | null = null;

    try {
      actor.send(event);
    } catch (e) {
      error = e instanceof Error ? e.message : typeof e === "string" ? e : JSON.stringify(e);
    }

    const snapAfter = actor.getSnapshot();
    const stateAfter: unknown = snapAfter.value;

    steps.push({
      eventType: event.type,
      definedInMachine: eventTypeSet.has(event.type),
      stateBefore,
      stateAfter,
      stateChanged: JSON.stringify(stateBefore) !== JSON.stringify(stateAfter),
      error,
    });
  }

  actor.stop();

  return {
    machineName,
    initialState: initialSnap.value,
    steps,
    allValid: steps.every((s) => s.definedInMachine && s.error === null),
  };
}
