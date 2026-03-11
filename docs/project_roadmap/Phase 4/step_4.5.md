### Step 4.5: Retrieval Layer In `@cs/rag`
**Goal**: Replace the current `@cs/rag` stub with a real retrieval layer built on the embeddings already stored in Convex.

**Current baseline**:
- `packages/rag/src/index.ts` is currently a placeholder.
- `convex/products.ts` already generates and refreshes bilingual product embeddings.
- `convex/vectorSearch.ts` already exposes vector search filtered by the combined `companyLanguage` field.

**Next work**:
- [ ] Add query-embedding helpers in `packages/rag` that reuse `@cs/ai` embedding capabilities.
- [ ] Add retrieval functions that call the existing Convex vector search action and hydrate product context from the hits.
- [ ] Normalize the retrieval output into product-centric context blocks suitable for prompt assembly.
- [ ] Add clear handling for empty search results, low-signal results, and language-specific retrieval.

**Verification**:
- Retrieval returns grounded product context from the correct company and language filter.
- Empty retrieval results return a stable, explicit outcome rather than silent fall-through.

**Tests**:
- Retrieval tests cover English and Arabic query paths, no-result cases, and company scoping.
- Convex-facing integration tests confirm the retrieval layer uses the combined `companyLanguage` filter correctly.

**Dependencies / Notes**:
- On the current Convex version in this repo, multi-field `AND` filtering is not available in `ctx.vectorSearch(...).filter(...)`, so retrieval must continue to rely on the combined `companyLanguage` field.
