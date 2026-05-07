import { CheckCircle2, FileSpreadsheet, Info, UploadCloud } from 'lucide-react';
import { useState } from 'react';

import { DashboardShell } from '../components/dashboard/DashboardShell';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Separator } from '../components/ui/separator';
import { CatalogTemplateDownload } from '../features/catalog-import/CatalogTemplateDownload';
import { buildCatalogTemplateHeaders, defaultCatalogTemplateOptions } from '../features/catalog-import/catalogTemplate';

const requiredColumns = buildCatalogTemplateHeaders(defaultCatalogTemplateOptions);

const uploadedFile = {
  name: 'reda-catalog-template.xlsx',
  date: '28 أبريل 2026',
  columns: requiredColumns.length,
  rows: 124,
  size: '86 KB',
};

export function UploadDataPage() {
  const [hasUploadedFile, setHasUploadedFile] = useState(false);

  return (
    <DashboardShell activePath="/dashboard/upload">
      <div className="mx-auto flex max-w-280 flex-col gap-6">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-black leading-tight text-[#101916] sm:text-4xl">رفع كتالوج المنتجات</h1>
        </header>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_21rem]">
          <div className="flex flex-col gap-5">
            <Card className="border-[#dfe6e2] shadow-[0_1px_3px_rgba(22,35,29,0.08),0_12px_32px_rgba(22,35,29,0.04)]">
              <CardContent className="px-5 pb-5">
                <div className="flex min-h-78 flex-col items-center gap-5 rounded-lg border border-dashed border-[#a9bbb2] bg-[#f8fbf9] px-6 pt-18 pb-6 text-center">
                  <div className="flex size-16 items-center justify-center rounded-lg bg-white text-[#0d7c47] shadow-[0_8px_24px_rgba(22,35,29,0.08)]">
                    <FileSpreadsheet />
                  </div>
                  <div className="flex flex-col gap-2">
                    <p className="text-xl font-bold text-[#1d2522]">اسحب ملف Excel هنا أو ارفعه من جهازك</p>
                    <p className="text-sm leading-6 text-[#63706b]">الصيغ المدعومة: XLSX، XLS، CSV. الحد الأقصى المقترح 5 MB.</p>
                  </div>
                  <div className="flex w-full flex-wrap items-center justify-center gap-3">
                    <CatalogTemplateDownload />
                    <Button onClick={() => setHasUploadedFile(true)}>
                      <UploadCloud data-icon="inline-start" />
                      رفع الملف
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-[#dfe6e2] shadow-[0_1px_3px_rgba(22,35,29,0.08),0_12px_32px_rgba(22,35,29,0.04)]">
              <CardHeader className="px-5 pt-5">
                <CardTitle className="text-xl font-bold text-[#1b2521]">الملفات المرفوعة</CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                {hasUploadedFile ? (
                  <div className="grid grid-cols-1 items-center gap-4 rounded-lg border border-[#dfe6e2] bg-white p-4 md:grid-cols-[minmax(0,1fr)_7rem_5rem_5rem_6rem]">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex size-10 items-center justify-center rounded-lg bg-[#edf7f1] text-[#0d7c47]">
                        <FileSpreadsheet />
                      </div>
                      <div className="min-w-0 text-end">
                        <p className="truncate font-bold text-[#1c2521]">{uploadedFile.name}</p>
                        <p className="text-sm text-[#68736f]">{uploadedFile.date}</p>
                      </div>
                    </div>
                    <span className="text-sm text-[#4d5753]">{uploadedFile.columns} أعمدة</span>
                    <span className="text-sm text-[#4d5753]">{uploadedFile.rows} صف</span>
                    <span className="text-sm text-[#4d5753]">{uploadedFile.size}</span>
                    <Badge variant="secondary">جاهز</Badge>
                  </div>
                ) : (
                  <div className="flex min-h-24 items-center justify-center rounded-lg border border-dashed border-[#c4cfca] bg-[#fafcfb] px-4 text-center text-sm text-[#66706c]">
                    لم يتم رفع أي ملف بعد.
                  </div>
                )}
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
                  <p>الذكاء الاصطناعي يعتمد على بياناتك، سيستخدم النظام هذا الكتالوج للإجابة بدقة على أسئلة العملاء عبر الواتساب.</p>
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </DashboardShell>
  );
}

