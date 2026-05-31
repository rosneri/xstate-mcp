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

## Quick start (no machines)

Run the server directly with no registered machines — useful for testing the connection:

```json
{
  "mcpServers": {
    "xstate-mcp": {
      "command": "bunx",
      "args": ["@rosneri/xstate-mcp"]
    }
  }
}
```

## With your machines

### Option 1 — Install locally (recommended)

Install as a dev dependency so the server starts instantly without a network round-trip:

```bash
bun add -d @rosneri/xstate-mcp
# or
npm install --save-dev @rosneri/xstate-mcp
```

In `.mcp.json`:

```json
{
  "mcpServers": {
    "xstate-mcp": {
      "command": "bun",
      "args": ["./node_modules/.bin/xstate-mcp"]
    }
  }
}
```

### Option 2 — Custom entry point

Create an entry file that registers your machines and passes them to the server:

```typescript
// mcp-entry.ts
import { createXstateMcpServer } from "@rosneri/xstate-mcp";
import { authMachine } from "./src/auth-machine.js";
import { checkoutMachine } from "./src/checkout-machine.js";

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

In `.mcp.json`:

```json
{
  "mcpServers": {
    "xstate-mcp": {
      "command": "bun",
      "args": ["run", "mcp-entry.ts"]
    }
  }
}
```

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
