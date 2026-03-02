### Step 4.4: Groq Provider
**Goal**: Implement Groq (Llama 3.1) as tertiary AI provider.

**Tasks**:
- [ ] Install `groq-sdk`
- [ ] Create `src/providers/groq.ts`
- [ ] Use Llama 3.1 8B model (cheapest, fastest)
- [ ] Implement same `AIProvider` interface

**Verification**:
- Response format matches other providers

**Tests**:
- Mock API → response parsed correctly
