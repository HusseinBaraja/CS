### Step 5.5: RAG-Enhanced AI Responses
**Goal**: Integrate the full RAG pipeline into AI response generation.

**Tasks**:
- [ ] Create `src/services/ai/chat.ts` — the main orchestrator
- [ ] Pipeline:
    1. Detect language of user query
    2. Call vector search with query + company ID
    3. Build context from results
    4. Assemble messages: system prompt + context + conversation history + user query
    5. Call AI provider
    6. Return response with action markers (if any)
- [ ] Handle "no results found" gracefully

**Verification**:
- Product questions answered with real data from RAG
- Prices shown correctly in target currency
- Unknown products handled gracefully (bot says "I couldn't find...")
- Off-topic questions politely refused

**Tests**:
- Product query with matches → contextual response
- Product query with no matches → graceful fallback
- Off-topic → refusal response
