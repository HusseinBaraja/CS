### Step 3.8: Product Image Management
**Goal**: Turn the existing `imageUrls` field into a real media-management capability with upload, delete, and cleanup workflows.

**Current baseline**:
- Products already store `imageUrls` in `convex/schema.ts` and the API product contract already exposes them.
- No object-storage abstraction, upload endpoint, or media cleanup flow exists yet.
- The charter still expects Cloudflare R2-backed image handling for product media and WhatsApp delivery.
- Product deletion currently removes Convex records only; it does not coordinate external media cleanup.

**Next work**:
- [ ] Introduce a storage abstraction in the monorepo that can own R2 configuration, upload, delete, and public URL generation.
- [ ] Add API endpoints for image upload and targeted image removal under the product resource.
- [ ] Decide whether product documents store raw public URLs only or richer metadata such as key, alt caption, and mime type.
- [ ] Add asynchronous cleanup behavior for orphaned or deleted product images through Convex jobs or worker-managed reconciliation.
- [ ] Define upload validation rules for file type, size, and duplicate image handling.

**Verification**:
- Uploaded images are associated with the correct company and product without cross-tenant leakage.
- Removing an image updates product state and schedules or performs matching object deletion safely.
- Product deletion does not leave untracked remote objects behind.

**Tests**:
- Upload success covers supported mime types and product scoping.
- Validation tests reject unsupported formats and oversized payloads.
- Cleanup tests verify product deletion triggers the correct deferred media cleanup workflow.

**Dependencies / Notes**:
- Keep external storage details behind a shared abstraction so `apps/api`, `apps/bot`, and future worker jobs do not each own bucket logic.
