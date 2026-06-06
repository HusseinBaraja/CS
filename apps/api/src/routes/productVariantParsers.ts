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

export const parseCreateVariantBody = (value: unknown): ParseResult<CreateProductVariantInput> => {
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

  if (!labelEn.value && !labelAr.value) {
    return {
      ok: false,
      message: 'at least one of labelEn or labelAr is required',
    };
  }

  return {
    ok: true,
    value: {
      ...(labelEn.value !== undefined && labelEn.value !== null ? { labelEn: labelEn.value } : {}),
      ...(labelAr.value !== undefined && labelAr.value !== null ? { labelAr: labelAr.value } : {}),
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

export const parseCreateUnitBody = (value: unknown): ParseResult<CreateProductUnitInput> => {
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

  const sortOrder = parseOptionalNumber(parsedObject.value.sortOrder, 'sortOrder');
  if (!sortOrder.ok) {
    return sortOrder;
  }

  if (!labelEn.value && !labelAr.value) {
    return {
      ok: false,
      message: 'at least one of labelEn or labelAr is required',
    };
  }

  if (price.value === undefined || price.value === null) {
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
      price: price.value,
      ...(sortOrder.value !== undefined && sortOrder.value !== null ? { sortOrder: sortOrder.value } : {}),
    },
  };
};

export const parseUpdateUnitBody = (value: unknown): ParseResult<UpdateProductUnitInput> => {
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

  const updates: UpdateProductUnitInput = {};

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
    const price = parseOptionalNumber(parsedObject.value.price, 'price', { allowNull: true });
    if (!price.ok) {
      return price;
    }

    updates.price = price.value;
  }

  if ('sortOrder' in parsedObject.value) {
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
    value: updates,
  };
};
