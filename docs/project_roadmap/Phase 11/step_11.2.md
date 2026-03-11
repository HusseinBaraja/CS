### Step 11.2: Integration Tests
**Goal**: Add cross-layer coverage for the flows that span packages, apps, and Convex boundaries.

**Current baseline**:
- Existing coverage already exercises several API-to-Convex and schema-level paths.
- No integration coverage exists yet for bot-to-AI, retrieval, command, or scheduled-job flows because those systems are still to be built.
- The architecture now depends on shared packages more heavily than the original roadmap assumed.

**Next work**:
- [ ] Add API-to-Convex integration coverage for the remaining management surfaces such as offers, rates, analytics, and image metadata.
- [ ] Add bot-to-shared-AI and bot-to-retrieval integration coverage using test doubles around WhatsApp transport.
- [ ] Add job-oriented integration coverage for auto-resume, analytics rollups, and media cleanup.
- [ ] Prefer integration seams that validate contract wiring without requiring live external providers.

**Verification**:
- The main application flows work across package boundaries without hidden adapter mismatches.
- Integration failures point to real cross-layer contract breakage rather than purely internal unit issues.

**Tests**:
- API integration tests cover success and failure flows end to end through the adapter boundary.
- Bot integration tests cover normalized inbound message to outbound response orchestration.

**Dependencies / Notes**:
- Keep integration coverage focused on the monorepo boundaries that matter most: `apps/api`, `apps/bot`, `packages/ai`, `packages/rag`, and `convex`.
