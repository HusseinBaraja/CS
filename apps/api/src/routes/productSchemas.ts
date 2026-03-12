import type {
  CreateProductInput,
  CreateProductVariantInput,
  ListProductsFilters,
  ProductSpecifications,
  ProductVariantAttributes,
  ProductVariantAttributeValue,
  UpdateProductInput,
  UpdateProductVariantInput,
} from '../services/products';
import type { CreateProductImageUploadInput } from '../services/productMedia';
import {
  isRecord,
  parseObject,
  parseOptionalNumber,
  parseOptionalString,
  parseRequiredString,
  type ParseResult,
} from './parserUtils';

const parseSpecifications = (
  value: unknown,
  options: { allowNull?: boolean } = {},
): ParseResult<ProductSpecifications | null | undefined> => {
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
      message: "specifications must be an object",
    };
  }

  if (!isRecord(value)) {
    return {
      ok: false,
      message: "specifications must be an object",
    };
  }

  const specifications: ProductSpecifications = {};
  for (const [key, entryValue] of Object.entries(value)) {
    const normalizedKey = key.trim();
    if (normalizedKey.length === 0) {
      return {
        ok: false,
        message: "specifications keys must be non-empty strings",
      };
    }

    if (normalizedKey in specifications) {
      return {
        ok: false,
        message: `specifications keys must be unique after trimming: ${normalizedKey}`,
      };
    }

    if (
      typeof entryValue !== "string" &&
      typeof entryValue !== "number" &&
      typeof entryValue !== "boolean"
    ) {
      return {
        ok: false,
        message: `specifications.${normalizedKey} must be a string, number, or boolean`,
      };
    }

    specifications[normalizedKey] = entryValue;
  }

  return {
    ok: true,
    value: specifications,
  };
};

const parseVariantAttributeValue = (
  value: unknown,
  path: string,
): ParseResult<ProductVariantAttributeValue> => {
  if (value === null) {
    return {
      ok: true,
      value: null,
    };
  }

  if (
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return {
      ok: true,
      value,
    };
  }

  if (Array.isArray(value)) {
    const entries: ProductVariantAttributeValue[] = [];
    for (const [index, entryValue] of value.entries()) {
      const parsedEntry = parseVariantAttributeValue(entryValue, `${path}[${index}]`);
      if (!parsedEntry.ok) {
        return parsedEntry;
      }

      entries.push(parsedEntry.value);
    }

    return {
      ok: true,
      value: entries,
    };
  }

  if (isRecord(value)) {
    return parseVariantAttributes(value, path);
  }

  return {
    ok: false,
    message: `${path} must be a string, number, boolean, null, object, or array`,
  };
};

const parseVariantAttributes = (
  value: unknown,
  path = "attributes",
): ParseResult<ProductVariantAttributes> => {
  if (!isRecord(value)) {
    return {
      ok: false,
      message: `${path} must be an object`,
    };
  }

  const attributes: ProductVariantAttributes = {};
  for (const [key, entryValue] of Object.entries(value)) {
    const normalizedKey = key.trim();
    if (normalizedKey.length === 0) {
      return {
        ok: false,
        message: `${path} keys must be non-empty strings`,
      };
    }

    if (normalizedKey in attributes) {
      return {
        ok: false,
        message: `${path} keys must be unique after trimming: ${normalizedKey}`,
      };
    }

    const parsedValue = parseVariantAttributeValue(entryValue, `${path}.${normalizedKey}`);
    if (!parsedValue.ok) {
      return parsedValue;
    }

    attributes[normalizedKey] = parsedValue.value;
  }

  return {
    ok: true,
    value: attributes,
  };
};

export const parseListProductsQuery = (
  categoryId: string | undefined,
  search: string | undefined,
): ParseResult<ListProductsFilters> => {
  const filters: ListProductsFilters = {};

  if (categoryId !== undefined) {
    const parsedCategoryId = parseRequiredString(categoryId, "categoryId");
    if (!parsedCategoryId.ok) {
      return parsedCategoryId;
    }

    filters.categoryId = parsedCategoryId.value;
  }

  if (search !== undefined) {
    const parsedSearch = parseRequiredString(search, "search");
    if (!parsedSearch.ok) {
      return parsedSearch;
    }

    filters.search = parsedSearch.value;
  }

  return {
    ok: true,
    value: filters,
  };
};

export const parseCreateProductBody = (value: unknown): ParseResult<CreateProductInput> => {
  const parsedObject = parseObject(value);
  if (!parsedObject.ok) {
    return parsedObject;
  }

  const categoryId = parseRequiredString(parsedObject.value.categoryId, "categoryId");
  if (!categoryId.ok) {
    return categoryId;
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

  const specifications = parseSpecifications(parsedObject.value.specifications);
  if (!specifications.ok) {
    return specifications;
  }

  const basePrice = parseOptionalNumber(parsedObject.value.basePrice, "basePrice");
  if (!basePrice.ok) {
    return basePrice;
  }

  const baseCurrency = parseOptionalString(parsedObject.value.baseCurrency, "baseCurrency");
  if (!baseCurrency.ok) {
    return baseCurrency;
  }

  return {
    ok: true,
    value: {
      categoryId: categoryId.value,
      nameEn: nameEn.value,
      ...(nameAr.value !== undefined && nameAr.value !== null ? { nameAr: nameAr.value } : {}),
      ...(descriptionEn.value !== undefined && descriptionEn.value !== null
        ? { descriptionEn: descriptionEn.value }
        : {}),
      ...(descriptionAr.value !== undefined && descriptionAr.value !== null
        ? { descriptionAr: descriptionAr.value }
        : {}),
      ...(specifications.value !== undefined && specifications.value !== null
        ? { specifications: specifications.value }
        : {}),
      ...(basePrice.value !== undefined && basePrice.value !== null
        ? { basePrice: basePrice.value }
        : {}),
      ...(baseCurrency.value !== undefined && baseCurrency.value !== null
        ? { baseCurrency: baseCurrency.value }
        : {}),
    },
  };
};

export const parseUpdateProductBody = (value: unknown): ParseResult<UpdateProductInput> => {
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

  const updates: UpdateProductInput = {};

  if ("categoryId" in parsedObject.value) {
    const categoryId = parseRequiredString(parsedObject.value.categoryId, "categoryId");
    if (!categoryId.ok) {
      return categoryId;
    }

    updates.categoryId = categoryId.value;
  }

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

  if ("specifications" in parsedObject.value) {
    const specifications = parseSpecifications(parsedObject.value.specifications, { allowNull: true });
    if (!specifications.ok) {
      return specifications;
    }

    updates.specifications = specifications.value;
  }

  if ("basePrice" in parsedObject.value) {
    const basePrice = parseOptionalNumber(parsedObject.value.basePrice, "basePrice", { allowNull: true });
    if (!basePrice.ok) {
      return basePrice;
    }

    updates.basePrice = basePrice.value;
  }

  if ("baseCurrency" in parsedObject.value) {
    const baseCurrency = parseOptionalString(parsedObject.value.baseCurrency, "baseCurrency", {
      allowNull: true,
    });
    if (!baseCurrency.ok) {
      return baseCurrency;
    }

    updates.baseCurrency = baseCurrency.value;
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

export const parseCreateProductImageUploadBody = (
  value: unknown,
): ParseResult<CreateProductImageUploadInput> => {
  const parsedObject = parseObject(value);
  if (!parsedObject.ok) {
    return parsedObject;
  }

  const contentType = parseRequiredString(parsedObject.value.contentType, "contentType");
  if (!contentType.ok) {
    return contentType;
  }

  const sizeBytes = parseOptionalNumber(parsedObject.value.sizeBytes, "sizeBytes");
  if (!sizeBytes.ok) {
    return sizeBytes;
  }

  if (sizeBytes.value === undefined || sizeBytes.value === null) {
    return {
      ok: false,
      message: "sizeBytes is required",
    };
  }

  const alt = parseOptionalString(parsedObject.value.alt, "alt");
  if (!alt.ok) {
    return alt;
  }

  return {
    ok: true,
    value: {
      contentType: contentType.value,
      sizeBytes: sizeBytes.value,
      ...(alt.value !== undefined && alt.value !== null ? { alt: alt.value } : {}),
    },
  };
};

export const parseCreateVariantBody = (value: unknown): ParseResult<CreateProductVariantInput> => {
  const parsedObject = parseObject(value);
  if (!parsedObject.ok) {
    return parsedObject;
  }

  const variantLabel = parseRequiredString(parsedObject.value.variantLabel, "variantLabel");
  if (!variantLabel.ok) {
    return variantLabel;
  }

  const attributes = parseVariantAttributes(parsedObject.value.attributes);
  if (!attributes.ok) {
    return attributes;
  }

  const priceOverride = parseOptionalNumber(parsedObject.value.priceOverride, "priceOverride");
  if (!priceOverride.ok) {
    return priceOverride;
  }

  return {
    ok: true,
    value: {
      variantLabel: variantLabel.value,
      attributes: attributes.value,
      ...(priceOverride.value !== undefined && priceOverride.value !== null
        ? { priceOverride: priceOverride.value }
        : {}),
    },
  };
};

export const parseUpdateVariantBody = (value: unknown): ParseResult<UpdateProductVariantInput> => {
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

  const updates: UpdateProductVariantInput = {};

  if ("variantLabel" in parsedObject.value) {
    const variantLabel = parseRequiredString(parsedObject.value.variantLabel, "variantLabel");
    if (!variantLabel.ok) {
      return variantLabel;
    }

    updates.variantLabel = variantLabel.value;
  }

  if ("attributes" in parsedObject.value) {
    const attributes = parseVariantAttributes(parsedObject.value.attributes);
    if (!attributes.ok) {
      return attributes;
    }

    updates.attributes = attributes.value;
  }

  if ("priceOverride" in parsedObject.value) {
    const priceOverride = parseOptionalNumber(parsedObject.value.priceOverride, "priceOverride", {
      allowNull: true,
    });
    if (!priceOverride.ok) {
      return priceOverride;
    }

    updates.priceOverride = priceOverride.value;
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
