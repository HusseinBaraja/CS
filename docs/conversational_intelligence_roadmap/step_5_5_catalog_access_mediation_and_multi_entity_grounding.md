# Step 5.5: Catalog Access Mediation and Multi-Entity Grounding

## Research Before Drafting
Inspect `packages/rag/src/index.ts`, `convex/vectorSearch.ts`, `convex/productEmbeddingRuntime.ts`, and the current catalog data sources before revising this step. Verify any uncertain retrieval, pricing, offer, or provider behaviors through the codebase and official docs. Use Context7 MCP where relevant.

## Objective
Define a customer-safe mediation layer so the assistant receives typed catalog facts across categories, products, variants, offers, and pricing rather than a narrow product-only grounding surface.

## Why This Step Comes Now
Step 5 defines how retrieval should consume resolved intent and conversation state. This step comes immediately after because retrieval mode selection alone is not enough. Before richer grounding can be trusted in prompt assembly, structured-output control, or rollout, the system needs a stable mediation boundary between raw storage and model-visible facts.

## In Scope
- Customer-safe catalog mediation contract
- Multi-entity grounding bundle design
- Category-aware and offer-aware grounding behavior
- Pricing and currency fact normalization for customer-facing use
- Explicit separation between storage schema and model-visible facts

## Out Of Scope
- Rolling summary behavior
- Retention and archival policy
- Structured-output repair strategy
- Rollout mechanics
- Admin UI or API redesign

## Current Problems This Step Addresses
Current catalog grounding problems include:

- categories exist in storage but are not available as first-class grounding facts
- retrieval and embedding hydration are product-only
- active offers and price-display facts are not mediated into a unified customer-safe bundle
- the assistant sees a small shortlist of product blocks instead of a typed catalog surface
- operational and storage concerns are too close to the future model boundary

Relevant current code:

- `packages/rag/src/index.ts`
- `convex/vectorSearch.ts`
- `convex/productEmbeddingRuntime.ts`
- `convex/categories.ts`
- `convex/offers.ts`
- `convex/currencyRates.ts`

## Target Behavior After This Step
After this step, retrieval outputs are mediated into a typed grounding bundle that can safely represent:

- categories
- products
- variants
- active offers
- normalized pricing and currency facts

The assistant no longer depends on product-only grounding for catalog questions. Category questions, category-constrained follow-ups, offer questions, and price questions all receive customer-safe factual evidence without exposing raw database shape.

Operational tables remain outside the model-facing path.

## Planned Interfaces And Data Contracts

### `CatalogGroundingBundle`
Purpose: customer-safe factual evidence assembled from retrieval outputs and catalog hydration.

Required fields:

- `entityRefs`
- `categories`
- `products`
- `variants`
- `offers`
- `pricingFacts`
- `imageAvailability`
- `retrievalMode`
- `retrievalConfidence`
- `provenance`
- `omissions`

Introduced behaviorally in: Step 5.5  
Planned as a grounding layer in: Step 3  
Consumed by: Steps 8, 9, and 10

Field rules:

- `entityRefs` must preserve entity kind and identifier
- `categories` must expose only customer-safe descriptive fields
- `offers` must include only active and applicable customer-facing offer facts
- `pricingFacts` must distinguish native catalog price from derived or converted display values
- `provenance` must allow later diagnostics to trace which facts came from direct lookup, constrained search, semantic search, or state recovery
- `omissions` must record intentionally withheld or unavailable facts without forcing the assistant to infer them

## Data Flow And Lifecycle
Planned lifecycle:

1. Receive resolved retrieval output from Step 5.
2. Normalize raw hits into typed entity references.
3. Hydrate customer-safe facts for categories, products, variants, offers, and prices.
4. Reconcile duplicate or conflicting facts across entity kinds.
5. Produce `CatalogGroundingBundle`.
6. Pass the bundle into typed prompt assembly without exposing raw storage rows.

Hydration priority should be:

1. directly selected entities from conversation state
2. direct entity lookup results
3. category-constrained search results
4. semantic catalog search results
5. active offers and pricing facts that apply to the selected or retrieved entities

## Edge Cases And Failure Modes
- Category exists but has no active or matching products
- Category is selected in state but semantic search returns only products from another category
- Offer applies to a product that was deleted or deactivated
- Price exists but display currency or conversion fact is unavailable
- Arabic and English names point to the same entity but lexical search returns mixed hits
- Too many products fit a category and the grounding bundle must stay bounded without losing category identity
- Entity lookup succeeds but required companion facts such as offers or price metadata are missing

## Validation And Test Scenarios
This step owns:

- direct category question answered from category grounding
- follow-up constrained to the selected category after prior list presentation
- active offer question answered from applicable offer facts
- price question answered from normalized pricing and currency facts
- category exists with zero products and the assistant responds safely
- overlapping category and product names resolve into a mixed but coherent grounding bundle

Each scenario must define:

- resolved retrieval input
- retrieved entity references
- mediated grounding bundle
- omitted facts if any
- expected customer-safe factual surface

## Rollout And Observability Requirements
Required metrics:

- grounding bundle entity-kind distribution
- category-grounding hit rate
- offer-grounding usage rate
- price-fact usage rate
- omitted-fact rate
- clarification rate attributable to missing or incomplete catalog mediation

This step should be introduced in shadow mode before broader catalog-aware prompt behavior becomes authoritative.

## Prerequisites
- [Step 5](./step_5_retrieval_refactor.md)

## Completion Criteria
- The model-visible grounding surface is defined separately from storage schema.
- Categories, products, variants, offers, and pricing facts are all represented as typed grounding data.
- Operational tables are explicitly excluded from the model-facing context contract.
- Validation scenarios cover category, product, offer, and pricing questions.

## What Later Steps Will Rely On From This Step
- Step 8 relies on a stable richer grounding shape before hardening structured outputs around it.
- Step 9 uses category, offer, and pricing grounding metrics for rollout evaluation.
- Step 10 uses this step as the replacement for product-only grounding shortcuts.
