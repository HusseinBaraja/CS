### Step 6.4: Access Control Modes
**Goal**: Implement phone-based access control modes at the tenant level before the bot starts handling real customer traffic.

**Current baseline**:
- Access-control modes are part of the product scope, but no enforcement logic exists yet.
- Company records already have a `config` field that can hold runtime policy until a stricter config model is introduced.
- Owner phone numbers already exist on companies and can anchor authorization rules.

**Next work**:
- [ ] Define the supported access-control modes and the exact config keys used to store them.
- [ ] Add bot-side checks for OWNER_ONLY, SINGLE_NUMBER, LIST, and ALL.
- [ ] Decide how allow-list data is stored and validated for each company.
- [ ] Ensure access checks run before conversation persistence, AI usage, or analytics emission when appropriate.

**Verification**:
- Allowed numbers proceed to the correct flow for the selected mode.
- Disallowed numbers receive a predictable and tenant-safe refusal or silence policy.

**Tests**:
- Each access-control mode is covered with owner and non-owner senders.
- Config edge cases such as empty allow lists or malformed values fail safely.

**Dependencies / Notes**:
- Keep config handling compatible with the existing flexible `company.config` shape, but document any future need for stricter config typing.
