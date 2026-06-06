export type CatalogTemplateLanguage = 'ar' | 'en';

export type CatalogTemplateOptions = {
  language: CatalogTemplateLanguage;
  includeDescription: boolean;
};

export const defaultCatalogTemplateOptions: CatalogTemplateOptions = {
  language: 'ar',
  includeDescription: true,
};

const labels = {
  ar: {
    categoryName: 'اسم القسم',
    productNumber: 'رقم المنتج',
    nameAr: 'اسم المنتج بالعربية',
    nameEn: 'اسم المنتج بالإنجليزية',
    descriptionAr: 'وصف المنتج بالعربية',
    descriptionEn: 'وصف المنتج بالإنجليزية',
    unit: 'الوحدة',
    price: 'السعر',
  },
  en: {
    categoryName: 'Section Name',
    productNumber: 'Product Number',
    nameAr: 'Arabic Product Name',
    nameEn: 'English Product Name',
    descriptionAr: 'Arabic Product Description',
    descriptionEn: 'English Product Description',
    unit: 'Unit',
    price: 'Price',
  },
} satisfies Record<CatalogTemplateLanguage, Record<string, string>>;

// Repeated product numbers represent sellable units, not product variants.
export function buildCatalogTemplateHeaders(options: CatalogTemplateOptions): string[] {
  const selectedLabels = labels[options.language];
  const headers = [
    selectedLabels.categoryName,
    selectedLabels.productNumber,
    selectedLabels.nameAr,
    selectedLabels.nameEn,
  ];

  if (options.includeDescription) {
    headers.push(selectedLabels.descriptionAr, selectedLabels.descriptionEn);
  }

  headers.push(selectedLabels.unit, selectedLabels.price);

  return headers;
}
