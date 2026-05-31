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

> ⚠️ **The packaged `xstate-mcp` bin registers _no_ machines.** Both `bunx @rosneri/xstate-mcp`
> and `./node_modules/.bin/xstate-mcp` run `createXstateMcpServer([])` — a working server with an
> **empty registry**, so `list_machines` returns `[]` and every `inspect_machine` / `simulate_events`
> call fails with `Unknown machine`. This is intentional: the stock bin is only for testing the
> connection. **To inspect your own machines you must write a custom entry point** (see
> [With your machines](#with-your-machines)). Pointing `.mcp.json` at the stock bin and expecting it
> to discover your machines is the most common setup mistake.

## Connection test (no machines)

Run the server directly with no registered machines — useful only for confirming the MCP client can
launch and talk to the server. `list_machines` will return `[]`:

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

You register machines by writing a small entry file that imports them and passes them to
`createXstateMcpServer`, then pointing `.mcp.json` at **that file** (not at the stock bin):

```typescript
// scripts/xstate-mcp-server.ts
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
      "args": ["./scripts/xstate-mcp-server.ts"]
    }
  }
}
```

Install `@rosneri/xstate-mcp` as a dev dependency (`bun add -d @rosneri/xstate-mcp`) so the entry
file can resolve the import and the server starts instantly without a network round-trip.

## Troubleshooting

**`list_machines` returns `[]`.** Your `.mcp.json` is pointing at the stock bin
(`./node_modules/.bin/xstate-mcp` or `bunx @rosneri/xstate-mcp`), which registers no machines. Point
it at your own entry file instead (see [With your machines](#with-your-machines)).

**`Cannot find module '@scope/pkg/machines'` from your entry file.** In a monorepo, a workspace
package is only resolvable from a location that declares it as a dependency and has it linked in
`node_modules`. An entry file at the repo root often can't resolve a workspace import. Either add the
package to the entry's nearest `package.json`, or import the machine by **relative path** to its
source — e.g. `import { flowMachine } from "../packages/core/src/machines/index.ts"`.

**Edited the entry file but the tools still show the old machines.** MCP clients spawn the server
process once and cache it. After changing the entry file or `.mcp.json`, reconnect the server (or
restart the client session) — a live server does not hot-reload its registry.

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
