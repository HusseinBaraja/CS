### Step 12.2: API Documentation
**Goal**: Document the real API surface first, then decide whether interactive docs are worth adding.

**Current baseline**:
- The API already exposes a meaningful baseline: health, readiness, auth bootstrap, and CRUD for companies, categories, products, and variants.
- No OpenAPI or interactive documentation layer exists yet.
- The roadmap should prioritize accurate public contract documentation over tooling for its own sake.

**Next work**:
- [ ] Document the existing public endpoints and their payload shapes in a source-of-truth doc or generated contract.
- [ ] Extend documentation as offers, rates, analytics, and image-management endpoints land.
- [ ] Decide whether interactive docs are justified once the API surface is stable enough to benefit from them.
- [ ] Keep examples aligned with the actual auth and error-response behavior already present in `apps/api`.

**Verification**:
- API consumers can discover the live route surface and expected payloads without reading the implementation.
- Examples stay synchronized with the real endpoints and status codes.

**Tests**:
- Documentation review checks endpoint coverage against `apps/api/src/app.ts` and route modules.
- If generated docs are introduced later, add checks that prevent route drift.

**Dependencies / Notes**:
- Interactive docs are a stretch task, not the primary objective of this step.
