### Step 3.4: Product Endpoints
**Goal**: Implement product CRUD with auto-embedding regeneration.

**Tasks**:
- [ ] Create `src/api/routes/products.ts`
- [ ] `GET /api/companies/:companyId/products` — list (with `?categoryId` and `?search` filters)
- [ ] `GET /api/companies/:companyId/products/:id` — get with variants included
- [ ] `POST /api/companies/:companyId/products` — create (auto-generate embeddings)
- [ ] `PUT /api/companies/:companyId/products/:id` — update (re-generate embeddings)
- [ ] `DELETE /api/companies/:companyId/products/:id` — delete (cascades embeddings + variants + R2 images)

**Verification**:
- All endpoints work
- Creating/updating a product triggers embedding generation
- Products return with their variants nested

**Tests**:
- CRUD lifecycle
- Filter by category
- Embedding auto-generation on create/update
