### Step 7.4: Analytics Command
**Goal**: Expose owner-facing analytics summaries over WhatsApp using the same aggregation layer planned for the REST API.

**Current baseline**:
- Analytics events are already modeled, but no aggregation layer exists yet.
- The charter expects commands such as `!analytics`.
- A bot-side analytics command should reuse the same data logic as Phase 3.7 instead of re-implementing summaries in `apps/bot`.

**Next work**:
- [ ] Implement `!analytics` for supported periods such as today, week, and month.
- [ ] Reuse the shared analytics aggregation layer rather than querying raw events from the command handler.
- [ ] Define concise WhatsApp formatting for counts, trend highlights, and top products.
- [ ] Decide whether the command should fail closed when no analytics data exists or return a zeroed summary.

**Verification**:
- The same source data yields consistent summaries through both the API and the owner command.
- Command output stays readable within WhatsApp message constraints.

**Tests**:
- Command tests cover empty analytics, populated analytics, and invalid period arguments.
- Integration coverage ensures API and command summaries stay aligned.

**Dependencies / Notes**:
- This step depends directly on Phase 3.7 producing a stable aggregation contract.
