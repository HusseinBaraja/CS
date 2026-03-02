### Step 3.3: Category Endpoints
**Goal**: Implement category CRUD scoped by company.
**Tasks**:
- [ ] Create `src/api/routes/categories.ts`
- [ ] `GET /api/companies/:companyId/categories` — list categories
- [ ] `GET /api/companies/:companyId/categories/:id` — get single
- [ ] `POST /api/companies/:companyId/categories` — create
- [ ] `PUT /api/companies/:companyId/categories/:id` — update
- [ ] `DELETE /api/companies/:companyId/categories/:id` — delete (fail if products exist)

**Verification**:
- All endpoints work correctly
- Delete returns 409 if category has products

**Tests**:
- Full CRUD cycle
- Delete with products → 409 conflict