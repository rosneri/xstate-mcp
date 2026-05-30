# xstate-mcp

MCP server for XState machine introspection and simulation. Exposes 9 tools for Claude (and other MCP clients) to inspect, simulate, and navigate XState state machines in any TypeScript project.

## Tools

| Tool | Description |
|------|-------------|
| `list_machines` | List all registered machines with summary info |
| `inspect_machine` | Full state tree with transitions and guard flags |
| `simulate_events` | Run an event sequence and capture each state snapshot |
| `validate_event_sequence` | Like simulate but continues past invalid events, reports each step |
| `suggest_capabilities` | Events available in a given state (own + ancestor + root) |
| `get_reachable_states` | All states reachable from a given state via static analysis |
| `find_path` | BFS shortest event sequence from state A to state B |
| `list_guard_conditions` | Every guarded transition with human-readable guard description |
| `export_state_diagram` | Mermaid `stateDiagram-v2` output for any machine |

## Usage

Install:

```bash
npm install xstate-mcp
```

Create an entry point that registers your machines:

```typescript
// mcp-entry.ts
import { createXstateMcpServer } from "xstate-mcp";
import { myMachine } from "./my-machine.js";

await createXstateMcpServer([
  {
    name: "my-machine",
    description: "Handles the login flow",
    machine: myMachine,
    supportsSimulation: true,
  },
]);
```

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "xstate-mcp": {
      "command": "node",
      "args": ["path/to/mcp-entry.js"]
    }
  }
}
```

Or with `bun` running TypeScript directly:

```json
{
  "mcpServers": {
    "xstate-mcp": {
      "command": "bun",
      "args": ["run", "path/to/mcp-entry.ts"]
    }
  }
}
```

## `supportsSimulation`

Set `supportsSimulation: false` for machines that require complex input (e.g. actor references, external services) that can't be created without a runtime context. The simulate-based tools will require an explicit `input` object in that case.

## License

MIT
