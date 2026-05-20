import { convexInternal, createConvexAdminClient, type ConvexAdminClient } from '@cs/db';
import { ERROR_CODES } from '@cs/shared';
import type { CompaniesService, DeleteCompanyResult } from './companies';
import {
  CompaniesServiceError,
  createConflictServiceError,
  createDatabaseServiceError,
  createValidationServiceError,
} from './companies';

interface ConvexCompaniesServiceOptions {
  createClient?: () => ConvexAdminClient;
}

const ERROR_PREFIXES = new Map<string, (message: string) => CompaniesServiceError>([
  [ERROR_CODES.CONFLICT, createConflictServiceError],
  [ERROR_CODES.VALIDATION_FAILED, createValidationServiceError],
]);

const parseTaggedError = (message: string): CompaniesServiceError | null => {
  for (const [code, createError] of ERROR_PREFIXES) {
    const marker = `${code}:`;
    const markerIndex = message.indexOf(marker);
    if (markerIndex >= 0) {
      const errorMessage = message.slice(markerIndex + marker.length).trim() || "Request failed";
      return createError(errorMessage);
    }
  }

  return null;
};

const isCompaniesServiceError = (error: unknown): error is CompaniesServiceError =>
  error instanceof CompaniesServiceError;

const normalizeServiceError = (error: unknown): CompaniesServiceError => {
  if (isCompaniesServiceError(error)) {
    return error;
  }

  if (error instanceof Error) {
    const taggedError = parseTaggedError(error.message);
    if (taggedError) {
      return taggedError;
    }

    if (
      error.message.includes("ArgumentValidationError") ||
      error.message.includes("Value does not match validator") ||
      error.message.includes("Invalid argument") ||
      error.message.includes("Unable to decode")
    ) {
      return createValidationServiceError("Invalid company identifier or request payload");
    }
  }

  return createDatabaseServiceError("Company data is temporarily unavailable");
};

export const createConvexCompaniesService = (
  options: ConvexCompaniesServiceOptions = {},
): CompaniesService => {
  const createClient = options.createClient ?? createConvexAdminClient;

  const withClient = async <T>(callback: (client: ConvexAdminClient) => Promise<T>): Promise<T> => {
    try {
      return await callback(createClient());
    } catch (error) {
      throw normalizeServiceError(error);
    }
  };

  return {
    list: () =>
      withClient((client) => client.query(convexInternal.companies.list, {})),
    get: (companyId) =>
      withClient((client) =>
        client.query(convexInternal.companies.get, {
          companyId: companyId as never,
        })
      ),
    create: (input) =>
      withClient((client) => client.mutation(convexInternal.companies.create, input)),
    update: (companyId, patch) =>
      withClient((client) =>
        client.mutation(convexInternal.companies.update, {
          companyId: companyId as never,
          ...patch,
        })
      ),
    delete: (companyId) =>
      withClient((client) =>
        client.action(convexInternal.companies.remove, {
          companyId: companyId as never,
        })
      ) as Promise<DeleteCompanyResult | null>,
  };
};
