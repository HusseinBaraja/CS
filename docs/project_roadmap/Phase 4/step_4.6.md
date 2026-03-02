### Step 4.6: System Prompts & Language Detection
**Goal**: Create the chatbot persona prompts and language utilities.

**Tasks**:
- [ ] Create `src/services/ai/prompts.ts`:
  - Base system prompt (business assistant persona)
  - Language-matched response instructions
  - Topic boundary rules (only business questions)
  - Hallucination prevention instructions
  - Action marker format (JSON in response for catalog/images/escalate)
  - Price negotiation behavior (configurable: STRICT / REDIRECT_OWNER / SHOW_RANGE)
- [ ] Create `src/utils/language.ts`:
  - Detect Arabic via Unicode ranges
  - Default to English for mixed content
  - Return `"ar"` or `"en"`

**Verification**:
- Arabic text detected as `ar`
- English text detected as `en`
- System prompt includes product context placeholder

**Tests**:
- Pure Arabic → `ar`
- Pure English → `en`
- Mixed → `en` (default)
- Numbers only → `en`
