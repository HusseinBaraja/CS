import { ChevronDown, Download } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';

import { Button } from '../../components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../components/ui/collapsible';
import { ToggleGroup, ToggleGroupItem } from '../../components/ui/toggle-group';
import {
  defaultCatalogTemplateOptions,
  type CatalogTemplateCurrency,
  type CatalogTemplateLanguage,
  type CatalogTemplateOptions,
} from './catalogTemplate';
import { downloadCatalogTemplate } from './downloadCatalogTemplate';

type CatalogTemplateDownloadProps = {
  onDownload?: (options: CatalogTemplateOptions) => void | Promise<void>;
};

type BooleanOption = 'yes' | 'no';

const toBooleanOption = (value: boolean): BooleanOption => (value ? 'yes' : 'no');

const fromBooleanOption = (value: string): boolean => value === 'yes';

export function CatalogTemplateDownload({ onDownload = downloadCatalogTemplate }: CatalogTemplateDownloadProps) {
  const [options, setOptions] = useState<CatalogTemplateOptions>(defaultCatalogTemplateOptions);

  const updateOptions = (nextOptions: Partial<CatalogTemplateOptions>) => {
    setOptions((currentOptions) => ({ ...currentOptions, ...nextOptions }));
  };

  return (
    <Collapsible className="contents">
      <CollapsibleTrigger asChild>
        <Button variant="outline" aria-label="تنزيل القالب">
          <ChevronDown data-icon="inline-start" />
          تنزيل القالب
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="order-last flex basis-full justify-center pt-4">
        <div className="flex w-68 flex-col gap-4 rounded-lg border border-[#dfe6e2] bg-white p-4 text-start shadow-[0_8px_24px_rgba(22,35,29,0.08)]">
          <TemplateOption label="السعر">
            <BooleanToggle
              ariaLabel="تضمين السعر"
              value={options.includePrice}
              onChange={(includePrice) =>
                updateOptions({
                  includePrice,
                  currency: includePrice ? options.currency ?? defaultCatalogTemplateOptions.currency : undefined,
                })
              }
            />
          </TemplateOption>

          <TemplateOption label="العملة">
            <ToggleGroup
              type="single"
              variant="outline"
              value={options.currency}
              disabled={!options.includePrice}
              aria-label="اختيار العملة"
              onValueChange={(value) => {
                if (value) {
                  updateOptions({ currency: value as CatalogTemplateCurrency });
                }
              }}
            >
              <ToggleGroupItem value="SAR" aria-label="SAR">
                SAR
              </ToggleGroupItem>
              <ToggleGroupItem value="YER" aria-label="YER">
                YER
              </ToggleGroupItem>
            </ToggleGroup>
          </TemplateOption>

          <TemplateOption label="اللغة">
            <ToggleGroup
              type="single"
              variant="outline"
              value={options.language}
              aria-label="اختيار اللغة"
              onValueChange={(value) => {
                if (value) {
                  updateOptions({ language: value as CatalogTemplateLanguage });
                }
              }}
            >
              <ToggleGroupItem value="ar" aria-label="العربية">
                العربية
              </ToggleGroupItem>
              <ToggleGroupItem value="en" aria-label="English">
                English
              </ToggleGroupItem>
            </ToggleGroup>
          </TemplateOption>

          <TemplateOption label="الصورة الرئيسية">
            <BooleanToggle
              ariaLabel="تضمين الصورة الرئيسية"
              value={options.includePrimaryImage}
              onChange={(includePrimaryImage) => updateOptions({ includePrimaryImage })}
            />
          </TemplateOption>

          <TemplateOption label="الوصف">
            <BooleanToggle
              ariaLabel="تضمين الوصف"
              value={options.includeDescription}
              onChange={(includeDescription) => updateOptions({ includeDescription })}
            />
          </TemplateOption>

          <TemplateOption label="المتغيرات">
            <BooleanToggle
              ariaLabel="تضمين المتغيرات"
              value={options.includeVariants}
              onChange={(includeVariants) => updateOptions({ includeVariants })}
            />
          </TemplateOption>

          <Button onClick={() => {
            Promise.resolve().then(() => onDownload(options)).catch((error: unknown) => {
              console.error('[CatalogTemplateDownload] download failed', error);
              // TODO: surface error to user (toast / error state)
            });
          }}>
            <Download data-icon="inline-start" />
            تحميل ملف Excel
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function TemplateOption({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm font-bold text-[#2f3935]">{label}</span>
      {children}
    </div>
  );
}

function BooleanToggle({
  ariaLabel,
  value,
  onChange,
}: {
  ariaLabel: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      value={toBooleanOption(value)}
      aria-label={ariaLabel}
      onValueChange={(nextValue) => {
        if (nextValue) {
          onChange(fromBooleanOption(nextValue));
        }
      }}
    >
      <ToggleGroupItem value="yes" aria-label="نعم">
        نعم
      </ToggleGroupItem>
      <ToggleGroupItem value="no" aria-label="لا">
        لا
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
