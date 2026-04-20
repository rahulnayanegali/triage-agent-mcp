---

## Escalation Rules
- >1000 occurrences in 24h → escalate one level (P2→P1, P1→P0)
- "production" in environment tag → treat as at least P1
- Any error on /api/payments/ route → always P0
- If Frontend and Backend patterns both match → assign Backend

## Team Ownership
- PaymentForm, checkout, stripe, billing → Frontend (jsrescuer@gmail.com)
- AuthService, login, oauth, session → Backend (jsrescuer@gmail.com)
- database, db, query, migration → Platform (jsrescuer@gmail.com)
- pipeline, etl, kafka, data-sync → Data (jsrescuer@gmail.com)
- S3, CDN, CloudFront, infra → Platform (jsrescuer@gmail.com)
- API, REST, GraphQL, endpoint → Backend (jsrescuer@gmail.com)
- React, component, render, UI → Frontend (jsrescuer@gmail.com)
- analytics, metrics, tracking → Data (jsrescuer@gmail.com)
- cron, scheduler, worker, queue → Platform (jsrescuer@gmail.com)
- Default (unknown) → Backend (jsrescuer@gmail.com)

---
