### Step 5.4: Inbound Message Normalization
**Goal**: Normalize raw WhatsApp events into a stable internal message model before business logic runs.

**Current baseline**:
- `apps/bot` has no inbound pipeline yet.
- Conversation, message, and company tables already exist in Convex, which gives the runtime a target data model.
- Later access control, owner commands, analytics, and AI routing all depend on one consistent normalized event shape.

**Next work**:
- [ ] Define the internal inbound message model used by bot orchestration.
- [ ] Normalize sender identity, company identity, message text, media markers, timestamps, and owner/customer role.
- [ ] Ignore unsupported or irrelevant WhatsApp events safely and explicitly.
- [ ] Route normalized messages into either owner-command handling or customer conversation handling.

**Verification**:
- Equivalent inbound WhatsApp events produce the same normalized representation regardless of transport quirks.
- Owner messages and customer messages are distinguishable before higher-level logic runs.

**Tests**:
- Normalization tests cover text messages, media placeholders, unsupported events, and malformed payloads.
- Routing tests confirm owner-command detection happens before customer AI flow execution.

**Dependencies / Notes**:
- Keep the normalized shape transport-facing but independent from provider or retrieval logic.
