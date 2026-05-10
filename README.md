# triage-agent-mcp

MCP server for Sentry issue triage — classifies issues by severity and routes to the owning team.

## Development

```bash
npm install
npm run dev   # tsx watch src/index.ts
```

## Build

```bash
npm run build   # tsc → dist/
npm start       # node dist/index.js
```
