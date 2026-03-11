## Phase 10: Security, Resilience, Observability
### Step 10.1: Input Sanitization
**Goal**: Extend the existing API validation baseline into WhatsApp, AI, and media-facing inputs.

**Current baseline**:
- `apps/api` already validates request bodies and enforces auth and rate limiting.
- Convex validators already constrain the stored data model.
- No WhatsApp-input sanitation, prompt-injection handling, or media-upload validation exists yet.

**Next work**:
- [ ] Add normalization and sanitization for inbound WhatsApp text before command parsing or AI orchestration.
- [ ] Add prompt-injection guardrails through shared prompt policy and explicit refusal behavior.
- [ ] Define media validation requirements for uploads and outbound media references.
- [ ] Review any free-form company config or analytics payload paths for abuse or size risks.

**Verification**:
- Unsafe or malformed customer inputs do not propagate unchecked into command handling, retrieval, or provider prompts.
- Media validation rejects unsupported or suspicious payloads before storage or send attempts.

**Tests**:
- Sanitization tests cover control characters, malformed inputs, and suspicious prompts.
- Upload validation tests cover mime type, size, and malformed multipart payloads.

**Dependencies / Notes**:
- This step builds on existing API validation rather than replacing it.
