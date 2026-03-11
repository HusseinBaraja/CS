### Step 5.5: Outbound Message Delivery
**Goal**: Provide one outbound delivery layer for text and media responses that the rest of the bot runtime can trust.

**Current baseline**:
- No real outbound delivery abstraction exists yet in `apps/bot`.
- Product records already expose `imageUrls`, which future image replies can depend on once media sending exists.
- The product charter expects typing indicators and natural pacing, but those do not exist yet.

**Next work**:
- [ ] Add outbound helpers for plain text, media sends, and response sequencing.
- [ ] Add optional typing indicators and intentional response delay hooks that can be enabled per conversation flow.
- [ ] Normalize outbound formatting so later AI, catalog, and owner-command replies do not each build messages differently.
- [ ] Define retry and failure behavior for outbound sends without duplicating messages excessively.

**Verification**:
- Text and media sends can be invoked through one stable bot-side interface.
- Message formatting stays predictable across AI replies, catalog sends, and operator responses.

**Tests**:
- Unit tests cover formatting, delay policy, and retry classification.
- Runtime tests verify outbound helper behavior for both plain text and media cases where practical.

**Dependencies / Notes**:
- Media delivery here should integrate with the storage decisions defined in Phase 3.8.
