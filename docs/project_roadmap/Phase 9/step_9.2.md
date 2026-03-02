### Step 9.2: Catalog Request Handling
**Goal**: Send full catalog when requested.

**Tasks**:
- [ ] Detect `SEND_CATALOG` action
- [ ] Query all categories and products for the company
- [ ] Format as organized WhatsApp message:

```
    📦 *Category Name*
    ├ Product 1 — 500 YER
    ├ Product 2 — 300 YER
    └ Product 3 — 200 YER
```

- [ ] Handle large catalogs (split into multiple messages if needed)

**Verification**:
- "Show me the catalog" / "كتالوج" triggers catalog send
- Works in both Arabic and English

**Tests**:
- Catalog formatted correctly
- Large catalog split into chunks 
