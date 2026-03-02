### Step 6.3: QR Code Handling
**Goal**: Display QR codes for new session authentication.

**Tasks**:
- [ ] Create `src/services/whatsapp/qr.ts`
- [ ] Display QR code in terminal using ANSI art
- [ ] Save QR code as image to `data/qr/{companyId}.png`
- [ ] Expose QR via API: `GET /api/companies/:companyId/qr` (returns image)

**Verification**:
- QR displays in terminal
- QR image accessible via API endpoint
