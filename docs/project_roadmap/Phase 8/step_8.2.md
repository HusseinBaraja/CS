### Step 8.2: Catalog Request Handling
**Goal**: Let the runtime detect and fulfill catalog-style requests from grounded product data.

**Current baseline**:
- Product, category, and variant data already exist in Convex and are exposed through the API.
- No catalog formatter or customer-facing catalog flow exists yet in `apps/bot`.
- The original roadmap assumed a document-centric catalog step; the current codebase is product-data-first and should stay that way unless a later document model is added intentionally.

**Next work**:
- [ ] Define the catalog request scenarios the bot should support first, such as full catalog, category catalog, or narrowed catalog responses.
- [ ] Build a formatter that can turn product and category data into compact WhatsApp-friendly catalog messages.
- [ ] Integrate catalog actions with the structured action contract from Phase 8.1.
- [ ] Decide when catalog responses should be generated directly from data versus triggered as an AI-selected action.

**Verification**:
- Catalog responses use real category, product, and variant data from the tenant catalog.
- Large catalogs degrade gracefully through paging, summarization, or follow-up prompts.

**Tests**:
- Formatter tests cover empty categories, multi-product categories, and large-result truncation behavior.
- Runtime tests cover action-triggered catalog sends and direct request routing.

**Dependencies / Notes**:
- Keep this step grounded in the live product schema rather than assuming an external PDF catalog system exists.
