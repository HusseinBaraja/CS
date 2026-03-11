export type ParseSuccess<T> = {
  ok: true;
  value: T;
};

export type ParseFailure = {
  ok: false;
  message: string;
};

export type ParseResult<T> = ParseSuccess<T> | ParseFailure;

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const parseObject = (value: unknown): ParseResult<Record<string, unknown>> => {
  if (!isRecord(value)) {
    return {
      ok: false,
      message: "Request body must be a JSON object",
    };
  }

  return {
    ok: true,
    value,
  };
};

export const parseRequiredString = (
  value: unknown,
  fieldName: string,
): ParseResult<string> => {
  if (typeof value !== "string") {
    return {
      ok: false,
      message: `${fieldName} must be a string`,
    };
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    return {
      ok: false,
      message: `${fieldName} is required`,
    };
  }

  return {
    ok: true,
    value: normalized,
  };
};

export const parseOptionalString = (
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
      message: `${fieldName} must be a string`,
    };
  }

  if (typeof value !== "string") {
    return {
      ok: false,
      message: `${fieldName} must be a string`,
    };
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    return {
      ok: false,
      message: `${fieldName} is required when provided`,
    };
  }

  return {
    ok: true,
    value: normalized,
  };
};

export const parseOptionalNumber = (
  value: unknown,
  fieldName: string,
  options: { allowNull?: boolean } = {},
): ParseResult<number | null | undefined> => {
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
      message: `${fieldName} must be a number`,
    };
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return {
      ok: false,
      message: `${fieldName} must be a non-negative number`,
    };
  }

  return {
    ok: true,
    value,
  };
};
