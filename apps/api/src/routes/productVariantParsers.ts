import type {
  CreateProductVariantInput,
  CreateProductUnitInput,
  UpdateProductUnitInput,
  UpdateProductVariantInput,
} from '../services/products';
import {
  parseObject,
  parseOptionalNumber,
  parseOptionalString,
  type ParseResult,
} from './parserUtils';

type LabeledPriceCreateInput = CreateProductVariantInput | CreateProductUnitInput;
type LabeledPriceUpdateInput = UpdateProductVariantInput | UpdateProductUnitInput;

const parseLabeledPriceCreate = <T extends LabeledPriceCreateInput>(
  value: unknown,
  options: { priceRequired?: boolean; includeSortOrder?: boolean } = {},
): ParseResult<T> => {
  const parsedObject = parseObject(value);
  if (!parsedObject.ok) {
    return parsedObject;
  }

  const labelEn = parseOptionalString(parsedObject.value.labelEn, 'labelEn');
  if (!labelEn.ok) {
    return labelEn;
  }

  const labelAr = parseOptionalString(parsedObject.value.labelAr, 'labelAr');
  if (!labelAr.ok) {
    return labelAr;
  }

  const price = parseOptionalNumber(parsedObject.value.price, 'price');
  if (!price.ok) {
    return price;
  }

  const sortOrder = options.includeSortOrder
    ? parseOptionalNumber(parsedObject.value.sortOrder, 'sortOrder')
    : { ok: true, value: undefined } as const;
  if (!sortOrder.ok) {
    return sortOrder;
  }

  if (!labelEn.value && !labelAr.value) {
    return {
      ok: false,
      message: 'at least one of labelEn or labelAr is required',
    };
  }

  if (options.priceRequired && (price.value === undefined || price.value === null)) {
    return {
      ok: false,
      message: 'price is required',
    };
  }

  return {
    ok: true,
    value: {
      ...(labelEn.value !== undefined && labelEn.value !== null ? { labelEn: labelEn.value } : {}),
      ...(labelAr.value !== undefined && labelAr.value !== null ? { labelAr: labelAr.value } : {}),
      ...(price.value !== undefined && price.value !== null ? { price: price.value } : {}),
      ...(sortOrder.value !== undefined && sortOrder.value !== null ? { sortOrder: sortOrder.value } : {}),
    } as T,
  };
};

const parseLabeledPriceUpdate = <T extends LabeledPriceUpdateInput>(
  value: unknown,
  options: { allowPriceNull?: boolean; includeSortOrder?: boolean } = {},
): ParseResult<T> => {
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

  const updates: Record<string, string | number | null | undefined> = {};

  if ('labelEn' in parsedObject.value) {
    const labelEn = parseOptionalString(parsedObject.value.labelEn, 'labelEn', { allowNull: true });
    if (!labelEn.ok) {
      return labelEn;
    }

    updates.labelEn = labelEn.value;
  }

  if ('labelAr' in parsedObject.value) {
    const labelAr = parseOptionalString(parsedObject.value.labelAr, 'labelAr', { allowNull: true });
    if (!labelAr.ok) {
      return labelAr;
    }

    updates.labelAr = labelAr.value;
  }

  if ('price' in parsedObject.value) {
    const price = parseOptionalNumber(parsedObject.value.price, 'price', {
      allowNull: options.allowPriceNull,
    });
    if (!price.ok) {
      return price;
    }

    updates.price = price.value;
  }

  if (options.includeSortOrder && 'sortOrder' in parsedObject.value) {
    const sortOrder = parseOptionalNumber(parsedObject.value.sortOrder, 'sortOrder', { allowNull: true });
    if (!sortOrder.ok) {
      return sortOrder;
    }

    updates.sortOrder = sortOrder.value;
  }

  if (Object.keys(updates).length === 0) {
    return {
      ok: false,
      message: 'Request body must include at least one updatable field',
    };
  }

  return {
    ok: true,
    value: updates as unknown as T,
  };
};

export const parseCreateVariantBody = (value: unknown): ParseResult<CreateProductVariantInput> =>
  parseLabeledPriceCreate<CreateProductVariantInput>(value);

export const parseUpdateVariantBody = (value: unknown): ParseResult<UpdateProductVariantInput> =>
  parseLabeledPriceUpdate<UpdateProductVariantInput>(value, { allowPriceNull: true });

export const parseCreateUnitBody = (value: unknown): ParseResult<CreateProductUnitInput> =>
  parseLabeledPriceCreate<CreateProductUnitInput>(value, {
    includeSortOrder: true,
    priceRequired: true,
  });

export const parseUpdateUnitBody = (value: unknown): ParseResult<UpdateProductUnitInput> =>
  parseLabeledPriceUpdate<UpdateProductUnitInput>(value, { includeSortOrder: true });
