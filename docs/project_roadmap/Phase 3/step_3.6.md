### Step 3.6: Offers & Currency Rate Endpoints
**Goal**: Manage promotional offers and exchange rates.

**Tasks**:
- [ ] Create `src/api/routes/offers.ts`
  - `GET /api/companies/:companyId/offers` — list (default: active only, `?all=true` for all)
  - `POST /api/companies/:companyId/offers` — create
  - `PUT .../offers/:id` — update
  - `DELETE .../offers/:id` — delete

- [ ] Create `src/api/routes/currencyRates.ts`
  - `GET /api/companies/:companyId/currency-rates` — list
  - `PUT /api/companies/:companyId/currency-rates` — upsert rate

**Verification**:
- Offers filtered by active/inactive
- Currency rates stored and retrievable

**Tests**:
- Create offer with start/end dates
- Rate upsert (insert if not exists, update if exists)
