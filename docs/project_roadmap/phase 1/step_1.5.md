### Step 1.5: Process Management
**Goal**: Keep the bot alive in production.

**Notes**:
- The project uses Turborepo + Bun for development (`bun dev`, `turbo run dev`)
- PM2 may be introduced at deployment time if needed for crash recovery and log management
- For now, Turborepo handles task orchestration and `bun --watch` provides auto-restart in dev

**Tasks**:
- [ ] Evaluate PM2 vs. Bun's built-in process management for production
- [ ] If PM2 is chosen, create `ecosystem.config.js` with:
  - Auto-restart on crash
  - Max memory restart threshold
  - Log file paths
- [ ] Add production npm scripts: `start`, `stop`, `logs`

**Verification**:

- App stays alive after a crash in production
- Logs are accessible and rotated
