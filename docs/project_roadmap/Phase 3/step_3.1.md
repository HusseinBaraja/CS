## Phase 3: REST API
### Step 3.1: Hono Server Setup
**Goal**: Create the Hono web server alongside the main application.

**Tasks**:
- [ ] Install `hono`
- [ ] Create `src/api/server.ts` — Hono app initialization
- [ ] Create `src/api/middleware/auth.ts` — API key authentication
- [ ] Create `src/api/middleware/rateLimit.ts` — request rate limiting
- [ ] Configure CORS
- [ ] Configure JSON body parsing
- [ ] Start on configurable port (default 3000)


**Verification**:
- Server starts on configured port
- `GET /api/health` responds with status
- Requests without API key are rejected (401)
- Valid API key allows access

**Tests**:
- Health endpoint returns 200
- Missing auth header returns 401
- Invalid API key returns 403
