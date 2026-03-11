## Phase 6: Conversation Lifecycle And Controls
### Step 6.1: Conversation Repository
**Goal**: Persist customer conversations and message history in a bot-friendly way using the existing Convex tables.

**Current baseline**:
- `convex/schema.ts` already includes `conversations` and `messages`.
- Schema tests already cover indexed conversation and message storage.
- No conversation-specific repository or service layer exists yet for bot flows.

**Next work**:
- [ ] Add shared Convex functions or shared repository helpers for get-or-create conversation behavior.
- [ ] Add message append helpers with consistent timestamp handling and role validation.
- [ ] Decide whether repository helpers should live in `convex`, a shared package, or a thin bot-facing adapter layer.
- [ ] Keep company and phone-number scoping explicit in every read and write path.

**Verification**:
- The same customer talking to the same company resolves to one active conversation record.
- Message writes are consistently associated with the correct conversation and role.

**Tests**:
- Get-or-create logic is idempotent for the same company and phone number.
- Message persistence covers ordered reads and multi-tenant isolation.

**Dependencies / Notes**:
- Conversation repository design must remain compatible with future mute state and auto-resume behavior.
