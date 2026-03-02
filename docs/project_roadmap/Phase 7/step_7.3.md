### Step 7.3: Conversation Timeout & Cleanup
**Goal**: Automatically expire stale conversations.

**Tasks**:
- [ ] Track `updatedAt` timestamp on every message
- [ ] On next message, check if conversation has timed out (configurable, default: 30 minutes)
- [ ] If timed out, start fresh conversation context
- [ ] Periodic cleanup of very old conversations (>7 days) from database

**Verification**:
- Message after timeout starts fresh context
- Old conversations cleaned from DB

**Tests**:
- Message within timeout → history preserved
- Message after timeout → fresh start
