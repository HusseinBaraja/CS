import { ValidationError } from '@cs/shared';

export const requireRouteParam = (
  value: string | undefined,
  paramName: string,
): string => {
  if (!value) {
    throw new ValidationError(`Missing route parameter: ${paramName}`);
  }

  return value;
};
