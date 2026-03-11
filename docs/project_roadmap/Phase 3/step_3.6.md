### Step 3.6: Offers And Currency Rate API
**Goal**: Expose promotional offers and exchange rates through the same API and Convex patterns used for companies, categories, and products.

**Current baseline**:
- `convex/schema.ts` already includes `offers` and `currencyRates` tables.
- `convex/seed.ts` and `convex/seedData.ts` already seed sample offers and at least one company currency rate.
- The API app does not yet expose routes or service adapters for either resource.
- Owner-command requirements in the charter still depend on these data sets becoming queryable and writable through stable application interfaces.

**Next work**:
- [ ] Add Convex functions for offer list, create, update, and delete with company scoping and active-window rules.
- [ ] Add Convex functions for currency-rate list and upsert keyed by `companyId + fromCurrency + toCurrency`.
- [ ] Add `apps/api` service interfaces, Convex adapters, schemas, and routes for both resources.
- [ ] Decide which currency-rate mutations should later be reused by owner commands versus staying API-only.
- [ ] Ensure offer and rate validation rules are explicit about date handling, duplicate pairs, and trimming behavior.

**Verification**:
- Offer reads can return active-only data by default while still supporting a full-management view.
- Currency rate writes are deterministic for a company and currency pair.
- API and Convex responses follow the same multi-tenant scoping rules as the existing CRUD surfaces.

**Tests**:
- Offer CRUD covers active and inactive filtering plus invalid date ranges.
- Currency-rate upsert covers create, update, duplicate pair handling, and invalid numeric rates.
- API route tests mirror the error-shape conventions already used in `apps/api`.

**Dependencies / Notes**:
- Convex `1.32.0` in this repo has no schema-level unique constraints, so currency-rate singleton behavior per pair must be enforced in function logic.
