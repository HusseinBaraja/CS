### Step 3.5: Product Variant API Stabilization
**Goal**: Finish hardening the already-existing product variant API surface.

**Current baseline**:
- `apps/api/src/routes/products.ts` already exposes variant list, create, update, and delete routes under the product resource.
- `apps/api/src/services/products.ts` already defines variant DTOs and service contracts.
- `convex/products.ts` already handles variant CRUD and re-generates product embeddings after variant changes.
- Variant attributes already support nested object and array values, not just flat key-value pairs.

**Next work**:
- [ ] Complete route-level test coverage for variant success and error paths in `apps/api/src/routes/products.test.ts`.
- [ ] Add service adapter coverage for variant operations in `apps/api/src/services/convexProductsService.test.ts`.
- [ ] Confirm API response shapes stay consistent with product CRUD error handling and status code conventions.
- [ ] Document the variant contract as part of the public API baseline before adding higher-level catalog and bot features.

**Verification**:
- Variant CRUD works only within the owning `companyId` and `productId` scope.
- Variant writes always trigger embedding refresh through the Convex action flow.
- Complex `attributes` payloads survive round-trip serialization without shape loss.

**Tests**:
- List variants for an existing product returns the stored variants in the expected payload shape.
- Create, update, and delete variant routes cover `404`, `400`, and `409` cases in addition to success cases.
- Convex adapter tests confirm tagged Convex errors map to the correct API-facing service errors.

**Dependencies / Notes**:
- Keep variant logic in the existing product resource path unless a later API version requires dedicated variant routes.
- Embedding refresh must continue to happen inside Convex actions, not inside plain mutations.
