import { describe, expect, test } from 'bun:test';
import { ERROR_CODES } from '@cs/shared';
import { createApp } from '../app';
import {
  type CompaniesService,
  CompaniesServiceError,
  type CompanyDto,
  type CreateCompanyInput,
  type DeleteCompanyResult,
  type UpdateCompanyInput,
} from '../services/companies';

const API_KEY = "test-api-key";

const baseCompany: CompanyDto = {
  id: "company-1",
  name: "Alpha Packaging",
  ownerPhone: "966500000000",
  timezone: "Asia/Aden",
  config: {
    welcomesEnabled: true,
  },
};

const baseDeleteResult: DeleteCompanyResult = {
  companyId: "company-1",
  counts: {
    companies: 1,
    botRuntimeSessions: 1,
    categories: 2,
    products: 3,
    productImageUploads: 1,
    productVariants: 4,
    embeddings: 5,
    conversations: 6,
    messages: 7,
    mediaCleanupJobs: 1,
    offers: 8,
    currencyRates: 1,
    analyticsEvents: 9,
  },
};

const authHeaders = {
  "x-api-key": API_KEY,
  "content-type": "application/json",
};

const createStubCompaniesService = (
  overrides: Partial<CompaniesService> = {},
): CompaniesService => ({
  list: async () => [],
  get: async () => null,
  create: async (input: CreateCompanyInput) => ({
    id: "company-created",
    ...input,
  }),
  update: async (_companyId: string, patch: UpdateCompanyInput) => ({
    ...baseCompany,
    ...patch,
    timezone: patch.timezone === null ? undefined : patch.timezone ?? baseCompany.timezone,
    config: patch.config === null ? undefined : patch.config ?? baseCompany.config,
  }),
  delete: async () => baseDeleteResult,
  ...overrides,
});

const createTestApp = (companiesService: CompaniesService) =>
  createApp({
    companiesService,
    runtimeConfig: {
      apiKey: API_KEY,
    },
  });

describe("company routes", () => {
  test("GET /api/companies returns the companies payload", async () => {
    const app = createTestApp(createStubCompaniesService({
      list: async () => [
        baseCompany,
        {
          id: "company-2",
          name: "Beta Packaging",
          ownerPhone: "966500000001",
        },
      ],
    }));

    const response = await app.request("/api/companies", {
      headers: {
        "x-api-key": API_KEY,
      },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      companies: [
        baseCompany,
        {
          id: "company-2",
          name: "Beta Packaging",
          ownerPhone: "966500000001",
        },
      ],
    });
  });

  test("GET /api/companies/:companyId returns 404 when the company does not exist", async () => {
    const app = createTestApp(createStubCompaniesService());

    const response = await app.request("/api/companies/missing-company", {
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

  test("POST /api/companies creates a company", async () => {
    let receivedInput: CreateCompanyInput | undefined;
    const app = createTestApp(createStubCompaniesService({
      create: async (input) => {
        receivedInput = input;
        return {
          id: "company-created",
          ...input,
        };
      },
    }));

    const response = await app.request("/api/companies", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        name: "  New Tenant  ",
        ownerPhone: " 966500000123 ",
        timezone: "Asia/Aden",
        config: {
          defaultLanguage: "ar",
          welcomesEnabled: true,
        },
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(receivedInput).toEqual({
      name: "New Tenant",
      ownerPhone: "966500000123",
      timezone: "Asia/Aden",
      config: {
        defaultLanguage: "ar",
        welcomesEnabled: true,
      },
    });
    expect(body).toEqual({
      ok: true,
      company: {
        id: "company-created",
        name: "New Tenant",
        ownerPhone: "966500000123",
        timezone: "Asia/Aden",
        config: {
          defaultLanguage: "ar",
          welcomesEnabled: true,
        },
      },
    });
  });

  test("POST /api/companies rejects invalid input", async () => {
    const app = createTestApp(createStubCompaniesService());

    const response = await app.request("/api/companies", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        name: "Tenant",
        ownerPhone: "966500000123",
        config: {
          nested: {
            invalid: true,
          },
        },
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.VALIDATION_FAILED,
        message: "config.nested must be a string, number, or boolean",
      },
    });
  });

  test("POST /api/companies maps duplicate owner conflicts to 409", async () => {
    const app = createTestApp(createStubCompaniesService({
      create: async () => {
        throw new CompaniesServiceError(
          ERROR_CODES.CONFLICT,
          "Owner phone is already assigned to another company",
          409,
        );
      },
    }));

    const response = await app.request("/api/companies", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        name: "Tenant",
        ownerPhone: "966500000123",
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.CONFLICT,
        message: "Owner phone is already assigned to another company",
      },
    });
  });

  test("PUT /api/companies/:companyId partially updates a company", async () => {
    let receivedPatch: UpdateCompanyInput | undefined;
    const app = createTestApp(createStubCompaniesService({
      update: async (_companyId, patch) => {
        receivedPatch = patch;
        return {
          ...baseCompany,
          name: patch.name ?? baseCompany.name,
          ownerPhone: patch.ownerPhone ?? baseCompany.ownerPhone,
          timezone: patch.timezone === null ? undefined : patch.timezone ?? baseCompany.timezone,
          config: patch.config === null ? undefined : patch.config ?? baseCompany.config,
        };
      },
    }));

    const response = await app.request("/api/companies/company-1", {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({
        name: "  Updated Tenant  ",
        ownerPhone: " 966500000321 ",
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(receivedPatch).toEqual({
      name: "Updated Tenant",
      ownerPhone: "966500000321",
    });
    expect(body).toEqual({
      ok: true,
      company: {
        ...baseCompany,
        name: "Updated Tenant",
        ownerPhone: "966500000321",
      },
    });
  });

  test("PUT /api/companies/:companyId clears timezone and config when null is provided", async () => {
    let receivedPatch: UpdateCompanyInput | undefined;
    const app = createTestApp(createStubCompaniesService({
      update: async (_companyId, patch) => {
        receivedPatch = patch;
        return {
          id: baseCompany.id,
          name: baseCompany.name,
          ownerPhone: baseCompany.ownerPhone,
        };
      },
    }));

    const response = await app.request("/api/companies/company-1", {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({
        timezone: null,
        config: null,
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(receivedPatch).toEqual({
      timezone: null,
      config: null,
    });
    expect(body).toEqual({
      ok: true,
      company: {
        id: baseCompany.id,
        name: baseCompany.name,
        ownerPhone: baseCompany.ownerPhone,
      },
    });
  });

  test("PUT /api/companies/:companyId rejects empty bodies", async () => {
    const app = createTestApp(createStubCompaniesService());

    const response = await app.request("/api/companies/company-1", {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({}),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.VALIDATION_FAILED,
        message: "Request body must include at least one updatable field",
      },
    });
  });

  test("DELETE /api/companies/:companyId returns cascade counts", async () => {
    const app = createTestApp(createStubCompaniesService());

    const response = await app.request("/api/companies/company-1", {
      method: "DELETE",
      headers: {
        "x-api-key": API_KEY,
      },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      deleted: baseDeleteResult,
    });
  });

  test("DELETE /api/companies/:companyId returns 404 when the company does not exist", async () => {
    const app = createTestApp(createStubCompaniesService({
      delete: async () => null,
    }));

    const response = await app.request("/api/companies/company-1", {
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
        message: "Company not found",
      },
    });
  });
});
