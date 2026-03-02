### Step 1.5: PM2 Configuration
**Goal**: Configure PM2 to keep the bot alive on Windows.

**Tasks**:
- [ ] Install `pm2` globally
- [ ] Create `ecosystem.config.js` with:
- Auto-restart on crash
- Max memory restart threshold
- Log file paths
- Watch mode for development
- [ ] Create npm scripts: `start`, `dev`, `stop`, `logs`

**Verification**:
- `pm2 start ecosystem.config.js` launches the app
- App auto-restarts after a crash
- Logs accessible via `pm2 logs`