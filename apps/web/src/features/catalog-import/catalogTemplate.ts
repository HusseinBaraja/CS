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
    baseCurrency: 'العملة الأساسية',
    specifications: 'المواصفات',
  },
  en: {
    productName: 'English Product Name',
    description: 'English Product Description',
    basePrice: 'Base Price',
    baseCurrency: 'Base Currency',
    specifications: 'Additional Information',
  },
} satisfies Record<CatalogTemplateLanguage, Record<string, string>>;

// Mapped from convex/schema.ts products table: categoryId, nameEn/nameAr,
// descriptionEn/descriptionAr, basePrice, baseCurrency, specifications.
export function buildCatalogTemplateHeaders(options: CatalogTemplateOptions): string[] {
  const selectedLabels = labels[options.language];
  const headers = ['Category Name', selectedLabels.productName];

  if (options.includeDescription) {
    headers.push(selectedLabels.description);
  }

  if (options.includePrice) {
    headers.push(selectedLabels.basePrice, `${selectedLabels.baseCurrency} (${options.currency})`);
  }

  if (options.includeSpecifications) {
    headers.push(selectedLabels.specifications);
  }

  return headers;
}
