### Step 9.4: Media Cleanup Jobs
**Goal**: Handle asynchronous cleanup of remote media objects created by product image management.

**Current baseline**:
- Product records already have `imageUrls`, but no cleanup jobs exist.
- Phase 3.8 introduces external storage and media lifecycle requirements.
- Company cleanup already handles Convex-side record deletion in batches, which provides a pattern for safe cleanup orchestration.

**Next work**:
- [ ] Implement background cleanup for deleted product images and orphaned uploads.
- [ ] Decide how cleanup jobs track storage keys, retries, and terminal failures.
- [ ] Ensure company deletion and product deletion can trigger media cleanup without blocking the primary transaction path.
- [ ] Add operator-visible logging for stuck or repeatedly failing media deletions.

**Verification**:
- Deleted product media is eventually removed from external storage.
- Cleanup jobs can resume after interruption without losing track of outstanding work.

**Tests**:
- Cleanup tests cover successful deletion, transient storage failure, and retry-safe reprocessing.
- Company-deletion scenarios verify Convex cleanup and media cleanup stay coordinated.

**Dependencies / Notes**:
- External storage cleanup should rely on stable object keys, not only on public URLs.
