### Step 3.7: Analytics Endpoint
**Goal**: Serve analytics summaries via API.

**Tasks**:
- [ ] Create `src/api/routes/analytics.ts`
- [ ] `GET /api/companies/:companyId/analytics?period=today|week|month`
- [ ] Aggregate from `analytics_events` table:
  - Total conversations
  - Total product searches
  - Image requests
  - Human handoffs
  - Average response time
  - Top searched products

- [ ] Return as structured JSON

**Verification**:
- Returns correct aggregations for each period filter

**Tests**:
- Empty data → returns zeros
- Seeded data → returns correct counts
