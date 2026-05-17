# triage-agent-mcp

MCP server that guides an AI agent through stack trace triage — from raw error to the commit and PR that introduced it.

## How it works

Three tools, called in sequence by the agent:

| Tool | Input | Output |
|------|-------|--------|
| `blame_stack_trace` | raw stack trace | instructions to identify the source file and line |
| `submit_trace_location` | file path + line range | `git blame` command to run + instructions to gather commit context |
| `submit_git_context` | commit message, PR info, comments | structured triage result as JSON |

## Example

```
Use mcp__triage-agent-mcp__blame_stack_trace to analyze this error:

Uncaught TypeError: Cannot read properties of null (reading 'useContext')
  at e.useContext (_virtual_mf___mfe_internal__remote__loadShare__react__loadShare__.mjs)
  at app-xaIRccHv.js:3:17698
```

The agent calls all three tools in sequence and returns the commit message, PR, and reviewer comments linked to the fault.

## Usage

Add to your MCP client config (e.g. Claude Desktop `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "triage-agent-mcp": {
      "command": "node",
      "args": ["/path/to/triage-agent-mcp/dist/index.js"]
    }
  }
}
```

## Development

```bash
npm install
npm test         # tsc type-check + smoke test
npm run build    # tsc → dist/
```
