import type { CreateOfferInput, ListOffersFilters, UpdateOfferInput } from '../services/offers';
import { parseObject, parseOptionalString, parseRequiredString, type ParseResult } from './parserUtils';

const ISO_DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;

const parseBooleanString = (
  value: string | undefined,
  fieldName: string,
): ParseResult<boolean | undefined> => {
  if (value === undefined) {
    return {
      ok: true,
      value: undefined,
    };
  }

  if (value === "true") {
    return {
      ok: true,
      value: true,
    };
  }

  if (value === "false") {
    return {
      ok: true,
      value: false,
    };
  }

  return {
    ok: false,
    message: `${fieldName} must be true or false`,
  };
};

const parseRequiredBoolean = (value: unknown, fieldName: string): ParseResult<boolean> => {
  if (typeof value !== "boolean") {
    return {
      ok: false,
      message: `${fieldName} must be a boolean`,
    };
  }

  return {
    ok: true,
    value,
  };
};

const parseOptionalBoolean = (value: unknown, fieldName: string): ParseResult<boolean | undefined> => {
  if (value === undefined) {
    return {
      ok: true,
      value: undefined,
    };
  }

  if (typeof value !== "boolean") {
    return {
      ok: false,
      message: `${fieldName} must be a boolean`,
    };
  }

  return {
    ok: true,
    value,
  };
};

const parseOptionalIsoDateTime = (
  value: unknown,
  fieldName: string,
  options: { allowNull?: boolean } = {},
): ParseResult<string | null | undefined> => {
  if (value === undefined) {
    return {
      ok: true,
      value: undefined,
    };
  }

  if (value === null) {
    if (options.allowNull) {
      return {
        ok: true,
        value: null,
      };
    }

    return {
      ok: false,
      message: `${fieldName} must be a valid ISO 8601 date-time string`,
    };
  }

  if (typeof value !== "string") {
    return {
      ok: false,
      message: `${fieldName} must be a valid ISO 8601 date-time string`,
    };
  }

  const normalized = value.trim();
  if (!ISO_DATE_TIME_PATTERN.test(normalized) || Number.isNaN(Date.parse(normalized))) {
    return {
      ok: false,
      message: `${fieldName} must be a valid ISO 8601 date-time string`,
    };
  }

  return {
    ok: true,
    value: normalized,
  };
};

export const parseListOffersQuery = (
  activeOnly: string | undefined,
): ParseResult<ListOffersFilters> => {
  const parsedActiveOnly = parseBooleanString(activeOnly, "activeOnly");
  if (!parsedActiveOnly.ok) {
    return parsedActiveOnly;
  }

  return {
    ok: true,
    value: {
      activeOnly: parsedActiveOnly.value ?? true,
    },
  };
};

export const parseCreateOfferBody = (value: unknown): ParseResult<CreateOfferInput> => {
  const parsedObject = parseObject(value);
  if (!parsedObject.ok) {
    return parsedObject;
  }

  const contentEn = parseRequiredString(parsedObject.value.contentEn, "contentEn");
  if (!contentEn.ok) {
    return contentEn;
  }

  const contentAr = parseOptionalString(parsedObject.value.contentAr, "contentAr");
  if (!contentAr.ok) {
    return contentAr;
  }

  const active = parseRequiredBoolean(parsedObject.value.active, "active");
  if (!active.ok) {
    return active;
  }

  const startDate = parseOptionalIsoDateTime(parsedObject.value.startDate, "startDate");
  if (!startDate.ok) {
    return startDate;
  }

  const endDate = parseOptionalIsoDateTime(parsedObject.value.endDate, "endDate");
  if (!endDate.ok) {
    return endDate;
  }

  return {
    ok: true,
    value: {
      contentEn: contentEn.value,
      active: active.value,
      ...(contentAr.value !== undefined && contentAr.value !== null ? { contentAr: contentAr.value } : {}),
      ...(startDate.value !== undefined && startDate.value !== null ? { startDate: startDate.value } : {}),
      ...(endDate.value !== undefined && endDate.value !== null ? { endDate: endDate.value } : {}),
    },
  };
};

export const parseUpdateOfferBody = (value: unknown): ParseResult<UpdateOfferInput> => {
  const parsedObject = parseObject(value);
  if (!parsedObject.ok) {
    return parsedObject;
  }

  if (Object.keys(parsedObject.value).length === 0) {
    return {
      ok: false,
      message: "Request body must include at least one updatable field",
    };
  }

  const updates: UpdateOfferInput = {};

  if ("contentEn" in parsedObject.value) {
    const contentEn = parseRequiredString(parsedObject.value.contentEn, "contentEn");
    if (!contentEn.ok) {
      return contentEn;
    }

    updates.contentEn = contentEn.value;
  }

  if ("contentAr" in parsedObject.value) {
    const contentAr = parseOptionalString(parsedObject.value.contentAr, "contentAr", { allowNull: true });
    if (!contentAr.ok) {
      return contentAr;
    }

    updates.contentAr = contentAr.value;
  }

  if ("active" in parsedObject.value) {
    const active = parseOptionalBoolean(parsedObject.value.active, "active");
    if (!active.ok) {
      return active;
    }

    updates.active = active.value;
  }

  if ("startDate" in parsedObject.value) {
    const startDate = parseOptionalIsoDateTime(parsedObject.value.startDate, "startDate", {
      allowNull: true,
    });
    if (!startDate.ok) {
      return startDate;
    }

    updates.startDate = startDate.value;
  }

  if ("endDate" in parsedObject.value) {
    const endDate = parseOptionalIsoDateTime(parsedObject.value.endDate, "endDate", {
      allowNull: true,
    });
    if (!endDate.ok) {
      return endDate;
    }

    updates.endDate = endDate.value;
  }

  if (Object.keys(updates).length === 0) {
    return {
      ok: false,
      message: "Request body must include at least one updatable field",
    };
  }

  return {
    ok: true,
    value: updates,
  };
};
