### Step 6.5: Customer And Tenant Rate Controls
**Goal**: Add WhatsApp-side throttling and abuse controls distinct from the API rate limiter that already exists.

**Current baseline**:
- `apps/api` already enforces HTTP rate limiting for REST consumers.
- No per-customer or per-tenant WhatsApp throttling exists yet in `apps/bot`.
- The charter explicitly calls for predictable behavior under spam, accidental loops, and WhatsApp platform limits.

**Next work**:
- [ ] Define rate limits at the customer, tenant, and possibly owner-command levels.
- [ ] Add bot-side counters or leases that can survive reconnects and avoid race conditions.
- [ ] Decide whether rate-limit state belongs in memory, Convex, or a mixed approach depending on the durability requirement.
- [ ] Define the user-facing behavior for throttled interactions.

**Verification**:
- Repeated inbound messages from one sender do not flood the bot or providers.
- One noisy tenant does not degrade another tenant’s throughput guarantees.

**Tests**:
- Rate-limit tests cover burst traffic, window reset behavior, and multi-tenant isolation.
- Owner-command flows are either exempted or explicitly rate-limited according to policy.

**Dependencies / Notes**:
- Reuse patterns from the API limiter where sensible, but do not assume HTTP request identity rules apply to WhatsApp senders.
