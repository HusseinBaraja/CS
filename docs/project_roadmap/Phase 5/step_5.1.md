## Phase 5: RAG Pipeline
### Step 5.1: Gemini Embedding Service
**Goal**: Generate text embeddings using Gemini's embedding API.

**Tasks**:
- [ ] Create `src/services/rag/embeddings.ts`
- [ ] Use `gemini-embedding-001` model (768 dimensions)
- [ ] Implement `generateEmbedding(text: string): Promise<number[]>`
- [ ] Implement `generateBatchEmbeddings(texts: string[]): Promise<number[][]>`
- [ ] Add retry logic and error handling
- [ ] Add in-memory LRU cache for query embeddings (avoid re-embedding repeated queries)
- [ ] Have 2 backup embedding providers in case Gemini is down. No text fallback.

**Verification**:
- Embedding for English text returns 768-dimension vector
- Embedding for Arabic text returns 768-dimension vector
- Batch generation works
- Cached queries return instantly without API call
- Embedding API down → backup embedding provider returns results

**Tests**:
- Mock API → correct dimension output
- Empty string → handled gracefully
