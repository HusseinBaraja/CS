# Public API Baseline

This document captures the current public REST API baseline exposed by `apps/api`.

## Authentication

All `/api/**` routes require the `x-api-key` header.

Example:

```http
GET /api/companies/company-1/products/product-1/variants HTTP/1.1
Host: localhost:3000
x-api-key: your-api-key
```

## Standard Error Shape

All handled API errors use this shape:

```json
{
  "ok": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Product not found"
  }
}
```

Common status conventions:

- `400`: validation failure or malformed JSON
- `404`: missing scoped resource
- `409`: optimistic concurrency conflict
- `503`: upstream dependency or embedding-provider failure

## Variant Endpoints

Variant routes are nested under the owning product and are always scoped by `companyId + productId`.

### GET `/api/companies/:companyId/products/:productId/variants`

Returns the variants for the scoped product.

Success response:

```json
{
  "ok": true,
  "variants": [
    {
      "id": "variant-1",
      "productId": "product-1",
      "variantLabel": "Large",
      "attributes": {
        "size": "L",
        "nested": {
          "finish": ["matte", "gloss"]
        }
      },
      "priceOverride": 1.45
    }
  ]
}
```

Failure cases:

- `404` when the scoped product does not exist

### POST `/api/companies/:companyId/products/:productId/variants`

Creates a variant for the scoped product and refreshes product embeddings through the Convex action flow.

Request body:

```json
{
  "variantLabel": "Family Pack",
  "attributes": {
    "size": "XL",
    "nested": {
      "finish": ["matte", "gloss"],
      "metadata": {
        "recyclable": true,
        "notes": null
      }
    }
  },
  "priceOverride": 2.1
}
```

Success response:

```json
{
  "ok": true,
  "variant": {
    "id": "variant-created",
    "productId": "product-1",
    "variantLabel": "Family Pack",
    "attributes": {
      "size": "XL",
      "nested": {
        "finish": ["matte", "gloss"],
        "metadata": {
          "recyclable": true,
          "notes": null
        }
      }
    },
    "priceOverride": 2.1
  }
}
```

Failure cases:

- `400` invalid request body or malformed JSON
- `404` scoped product missing
- `409` concurrent product revision conflict
- `503` embedding generation failed

### PUT `/api/companies/:companyId/products/:productId/variants/:variantId`

Updates the scoped variant and refreshes product embeddings.

Request body:

```json
{
  "variantLabel": "Extra Large",
  "attributes": {
    "size": "XL",
    "nested": {
      "palette": ["white", "kraft"]
    }
  },
  "priceOverride": null
}
```

Notes:

- `priceOverride: null` clears the existing override
- request body must contain at least one updatable field

Success response:

```json
{
  "ok": true,
  "variant": {
    "id": "variant-1",
    "productId": "product-1",
    "variantLabel": "Extra Large",
    "attributes": {
      "size": "XL",
      "nested": {
        "palette": ["white", "kraft"]
      }
    }
  }
}
```

Failure cases:

- `400` invalid request body or malformed JSON
- `404` scoped product missing
- `404` scoped variant missing
- `409` concurrent product revision conflict
- `503` embedding generation failed

### DELETE `/api/companies/:companyId/products/:productId/variants/:variantId`

Deletes the scoped variant and refreshes product embeddings.

Success response:

```json
{
  "ok": true,
  "deleted": {
    "productId": "product-1",
    "variantId": "variant-1"
  }
}
```

Failure cases:

- `404` scoped product missing
- `404` scoped variant missing
- `409` concurrent product revision conflict
- `503` embedding generation failed

## Variant Attributes Contract

`attributes` must be a JSON object at the top level.

Allowed nested values:

- string
- finite number
- boolean
- null
- arrays containing allowed values
- nested objects containing allowed values

Normalization rules:

- object keys are trimmed at every level
- empty keys after trimming are rejected
- duplicate keys after trimming at the same object level are rejected
- string leaf values are preserved as provided
- array order is preserved
