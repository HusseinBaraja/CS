### Step 9.4: Human Handoff
**Goal**: Mute the bot and redirect to human when needed.

**Tasks**:
- [ ] Create `src/services/handoff.ts`
- [ ] Triggers:
    - Explicit request ("I want to talk to a person" / "أريد التحدث مع شخص")
    - Order intent detected
    - Low AI confidence
    - All AI providers failed

- [ ] On trigger:
    1. Set `muted = true`, `muted_at = now()` in conversation
    2. Notify owner with customer info + conversation context
    3. Send customer: "Connecting you with our team..."

- [ ] Auto-unmute after 12 hours of silence:
    - Check `muted_at` on each incoming message (secondary safeguard)
    - If > 12 hours since `muted_at`, set `muted = false`

- [ ] Add Convex cron job (`convex/crons.ts`) running every 15 minutes:
    - Query conversations WHERE `muted = true` AND `mutedAt < now() - 12 hours`
    - Set `muted = false` on all matches
    - This ensures conversations are unmuted even if the customer never messages again

**Verification**:
- "I want to speak to a person" → bot mutes, owner notified
- Bot stays silent while muted
- After 12h → bot resumes

**Tests**:
- Mute sets flags correctly
- Messages during mute → no response
- Unmute after timeout  
