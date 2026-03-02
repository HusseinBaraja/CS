### Step 7.2: Context Window Management
**Goal**: Include conversation history in AI context.

**Tasks**:
- [ ] Update `src/services/ai/chat.ts` to include conversation history
- [ ] Format history as `ChatMessage[]` array
- [ ] Handle quoted/reply messages (include original message as context)
- [ ] Balance history length vs. RAG context vs. token limits

**Verification**:
- Bot remembers previous messages in conversation
- Follow-up questions work without repeating context
- "What about the price?" after asking about a product → correct response

**Tests**:
- Follow-up question uses history
- History + RAG context stays within token limits
