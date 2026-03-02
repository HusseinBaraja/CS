### Step 2.4: Data Export / Backup
**Goal**: Leverage Convex's built-in data export for backups.

**Tasks**:
- [ ] Document how to use Convex Dashboard's snapshot export feature
- [ ] Create a script using Convex's export API for automated backups
- [ ] Save exports to a local `backups/` directory with timestamps
- [ ] Add a retention policy (keep last N exports)


**Verification**:
- Export produces a complete snapshot of all tables
- Export can be imported to a fresh Convex deployment
