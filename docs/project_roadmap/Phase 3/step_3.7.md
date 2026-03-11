### Step 3.7: Analytics Read API
**Goal**: Build a read-optimized analytics summary endpoint on top of the existing analytics event store.

**Current baseline**:
- `convex/schema.ts` already defines the `analyticsEvents` table and time-based indexes.
- Schema and tests already prove analytics events can be stored and queried efficiently by company, type, and time.
- No shared event taxonomy or API summary endpoint exists yet.
- Later owner commands and automated reports depend on a reusable aggregation layer, not ad hoc queries.

**Next work**:
- [ ] Define the first supported analytics event taxonomy and payload fields needed by bot, API, and worker flows.
- [ ] Add Convex query functions that aggregate common periods such as `today`, `week`, and `month`.
- [ ] Include derived metrics that are realistic for the current product, such as handoffs, searches, image sends, and message counts.
- [ ] Add `apps/api` service and route support for `GET /api/companies/:companyId/analytics`.
- [ ] Keep the aggregation contract reusable by Phase 7 owner commands and Phase 9 reporting jobs.

**Verification**:
- Empty event history returns a stable zeroed response shape rather than missing fields.
- Aggregations respect company boundaries and requested time windows.
- Top-product style summaries only use grounded product identifiers present in the underlying events.

**Tests**:
- Empty dataset returns zeros and empty lists.
- Seeded event data returns correct counts for multiple time windows.
- API route tests cover invalid period values and missing company cases.

**Dependencies / Notes**:
- Event design in this step must stay aligned with the emission plan in Phase 8.7 so reporting does not require a second schema rewrite.
