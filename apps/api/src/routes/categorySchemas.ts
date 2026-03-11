import type { CreateCategoryInput, UpdateCategoryInput } from '../services/categories';
import {
  parseObject,
  parseOptionalString,
  parseRequiredString,
  type ParseResult,
} from './parserUtils';

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
