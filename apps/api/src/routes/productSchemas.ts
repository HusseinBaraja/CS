import type {
  CreateProductInput,
  ListProductsFilters,
  ProductSpecifications,
  UpdateProductInput,
} from '../services/products';
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

const parseImageUrls = (
  value: unknown,
  options: { allowNull?: boolean } = {},
): ParseResult<string[] | null | undefined> => {
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
      message: "imageUrls must be an array of strings",
    };
  }

  if (!Array.isArray(value)) {
    return {
      ok: false,
      message: "imageUrls must be an array of strings",
    };
  }

  const imageUrls: string[] = [];
  for (const [index, entryValue] of value.entries()) {
    if (typeof entryValue !== "string") {
      return {
        ok: false,
        message: `imageUrls[${index}] must be a string`,
      };
    }

    const normalized = entryValue.trim();
    if (normalized.length === 0) {
      return {
        ok: false,
        message: `imageUrls[${index}] is required`,
      };
    }

    imageUrls.push(normalized);
  }

  return {
    ok: true,
    value: imageUrls,
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

  const imageUrls = parseImageUrls(parsedObject.value.imageUrls);
  if (!imageUrls.ok) {
    return imageUrls;
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
      ...(imageUrls.value !== undefined && imageUrls.value !== null
        ? { imageUrls: imageUrls.value }
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

  if ("imageUrls" in parsedObject.value) {
    const imageUrls = parseImageUrls(parsedObject.value.imageUrls, { allowNull: true });
    if (!imageUrls.ok) {
      return imageUrls;
    }

    updates.imageUrls = imageUrls.value;
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
