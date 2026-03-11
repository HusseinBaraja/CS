### Step 4.4: Prompting And Language Policy
**Goal**: Move chatbot prompting rules and language behavior into shared AI utilities instead of leaving them implied in future bot code.

**Current baseline**:
- The charter and SRS already require Arabic and English support, grounded responses, and topic boundaries.
- No shared prompt builder or language utility exists yet in `packages/ai` or `packages/rag`.
- Bot and worker runtimes are still minimal, so this is the right point to centralize prompt policy before runtime logic grows.

**Next work**:
- [ ] Add shared language detection utilities and define the default behavior for mixed-language or non-linguistic inputs.
- [ ] Define the base system prompt, grounding rules, off-topic refusal behavior, and escalation-friendly response rules.
- [ ] Define the structured action format the model is allowed to emit for later customer-facing features.
- [ ] Keep prompt assembly separate from transport and provider selection so tests can validate prompt content directly.

**Verification**:
- Language utilities classify Arabic, English, and mixed inputs consistently with the product expectations.
- Prompt builders always include grounding and scope-boundary instructions before provider invocation.

**Tests**:
- Language detection tests cover Arabic, English, mixed text, and numeric-only inputs.
- Prompt tests verify required safety and grounding instructions are present.

**Dependencies / Notes**:
- Prompt policy must stay consistent with the action-handling design in Phase 8.1 and the refusal/fallback rules in Phase 8.6.
