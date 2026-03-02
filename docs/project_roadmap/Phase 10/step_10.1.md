## Phase 10: Production Hardening
### Step 10.1: Input Sanitization
**Goal**: Prevent injection attacks across all inputs.

**Tasks**:
- [ ] Sanitize all WhatsApp message inputs (strip control characters)
- [ ] Validate all API request bodies with Zod schemas
- [ ] Convex handles data validation and sanitization via schema validators
- [ ] Add prompt injection guardrails in system prompt
- [ ] Escape special characters in WhatsApp responses

**Verification**:
- Malicious inputs handled safely
- No SQL injection possible
- Prompt injection attempts detected/blocked

**Tests**:
- SQL injection attempt → sanitized
- XSS in API body → rejected
- Prompt injection → ignored by AI
