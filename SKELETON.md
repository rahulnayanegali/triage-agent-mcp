# triage-agent-mcp — skeleton north star

## What this thing does

A user runs this as an MCP server. Their agent (Claude Desktop or Claude Code)
pre-fetches a Sentry issue and hands the data to `triage_issue()`. The server
classifies it by severity (P0-P3) and routes it to the owning team using rules
the user wrote in `triage-context.md`. The server never calls Sentry itself.

---

## Data flow (agreed, locked)

```
Agent (Claude Desktop / Code)
  |
  | 1. fetch issue from Sentry API (agent does this, not the server)
  |
  | IssueData { id, title, culprit, eventCount, userCount, environment?, url? }
  |
  v
index.ts  (MCP tool: triage_issue)
  |
  | loads triage-context.md on boot
  | calls parseRoutesFromContext() → Route[]
  | calls classifyIssue(issue, routes) → TriageResult
  |
  v
classifier.ts
  |
  | word-level matching against route descriptions
  | applies escalation rules (url, eventCount, environment)
  |
  v
TriageResult { issueId, severity, team, assignee, reason[], ticketTitle, confidence }
  |
  v
Formatted markdown string returned to the agent
```

---

## Source files (three, that is all)

| File | What it owns |
|------|-------------|
| `src/classifier.ts` | `parseRoutesFromContext()` and `classifyIssue()`. No I/O. Pure functions. |
| `src/index.ts` | MCP server. Loads context file. Wires tool to classifier. |
| `triage-context.md` | User-owned. Gitignored. Rules live here, not in code. |

---

## The one MCP tool

**Name:** `triage_issue`

**Input:** `IssueData` (passed in by the agent, pre-fetched from Sentry)

**Output:** Formatted markdown with severity, team, assignee, and reason lines

**Description (as registered):** "Classify a Sentry issue by severity P0-P3 and route
to owning team using rules from triage-context.md"

---

## Types (locked, do not change without updating tests)

```typescript
type Severity = "P0" | "P1" | "P2" | "P3"

interface IssueData {
  id: string
  title: string
  culprit: string
  eventCount: number
  userCount: number
  environment?: string
  url?: string
}

interface TriageResult {
  issueId: string
  severity: Severity
  team: string
  assignee: string
  reason: string[]
  ticketTitle: string
  confidence: "high" | "low"
}

interface Route {
  name: string
  description: string
  severity: Severity
  team: string
  assignee: string
}
```

---

## Classifier rules (agreed, locked)

- Haystack: `issue.title + " " + issue.culprit` (lowercase)
- Match: word-level, case-insensitive, against each route's description words
- Winner: route with the most matching words
- Fallback (no match): `severity: P2, team: "Backend", assignee: "unknown", confidence: "low"`
- Escalation (applied after route match, in this order):
  - `issue.url` contains `/api/payments/` → force P0
  - `issue.eventCount > 1000` → bump severity one level
  - `issue.environment === "production"` and severity is P2 or P3 → set P1
- `confidence: "high"` if match count >= 2, `"low"` if match count is 1
- `ticketTitle`: issue.title truncated to 80 chars with "..." if longer
- When two routes match the same number of words, the first route declared in triage-context.md wins. Order routes from most specific to most general.

---

## What "done" looks like

- `classifier.ts` compiles and all three tests in `classifier.test.ts` pass
- `index.ts` starts without error when `triage-context.md` is present
- `index.ts` returns a clear error message when `triage-context.md` is missing
- An agent calling `triage_issue()` with a real Sentry issue gets back a formatted result
- Emails and team names come only from `triage-context.md`, never from source code

---

## What this is NOT (v1 scope boundary)

- No Sentry API calls from the server
- No embeddings or semantic routing (that is v2)
- No webhook support
- No database or persistent state
- No web interface

---

## What the server trusts

The server accepts IssueData values as passed by the agent and
classifies them as-is. It does not validate that the data came
from Sentry, that strings are untruncated, or that fields are
HTML-decoded. The classifier is tested against clean,
realistic Sentry strings. If your agent transforms the issue
before passing it (truncation, encoding, summarization),
word-level matching may degrade silently.

The practical contract: pass title and culprit exactly as
Sentry returns them. Do not summarize or reformat before
calling triage_issue.