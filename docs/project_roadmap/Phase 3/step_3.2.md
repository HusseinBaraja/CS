### Step 3.2: Company Endpoints
**Goal**: Implement company (tenant) management endpoints.
**Tasks**:

- [ ] Create `src/api/routes/companies.ts`
- [ ] `GET /api/companies` — list all companies
- [ ] `GET /api/companies/:companyId` — get single company
- [ ] `POST /api/companies` — register new company
- [ ] `PUT /api/companies/:companyId` — update company config
- [ ] `DELETE /api/companies/:companyId` — delete company (cascades to all data)

**Verification**:
- All CRUD operations work
- Deletion cascades properly

**Tests**:
- CRUD lifecycle test
- Cascade delete removes products, conversations, etc.
- Validation rejects invalid input
