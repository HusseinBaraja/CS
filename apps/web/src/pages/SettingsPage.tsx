import { AlertTriangle, CheckCircle2, Loader2, Save, Settings } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { DashboardShell } from '../components/dashboard/DashboardShell';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '../components/ui/toggle-group';
import {
  listCompanies,
  resolveYasTradingCompany,
} from '../features/catalog-import/catalogImportApi';
import {
  getCompanySettings,
  type CompanySettings,
  updateCompanySettings,
} from '../features/company-settings/companySettingsApi';

type CurrencyChoice = 'SAR' | 'YER';

const isCurrencyChoice = (value: string | undefined): value is CurrencyChoice =>
  value === 'SAR' || value === 'YER';

export function SettingsPage() {
  const [companyState, setCompanyState] = useState<ReturnType<typeof resolveYasTradingCompany> | null>(null);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [selectedCurrency, setSelectedCurrency] = useState<CurrencyChoice | ''>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        const companies = await listCompanies();
        const resolvedCompany = resolveYasTradingCompany(companies);
        if (!isMounted) {
          return;
        }

        setCompanyState(resolvedCompany);
        if (resolvedCompany.error || !resolvedCompany.company) {
          return;
        }

        const loadedSettings = await getCompanySettings(resolvedCompany.company.id);
        if (!isMounted) {
          return;
        }

        setSettings(loadedSettings);
        setSelectedCurrency(isCurrencyChoice(loadedSettings.operatingCurrency)
          ? loadedSettings.operatingCurrency
          : '');
      } catch (caughtError) {
        if (isMounted) {
          setError(caughtError instanceof Error ? caughtError.message : 'تعذر تحميل الإعدادات.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      isMounted = false;
    };
  }, []);

  const validationError = useMemo(() => {
    if (companyState?.error) {
      return companyState.error;
    }

    if (!settings) {
      return 'تعذر تحميل إعدادات الشركة.';
    }

    if (!selectedCurrency) {
      return 'اختر عملة تشغيل صحيحة.';
    }

    return null;
  }, [companyState, selectedCurrency, settings]);
  const canSave = Boolean(companyState?.company && settings && selectedCurrency);

  const saveSettings = async () => {
    if (!companyState?.company || !settings || !selectedCurrency) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSavedMessage(null);
    try {
      const updatedSettings = await updateCompanySettings(companyState.company.id, {
        missingPricePolicy: settings.missingPricePolicy,
        maxAutomatedMessageChars: settings.maxAutomatedMessageChars,
        operatingCurrency: selectedCurrency,
      });
      setSettings(updatedSettings);
      setSelectedCurrency(isCurrencyChoice(updatedSettings.operatingCurrency)
        ? updatedSettings.operatingCurrency
        : selectedCurrency);
      setSavedMessage('تم حفظ العملة.');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'فشل حفظ الإعدادات.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <DashboardShell activePath="/dashboard/settings">
      <div className="mx-auto flex max-w-180 flex-col gap-6">
        <header className="flex flex-col gap-2">
          <Badge className="w-fit bg-[#1f6f45] text-white">YAS_Trading مؤقت</Badge>
          <h1 className="text-3xl font-black leading-tight text-[#101916] sm:text-4xl">الإعدادات</h1>
        </header>

        <Card className="border-[#dfe6e2] shadow-[0_1px_3px_rgba(22,35,29,0.08),0_12px_32px_rgba(22,35,29,0.04)]">
          <CardHeader className="px-5 pt-5">
            <CardTitle className="flex items-center gap-2 text-xl font-bold text-[#1b2521]">
              <Settings className="text-[#0d7c47]" />
              عملة التشغيل
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5 px-5 pb-5">
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm font-medium text-[#4d5753]">
                <Loader2 className="animate-spin" /> جار تحميل الإعدادات
              </div>
            ) : (
              <>
                <div className="rounded-lg border border-[#dfe6e2] bg-[#f8fbf9] p-4">
                  {companyState?.company ? (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm text-[#66706c]">الشركة</p>
                        <p className="font-bold text-[#1c2521]">{companyState.company.name}</p>
                      </div>
                      <Badge variant="secondary">{companyState.company.id}</Badge>
                    </div>
                  ) : (
                    <StatusMessage kind="error" message={companyState?.error ?? 'تعذر تحديد الشركة.'} />
                  )}
                </div>

                {companyState?.company ? (
                  <>
                    <div className="flex flex-col gap-3">
                      <p className="text-sm font-semibold text-[#44504b]">القيمة المحفوظة: {settings?.operatingCurrency ?? 'غير محددة'}</p>
                      <ToggleGroup
                        type="single"
                        variant="outline"
                        value={selectedCurrency}
                        aria-label="اختيار عملة التشغيل"
                        onValueChange={(value) => {
                          if (isCurrencyChoice(value)) {
                            setSelectedCurrency(value);
                            setSavedMessage(null);
                          }
                        }}
                      >
                        <ToggleGroupItem value="SAR" aria-label="SAR">SAR</ToggleGroupItem>
                        <ToggleGroupItem value="YER" aria-label="YER">YER</ToggleGroupItem>
                      </ToggleGroup>
                    </div>

                    {validationError && !companyState?.error ? <StatusMessage kind="error" message={validationError} /> : null}
                    {error ? <StatusMessage kind="error" message={error} /> : null}
                    {savedMessage ? <StatusMessage kind="success" message={savedMessage} /> : null}

                    <Button
                      className="w-fit bg-[#0d7c47] text-white hover:bg-[#096b3b]"
                      disabled={!canSave || isSaving}
                      onClick={saveSettings}
                    >
                      {isSaving ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Save data-icon="inline-start" />}
                      حفظ
                    </Button>
                  </>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}

function StatusMessage({ kind, message }: { kind: 'error' | 'success'; message: string }) {
  const Icon = kind === 'success' ? CheckCircle2 : AlertTriangle;
  const colorClass = kind === 'success' ? 'text-[#1f6f45]' : 'text-[#9f2f2f]';

  return (
    <div className={`flex gap-2 text-sm font-semibold ${colorClass}`}>
      <Icon className="shrink-0" />
      <span>{message}</span>
    </div>
  );
}
