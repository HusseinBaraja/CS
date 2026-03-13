import { describe, expect, test } from 'bun:test';
import { ERROR_CODES } from '@cs/shared';
import { createApp } from '../app';
import {
  type CreateOfferInput,
  type ListOffersFilters,
  type OfferDto,
  type OffersService,
  type UpdateOfferInput,
} from '../services/offers';

const API_KEY = "test-api-key";

const baseOffer: OfferDto = {
  id: "offer-1",
  companyId: "company-1",
  contentEn: "Weekend sale",
  contentAr: "عرض نهاية الأسبوع",
  active: true,
  startDate: "2026-03-12T08:00:00.000Z",
  endDate: "2026-03-12T20:00:00.000Z",
  isCurrentlyActive: true,
};

const authHeaders = {
  "x-api-key": API_KEY,
  "content-type": "application/json",
};

const createStubOffersService = (
  overrides: Partial<OffersService> = {},
): OffersService => ({
  list: async () => [],
  create: async (_companyId: string, input: CreateOfferInput) => ({
    id: "offer-created",
    companyId: "company-1",
    ...input,
    isCurrentlyActive: input.active,
  }),
  update: async (_companyId: string, offerId: string, patch: UpdateOfferInput) => ({
    ...baseOffer,
    id: offerId,
    contentEn: patch.contentEn ?? baseOffer.contentEn,
    contentAr: patch.contentAr === null ? undefined : patch.contentAr ?? baseOffer.contentAr,
    active: patch.active ?? baseOffer.active,
    startDate: patch.startDate === null ? undefined : patch.startDate ?? baseOffer.startDate,
    endDate: patch.endDate === null ? undefined : patch.endDate ?? baseOffer.endDate,
    isCurrentlyActive: patch.active ?? baseOffer.active,
  }),
  delete: async () => ({
    offerId: "offer-1",
  }),
  ...overrides,
});

const createTestApp = (offersService: OffersService) =>
  createApp({
    offersService,
    runtimeConfig: {
      apiKey: API_KEY,
    },
  });

describe("offer routes", () => {
  test("GET /api/companies/:companyId/offers forwards activeOnly=false", async () => {
    let receivedFilters: ListOffersFilters | undefined;
    const app = createTestApp(createStubOffersService({
      list: async (_companyId, filters) => {
        receivedFilters = filters;
        return [baseOffer];
      },
    }));

    const response = await app.request("/api/companies/company-1/offers?activeOnly=false", {
      headers: {
        "x-api-key": API_KEY,
      },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(receivedFilters).toEqual({
      activeOnly: false,
    });
    expect(body).toEqual({
      ok: true,
      offers: [baseOffer],
    });
  });

  test("GET /api/companies/:companyId/offers returns 404 when the company does not exist", async () => {
    const app = createTestApp(createStubOffersService({
      list: async () => null,
    }));

    const response = await app.request("/api/companies/company-1/offers", {
      headers: {
        "x-api-key": API_KEY,
      },
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.NOT_FOUND,
        message: "Company not found",
      },
    });
  });

  test("POST /api/companies/:companyId/offers creates an offer", async () => {
    let receivedInput: CreateOfferInput | undefined;
    const app = createTestApp(createStubOffersService({
      create: async (_companyId, input) => {
        receivedInput = input;
        return {
          id: "offer-created",
          companyId: "company-1",
          ...input,
          isCurrentlyActive: input.active,
        };
      },
    }));

    const response = await app.request("/api/companies/company-1/offers", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        contentEn: "  Weekend sale  ",
        contentAr: "  عرض نهاية الأسبوع  ",
        active: true,
        startDate: "2026-03-12T08:00:00.000Z",
        endDate: "2026-03-12T20:00:00.000Z",
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(receivedInput).toEqual({
      contentEn: "Weekend sale",
      contentAr: "عرض نهاية الأسبوع",
      active: true,
      startDate: "2026-03-12T08:00:00.000Z",
      endDate: "2026-03-12T20:00:00.000Z",
    });
    expect(body).toEqual({
      ok: true,
      offer: {
        id: "offer-created",
        companyId: "company-1",
        contentEn: "Weekend sale",
        contentAr: "عرض نهاية الأسبوع",
        active: true,
        startDate: "2026-03-12T08:00:00.000Z",
        endDate: "2026-03-12T20:00:00.000Z",
        isCurrentlyActive: true,
      },
    });
  });

  test("PUT /api/companies/:companyId/offers/:id rejects invalid bodies", async () => {
    const app = createTestApp(createStubOffersService());

    const response = await app.request("/api/companies/company-1/offers/offer-1", {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({
        startDate: "2026-03-12",
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.VALIDATION_FAILED,
        message: "startDate must be a valid ISO 8601 date-time string",
      },
    });
  });

  test("POST /api/companies/:companyId/offers rejects malformed JSON", async () => {
    const app = createTestApp(createStubOffersService());

    const response = await app.request("/api/companies/company-1/offers", {
      method: "POST",
      headers: authHeaders,
      body: "{",
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.VALIDATION_FAILED,
        message: "Malformed JSON body",
      },
    });
  });

  test("DELETE /api/companies/:companyId/offers/:id returns 404 when the offer does not exist", async () => {
    const app = createTestApp(createStubOffersService({
      delete: async () => null,
    }));

    const response = await app.request("/api/companies/company-1/offers/offer-1", {
      method: "DELETE",
      headers: {
        "x-api-key": API_KEY,
      },
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.NOT_FOUND,
        message: "Offer not found",
      },
    });
  });
});
