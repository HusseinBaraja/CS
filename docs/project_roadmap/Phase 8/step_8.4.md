### Step 8.4: Clarification Flow
**Goal**: Ask targeted follow-up questions when retrieval or intent resolution is ambiguous instead of guessing.

**Current baseline**:
- The future retrieval layer will surface ambiguous or low-signal cases, but no clarification policy exists yet.
- Product variants and bilingual catalogs increase the likelihood of ambiguous customer requests.
- The bot runtime currently has no branch for clarification before answer generation.

**Next work**:
- [ ] Define the conditions that should trigger clarification instead of a direct answer.
- [ ] Create reusable clarification response patterns that stay grounded in known products or categories.
- [ ] Decide how clarification exchanges influence conversation history and analytics.
- [ ] Ensure clarification paths can still escalate or fall back if the ambiguity persists.

**Verification**:
- Ambiguous requests produce concise, relevant follow-up questions instead of fabricated answers.
- Clarification prompts remain tenant- and catalog-specific.

**Tests**:
- Ambiguous product-name and category-name cases trigger clarification.
- Repeated ambiguity eventually reaches a safe fallback or handoff path.

**Dependencies / Notes**:
- Clarification policy should be coordinated with the confidence and refusal rules in Phase 8.6.
