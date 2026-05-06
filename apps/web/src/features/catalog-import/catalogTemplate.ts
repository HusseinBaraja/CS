export type CatalogTemplateCurrency = 'SAR' | 'YER';

export type CatalogTemplateLanguage = 'ar' | 'en';

export type CatalogTemplateOptions = {
  currency?: CatalogTemplateCurrency;
  includePrice: boolean;
  language: CatalogTemplateLanguage;
  includeSpecifications: boolean;
  includeDescription: boolean;
};

export const defaultCatalogTemplateOptions: CatalogTemplateOptions = {
  currency: 'SAR',
  includePrice: true,
  language: 'ar',
  includeSpecifications: true,
  includeDescription: true,
};

const labels = {
  ar: {
    categoryName: 'اسم القسم',
    productNumber: 'رقم المنتج',
    productName: 'اسم المنتج بالعربية',
    description: 'وصف المنتج بالعربية',
    basePrice: 'السعر',
    specifications: 'المواصفات',
  },
  en: {
    categoryName: 'Section Name',
    productNumber: 'Product Number',
    productName: 'English Product Name',
    description: 'English Product Description',
    basePrice: 'Base Price',
    specifications: 'Additional Information',
  },
} satisfies Record<CatalogTemplateLanguage, Record<string, string>>;

const currencyLabels = {
  ar: {
    SAR: 'ريال سعودي',
    YER: 'ريال يمني',
  },
  en: {
    SAR: 'Saudi Riyal',
    YER: 'Yemeni Rial',
  },
} satisfies Record<CatalogTemplateLanguage, Record<CatalogTemplateCurrency, string>>;

// Mapped from convex/schema.ts products table: categoryId, nameEn/nameAr,
// descriptionEn/descriptionAr, basePrice, baseCurrency, specifications.
export function buildCatalogTemplateHeaders(options: CatalogTemplateOptions): string[] {
  const selectedLabels = labels[options.language];
  const headers = [selectedLabels.categoryName, selectedLabels.productNumber, selectedLabels.productName];

  if (options.includeDescription) {
    headers.push(selectedLabels.description);
  }

  if (options.includePrice) {
    const currency: CatalogTemplateCurrency = options.currency ?? defaultCatalogTemplateOptions.currency ?? 'SAR';
    const selectedCurrency = currencyLabels[options.language][currency];
    headers.push(`${selectedLabels.basePrice} (${selectedCurrency})`);
  }

  if (options.includeSpecifications) {
    headers.push(selectedLabels.specifications);
  }

  return headers;
}
