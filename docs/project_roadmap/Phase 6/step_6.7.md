### Step 6.7: Per-User Rate Limiting
**Goal**: Prevent abuse and respect WhatsApp limits.

**Tasks**:
- [ ] Create `src/services/rateLimiter.ts`
- [ ] Implement per-phone-number rate limiting
- [ ] Configure minimum interval between messages (default: 3 seconds)
- [ ] Queue messages that exceed limit (don't drop)
- [ ] Track via in-memory Map (reset on restart is acceptable)

**Verification**:
- Rapid messages from same user are throttled
- Messages eventually delivered (not dropped)
- Different users don't affect each other

**Tests**:
- Rapid messages → throttled
- Messages delivered after throttle period
