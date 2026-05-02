## Existing System (as-is)

```
  ┌─────────────────────────────────────────────────────┐
  │  MCP Client (Claude / any agent)                    │
  │  manually fetches from Sentry, then calls tool      │
  └───────────────────┬─────────────────────────────────┘
                      │  triage_issue(id, title, culprit,
                      │              eventCount, userCount, ...)
                      ▼
  ┌─────────────────────────────────────────────────────┐
  │  MCP Server  (triage-agent-mcp)                     │
  │                                                     │
  │  1. load triage-context.md  ◄── manually maintained │
  │     (routes + escalation rules)      by user        │
  │                                                     │
  │  2. keyword match                                   │
  │     title + culprit → bag of words                  │
  │     → find route with most word overlaps  ⚠ fragile │
  │                                                     │
  │  3. escalation rules                                │
  │     event_count / url / environment triggers        │
  │                                                     │
  │  4. confidence: "high" if ≥2 words matched,         │
  │                 "low"  otherwise          ⚠ crude   │
  └───────────────────┬─────────────────────────────────┘
                      │
                      ▼
         severity / team / assignee / reasons

  Known gaps
  ──────────
  ⚠ no Sentry API — caller must pre-fetch issue data
  ⚠ keyword match has no semantic understanding
  ⚠ triage-context.md goes stale without manual upkeep
  ⚠ userCount field wired in but unused in classifier
  ⚠ confidence is binary, not a real score
```

---

## Pivot as MCP Server

```
  ┌──────────────────────────────────────────────┐
  │  MCP Client (Claude)                         │
  └──────────┬───────────────────────────────────┘
             │  blame_stack_trace(
             │    stack_trace: string,
             │    repo_path:   string   ← explicit, git -C
             │  )
             ▼
  ┌──────────────────────────────────────────────┐
  │  MCP Server  (local process, sees filesystem)│
  │                                              │
  │  1. parse stack trace                        │
  │     → file paths + line numbers    ~ P0.5    │
  │                                              │
  │  2. git blame each line                      │
  │     → commit hash + author                   │
  │                                              │
  │  3. formatting commit?                       │
  │     file count + message + diff profile      │
  │     → yes: walk blame back one step          │
  │            append .git-blame-ignore-revs     │
  │                                              │
  │  4. author still on team?                    │
  │     → no: git log → CODEOWNERS → unroutable  │
  │                                              │
  │  5. GITHUB_TOKEN set?                        │
  │     → fetch PR: desc + diff + comments       │
  │       bundle into result text                │
  │                                              │
  │  6. sampling/createMessage ──────────────┐   │
  │     "here is stack trace + blame +       │   │
  │      PR text. what's the root cause?"    │   │
  │                                          │   │
  └──────────────────────────────────────────┼───┘
                                             │
                                             ▼
                                      ┌──────────────┐
                                      │ Claude (LLM) │
                                      │ reasons over │
                                      │ the context  │
                                      └──────┬───────┘
                                             │ "likely null on
                                             │  user.subscription..."
                                             ▼
  ┌──────────────────────────────────────────────┐
  │  MCP Server bundles sampling response        │
  └──────────┬───────────────────────────────────┘
             │
             ▼
    author / commit / confidence% / root cause

  Tiers
  ─────
  Tier 1  git only          → author + commit + confidence
  Tier 2  + GITHUB_TOKEN    → adds PR context, Claude reasons for free
  (no Anthropic API key needed — sampling uses the Claude already present)

  Decisions / Open Questions
  ──────────────────────────
  ✅ P0   repo_path: explicit param, git -C repo_path for every shell call
  ✅ P0   root cause: sampling/createMessage, no API key needed
              fallback: return raw text, Claude reasons in outer loop

  ~  P0.5 stack trace parsing: engineering problem, solve per-language later

  ⚠ P1   confidence%: formula not yet defined
  ⚠ P1   team resolution: CODEOWNERS file, or user-supplied config?
```

---

## Pivot Brainstorming

**One Liner:** This product uses the Sentry stack trace to find the likely responsible commit and automatically route the issue to the team who owns that code today.

**Stress tests**

**1. Time gap between commit and issue surfacing**
Use Sentry release data to narrow the commit window first. If the release window is too wide or missing, fall back to full-history blame with a lower confidence score. Product never guesses silently — it says how far back it had to look.

**2. Formatting commit pollutes blame**
Detected via three signals in combination: high file count, commit message pattern ("apply prettier", "format", "lint fix"), and diff character profile (mostly whitespace, low semantic diff). When signals align, walks blame back one step to the commit before the formatter. As a bonus move, auto-generates or appends to `.git-blame-ignore-revs` so git blame skips it natively on future runs — self-healing, not just corrective. If a formatting commit also contains real changes, confidence score drops instead of routing wrong.

**3. Author no longer on the team**
Fallback chain: git log traversal (who else touched this file recently and is still on the team) → PR review history (reviewers often have more current context than the original author) → CODEOWNERS → explicit "unroutable" state. Unroutable surfaces the last known author in Slack and never silently drops the issue.

**4. PR context as root cause signal**
Every commit has a PR. The PR has a description, diff, and reviewer comments. An LLM reads all three against the Sentry error to surface not just who but why — flagging unanswered reviewer concerns or causal description matches as likely root cause signals.

**Design principle holding all three together:** calibrated uncertainty is more useful than confident wrongness. The product always says what it knows, what it doesn't, and why.


### What this is
A CLI tool that takes a Sentry stack trace and finds the likely author and root cause of the issue using git, and optionally GitHub + an LLM.

### Run location
Inside the repo directory where the bug originated. Git commands run locally against that repo.

### Core flow
1. User pastes or pipes a Sentry stack trace
2. CLI parses file paths and line numbers from the trace
3. `git blame` on each extracted line → commit hash + author
4. Formatting commit detection — high file count, commit message pattern, diff character profile → walk blame back one step if flagged; append to `.git-blame-ignore-revs`
5. Fallback chain if author is gone: `git log` traversal → PR reviewer comments (if GitHub token provided) → CODEOWNERS → unroutable state
6. If GitHub token provided: fetch PR linked to commit, pull description, diff, reviewer comments
7. If Anthropic key provided: send stack trace + PR context to Claude, get root cause summary + confidence
8. Print output: author, confidence score, causal commit, and optionally the LLM root cause summary

### Two tiers
**Tier 1 — git only**
No keys needed. Works fully offline. Output is author + confidence + causal commit.

**Tier 2 — git + GitHub token + Anthropic key**
Additive. Pulls PR reviewer comments and generates LLM root cause summary. Absence of either key degrades gracefully, never breaks.

### Key design principles
- Calibrated uncertainty over confident wrongness — always surface confidence score and reasoning
- Keys are optional and additive — tool is never blocked by missing credentials
- Formatting commits are detected and walked back, not silently accepted
- Unroutable is a valid explicit state — surface last known author, never drop silently

### Stress tests already designed
1. **Time gap** — use git release tags to narrow commit window; fall back to full history with lower confidence
2. **Formatting commit** — detect via file count + message pattern + diff profile; walk back one step; auto-generate `.git-blame-ignore-revs`
3. **Author gone** — fallback chain as above
4. **PR context** — LLM reads PR description + diff + reviewer comments against the stack trace to surface root cause signals

### Stack
- Language: your call, Node.js or Python both fine
- Git: shell out to git commands locally
- GitHub: REST API, token via env var `GITHUB_TOKEN`
- LLM: Anthropic API, key via env var `ANTHROPIC_API_KEY`

### What good output looks like
```
Author:     rahul <rahul@company.com>
Commit:     a3f9c12 — "migrate subscription to lazy loading"
Confidence: 74%
PR:         #412 — reviewer flagged unauthenticated case (unanswered)
Root cause: Likely null on user.subscription when accessed before auth resolves
```
