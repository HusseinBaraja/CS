import type {
  CreateProductInput,
  CreateProductVariantInput,
  ListProductsFilters,
  UpdateProductInput,
  UpdateProductVariantInput,
} from '../services/products';
import type { CreateProductImageUploadInput } from '../services/productMedia';
import {
  parseObject,
  parseOptionalNumber,
  parseOptionalString,
  parseRequiredString,
  type ParseResult,
} from './parserUtils';

const assignOptionalString = (
  target: object,
  key: string,
  value: string | null | undefined,
): void => {
  if (value !== undefined && value !== null) {
    (target as Record<string, unknown>)[key] = value;
  }
};

const assignOptionalNullableString = (
  target: object,
  key: string,
  value: string | null | undefined,
): void => {
  if (value !== undefined) {
    (target as Record<string, unknown>)[key] = value;
  }
};

const assignOptionalNumber = (
  target: object,
  key: string,
  value: number | null | undefined,
): void => {
  if (value !== undefined && value !== null) {
    (target as Record<string, unknown>)[key] = value;
  }
};

const assignOptionalNullableNumber = (
  target: object,
  key: string,
  value: number | null | undefined,
): void => {
  if (value !== undefined) {
    (target as Record<string, unknown>)[key] = value;
  }
};

const hasAtLeastOneName = (value: Pick<CreateProductInput, 'nameAr' | 'nameEn'>): boolean =>
  Boolean(value.nameAr || value.nameEn);

export const parseListProductsQuery = (
  categoryId: string | undefined,
  search: string | undefined,
): ParseResult<ListProductsFilters> => {
  const filters: ListProductsFilters = {};

  if (categoryId !== undefined) {
    const parsedCategoryId = parseRequiredString(categoryId, 'categoryId');
    if (!parsedCategoryId.ok) {
      return parsedCategoryId;
    }

    filters.categoryId = parsedCategoryId.value;
  }

  if (search !== undefined) {
    const parsedSearch = parseRequiredString(search, 'search');
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

  const categoryId = parseRequiredString(parsedObject.value.categoryId, 'categoryId');
  if (!categoryId.ok) {
    return categoryId;
  }

  const productNo = parseOptionalString(parsedObject.value.productNo, 'productNo');
  if (!productNo.ok) {
    return productNo;
  }

  const nameEn = parseOptionalString(parsedObject.value.nameEn, 'nameEn');
  if (!nameEn.ok) {
    return nameEn;
  }

  const nameAr = parseOptionalString(parsedObject.value.nameAr, 'nameAr');
  if (!nameAr.ok) {
    return nameAr;
  }

  const descriptionEn = parseOptionalString(parsedObject.value.descriptionEn, 'descriptionEn');
  if (!descriptionEn.ok) {
    return descriptionEn;
  }

  const descriptionAr = parseOptionalString(parsedObject.value.descriptionAr, 'descriptionAr');
  if (!descriptionAr.ok) {
    return descriptionAr;
  }

  const price = parseOptionalNumber(parsedObject.value.price, 'price');
  if (!price.ok) {
    return price;
  }

  const currency = parseOptionalString(parsedObject.value.currency, 'currency');
  if (!currency.ok) {
    return currency;
  }

  const primaryImage = parseOptionalString(parsedObject.value.primaryImage, 'primaryImage');
  if (!primaryImage.ok) {
    return primaryImage;
  }

  const parsedProduct: CreateProductInput = {
    categoryId: categoryId.value,
  };
  assignOptionalString(parsedProduct, 'productNo', productNo.value);
  assignOptionalString(parsedProduct, 'nameEn', nameEn.value);
  assignOptionalString(parsedProduct, 'nameAr', nameAr.value);
  assignOptionalString(parsedProduct, 'descriptionEn', descriptionEn.value);
  assignOptionalString(parsedProduct, 'descriptionAr', descriptionAr.value);
  assignOptionalNumber(parsedProduct, 'price', price.value);
  assignOptionalString(parsedProduct, 'currency', currency.value);
  assignOptionalString(parsedProduct, 'primaryImage', primaryImage.value);

  if (!hasAtLeastOneName(parsedProduct)) {
    return {
      ok: false,
      message: 'at least one of nameEn or nameAr is required',
    };
  }

  return {
    ok: true,
    value: parsedProduct,
  };
};

export const parseUpdateProductBody = (value: unknown): ParseResult<UpdateProductInput> => {
  const parsedObject = parseObject(value);
  if (!parsedObject.ok) {
    return parsedObject;
  }

  const updates: UpdateProductInput = {};

  if ('categoryId' in parsedObject.value) {
    const categoryId = parseRequiredString(parsedObject.value.categoryId, 'categoryId');
    if (!categoryId.ok) {
      return categoryId;
    }

    updates.categoryId = categoryId.value;
  }

  if ('productNo' in parsedObject.value) {
    const productNo = parseOptionalString(parsedObject.value.productNo, 'productNo', { allowNull: true });
    if (!productNo.ok) {
      return productNo;
    }

    assignOptionalNullableString(updates, 'productNo', productNo.value);
  }

  if ('nameEn' in parsedObject.value) {
    const nameEn = parseOptionalString(parsedObject.value.nameEn, 'nameEn', { allowNull: true });
    if (!nameEn.ok) {
      return nameEn;
    }

    assignOptionalNullableString(updates, 'nameEn', nameEn.value);
  }

  if ('nameAr' in parsedObject.value) {
    const nameAr = parseOptionalString(parsedObject.value.nameAr, 'nameAr', { allowNull: true });
    if (!nameAr.ok) {
      return nameAr;
    }

    assignOptionalNullableString(updates, 'nameAr', nameAr.value);
  }

  if ('descriptionEn' in parsedObject.value) {
    const descriptionEn = parseOptionalString(parsedObject.value.descriptionEn, 'descriptionEn', {
      allowNull: true,
    });
    if (!descriptionEn.ok) {
      return descriptionEn;
    }

    assignOptionalNullableString(updates, 'descriptionEn', descriptionEn.value);
  }

  if ('descriptionAr' in parsedObject.value) {
    const descriptionAr = parseOptionalString(parsedObject.value.descriptionAr, 'descriptionAr', {
      allowNull: true,
    });
    if (!descriptionAr.ok) {
      return descriptionAr;
    }

    assignOptionalNullableString(updates, 'descriptionAr', descriptionAr.value);
  }

  if ('price' in parsedObject.value) {
    const price = parseOptionalNumber(parsedObject.value.price, 'price', { allowNull: true });
    if (!price.ok) {
      return price;
    }

    assignOptionalNullableNumber(updates, 'price', price.value);
  }

  if ('currency' in parsedObject.value) {
    const currency = parseOptionalString(parsedObject.value.currency, 'currency', {
      allowNull: true,
    });
    if (!currency.ok) {
      return currency;
    }

    assignOptionalNullableString(updates, 'currency', currency.value);
  }

  if (Object.keys(updates).length === 0) {
    return {
      ok: false,
      message: 'Request body must include at least one recognized updatable field',
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

  const contentType = parseRequiredString(parsedObject.value.contentType, 'contentType');
  if (!contentType.ok) {
    return contentType;
  }

  const sizeBytes = parseOptionalNumber(parsedObject.value.sizeBytes, 'sizeBytes');
  if (!sizeBytes.ok) {
    return sizeBytes;
  }

  if (sizeBytes.value === undefined || sizeBytes.value === null) {
    return {
      ok: false,
      message: 'sizeBytes is required',
    };
  }

  const alt = parseOptionalString(parsedObject.value.alt, 'alt');
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

  const label = parseRequiredString(parsedObject.value.label, 'label');
  if (!label.ok) {
    return label;
  }

  const price = parseOptionalNumber(parsedObject.value.price, 'price');
  if (!price.ok) {
    return price;
  }

  return {
    ok: true,
    value: {
      label: label.value,
      ...(price.value !== undefined && price.value !== null ? { price: price.value } : {}),
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
      message: 'Request body must include at least one updatable field',
    };
  }

  const updates: UpdateProductVariantInput = {};

  if ('label' in parsedObject.value) {
    const label = parseRequiredString(parsedObject.value.label, 'label');
    if (!label.ok) {
      return label;
    }

    updates.label = label.value;
  }

  if ('price' in parsedObject.value) {
    const price = parseOptionalNumber(parsedObject.value.price, 'price', {
      allowNull: true,
    });
    if (!price.ok) {
      return price;
    }

    updates.price = price.value;
  }

  if (Object.keys(updates).length === 0) {
    return {
      ok: false,
      message: 'Request body must include at least one updatable field',
    };
  }

  return {
    ok: true,
    value: updates,
  };
};
