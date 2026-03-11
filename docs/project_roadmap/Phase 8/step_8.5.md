### Step 8.5: Currency-Aware Response Formatting
**Goal**: Present prices in the right currency and formatting style for each tenant conversation.

**Current baseline**:
- Product records already include `basePrice` and `baseCurrency`.
- Currency rates already exist in the schema and seed data, but there is no retrieval or formatting layer yet.
- Customer-facing replies should not guess at conversion data or silently mix currencies.

**Next work**:
- [ ] Add a shared conversion and formatting helper that resolves the company’s relevant rate data.
- [ ] Define fallback behavior when conversion data is missing, stale, or ambiguous.
- [ ] Ensure AI responses and non-AI catalog formatting both use the same price-rendering helper.
- [ ] Decide how rates are selected when multiple currency pairs become available for one tenant.

**Verification**:
- Replies present prices consistently for the same tenant and conversation context.
- Missing conversion data results in a clear fallback rather than a fabricated rate.

**Tests**:
- Conversion tests cover direct conversion, missing rate, and unchanged base-currency formatting.
- Output tests verify both AI and non-AI responses use the same formatted price representation.

**Dependencies / Notes**:
- This step depends on the management surface added in Phase 3.6 for rates.
