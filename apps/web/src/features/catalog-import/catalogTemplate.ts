export type CatalogTemplateCurrency = 'SAR' | 'YER';

export type CatalogTemplateLanguage = 'ar' | 'en';

export type CatalogTemplateOptions = {
  currency: CatalogTemplateCurrency;
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
    productName: 'اسم المنتج بالعربية',
    description: 'وصف المنتج بالعربية',
    basePrice: 'السعر الأساسي',
    specifications: 'المواصفات',
  },
  en: {
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
  const selectedCurrency = currencyLabels[options.language][options.currency];
  const headers = ['Category Name', selectedLabels.productName];

  if (options.includeDescription) {
    headers.push(selectedLabels.description);
  }

  if (options.includePrice) {
    headers.push(`${selectedLabels.basePrice} (${selectedCurrency})`);
  }

  if (options.includeSpecifications) {
    headers.push(selectedLabels.specifications);
  }

  return headers;
}
