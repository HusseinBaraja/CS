## Phase 2: Convex Backend Layer
### Step 2.1: Convex Project Setup
**Goal**: Initialize Convex and establish the project structure.

**Tasks**:
- [ ] Install `convex` package
- [ ] Run `bunx convex dev` to initialize the `convex/` directory
- [ ] Create a Convex project (free tier) via the CLI
- [ ] Verify the `convex/` directory is created with `_generated/` types
- [ ] Add `CONVEX_URL` to `.env` (auto-populated by CLI)
- [ ] Create `convex/helpers.ts` for shared utility functions

**Verification**:
- `bunx convex dev` connects to deployment successfully
- Auto-generated types available in `convex/_generated/`
- Dashboard accessible at `dashboard.convex.dev`

**Tests**:
- Convex client connects and responds to a simple query
