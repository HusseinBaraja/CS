import type {
  CreateProductInput,
  ListProductsFilters,
  UpdateProductInput,
} from '../services/products';
import type { CreateProductImageUploadInput } from '../services/productMedia';
import {
  parseObject,
  parseOptionalNumber,
  parseOptionalString,
  parseRequiredString,
  type ParseResult,
} from './parserUtils';

const assignOptional = <T, K extends keyof T>(
  target: T,
  key: K,
  value: T[K] | null | undefined,
  { allowNull }: { allowNull?: boolean } = {},
): void => {
  if (value === undefined) {
    return;
  }

  if (value === null && !allowNull) {
    return;
  }

  target[key] = value as T[K];
};

const hasAtLeastOneIdentifier = (
  value: Pick<CreateProductInput, 'productNo' | 'nameAr' | 'nameEn'>,
): boolean => Boolean(value.productNo || value.nameAr || value.nameEn);

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
  assignOptional(parsedProduct, 'productNo', productNo.value);
  assignOptional(parsedProduct, 'nameEn', nameEn.value);
  assignOptional(parsedProduct, 'nameAr', nameAr.value);
  assignOptional(parsedProduct, 'descriptionEn', descriptionEn.value);
  assignOptional(parsedProduct, 'descriptionAr', descriptionAr.value);
  assignOptional(parsedProduct, 'price', price.value);
  assignOptional(parsedProduct, 'currency', currency.value);
  assignOptional(parsedProduct, 'primaryImage', primaryImage.value);

  if (!hasAtLeastOneIdentifier(parsedProduct)) {
    return {
      ok: false,
      message: 'at least one of productNo, nameEn or nameAr is required',
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

    assignOptional(updates, 'productNo', productNo.value, { allowNull: true });
  }

  if ('nameEn' in parsedObject.value) {
    const nameEn = parseOptionalString(parsedObject.value.nameEn, 'nameEn', { allowNull: true });
    if (!nameEn.ok) {
      return nameEn;
    }

    assignOptional(updates, 'nameEn', nameEn.value, { allowNull: true });
  }

  if ('nameAr' in parsedObject.value) {
    const nameAr = parseOptionalString(parsedObject.value.nameAr, 'nameAr', { allowNull: true });
    if (!nameAr.ok) {
      return nameAr;
    }

    assignOptional(updates, 'nameAr', nameAr.value, { allowNull: true });
  }

  if ('descriptionEn' in parsedObject.value) {
    const descriptionEn = parseOptionalString(parsedObject.value.descriptionEn, 'descriptionEn', {
      allowNull: true,
    });
    if (!descriptionEn.ok) {
      return descriptionEn;
    }

    assignOptional(updates, 'descriptionEn', descriptionEn.value, { allowNull: true });
  }

  if ('descriptionAr' in parsedObject.value) {
    const descriptionAr = parseOptionalString(parsedObject.value.descriptionAr, 'descriptionAr', {
      allowNull: true,
    });
    if (!descriptionAr.ok) {
      return descriptionAr;
    }

    assignOptional(updates, 'descriptionAr', descriptionAr.value, { allowNull: true });
  }

  if ('price' in parsedObject.value) {
    const price = parseOptionalNumber(parsedObject.value.price, 'price', { allowNull: true });
    if (!price.ok) {
      return price;
    }

    assignOptional(updates, 'price', price.value, { allowNull: true });
  }

  if ('currency' in parsedObject.value) {
    const currency = parseOptionalString(parsedObject.value.currency, 'currency', {
      allowNull: true,
    });
    if (!currency.ok) {
      return currency;
    }

    assignOptional(updates, 'currency', currency.value, { allowNull: true });
  }

  if ('primaryImage' in parsedObject.value) {
    const primaryImage = parseOptionalString(parsedObject.value.primaryImage, 'primaryImage', {
      allowNull: true,
    });
    if (!primaryImage.ok) {
      return primaryImage;
    }

    assignOptional(updates, 'primaryImage', primaryImage.value, { allowNull: true });
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

