### Step 4.6: Chat Orchestration
**Goal**: Compose retrieval, prompt assembly, history, and provider failover into one reusable chat service.

**Current baseline**:
- Embedding generation already exists for catalog data, but there is no shared runtime that turns user input into a grounded answer.
- `apps/bot` still uses a placeholder `mockChat` bootstrap flow.
- Future bot and worker features need one shared orchestrator rather than embedding AI logic inside transport handlers.

**Next work**:
- [ ] Build a chat orchestration entrypoint in shared code that accepts tenant context, conversation context, and a user message.
- [ ] Run language detection, query embedding, retrieval, prompt assembly, and provider failover in one defined sequence.
- [ ] Return both the assistant text and any structured action envelope needed by later runtime steps.
- [ ] Define graceful behavior when retrieval is empty, providers fail, or the request is off-topic.

**Verification**:
- Product questions can produce grounded responses from retrieved catalog context.
- Off-topic or low-signal inputs return safe fallbacks instead of hallucinated answers.

**Tests**:
- End-to-end orchestration tests cover successful retrieval, empty retrieval, provider failover, and refusal behavior.
- Output tests confirm the orchestrator returns both user-facing text and structured action data when appropriate.

**Dependencies / Notes**:
- Keep orchestration reusable from `apps/bot` first, but do not make it transport-specific.
