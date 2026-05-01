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