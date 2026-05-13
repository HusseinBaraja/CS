import { AlertTriangle, CheckCircle2, FileSpreadsheet, Info, Loader2, UploadCloud } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { DashboardShell } from '../components/dashboard/DashboardShell';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Separator } from '../components/ui/separator';
import { CatalogTemplateDownload } from '../features/catalog-import/CatalogTemplateDownload';
import { buildCatalogTemplateHeaders, defaultCatalogTemplateOptions } from '../features/catalog-import/catalogTemplate';
import {
  applyCatalogImport,
  type CatalogImportApplyResult,
  type CatalogImportPreview,
  listCompanies,
  previewCatalogImport,
  resolveYasTradingCompany,
  type SourceLanguage,
} from '../features/catalog-import/catalogImportApi';

const requiredColumns = buildCatalogTemplateHeaders(defaultCatalogTemplateOptions);

export function UploadDataPage() {
  const [file, setFile] = useState<File | null>(null);
  const [sourceLanguage, setSourceLanguage] = useState<SourceLanguage>('ar');
  const [companyState, setCompanyState] = useState<ReturnType<typeof resolveYasTradingCompany> | null>(null);
  const [preview, setPreview] = useState<CatalogImportPreview | null>(null);
  const [result, setResult] = useState<CatalogImportApplyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingCompany, setIsLoadingCompany] = useState(true);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  useEffect(() => {
    let isMounted = true;
    listCompanies()
      .then((companies) => {
        if (isMounted) {
          setCompanyState(resolveYasTradingCompany(companies));
        }
      })
      .catch((caughtError: unknown) => {
        if (isMounted) {
          setCompanyState({ error: caughtError instanceof Error ? caughtError.message : 'تعذر تحميل الشركات.' });
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingCompany(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const blockingError = useMemo(() => {
    if (companyState?.error) {
      return companyState.error;
    }

    if (!file) {
      return 'اختر ملف الكتالوج قبل المعاينة أو التطبيق.';
    }

    return null;
  }, [companyState, file]);

  const runPreview = async () => {
    if (!companyState?.company || !file) {
      return;
    }

    setIsPreviewing(true);
    setError(null);
    setResult(null);
    try {
      setPreview(await previewCatalogImport(companyState.company.id, file, sourceLanguage));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'فشلت المعاينة.');
    } finally {
      setIsPreviewing(false);
    }
  };

  const runApply = async () => {
    if (!companyState?.company || !file) {
      return;
    }

    setIsApplying(true);
    setError(null);
    try {
      setResult(await applyCatalogImport(companyState.company.id, file, sourceLanguage));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'فشل تطبيق الاستيراد.');
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <DashboardShell activePath="/dashboard/upload">
      <div className="mx-auto flex max-w-280 flex-col gap-6">
        <header className="flex flex-col gap-2">
          <Badge className="w-fit bg-[#1f6f45] text-white">YAS_Trading مؤقت</Badge>
          <h1 className="text-3xl font-black leading-tight text-[#101916] sm:text-4xl">استيراد كتالوج YAS_Trading</h1>
        </header>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_21rem]">
          <div className="flex flex-col gap-5">
            <Card className="border-[#dfe6e2] shadow-[0_1px_3px_rgba(22,35,29,0.08),0_12px_32px_rgba(22,35,29,0.04)]">
              <CardContent className="flex flex-col gap-4 px-5 pb-5">
                <div className="rounded-lg border border-[#dfe6e2] bg-[#f8fbf9] p-4">
                  {isLoadingCompany ? (
                    <div className="flex items-center gap-2 text-sm font-medium text-[#4d5753]">
                      <Loader2 className="animate-spin" /> جار تحميل الشركة
                    </div>
                  ) : companyState?.company ? (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm text-[#66706c]">الشركة المستهدفة</p>
                        <p className="font-bold text-[#1c2521]">{companyState.company.name}</p>
                      </div>
                      <Badge variant="secondary">{companyState.company.id}</Badge>
                    </div>
                  ) : (
                    <div className="flex gap-2 text-sm font-semibold text-[#9f2f2f]">
                      <AlertTriangle className="shrink-0" />
                      <span>{companyState?.error}</span>
                    </div>
                  )}
                </div>

                <div className="flex min-h-78 flex-col items-center gap-5 rounded-lg border border-dashed border-[#a9bbb2] bg-[#f8fbf9] px-6 pt-14 pb-6 text-center">
                  <div className="flex size-16 items-center justify-center rounded-lg bg-white text-[#0d7c47] shadow-[0_8px_24px_rgba(22,35,29,0.08)]">
                    <FileSpreadsheet />
                  </div>
                  <div className="flex flex-col gap-2">
                    <p className="text-xl font-bold text-[#1d2522]">اختر ملف Excel للمعاينة ثم التطبيق</p>
                    <p className="text-sm leading-6 text-[#63706b]">الملف يبقى خارج Convex، ويتم تخزين الكتالوج المعالج فقط.</p>
                  </div>
                  <div className="grid w-full gap-3 md:grid-cols-[minmax(0,1fr)_10rem]">
                    <input
                      aria-label="ملف الكتالوج"
                      className="rounded-lg border border-[#cdd8d2] bg-white px-3 py-2 text-sm"
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={(event) => {
                        setFile(event.target.files?.[0] ?? null);
                        setPreview(null);
                        setResult(null);
                      }}
                    />
                    <select
                      aria-label="لغة مصدر الملف"
                      className="rounded-lg border border-[#cdd8d2] bg-white px-3 py-2 text-sm"
                      value={sourceLanguage}
                      onChange={(event) => setSourceLanguage(event.target.value as SourceLanguage)}
                    >
                      <option value="ar">العربية</option>
                      <option value="en">English</option>
                    </select>
                  </div>
                  <div className="flex w-full flex-wrap items-center justify-center gap-3">
                    <CatalogTemplateDownload />
                    <Button disabled={Boolean(blockingError) || isPreviewing} onClick={runPreview}>
                      {isPreviewing ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <UploadCloud data-icon="inline-start" />}
                      معاينة
                    </Button>
                    <Button disabled={Boolean(blockingError) || isApplying || !preview || preview.blockingErrors.length > 0} onClick={runApply}>
                      {isApplying ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <CheckCircle2 data-icon="inline-start" />}
                      تطبيق الاستيراد
                    </Button>
                  </div>
                  {file ? <p className="text-sm font-medium text-[#31403a]">{file.name}</p> : null}
                  {blockingError ? <p className="text-sm font-semibold text-[#9f2f2f]">{blockingError}</p> : null}
                  {error ? <p className="text-sm font-semibold text-[#9f2f2f]">{error}</p> : null}
                </div>
              </CardContent>
            </Card>

            <Card className="border-[#dfe6e2] shadow-[0_1px_3px_rgba(22,35,29,0.08),0_12px_32px_rgba(22,35,29,0.04)]">
              <CardHeader className="px-5 pt-5">
                <CardTitle className="text-xl font-bold text-[#1b2521]">معاينة الاستيراد</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 px-5 pb-5">
                {preview ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Badge variant="secondary">{preview.productGroupCount} منتجات</Badge>
                      <Badge variant="secondary">{preview.categoryCount} أقسام</Badge>
                      <Badge variant="secondary">{preview.variantCount} متغيرات</Badge>
                    </div>
                    {preview.blockingErrors.map((item) => (
                      <p key={`${item.row ?? 'file'}-${item.message}`} className="text-sm font-semibold text-[#9f2f2f]">
                        {item.row ? `صف ${item.row}: ` : ''}{item.message}
                      </p>
                    ))}
                    <div className="grid gap-3">
                      {preview.groups.map((group) => (
                        <div key={group.productNo} className="rounded-lg border border-[#dfe6e2] bg-white p-4">
                          <div className="flex flex-wrap justify-between gap-2">
                            <p className="font-bold text-[#1c2521]">{group.productNo}</p>
                            <span className="text-sm text-[#66706c]">{group.variantCount} متغيرات</span>
                          </div>
                          <p className="text-sm text-[#4d5753]">{group.categoryName} / {group.productName}</p>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex min-h-24 items-center justify-center rounded-lg border border-dashed border-[#c4cfca] bg-[#fafcfb] px-4 text-center text-sm text-[#66706c]">
                    لم تتم معاينة أي ملف بعد.
                  </div>
                )}
                {result ? (
                  <div className="rounded-lg border border-[#b7d7c2] bg-[#f3f8f5] p-4 text-sm text-[#244234]">
                    تم تطبيق {result.replacedProductGroupCount} منتجات و {result.replacedVariantCount} متغيرات على {result.company.name}.
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>

          <aside className="flex flex-col gap-5">
            <Card className="border-[#dfe6e2] shadow-[0_1px_3px_rgba(22,35,29,0.08),0_12px_32px_rgba(22,35,29,0.04)]">
              <CardHeader className="px-5 pt-5">
                <CardTitle className="text-lg font-bold text-[#1b2521]">الأعمدة المطلوبة</CardTitle>
                <CardDescription>تأكد أن الملف يحتوي على هذه الأعمدة.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 px-5 pb-5">
                {requiredColumns.map((column) => (
                  <div key={column} className="flex items-center gap-3 text-sm font-medium text-[#2f3935]">
                    <CheckCircle2 className="text-[#0d7c47]" />
                    <span>{column}</span>
                  </div>
                ))}
                <Separator className="my-1" />
                <div className="flex gap-3 rounded-lg bg-[#f3f8f5] p-4 text-sm leading-6 text-[#44504b]">
                  <Info className="mt-1 shrink-0 text-[#0d7c47]" />
                  <p>كل ملف يستخدم لغة مصدر واحدة، ويترجم النظام أسماء الأقسام والمنتجات والمتغيرات قبل تحديث كتالوج الواتساب.</p>
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </DashboardShell>
  );
}
