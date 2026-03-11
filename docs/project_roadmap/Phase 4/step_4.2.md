### Step 4.2: Provider Adapters
**Goal**: Implement the real chat-provider adapters in `packages/ai` using the SDKs that are already present in the workspace.

**Current baseline**:
- `openai`, `@google/genai`, and `groq-sdk` are already installed in `packages/ai`.
- No provider adapter currently exposes a real chat call or health check.
- Gemini is already used for embeddings, so chat and embedding concerns must coexist cleanly inside the same package.

**Next work**:
- [ ] Implement a DeepSeek adapter using the OpenAI-compatible client path.
- [ ] Implement a Gemini chat adapter without breaking the existing embedding helpers.
- [ ] Implement a Groq adapter as the tertiary provider.
- [ ] Add timeout, retry, and transient-failure classification at the adapter boundary.
- [ ] Document the exact environment variables each provider requires and which ones remain optional.

**Verification**:
- Each adapter maps the provider response into the shared `packages/ai` chat result shape.
- Timeout and retry behavior is consistent enough that higher-level failover does not need SDK-specific branching.

**Tests**:
- Mocked adapter tests cover successful responses, retryable failures, non-retryable failures, and health checks.
- Provider-specific payload quirks are normalized before reaching the shared contract.

**Dependencies / Notes**:
- Keep provider SDK usage private to `packages/ai`; downstream apps should consume only shared abstractions.
