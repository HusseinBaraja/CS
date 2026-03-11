### Step 4.3: Failover Manager
**Goal**: Add one shared orchestration layer that can select providers, classify failures, and fail over predictably.

**Current baseline**:
- The project charter expects a primary, backup, and tertiary AI path.
- `packages/ai` currently has no shared chat manager or health-aware provider ordering.
- Structured logging already exists in `@cs/core`, which gives this step a stable place to record failover behavior.

**Next work**:
- [ ] Implement a provider manager in `packages/ai` that accepts the configured provider chain and shared chat request format.
- [ ] Distinguish retry-in-place failures from provider-switch failures.
- [ ] Add lightweight availability checks or startup probes that do not block unrelated apps unnecessarily.
- [ ] Log provider choice, failover events, and terminal failures with tenant-safe metadata.

**Verification**:
- A healthy primary provider is used first without unnecessary fallbacks.
- Retryable provider outages degrade to the next configured provider in a deterministic order.
- Terminal failures surface one normalized error shape to callers.

**Tests**:
- Primary success, primary failover, and all-providers-failed flows are all covered.
- Logs record failover events without leaking secrets or prompt bodies.

**Dependencies / Notes**:
- Keep provider selection in shared code so bot, worker, and any future API-driven AI features share one failover policy.
