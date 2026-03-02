### Step 9.5: Confidence-Based Fallback
**Goal**: Detect low-confidence AI responses.

**Tasks**:
- [ ] Include confidence instruction in system prompt (AI returns 0-100 score)
- [ ] Parse confidence from response
- [ ] If below threshold (configurable, default: 40) → trigger human handoff
- [ ] Log all low-confidence responses to `analytics_events`

**Verification**:
- Low confidence → escalation triggered
- Events logged for review

**Tests**:
- High confidence → normal flow
- Low confidence → handoff triggered
