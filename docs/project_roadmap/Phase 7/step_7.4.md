### Step 7.4: Welcome Message & Proactive Offers
**Goal**: Greet first-time customers and share active offers.

**Tasks**:
- [ ] Detect first-time customer (no existing conversation)
- [ ] **Idempotency guard**: encapsulate the "find or create" logic completely inside a single Convex mutation script to prevent duplicate welcomes from rapid concurrent messages
- [ ] Send welcome message template (bilingual)
- [ ] Query active offers for the company from `offers` table
- [ ] If offers exist, use AI to generate a natural promotional message from the offer data
- [ ] Send offer message as a second message after welcome
- [ ] Then proceed to answer the customer's actual query

**Verification**:
- First message → welcome + offer + answer
- Returning customer → just answer (no welcome again)
- No active offers → welcome + answer only

**Tests**:
- First-time customer → welcome sent
- Returning customer → no welcome
- Active offers → AI-generated offer message
- No offers → skipped gracefully
