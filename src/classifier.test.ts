import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyIssue, parseTriageConfig } from "./classifier.js";
import type { IssueData } from "./classifier.js";

const triageContext = `
# Triage context

## Routes

### payment-failures
description: "payment errors, stripe checkout failed, billing issue, transaction declined"
severity: P0
team: Frontend
assignee: frontend@company.com

### frontend-crash
description: "TypeError, undefined, cannot, property, unhandled, exception, React render, component crashed"
severity: P2
team: Frontend
assignee: frontend@company.com

## Escalation rules

### high-volume
trigger: event_count > 1000
action: bump

### production-floor
trigger: environment = production
action: floor P1
`;

const config = parseTriageConfig(triageContext);

test("StripeError in PaymentForm → P0, Frontend", () => {
  const issue: IssueData = {
    id: "JAVASCRIPT-REACT-1",
    title: "StripeError: No such payment_intent in PaymentForm.handleSubmit",
    culprit: "PaymentForm.handleSubmit",
    eventCount: 114,
    userCount: 1,
  };
  const result = classifyIssue(issue, config);
  assert.equal(result.severity, "P0");
  assert.equal(result.team, "Frontend");
});

test("TypeError in SearchResults.render → P2, Frontend", () => {
  const issue: IssueData = {
    id: "JAVASCRIPT-REACT-2",
    title: "TypeError: Cannot read properties of undefined (reading 'map')",
    culprit: "SearchResults.render",
    eventCount: 29,
    userCount: 1,
  };
  const result = classifyIssue(issue, config);
  assert.equal(result.severity, "P2");
  assert.equal(result.team, "Frontend");
});

test("Unknown error → P2 default, Backend", () => {
  const issue: IssueData = {
    id: "JAVASCRIPT-REACT-3",
    title: "This is your first error!",
    culprit: "onClick",
    eventCount: 1,
    userCount: 1,
  };
  const result = classifyIssue(issue, config);
  assert.equal(result.severity, "P2");
  assert.equal(result.team, "Backend");
});

test("High volume bumps severity from P2 to P1", () => {
  const issue: IssueData = {
    id: "TEST-4",
    title: "TypeError: Cannot read properties of undefined",
    culprit: "SearchResults.render",
    eventCount: 1500,
    userCount: 10,
  };
  const result = classifyIssue(issue, config);
  assert.equal(result.severity, "P1");
  assert.equal(result.team, "Frontend");
  assert.ok(result.reason.some((r) => r.includes("high-volume")));
});

test("Production environment floors severity to P1", () => {
  const issue: IssueData = {
    id: "TEST-5",
    title: "TypeError: Cannot read properties of undefined",
    culprit: "SearchResults.render",
    eventCount: 5,
    userCount: 1,
    environment: "production",
  };
  const result = classifyIssue(issue, config);
  assert.equal(result.severity, "P1");
  assert.equal(result.team, "Frontend");
  assert.ok(result.reason.some((r) => r.includes("production-floor")));
});

test("No escalation fires when conditions not met", () => {
  const issue: IssueData = {
    id: "TEST-6",
    title: "TypeError: Cannot read properties of undefined",
    culprit: "SearchResults.render",
    eventCount: 50,
    userCount: 1,
    environment: "staging",
  };
  const result = classifyIssue(issue, config);
  assert.equal(result.severity, "P2");
  assert.equal(result.reason.length, 1);
});
