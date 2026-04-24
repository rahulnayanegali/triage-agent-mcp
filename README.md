# triage-agent-mcp
 
Most teams treat Sentry as a notification firehose. Alerts come in, engineers scan
the list manually, someone makes a judgment call on priority, and half the time the
wrong team gets pinged. The process depends entirely on whoever is on call knowing
the codebase well enough to route correctly. This server removes that human dependency.
 
`triage-agent-mcp` is an MCP server that classifies Sentry issues by severity (P0-P3)
and routes them to the owning team. Routing rules live in a markdown file your team
owns and edits. No code change is needed to update them.
 
---
 
## How it works
 
Your agent (Claude Desktop or Claude Code) fetches the Sentry issue and passes the
data to `triage_issue()`. The server loads your `triage-context.md`, matches the issue
against your routes, applies any escalation rules, and returns a structured result with
severity, team, assignee, confidence, and a list of reasons explaining the decision.
 
The server never calls Sentry directly. The agent fetches; the server classifies. That
separation keeps the classifier independently testable and means the server has no
credentials, no network calls, and no side effects.
 
Three files is all there is: `src/classifier.ts` (pure functions, no I/O),
`src/index.ts` (MCP wiring), and `triage-context.md` (your rules).
 
---
 
## Quickstart
 
```bash
git clone https://github.com/rahulnayanegali/triage-agent-mcp
cd triage-agent-mcp
npm install
cp triage-context.example.md triage-context.md
```
 
Edit `triage-context.md` to replace the placeholder emails with your team's actual
addresses. The default routes (payment failures, auth, database, API, frontend crashes,
network issues, and noise) work immediately without further edits.
 
Build and wire to Claude Desktop by adding this to your `claude_desktop_config.json`:
 
```json
{
  "mcpServers": {
    "triage-agent-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/triage-agent-mcp/dist/index.js"]
    }
  }
}
```
 
For Claude Code, copy `.mcp.json.example` to `.mcp.json` in your project root — the path is already set to `./dist/index.js` so no edits are needed.
Then run `npm run build`. The server is ready.
 
---
 
## triage-context.md format
 
The file has two sections: `## Routes` and `## Escalation rules`.
 
```markdown
# Triage context
 
## Routes
 
### payment-failures
description: "payment errors, stripe checkout failed, billing issue, transaction declined"
severity: P0
team: Frontend
assignee: frontend-team@company.com
 
### frontend-crash
description: "TypeError, undefined is not a function, cannot read property, React render error"
severity: P2
team: Frontend
assignee: frontend-team@company.com
 
### noise
description: "ResizeObserver loop limit, browser extension error, AbortError, favicon 404"
severity: P3
team: Ignore
assignee: none
 
## Escalation rules
 
### high-volume
trigger: event_count > 1000
action: bump
 
### production-floor
trigger: environment = production
action: floor P1
 
### payment-api-override
trigger: url contains /api/payments/
action: force P0
```
 
Routes with `team: Ignore` are skipped entirely during classification. Escalation rules
are applied after the route match, in the order they appear in the file.
 
---
 
## Classifier behavior
 
The classifier builds a haystack from the issue's `title` and `culprit` fields
(lowercase, split on non-word characters). It then counts how many words from each
route's description appear in that haystack and picks the route with the highest count.
 
Confidence is `high` when two or more description words matched, `low` when only one
matched. If nothing matches, the result falls back to `severity: P2, team: Backend,
confidence: low`.
 
Escalation rules run after the route match. Three action types are supported:
 
- `force P0` overrides severity to P0 regardless of the matched route.
- `bump` moves severity one step toward P0 (P3 to P2, P2 to P1, P1 to P0).
- `floor P1` sets severity to P1 if the matched route returned P2 or P3.
Every rule that fires appends a string to `reason[]` in the result, so the full
decision chain is always auditable.
 
The result shape:
 
```typescript
interface TriageResult {
  issueId: string
  severity: "P0" | "P1" | "P2" | "P3"
  team: string
  assignee: string
  reason: string[]
  ticketTitle: string
  confidence: "high" | "low"
}
```
 
---
 
## What v1 does not do
 
The server has no Sentry API integration; the agent is responsible for fetching the
issue. There is no semantic or embedding-based routing; matching is word-level only.
There is no webhook support, no persistent state, and no web interface. If you need
any of these, they are out of scope for v1 and tracked below.
 
---
 
---
### Testing

Run the unit tests first to verify the classifier works on a clean build:

```bash
npm test
# expected output: # tests 6  # pass 6  # fail 0
```

To test the tool interactively over the MCP protocol, use MCP Inspector:

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

## Roadmap
 
V2 will replace the word-level matcher with a semantic embedding router. Teams will
write plain English route descriptions and the engine will match by meaning, so
"cart abandoned" routes correctly without anyone adding a new keyword. The classifier
replacement will not touch `src/index.ts` or `triage-context.md`; the interface stays
identical.