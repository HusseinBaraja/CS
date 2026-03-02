### Step 9.6: Analytics Event Tracking
**Goal**: Track all meaningful events for reporting.

**Tasks**:
- [ ] Create `src/services/analytics.ts`
- [ ] Track events:
    - `message_received` — every incoming message
    - `product_searched` — every RAG search with results count
    - `catalog_requested` — catalog action triggered
    - `image_requested` — image action triggered
    - `handoff_triggered` — human handoff with reason
    - `ai_response` — provider, latency, token count
    - `low_confidence` — query + score

- [ ] Implement `getAnalyticsSummary(companyId, period)`
- [ ] Add Convex cron job to purge analytics events older than 90 days (prevents unbounded table growth)

**Verification**:
- Events stored correctly
- Summary aggregation matches raw events

**Tests**:
- Track event → stored in DB
- Summary calculation correct
