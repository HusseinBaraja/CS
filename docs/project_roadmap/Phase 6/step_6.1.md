## Phase 6: WhatsApp Integration
### Step 6.1: Baileys Client Setup
**Goal**: Initialize Baileys client with multi-device authentication.

**Tasks**:
- [ ] Install `@whiskeysockets/baileys`
- [ ] Create `src/services/whatsapp/client.ts`
- [ ] Configure with multi-device mode
- [ ] Persist authentication state to local directory (`auth_sessions/{companyId}/`)
- [ ] Handle connection events: `open`, `close`, `connecting`

**Verification**:
- QR code displays (terminal or image)
- After scanning, bot connects successfully
- Session persists across restarts

**Tests**:
- Connection state machine transitions correctly
