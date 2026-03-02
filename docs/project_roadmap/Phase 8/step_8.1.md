## Phase 8: Owner Commands
### Step 8.1: Command Parser
**Goal**: Parse owner commands (prefix: `!`).

**Tasks**:
- [ ] Create `src/controllers/command.ts`
- [ ] Detect `!` prefix in message
- [ ] Parse command name and arguments
- [ ] Validate sender is the company owner
- [ ] Route to matching command handler
- [ ] Return "unknown command" for invalid commands

**Verification**:
- `!help` → parsed correctly
- `!setrate SAR YER 425` → command="setrate", args=["SAR","YER","425"]
- Non-owner → rejected with message

**Tests**:
- Parse various command formats
- Owner validation
- Unknown command handling
