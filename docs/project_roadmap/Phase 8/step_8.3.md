### Step 8.3: Image Request Handling
**Goal**: Let customers request product images using the product media model defined by the API and storage layers.

**Current baseline**:
- Products already expose `imageUrls`, but there is no media-send runtime or image-request logic.
- Phase 3.8 defines the storage and API management work needed to make product media reliable.
- The customer-facing flow should rely on real product records, not model hallucinations about available images.

**Next work**:
- [ ] Add image lookup behavior that maps a grounded product selection to one or more stored media references.
- [ ] Integrate image actions with outbound media delivery in `apps/bot`.
- [ ] Define what happens when a product is found but has no images.
- [ ] Ensure the response text stays consistent with the images that were actually sent.

**Verification**:
- The bot only sends images associated with the resolved tenant product.
- No-image cases return a clear fallback instead of a broken media send.

**Tests**:
- Image-request flows cover one image, multiple images, and no-image products.
- Runtime tests ensure the outbound layer receives the exact media references selected by the action executor.

**Dependencies / Notes**:
- This step depends on the media-management decisions in Phase 3.8 and the outbound send helpers from Phase 5.5.
