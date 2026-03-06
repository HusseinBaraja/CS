From Phase 1 docs, `SRS.md`, and `PROJECT_CHARTER_AND_VISION.md`, the intended current state is a solid foundation (`config` + `logging` + `errors`) before deeper features.

### Issues in the current environment
1. **Docs are inconsistent/incomplete (high confusion risk)**
    - `phase 1` folder naming is inconsistent with others (`phase 1` vs `Phase 2`, `Phase 3`, ...).
    - `step_1.1.md` appears missing (Phase 1 only has `step_1.2.md`, `step_1.3.md`, `step_1.4.md`).
    - `Phase 12` contains a misnamed file: `step_13.3.md` while content says `Step 12.3`.
    - `SRS.md` references `docs/IMPLEMENTATION_PLAN.md` and `../system_design.md`, but those files are not present.
    - `README.md` is also missing, although SRS/roadmap expect it.

2. **Phase 1 config requirements are only partially met**
    - In `packages\config\src\index.ts`, many values that SRS marks as required are currently `optional()` (`CONVEX_URL`, `AI_PROVIDER`, provider keys, R2 fields, etc.).
    - SRS `FR-1.2` expects descriptive `ConfigError` on invalid/missing env vars; current config layer does not throw domain-specific `ConfigError`.
    - No config tests found for required/missing/default behavior (Phase 1 Step 1.2 test expectations are not implemented).

3. **Logging does not yet match SRS/Charter “production hardening” expectations**
    - `packages\core\src\index.ts` has structured logging + redaction + dev pretty-print (good), but:
    - SRS `FR-2.4` requires production file logging with daily rotation (14 days) — not implemented.
    - Redaction list does not explicitly cover phone number fields even though SRS calls out phone/API-key sensitivity.

4. **Error layer is solid but not fully aligned to intended semantics**
    - `packages\shared\src\errors.ts` is good foundation with hierarchy and serialization.
    - But `ConfigError` always maps to `CONFIG_INVALID`; `CONFIG_MISSING` exists in constants yet is not represented via a dedicated path/class behavior.

5. **Roadmap progress tracking does not reflect code reality**
    - Many roadmap checkboxes remain unchecked while partial implementation exists.
    - `Phase 2 step_2.1` still unchecked, yet `convex\` exists; however, expected generated Convex types (`convex\_generated\`) are missing and `convex\schema.ts` is only a placeholder.

6. **Implementation is still bootstrap-level vs SRS/Charter scope**
    - `apps\bot`, `apps\worker`, `packages\ai`, `packages\rag`, and `packages\db` are mostly stubs/mock behavior.
    - This is normal early-stage, but it means environment is far from charter success metrics and SRS must-have features.

### Surprises worth flagging to the developer
Per your guideline about confusion points, these are the top surprises to record in `AGENTS.MD`:
- Missing referenced docs (`IMPLEMENTATION_PLAN.md`, `system_design.md`, `README.md`).
- Phase/document naming drift (`phase 1` case mismatch, `step_13.3.md` under Phase 12).
- SRS-required env vars currently modeled as optional.

### Bottom line
The environment is **good as a scaffold**, but the main current issues are:
- **documentation drift**,
- **Phase 1 requirement misalignment in config/logging details**, and
- **status/progress mismatch between roadmap checklists and actual repo state**.

If you want, I can next give you a prioritized “fix order” (what to correct first to stabilize Phase 1 and unblock Phase 2 cleanly).