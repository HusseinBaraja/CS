### Step 2.3: Sample Data Seeder
**Goal**: Create a seed script with realistic sample data for development and testing.

**Tasks**:
- [ ] Seed a sample company ("YAS Packaging Co")
- [ ] Seed 4–5 categories (Containers, Cups, Plates, Bags, Cutlery)
- [ ] Seed 15–20 products with bilingual names, descriptions, specs, and prices
- [ ] Seed 2–3 variants per product where applicable
- [ ] Seed 2 active offers
- [ ] Seed currency rate (SAR → YER at 425)
- [ ] Create a runner script to call the seed mutation

**Verification**:
- Seed mutation populates all tables (visible in Convex Dashboard)
- Data is bilingual and realistic
- Variants link correctly to products via `v.id("products")`

**Tests**:
- Seed runs idempotently (clears existing data before re-seeding)
