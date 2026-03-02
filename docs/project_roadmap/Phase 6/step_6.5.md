### Step 6.5: Message Sending
**Goal**: Send text and media messages back to users.

**Tasks**:
- [ ] Add to `src/controllers/message.ts`: `sendText()`, `sendImage()`
- [ ] Handle message queuing to prevent WhatsApp rate limiting
- [ ] Add typing indicator (`composing` presence) before responding
- [ ] Simulate natural delay (1-3 seconds) before sending

**Verification**:
- Bot replies with text
- Bot sends images with captions
- Typing indicator visible to customer

**Tests**:
- Send text → message delivered
- Send image with caption → delivered
