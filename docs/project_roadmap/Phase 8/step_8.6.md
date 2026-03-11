### Step 8.6: Confidence And Refusal Policy
**Goal**: Define when the bot should answer, ask for clarification, refuse, or hand off instead of forcing every input through one AI response path.

**Current baseline**:
- The charter requires grounded behavior and explicit human handoff for cases the bot cannot handle confidently.
- No runtime policy currently exists for confidence thresholds, refusal triggers, or low-signal retrieval results.
- Later analytics and handoff features depend on these decisions being explicit and observable.

**Next work**:
- [ ] Define low-confidence signals from retrieval, provider output, and business-rule checks.
- [ ] Add clear branches for direct answer, clarification, polite refusal, and handoff.
- [ ] Ensure off-topic and prompt-injection attempts are handled through policy, not by chance.
- [ ] Record the policy outcome in a form that analytics can later aggregate.

**Verification**:
- The bot does not answer confidently when grounding is weak or absent.
- Off-topic and unsafe prompts produce consistent refusal behavior.

**Tests**:
- Tests cover grounded answer, clarification, refusal, and handoff outcomes.
- Prompt-injection and low-retrieval-signal cases are exercised explicitly.

**Dependencies / Notes**:
- Keep the refusal and handoff policy aligned with the prompt constraints introduced in Phase 4.4.
