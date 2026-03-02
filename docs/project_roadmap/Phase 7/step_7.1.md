## Phase 7: Conversation & Memory
### Step 7.1: Conversation Service
**Goal**: Manage per-user, per-company conversation history.

**Tasks**:
- [ ] Create `src/services/conversation.ts`
- [ ] Implement:
    - `getOrCreateConversation(phone, companyId)` — find or create conversation record
    - `getHistory(phone, companyId)` — query `messages` table by `conversationId`, ORDER BY `timestamp`, LIMIT N
    - `addMessage(conversationId, role, content)` — insert into `messages` table
    - `clearHistory(conversationId)` — delete all messages for conversation
    - `trimHistory(conversationId, maxMessages)` — delete oldest messages beyond limit
- [ ] Configure max history length (default: 20 messages)

**Verification**:
- History persists across messages
- Old messages trimmed when limit exceeded
- History scoped to company

**Tests**:
- Add message → persists
- Trim at limit → oldest removed
- Clear → empty array
