### Step 5.3: Vector Search Service
**Goal**: Implement semantic product search using Convex's built-in vector search.

**Tasks**:
- [ ] Create `src/services/rag/vectorSearch.ts`
- [ ] Implement `search(query: string, companyId: string, limit?: number)`:
  1. Generate embedding for the query via Gemini
  2. Call `ctx.vectorSearch("embeddings", "by_embedding", { ... })` as a Convex action
  3. Filter by `companyId` using Convex's built-in filter expressions
  4. Return ranked product matches with `_score` similarity values
- [ ] Filter by similarity threshold on `_score` (configurable, default 0.3)

**Verification**:
- "food containers" finds relevant container products
- Arabic queries match Arabic product descriptions
- Results ordered by relevance (`_score`)
- Cross-company isolation works via `companyId` filter

**Tests**:
- Mock embedding → correct Convex vector search call
- Threshold filters low-relevance results
