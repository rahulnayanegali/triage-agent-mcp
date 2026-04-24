# ADR 001 — Classifier architecture: word-matching over LLM

## Status
Accepted — v1

## Context
The server needs to route Sentry issues to the correct team
using rules defined by the user in triage-context.md.
Two approaches were considered:

Option A — word-level Set intersection against route descriptions
Option B — LLM classification with triage-context.md as a prompt

## Decision
Option A. Word-level matching via Set intersection.

## Rationale
Deterministic: identical input always produces identical output.
This matters at 2am when a P0 is misrouted and someone needs
to know why.

Testable: routing rules can be unit tested before an incident
proves them wrong. Option B cannot be unit tested.

Auditable: the reason[] field in TriageResult shows exactly
which words matched and which escalation rules fired. Nothing
is hidden in a probability distribution.

Zero dependencies: no API key, no network call, no model
version drift.

## Tradeoffs
Gained: determinism, testability, auditability, zero runtime deps.

Given up: no synonym matching ("payments" does not match
"payment"), no partial-word matching, no handling of phrasing
variation. Route descriptions must be maintained as keyword
lists, not natural language sentences.

## What v2 changes
The embedding router will replace the word-matching logic inside
classifier.ts without touching src/index.ts, triage-context.md,
or any type signatures. The TriageConfig interface gains an
optional embeddings field. No caller changes.

## Why not LLM for v1
An LLM with triage-context.md as a system prompt would classify
reasonably well. It would not produce the same result twice for
edge cases, could not be unit tested, and would require an API
key and network access in the server. For a classification layer
whose output triggers team notifications, probabilistic is not
the right tradeoff at v1.
