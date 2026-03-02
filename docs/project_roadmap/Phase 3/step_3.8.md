### Step 3.8: Image Upload Endpoint
**Goal**: Upload product images via API using Cloudflare R2.

**Tasks**:
- [ ] Install `@aws-sdk/client-s3`
- [ ] Create `src/services/r2.ts` — R2 client setup using S3-compatible API
- [ ] Add `POST /api/companies/:companyId/products/:productId/images`
- [ ] Accept `multipart/form-data` with image file
- [ ] Upload to R2 bucket under key `{companyId}/{productId}/{uuid}.{ext}`
- [ ] Append the R2 public URL to product's `imageUrls` array
- [ ] Validate file type (JPEG, PNG, WebP only)
- [ ] Add `DELETE /api/companies/:companyId/products/:productId/images/:index` to remove single image
- [ ] On product delete, handle image cleanups asynchronously using Convex cron jobs or a background task queue


**Verification**:
- Image stored in R2 bucket
- URL appended to product record and publicly accessible
- Invalid file types rejected
- Product deletion cleans up R2 objects

**Tests**:
- Upload valid image → 201
- Upload invalid file type → 400
- Delete product → R2 objects scheduled for removal asynchronously
