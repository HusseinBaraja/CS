### Step 7.3: State Mutation Commands
**Goal**: Add owner commands that mutate live bot or company state in controlled ways.

**Current baseline**:
- The charter expects command-driven state changes such as `!clear` and currency-rate management.
- API and Convex mutation surfaces for offers and currency rates are still planned work in Phase 3.6.
- Conversation data already exists, so `!clear` can be grounded in persisted state once the repository layer is in place.

**Next work**:
- [ ] Implement `!clear` to reset or trim the active conversation safely for the correct tenant and sender.
- [ ] Decide which currency-rate write commands belong in the bot, what syntax they use, and which Convex/API paths they call.
- [ ] Define authorization and confirmation behavior for commands that change customer-visible behavior.
- [ ] Ensure command mutations are idempotent or clearly retry-safe.

**Verification**:
- `!clear` only affects the intended conversation.
- Currency-related commands update the same underlying data model used by the API.

**Tests**:
- Command tests cover successful mutation, unauthorized use, missing arguments, and invalid values.
- Integration tests confirm owner-command writes and API reads stay consistent.

**Dependencies / Notes**:
- This step should not invent parallel data models for rates or conversation resets; it must reuse the main application contracts.
