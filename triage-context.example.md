---

# Triage context
# This file is yours to edit. The server reads it on every boot.
# Add routes, change descriptions, update emails — no code changes needed.
# The richer your descriptions, the better the matching.

## Routes

### payment-failures
description: "payment errors, stripe checkout failed, billing issue, transaction declined, cart error, invoice failure, subscription charge failed"
severity: P0
team: Frontend
assignee: your-frontend-team@company.com

### auth-failures
description: "login failed, session expired, oauth error, authentication broken, unauthorized access, token invalid, password reset failed, signup error"
severity: P1
team: Backend
assignee: your-backend-team@company.com

### database-errors
description: "database connection failed, query timeout, RDS error, DynamoDB failure, migration failed, connection pool exhausted, SQL error"
severity: P0
team: Platform
assignee: your-platform-team@company.com

### api-errors
description: "API 500 error, server error, REST endpoint failing, GraphQL error, CORS issue, API gateway timeout, backend service unavailable"
severity: P1
team: Backend
assignee: your-backend-team@company.com

### frontend-crash
description: "TypeError, undefined is not a function, cannot read property, unhandled exception, React render error, component crashed, white screen"
severity: P2
team: Frontend
assignee: your-frontend-team@company.com

### network-errors
description: "fetch failed, network request failed, SSL error, CDN timeout, CloudFront error, DNS failure, connection refused"
severity: P2
team: Backend
assignee: your-backend-team@company.com

### noise
description: "ResizeObserver loop limit, browser extension error, AbortError, non-error promise rejection, script error cross-origin, favicon 404"
severity: P3
team: Ignore
assignee: none

---
