### Step 3.5: Product Variant Endpoints
**Goal**: Manage product variants.

**Tasks**:
- [ ] Add to `src/api/routes/products.ts` (or separate `variants.ts`)
- [ ] `GET /api/companies/:companyId/products/:productId/variants` — list
- [ ] `POST /api/companies/:companyId/products/:productId/variants` — create
- [ ] `PUT .../variants/:id` — update (enforce company match via join)
- [ ] `DELETE .../variants/:id` — delete (enforce company match via join)

**Verification**:
- Variants link to correct product
- JSONB `attributes` stores flexibly

**Tests**:
- Create variant with simple attributes → success
- Create variant with complex attributes → success