import { Hono } from 'hono';
import { ERROR_CODES, ValidationError, canonicalizePhoneNumber } from '@cs/shared';
import { createErrorResponse } from '../responses';
import type { ConversationsService } from '../services/conversations';
import { ConversationsServiceError } from '../services/conversations';
import { requireRouteParam } from './routeParams';

export interface ConversationsRoutesOptions {
  conversationsService: ConversationsService;
}

type ConversationMutationBody = {
  phoneNumber: string;
  reason?: string;
};

const isServiceError = (error: unknown): error is ConversationsServiceError =>
  error instanceof ConversationsServiceError;

const parseBody = (value: unknown): ConversationMutationBody => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError("Request body must be an object");
  }

  const phoneNumber = canonicalizePhoneNumber(
    typeof (value as Record<string, unknown>).phoneNumber === "string"
      ? (value as Record<string, string>).phoneNumber
      : "",
  );
  if (!phoneNumber) {
    throw new ValidationError("phoneNumber is required");
  }

  const reasonValue = (value as Record<string, unknown>).reason;
  if (reasonValue !== undefined && typeof reasonValue !== "string") {
    throw new ValidationError("reason must be a string when provided");
  }

  const reason = typeof reasonValue === "string" ? reasonValue.trim() : undefined;
  return {
    phoneNumber,
    ...(reason ? { reason } : {}),
  };
};

export const createConversationsRoutes = (
  options: ConversationsRoutesOptions,
) => {
  const app = new Hono();

  app.post("/handoff", async (c) => {
    const companyId = requireRouteParam(c.req.param("companyId"), "companyId");
    const body = parseBody(await c.req.json());

    try {
      const conversation = await options.conversationsService.handoffConversation({
        companyId,
        phoneNumber: body.phoneNumber,
        ...(body.reason ? { reason: body.reason } : {}),
      });

      if (!conversation) {
        return c.json(createErrorResponse(ERROR_CODES.NOT_FOUND, "Conversation not found"), 404);
      }

      return c.json({
        ok: true,
        conversation,
      });
    } catch (error) {
      if (isServiceError(error)) {
        return c.json(createErrorResponse(error.code, error.message), error.status);
      }

      throw error;
    }
  });

  app.post("/resume", async (c) => {
    const companyId = requireRouteParam(c.req.param("companyId"), "companyId");
    const body = parseBody(await c.req.json());

    try {
      const conversation = await options.conversationsService.resumeConversation({
        companyId,
        phoneNumber: body.phoneNumber,
        ...(body.reason ? { reason: body.reason } : {}),
      });

      if (!conversation) {
        return c.json(createErrorResponse(ERROR_CODES.NOT_FOUND, "Conversation not found"), 404);
      }

      return c.json({
        ok: true,
        conversation,
      });
    } catch (error) {
      if (isServiceError(error)) {
        return c.json(createErrorResponse(error.code, error.message), error.status);
      }

      throw error;
    }
  });

  return app;
};
