import type { CatalogImportSourceLanguage } from '../services/catalogImports';
import { createAsyncLimiter } from './asyncLimiter';
import type { TranslatedImportGroup } from './translationTypes';
import type { ParsedCatalogImportGroup } from './workbookParser';

type UnitLabelTranslator = (text: string, field: string, productNo: string) => Promise<string>;

export const translateGroupUnits = async ({
  group,
  sourceLanguage,
  translate,
}: {
  group: ParsedCatalogImportGroup;
  sourceLanguage: CatalogImportSourceLanguage;
  translate: UnitLabelTranslator;
}): Promise<TranslatedImportGroup["units"]> => {
  const limitUnit = createAsyncLimiter(8);

  return Promise.all(group.rows.map((row, index) => limitUnit(async () => {
    const translatedLabel = await translate(row.unitLabel, 'unitLabel', group.productNo);
    return {
      ...(sourceLanguage === 'en'
        ? { labelEn: row.unitLabel, labelAr: translatedLabel }
        : { labelEn: translatedLabel, labelAr: row.unitLabel }),
      price: row.price,
      sortOrder: index,
    };
  })));
};
