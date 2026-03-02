### Step 6.4: Message Receiving & Routing
**Goal**: Handle incoming WhatsApp messages.

**Tasks**:
- [ ] Create `src/controllers/message.ts`
- [ ] Listen to Baileys `messages.upsert` event
- [ ] Extract: sender number, message body, message type, quoted message
- [ ] Ignore: group messages, status updates, own messages
- [ ] Ignore: messages received while offline (check timestamp vs. boot time)
- [ ] Route to appropriate handler based on content:
    - `!` prefix → command handler
    - Text message → AI handler
    - Media message → polite decline
- [ ] Log all incoming messages

**Verification**:
- Text message → logged and routed to AI
- `!help` → routed to command handler
- Voice note → polite decline message
- Group message → ignored

**Tests**:
- Route text to AI handler
- Route `!` command to command handler
- Skip group messages
- Skip offline messages
