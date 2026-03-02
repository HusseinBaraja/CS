### Step 6.6: Access Control
**Goal**: Implement phone number-based access control per company.

**Tasks**:
- [ ] Create `src/services/accessControl.ts`
- [ ] Implement modes (read from company config):
    - `OWNER_ONLY` — only the owner's phone number
    - `SINGLE_NUMBER` — one specific number
    - `LIST` — approved numbers list
    - `ALL` — any number
- [ ] Check authorization before processing any message
- [ ] Identify owner for admin commands

**Verification**:
- `OWNER_ONLY` blocks non-owner
- `LIST` allows only approved numbers
- `ALL` allows everyone
- Owner always has access

**Tests**:
- Each mode tested with authorized and unauthorized numbers
