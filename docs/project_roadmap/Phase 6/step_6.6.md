### Step 6.6: Welcome And Offer Flow
**Goal**: Handle first-contact greetings and active promotional offers without breaking the main customer request flow.

**Current baseline**:
- Offers already exist in the schema and seed data, but they are not queryable through bot logic yet.
- No first-contact detection or welcome-message logic exists yet.
- The product charter treats welcome and promotional messaging as conditional and context-aware, not as bulk marketing.

**Next work**:
- [ ] Define how the bot detects a first-time customer versus a returning one.
- [ ] Add active-offer lookup rules that reuse the offer data model planned for the API in Phase 3.6.
- [ ] Decide whether greetings and offers are static templates, AI-assisted phrasing, or a hybrid.
- [ ] Ensure the customer’s actual question is still answered promptly after any welcome or offer content.

**Verification**:
- First-time contacts receive the intended greeting behavior exactly once per tenant policy.
- Active offers are only surfaced when valid for the company and current time window.

**Tests**:
- First-contact and returning-contact cases are both covered.
- Active, expired, and disabled offer scenarios behave predictably.

**Dependencies / Notes**:
- This step depends on Phase 3.6 for a stable offers management surface and on conversation persistence for first-contact detection.
