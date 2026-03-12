# Product Image Upload via API

This guide documents the current product image upload flow backed by Cloudflare R2 presigned URLs.

## Prerequisites

The repo-root `.env` must contain working values for:

```env
API_KEY=your_api_key
CONVEX_URL=https://your-deployment.convex.cloud
CONVEX_ADMIN_KEY=your_convex_deploy_key
R2_BUCKET_NAME=your_bucket_name
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
```

The Convex deployment must already have the latest backend functions and schema:

```powershell
convex dev --once
```

The API must be running from the repo root:

```powershell
bun dev:api
```

## Quick Verification

Before testing uploads, confirm the API can read company data:

```powershell
Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:3000/api/companies" `
  -Headers @{ "x-api-key" = "12345" }
```

If this fails with `DB_QUERY_FAILED`, fix Convex configuration first.

## Upload Flow

Set variables:

```powershell
$API_BASE_URL = "http://localhost:3000"
$COMPANY_ID = "<company_id>"
$PRODUCT_ID = "<product_id>"
$API_KEY = "12345"
$FILE = "$PWD\card.jpeg"
$SIZE = (Get-Item $FILE).Length
```

Create an upload session:

```powershell
$upload = Invoke-RestMethod `
  -Method Post `
  -Uri "$API_BASE_URL/api/companies/$COMPANY_ID/products/$PRODUCT_ID/images/uploads" `
  -Headers @{ "x-api-key" = $API_KEY } `
  -ContentType "application/json" `
  -Body (@{
    contentType = "image/jpeg"
    sizeBytes = $SIZE
    alt = "Mock image"
  } | ConvertTo-Json)

$upload
```

The response includes:

- `upload.uploadId`
- `upload.imageId`
- `upload.objectKey`
- `upload.uploadUrl`
- `upload.expiresAt`

Upload the file directly to R2 using the presigned URL:

```powershell
Invoke-WebRequest `
  -Method Put `
  -Uri $upload.upload.uploadUrl `
  -InFile $FILE `
  -ContentType "image/jpeg"
```

Complete the upload through the API:

```powershell
$complete = Invoke-RestMethod `
  -Method Post `
  -Uri "$API_BASE_URL/api/companies/$COMPANY_ID/products/$PRODUCT_ID/images/uploads/$($upload.upload.uploadId)/complete" `
  -Headers @{ "x-api-key" = $API_KEY }

$complete
```

Verify the image is attached to the product:

```powershell
$product = Invoke-RestMethod `
  -Method Get `
  -Uri "$API_BASE_URL/api/companies/$COMPANY_ID/products/$PRODUCT_ID" `
  -Headers @{ "x-api-key" = $API_KEY }

$product.product.images
```

## Find Company and Product IDs

List companies:

```powershell
Invoke-RestMethod `
  -Method Get `
  -Uri "$API_BASE_URL/api/companies" `
  -Headers @{ "x-api-key" = $API_KEY }
```

List products for a company:

```powershell
Invoke-RestMethod `
  -Method Get `
  -Uri "$API_BASE_URL/api/companies/$COMPANY_ID/products" `
  -Headers @{ "x-api-key" = $API_KEY }
```

## Current Behavior

- Allowed content types: `image/jpeg`, `image/png`, `image/webp`
- Maximum size: `5 MiB`
- Uploads are two-step: create upload session, upload to R2, then complete
- Download URLs are presigned and short-lived
- Object keys are currently generated with a UUID-based image id, so filenames in R2 are intentionally unique rather than human-readable

## Common Errors

`CONFIG_MISSING` with `API authentication is not configured`

- The API was started without `API_KEY`

`DB_QUERY_FAILED` with `Company data is temporarily unavailable`

- `CONVEX_URL` or `CONVEX_ADMIN_KEY` is missing, wrong, or points to a different deployment

`DB_QUERY_FAILED` with `Product media is temporarily unavailable`

- The Convex backend is missing the `productMedia` functions, or R2 storage setup is incomplete

`404 Product not found`

- The `COMPANY_ID` and `PRODUCT_ID` do not belong to the same product scope

`400` validation failures

- `contentType` is unsupported
- `sizeBytes` is missing or too large

## Notes

- The API scripts in this repo load the repo-root `.env` explicitly.
- If Convex schema changes were made locally, run `convex dev --once` before using the media endpoints.
- If secrets were pasted into terminals, screenshots, or chat, rotate them afterwards.
