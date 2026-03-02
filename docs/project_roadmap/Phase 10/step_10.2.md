### Step 10.2: Graceful Degradation
**Goal**: Handle service failures without crashing.

**Tasks**:
- [ ] AI failover chain: DeepSeek → Gemini → Groq → human handoff (already in Phase 4)
- [ ] Convex handles retry/reconnection automatically (no manual DB connection management)
- [ ] Baileys reconnection on disconnect
- [ ] Friendly error messages to users (bilingual)
- [ ] Global unhandled exception/rejection handlers

**Verification**:
- AI failure doesn't crash bot
- Convex backend accessible and stable
- Users always get a response (even if "sorry, try again later")

**Tests**:
- Simulate Convex errors → handled gracefully
- Simulate all AI down → human handoff triggered
