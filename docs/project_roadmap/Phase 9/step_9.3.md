### Step 9.3: Image Request Handling
**Goal**: Send product images when requested.

**Tasks**:
- [ ] Detect `SEND_IMAGES` action with product ID
- [ ] Look up product images from `image_paths`
- [ ] Send images with bilingual captions
- [ ] Handle multiple images per product

**Verification**:
- "Show me pictures of plates" sends plate images
- Images have proper captions

**Tests**
- Product with images → sent
- Product without images → graceful message
