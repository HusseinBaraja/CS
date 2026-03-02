### Step 8.6: Set Rate Command
**Goal**: Implement `!setrate`.

**Tasks**:
- [ ] Create `src/commands/setrate.ts`
- [ ] Usage: `!setrate SAR YER 425`
- [ ] Upsert the rate in `currency_rates` table
- [ ] Confirm with current rate displayed

**Verification**:
- Rate stored, confirmation sent
- Subsequent product queries use new rate
