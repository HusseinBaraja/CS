## Phase 8: Customer-Facing AI Features
### Step 8.1: Action Detection Contract
**Goal**: Define the structured action contract that can safely accompany AI-generated text responses.

**Current baseline**:
- The shared prompting and chat orchestration work still needs a defined action envelope.
- No action parser or executor exists yet in the runtime.
- The product scope expects actions such as catalog sends, image sends, clarification requests, and human escalation.

**Next work**:
- [ ] Define the allowed action types and the exact schema returned by the chat orchestrator.
- [ ] Add a parser and validator that rejects malformed or unsupported actions safely.
- [ ] Define how plain text and action payloads coexist in one assistant response contract.
- [ ] Keep action handling transport-agnostic enough that bot runtime code only executes already-validated instructions.

**Verification**:
- Valid action payloads can be parsed without ambiguous fallback logic.
- Unknown or malformed actions never cause unsafe execution.

**Tests**:
- Parser tests cover valid actions, invalid schemas, unknown action types, and missing fields.
- Contract tests ensure the action schema stays aligned with prompt expectations from Phase 4.4.

**Dependencies / Notes**:
- Treat action payloads as advisory outputs from the model, not as trusted commands.
