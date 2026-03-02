### Step 4.5: Provider Manager with Failover
**Goal**: Orchestrate providers with automatic failover chain.

**Tasks**:
- [ ] Create `src/providers/index.ts`
- [ ] Implement `ProviderManager`:
  - Load active provider from config
  - On failure → try next provider in chain
  - Chain: DeepSeek → Gemini → Groq → throw `AIError`
  - Log every failover event
- [ ] Export factory function: `createProviderManager(config)`

**Verification**:
- Primary provider used when healthy
- Failover triggers when primary fails
- All-fail throws meaningful error

**Tests**:
- Primary succeeds → uses primary
- Primary fails → falls back to secondary
- All fail → throws `AIError`
- Failover logged  
