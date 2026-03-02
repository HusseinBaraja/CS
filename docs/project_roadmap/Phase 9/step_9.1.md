## Phase 9: Advanced Features
### Step 9.1: Action Detection System
**Goal**: Detect and execute special actions from AI responses.

**Tasks**:
- [ ] Create `src/services/ai/actions.ts`
- [ ] Define action types: `SEND_CATALOG`, `SEND_IMAGES`, `ASK_CLARIFICATION`, `ESCALATE_HUMAN`
- [ ] Parse AI response for JSON action markers
- [ ] Execute corresponding actions after sending text response

**Verification**:
- AI can trigger catalog send via action marker
- AI can trigger image send via action marker

**Tests**:
- JSON marker parsed correctly
- Unknown action type → ignored safely
