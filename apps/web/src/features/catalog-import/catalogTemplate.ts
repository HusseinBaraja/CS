export type CatalogTemplateCurrency = 'SAR' | 'YER';

export type CatalogTemplateLanguage = 'ar' | 'en';

export type CatalogTemplateOptions = {
  currency?: CatalogTemplateCurrency;
  includePrice: boolean;
  language: CatalogTemplateLanguage;
  includeDescription: boolean;
  includePrimaryImage: boolean;
  includeVariants: boolean;
};

export const defaultCatalogTemplateOptions: CatalogTemplateOptions = {
  currency: 'SAR',
  includePrice: true,
  language: 'ar',
  includeDescription: true,
  includePrimaryImage: true,
  includeVariants: true,
};

const labels = {
  ar: {
    categoryName: 'اسم القسم',
    productNumber: 'رقم المنتج',
    nameAr: 'اسم المنتج بالعربية',
    nameEn: 'اسم المنتج بالإنجليزية',
    descriptionAr: 'وصف المنتج بالعربية',
    descriptionEn: 'وصف المنتج بالإنجليزية',
    price: 'السعر',
    currency: 'العملة',
    primaryImage: 'الصورة الرئيسية',
    variantLabel: 'اسم المتغير',
    variantPrice: 'سعر المتغير',
  },
  en: {
    categoryName: 'Section Name',
    productNumber: 'Product Number',
    nameAr: 'Arabic Product Name',
    nameEn: 'English Product Name',
    descriptionAr: 'Arabic Product Description',
    descriptionEn: 'English Product Description',
    price: 'Product Price',
    currency: 'Currency',
    primaryImage: 'Primary Image',
    variantLabel: 'Variant Label',
    variantPrice: 'Variant Price',
  },
} satisfies Record<CatalogTemplateLanguage, Record<string, string>>;

// Product rows map to the fixed catalog contract. Variant columns are import shape only.
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

  if (options.includePrice) {
    headers.push(selectedLabels.price, selectedLabels.currency);
  }

  if (options.includePrimaryImage) {
    headers.push(selectedLabels.primaryImage);
  }

  if (options.includeVariants) {
    headers.push(selectedLabels.variantLabel, selectedLabels.variantPrice);
  }

  return headers;
}
