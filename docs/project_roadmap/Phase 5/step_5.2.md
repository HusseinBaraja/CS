### Step 5.2: Product Embedding Generation
**Goal**: Generate and store embeddings for all products.

**Tasks**:
- [ ] Create embedding text template: combine `name + description + specs` for each language
- [ ] Generate embeddings for both Arabic and English versions of each product
- [ ] Store in Convex `embeddings` table using a mutation, scoped by `companyId`
- [ ] Create a Convex action to regenerate all embeddings
- [ ] Hook into product create/update API to auto-regenerate

**Verification**:
- All products have 2 embeddings (AR + EN)
- Re-running is idempotent (deletes old, creates new)
