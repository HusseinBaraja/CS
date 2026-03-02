### Step 5.4: RAG Context Builder
**Goal**: Build AI context from search results.

**Tasks**:
- [ ] Create `src/services/rag/context.ts`
- [ ] Format product data into readable context string including:
  - Product name (in detected language)
  - Description
  - Specifications
  - Price (converted via company's currency rates)
  - Available variants
- [ ] Limit context size to stay within token limits
- [ ] Include "no products found" signal when search returns empty

**Verification**:
- Context includes relevant product details
- Prices converted correctly using company's rates
- Variants displayed under their product

**Tests**:
- Products with variants → variants listed
- Currency conversion applied correctly
- Empty search → appropriate message
