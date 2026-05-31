# @rosneri/xstate-mcp

MCP server for XState v5 machine introspection and simulation. Gives Claude (and any MCP client) 9 tools to inspect, simulate, and navigate XState state machines — purely from machine definitions, no running app required.

## Tools

| Tool | Description |
|------|-------------|
| `list_machines` | List all registered machines with summary info |
| `inspect_machine` | Full state tree with every transition and guard flag |
| `simulate_events` | Run an event sequence, capture a state snapshot after each step |
| `validate_event_sequence` | Like simulate but continues past invalid events, reports each step |
| `suggest_capabilities` | Events available in a given state (own + ancestor + root) |
| `get_reachable_states` | All states reachable from a given state via static analysis |
| `find_path` | BFS shortest event sequence from state A to state B |
| `list_guard_conditions` | Every guarded transition with human-readable guard description |
| `export_state_diagram` | Mermaid `stateDiagram-v2` output for any machine |

## Getting started

Install it as a dev dependency:

```bash
bun add -d @rosneri/xstate-mcp
```

Write a small entry file that imports your machines and registers them. Each entry needs a `name`, a
short `description`, the `machine` itself, and `supportsSimulation`:

```typescript
// xstate-mcp-server.ts
import { createXstateMcpServer } from "@rosneri/xstate-mcp";
import { authMachine } from "./auth-machine.js";
import { checkoutMachine } from "./checkout-machine.js";

await createXstateMcpServer([
  {
    name: "auth",
    description: "Handles login, logout, and session refresh",
    machine: authMachine,
    supportsSimulation: true,
  },
  {
    name: "checkout",
    description: "Multi-step checkout flow",
    machine: checkoutMachine,
    supportsSimulation: false, // requires a payment service actor
  },
]);
```

Point your MCP client at that file. In `.mcp.json`:

```json
{
  "mcpServers": {
    "xstate-mcp": {
      "command": "bun",
      "args": ["./xstate-mcp-server.ts"]
    }
  }
}
```

Reconnect the server (or restart your client), then ask it to `list_machines` — your machines will
show up, ready for `inspect_machine`, `simulate_events`, `export_state_diagram`, and the rest.

The entry file is the only place machines are registered; the server has no auto-discovery. Whenever
you add a machine, add it to the array and reconnect.

## Troubleshooting

**`list_machines` is empty, or you get `Unknown machine`.** The server only knows about machines
passed to `createXstateMcpServer`. Check that `.mcp.json` runs your entry file (not the bare package)
and that the machine is in the array.

**Edited the entry file but nothing changed.** Clients start the server once and cache the process.
Reconnect the server or restart your client after editing the entry or `.mcp.json` — it does not
hot-reload.

## `supportsSimulation`

Set `supportsSimulation: false` for machines that require complex input (actor references, external services, etc.) that can't be created without a running context. The `simulate_events` and `validate_event_sequence` tools will require an explicit `input` object for those machines.

## Lower-level utilities

All internal utilities are re-exported for consumers who want to build custom tools:

```typescript
import {
  inspectMachine,
  simulateEvents,
  validateEventSequence,
  getReachableStates,
  findPath,
  listGuardConditions,
  exportStateDiagram,
} from "@rosneri/xstate-mcp";
```

## License

MIT
