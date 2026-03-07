### Step 1.1: Project Foundation Setup
**Goal**: Establish the monorepo structure and baseline tooling for the application.

**Tasks**:
- [x] Create the Bun workspace root and Turborepo task graph
- [x] Set up `apps/` and `packages/` folders for runtime apps and shared libraries
- [x] Add shared TypeScript configuration and path alias support
- [x] Add baseline ignore rules for local env files, build output, and generated data
- [x] Create initial package manifests and workspace scripts for `dev`, `build`, `check`, and `test`

**Verification**:
- Workspace scripts run from the repository root
- Shared TypeScript configuration is consumed by apps and packages
- Local environment files are ignored by Git

**Notes**:
- This step captures the bootstrap work that already existed in the repo before the Phase 1 audits were written.
