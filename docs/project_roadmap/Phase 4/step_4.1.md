## Phase 4: Shared AI And Retrieval Foundation
### Step 4.1: AI Package Contracts
**Goal**: Define the shared chat-provider contracts inside `packages/ai` so later bot and worker features can depend on one stable interface.

**Current baseline**:
- `packages/ai` already exists and currently owns Gemini embedding helpers plus a temporary `mockChat` placeholder.
- The package already depends on `openai`, `@google/genai`, and `groq-sdk`, but there is no unified chat-provider contract yet.
- API and Convex code already rely on `@cs/ai` for embeddings, so chat contracts should expand the package rather than creating parallel app-local abstractions.

**Next work**:
- [ ] Define chat provider interfaces, message types, response types, and provider error categories in `packages/ai`.
- [ ] Add package-local runtime config types for provider keys, model selection, timeout policy, and failover ordering.
- [ ] Separate embedding contracts from chat contracts so the package can evolve without conflating the two concerns.
- [ ] Expose only the stable public types through `packages/ai/src/index.ts`.

**Verification**:
- A consumer in `apps/bot` can depend on the shared chat contract without importing provider-specific SDK types.
- The embedding API remains compatible with current Convex product workflows.

**Tests**:
- Type-level and unit tests cover message normalization, config validation, and provider error tagging.
- Public package exports stay stable and do not leak SDK-specific response objects.

**Dependencies / Notes**:
- Keep provider contracts in `packages/ai`, not in `apps/bot`, so later API or worker features can reuse the same interface.
