import type { CompanyConfig, CreateCompanyInput, UpdateCompanyInput } from '../services/companies';

type ParseSuccess<T> = {
  ok: true;
  value: T;
};

type ParseFailure = {
  ok: false;
  message: string;
};

type ParseResult<T> = ParseSuccess<T> | ParseFailure;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isConfigValue = (value: unknown): value is string | number | boolean =>
  typeof value === "string" || typeof value === "number" || typeof value === "boolean";

const parseRequiredString = (value: unknown, fieldName: string): ParseResult<string> => {
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

const parseOptionalString = (
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

const isValidTimeZone = (value: string): boolean => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

const parseTimezone = (
  value: unknown,
  options: { allowNull?: boolean } = {},
): ParseResult<string | null | undefined> => {
  const parsed = parseOptionalString(value, "timezone", options);
  if (!parsed.ok || parsed.value === undefined || parsed.value === null) {
    return parsed;
  }

  if (!isValidTimeZone(parsed.value)) {
    return {
      ok: false,
      message: "timezone must be a valid IANA timezone",
    };
  }

  return parsed;
};

const parseConfig = (
  value: unknown,
  options: { allowNull?: boolean } = {},
): ParseResult<CompanyConfig | null | undefined> => {
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
      message: "config must be an object",
    };
  }

  if (!isRecord(value)) {
    return {
      ok: false,
      message: "config must be an object",
    };
  }

  const config: CompanyConfig = {};

  for (const [key, entry] of Object.entries(value)) {
    if (!isConfigValue(entry)) {
      return {
        ok: false,
        message: `config.${key} must be a string, number, or boolean`,
      };
    }

    config[key] = entry;
  }

  return {
    ok: true,
    value: config,
  };
};

const parseObject = (value: unknown): ParseResult<Record<string, unknown>> => {
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

export const parseCreateCompanyBody = (value: unknown): ParseResult<CreateCompanyInput> => {
  const parsedObject = parseObject(value);
  if (!parsedObject.ok) {
    return parsedObject;
  }

  const name = parseRequiredString(parsedObject.value.name, "name");
  if (!name.ok) {
    return name;
  }

  const ownerPhone = parseRequiredString(parsedObject.value.ownerPhone, "ownerPhone");
  if (!ownerPhone.ok) {
    return ownerPhone;
  }

  const timezone = parseTimezone(parsedObject.value.timezone);
  if (!timezone.ok) {
    return timezone;
  }

  const config = parseConfig(parsedObject.value.config);
  if (!config.ok) {
    return config;
  }

  return {
    ok: true,
    value: {
      name: name.value,
      ownerPhone: ownerPhone.value,
      ...(timezone.value !== undefined && timezone.value !== null
        ? { timezone: timezone.value }
        : {}),
      ...(config.value !== undefined && config.value !== null
        ? { config: config.value }
        : {}),
    },
  };
};

export const parseUpdateCompanyBody = (value: unknown): ParseResult<UpdateCompanyInput> => {
  const parsedObject = parseObject(value);
  if (!parsedObject.ok) {
    return parsedObject;
  }

  const updates: UpdateCompanyInput = {};

  if (Object.keys(parsedObject.value).length === 0) {
    return {
      ok: false,
      message: "Request body must include at least one updatable field",
    };
  }

  if ("name" in parsedObject.value) {
    const name = parseRequiredString(parsedObject.value.name, "name");
    if (!name.ok) {
      return name;
    }
    updates.name = name.value;
  }

  if ("ownerPhone" in parsedObject.value) {
    const ownerPhone = parseRequiredString(parsedObject.value.ownerPhone, "ownerPhone");
    if (!ownerPhone.ok) {
      return ownerPhone;
    }
    updates.ownerPhone = ownerPhone.value;
  }

  if ("timezone" in parsedObject.value) {
    const timezone = parseTimezone(parsedObject.value.timezone, { allowNull: true });
    if (!timezone.ok) {
      return timezone;
    }
    updates.timezone = timezone.value;
  }

  if ("config" in parsedObject.value) {
    const config = parseConfig(parsedObject.value.config, { allowNull: true });
    if (!config.ok) {
      return config;
    }
    updates.config = config.value;
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
