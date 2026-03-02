### Step 6.2: Multi-Session Management
**Goal**: Manage multiple WhatsApp sessions (one per company).

**Tasks**:
- [ ] Create `src/services/whatsapp/session.ts`
- [ ] Implement `SessionManager`:
    - Start session for a company
    - Stop session for a company
    - Get session by company ID
    - List active sessions
- [ ] Store session metadata in database (`whatsapp_sessions` or `companies.config`)
- [ ] On app startup, reconnect all previously active sessions

**Verification**:
- Multiple sessions can run simultaneously
- Each session mapped to correct company
- Restart recovers all sessions

**Tests**:
- Start/stop session lifecycle
- Company isolation (messages routed to correct company)
