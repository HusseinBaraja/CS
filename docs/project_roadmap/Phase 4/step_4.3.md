### Step 4.3: Gemini Provider
**Goal**: Implement Google Gemini as backup AI provider.

**Tasks**:
- [ ] Install `@google/genai`
- [ ] Create `src/providers/gemini.ts`
- [ ] Use Gemini Flash model for fast, cheap responses
- [ ] Implement same `AIProvider` interface
- [ ] Handle Gemini-specific response format

**Verification**:
- Same prompt format works as DeepSeek
- Response mapped to `ChatResponse` correctly

**Tests**:
- Mock API → response parsed correctly
- Error handling works
