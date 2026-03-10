import type { CreateCategoryInput, UpdateCategoryInput } from '../services/categories';

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

export const parseCreateCategoryBody = (value: unknown): ParseResult<CreateCategoryInput> => {
  const parsedObject = parseObject(value);
  if (!parsedObject.ok) {
    return parsedObject;
  }

  const nameEn = parseRequiredString(parsedObject.value.nameEn, "nameEn");
  if (!nameEn.ok) {
    return nameEn;
  }

  const nameAr = parseOptionalString(parsedObject.value.nameAr, "nameAr");
  if (!nameAr.ok) {
    return nameAr;
  }

  const descriptionEn = parseOptionalString(parsedObject.value.descriptionEn, "descriptionEn");
  if (!descriptionEn.ok) {
    return descriptionEn;
  }

  const descriptionAr = parseOptionalString(parsedObject.value.descriptionAr, "descriptionAr");
  if (!descriptionAr.ok) {
    return descriptionAr;
  }

  return {
    ok: true,
    value: {
      nameEn: nameEn.value,
      ...(nameAr.value !== undefined && nameAr.value !== null ? { nameAr: nameAr.value } : {}),
      ...(descriptionEn.value !== undefined && descriptionEn.value !== null
        ? { descriptionEn: descriptionEn.value }
        : {}),
      ...(descriptionAr.value !== undefined && descriptionAr.value !== null
        ? { descriptionAr: descriptionAr.value }
        : {}),
    },
  };
};

export const parseUpdateCategoryBody = (value: unknown): ParseResult<UpdateCategoryInput> => {
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

  const updates: UpdateCategoryInput = {};

  if ("nameEn" in parsedObject.value) {
    const nameEn = parseRequiredString(parsedObject.value.nameEn, "nameEn");
    if (!nameEn.ok) {
      return nameEn;
    }

    updates.nameEn = nameEn.value;
  }

  if ("nameAr" in parsedObject.value) {
    const nameAr = parseOptionalString(parsedObject.value.nameAr, "nameAr", { allowNull: true });
    if (!nameAr.ok) {
      return nameAr;
    }

    updates.nameAr = nameAr.value;
  }

  if ("descriptionEn" in parsedObject.value) {
    const descriptionEn = parseOptionalString(parsedObject.value.descriptionEn, "descriptionEn", {
      allowNull: true,
    });
    if (!descriptionEn.ok) {
      return descriptionEn;
    }

    updates.descriptionEn = descriptionEn.value;
  }

  if ("descriptionAr" in parsedObject.value) {
    const descriptionAr = parseOptionalString(parsedObject.value.descriptionAr, "descriptionAr", {
      allowNull: true,
    });
    if (!descriptionAr.ok) {
      return descriptionAr;
    }

    updates.descriptionAr = descriptionAr.value;
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
