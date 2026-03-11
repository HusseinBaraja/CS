### Step 8.7: Analytics Event Emission
**Goal**: Emit analytics events from customer-facing bot behavior so API summaries and owner commands have real operational data.

**Current baseline**:
- The analytics event table already exists, but no runtime emits production-style events yet.
- Future analytics reads in Phase 3.7 and owner analytics in Phase 7.4 both depend on consistent event emission.
- Customer-facing features in this phase introduce the main behavior that needs to be measured.

**Next work**:
- [ ] Define the event types emitted for searches, clarifications, handoffs, catalog sends, image sends, and successful responses.
- [ ] Add event-emission helpers that can be called from bot flows without duplicating payload-shape logic.
- [ ] Ensure emitted payloads stay small, typed, and useful for later reporting.
- [ ] Decide which failures should also emit analytics or operational events.

**Verification**:
- Major customer interaction branches produce the expected analytics events.
- Events remain scoped to the correct tenant and time window.

**Tests**:
- Event-emission tests cover each customer-facing branch and verify payload shapes.
- Integration tests confirm emitted events can be aggregated by the Phase 3.7 summaries.

**Dependencies / Notes**:
- Keep event taxonomy synchronized with the aggregation requirements defined earlier in the roadmap.
