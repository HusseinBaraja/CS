## Phase 7: Owner Commands
### Step 7.1: Command Parser And Authorization
**Goal**: Add a bot-side owner command layer that is explicit about parsing, authorization, and error handling.

**Current baseline**:
- The product scope depends on owner commands, but `apps/bot` does not implement them yet.
- Owner phone numbers already exist on company records and can anchor authorization.
- Inbound normalization from Phase 5.4 should make command parsing transport-agnostic within the bot runtime.

**Next work**:
- [ ] Add a command parser in `apps/bot` for `!`-prefixed owner messages.
- [ ] Authorize commands against company ownership and any future access-control policy.
- [ ] Route valid commands to dedicated handlers instead of embedding business logic in the parser.
- [ ] Define consistent unknown-command and unauthorized-command responses.

**Verification**:
- Valid owner commands are parsed and routed predictably.
- Non-owner attempts do not execute command handlers.

**Tests**:
- Parser tests cover command names, argument splitting, whitespace handling, and unknown commands.
- Authorization tests cover the owner phone and disallowed senders.

**Dependencies / Notes**:
- Command parsing should stay separate from individual command implementations so later commands are easy to add and test.
