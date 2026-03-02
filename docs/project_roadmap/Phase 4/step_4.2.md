### Step 4.2: DeepSeek Provider
**Goal**: Implement the primary AI provider using OpenAI-compatible API.

**Tasks**:
- [ ] Install `openai` package
- [ ] Create `src/providers/deepseek.ts`
- [ ] Configure with DeepSeek base URL and API key
- [ ] Implement `chat()` with timeout and retry logic
- [ ] Implement `isAvailable()` health check


**Verification**:
- Simple prompt returns response
- Timeout works correctly
- Retries on transient failures (429, 500, 503)

**Tests**:
- Mock API → successful response parsed correctly
- Mock API → timeout triggers retry
- `isAvailable()` returns true/false correctly\
