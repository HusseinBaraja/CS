import { BarChart3, LockKeyhole, MessageSquare, Package, ShoppingBag, Sparkles, UserRound } from 'lucide-react';

import dashboardMuralUrl from '../assets/dashboard/dashboard-mural.png';
import { DashboardShell } from '../components/dashboard/DashboardShell';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';

const metricCards = [
  { title: 'المحادثات الأخيرة', icon: MessageSquare, kind: 'chat' },
  { title: 'ملخص الكتالوج', icon: ShoppingBag, kind: 'catalog' },
  { title: 'نظرة عامة على الأداء', icon: BarChart3, kind: 'chart' },
] as const;

function LockedStrip({ className = '' }: { className?: string }) {
  return (
    <div className={`flex h-9 items-center justify-center gap-2 rounded-md border border-[#cfe1d7] bg-[#f2f8f4] text-sm font-medium text-[#23654b] ${className}`}>
      <LockKeyhole />
      <span>البيانات غير متاحة حالياً</span>
    </div>
  );
}

function SkeletonLine({ className = '' }: { className?: string }) {
  return <Skeleton className={`h-2.5 rounded-full bg-[#e5e8ea] ${className}`} />;
}

function MetricPreview({ kind }: { kind: (typeof metricCards)[number]['kind'] }) {
  if (kind === 'catalog') {
    return (
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-[120px_1fr] gap-4">
          <div className="flex h-28 items-center justify-center rounded-md bg-linear-to-br from-[#e7e9ec] to-[#f3f4f5] text-[#c8cdd1]">
            <Package />
          </div>
          <div className="flex flex-col gap-4 pt-5">
            <SkeletonLine className="w-[82%]" />
            <SkeletonLine className="w-[64%]" />
            <SkeletonLine className="w-[48%]" />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }, (_, i) => `catalog-skeleton-${i}`).map((id) => (
            <Skeleton key={id} className="h-12 rounded-md bg-linear-to-br from-[#e8eaec] to-[#f7f8f8]" />
          ))}
        </div>
      </div>
    );
  }

  if (kind === 'chart') {
    return (
      <div className="flex flex-col gap-4">
        <div className="relative h-28 overflow-hidden rounded-md border border-[#eef0f1] bg-[linear-gradient(#eef1f2_1px,transparent_1px)] bg-size-[100%_25%]">
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 320 112" aria-hidden="true">
            <path
              d="M0 72 C28 42 48 94 78 62 S124 72 148 38 S190 86 220 48 S250 76 270 42 S300 24 320 22"
              fill="none"
              stroke="#c5cbce"
              strokeWidth="2"
            />
          </svg>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }, (_, i) => `chart-skeleton-${i}`).map((id) => (
            <div key={id} className="flex h-10 items-center gap-2 rounded-md border border-[#e6eaec] px-3">
              <Skeleton className="size-5 rounded-full bg-[#e7eaec]" />
              <SkeletonLine className="w-12" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 pt-3">
      {Array.from({ length: 3 }, (_, i) => `chat-skeleton-${i}`).map((id) => (
        <div key={id} className="grid grid-cols-[32px_1fr_48px] items-center gap-4">
          <Skeleton className="size-8 rounded-full bg-[#e5e8ea]" />
          <div className="flex flex-col gap-3">
            <SkeletonLine className="w-24" />
            <SkeletonLine className="w-44 max-w-full" />
          </div>
          <SkeletonLine className="w-12" />
        </div>
      ))}
    </div>
  );
}

function MetricCard({ title, icon: Icon, kind }: (typeof metricCards)[number]) {
  return (
    <Card className="min-h-65 border-[#dfe6e2] shadow-[0_1px_3px_rgba(22,35,29,0.08),0_12px_32px_rgba(22,35,29,0.04)]">
      <CardHeader className="flex-row items-center justify-between gap-4 px-3 pt-3 sm:px-4 sm:pt-4">
        <div className="flex size-9 items-center justify-center rounded-lg bg-[#eef8f2] text-[#16874f]">
          <Icon />
        </div>
        <CardTitle className="text-lg font-bold text-[#1d2522]">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col px-3 pb-3 sm:px-4 sm:pb-4">
        <div className="flex-1 opacity-80">
          <MetricPreview kind={kind} />
        </div>
        <LockedStrip className="mt-4" />
      </CardContent>
    </Card>
  );
}

export function DashboardPage() {
  return (
    <DashboardShell activePath="/dashboard">
      <div className="mx-auto flex max-w-280 flex-col gap-5">
              <Card className="min-h-82.5 border-[#dfe6e2] shadow-[0_1px_3px_rgba(22,35,29,0.08),0_12px_32px_rgba(22,35,29,0.04)]">
                <CardContent className="grid grid-cols-1 items-center gap-6 p-6 md:p-8 lg:grid-cols-[1.15fr_0.85fr]">
                  <div className="order-2 flex justify-center lg:order-2">
                    <img
                      src={dashboardMuralUrl}
                      alt=""
                      aria-hidden="true"
                      className="h-auto w-full max-w-130 object-contain"
                    />
                  </div>
                  <div className="order-1 mx-auto max-w-107.5 text-center lg:order-1">
                    <div className="mb-5 flex items-center justify-center gap-3">
                      <Sparkles className="text-[#0d7d48]" />
                      <h1 className="text-3xl font-black leading-tight text-[#101916] sm:text-4xl">
                        هذه الصفحة قيد الإنشاء
                      </h1>
                    </div>
                    <p className="mx-auto mb-6 max-w-97.5 text-xl leading-9 text-[#4f5654]">
                      نعمل حالياً على تجهيز هذه الواجهة لتكون جاهزة قريباً.
                    </p>
                    <div className="mx-auto flex min-h-19 max-w-95 items-center gap-4 rounded-lg border border-[#cdded5] bg-[#f5faf7] px-6 text-[#45514d]">
                      <LockKeyhole className="shrink-0 text-[#0d7c47]" />
                      <span className="text-base leading-7">نحن نعمل بجد لنقدم لك تجربة رائعة تلبي احتياجات عملك.</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {metricCards.map((card) => (
                  <MetricCard key={card.title} {...card} />
                ))}
              </div>

              <Card className="border-[#dfe6e2] shadow-[0_1px_3px_rgba(22,35,29,0.08),0_12px_32px_rgba(22,35,29,0.04)]">
                <CardHeader className="flex-row items-center justify-between px-4 pt-4">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-[#eef8f2] text-[#16874f]">
                    <UserRound />
                  </div>
                  <CardTitle className="text-lg font-bold">نشاط الفريق</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="flex flex-col gap-3 opacity-75">
                    {Array.from({ length: 4 }, (_, i) => `team-skeleton-${i}`).map((id) => (
                      <div key={id} className="grid grid-cols-[34px_1fr_64px_160px_56px] items-center gap-5 max-md:grid-cols-[34px_1fr_56px]">
                        <Skeleton className="size-8 rounded-full bg-[#e0e4e6]" />
                        <SkeletonLine className="w-full" />
                        <SkeletonLine className="w-16 bg-[#dceee5]" />
                        <SkeletonLine className="w-full max-md:hidden" />
                        <SkeletonLine className="w-14 max-md:hidden" />
                      </div>
                    ))}
                  </div>
                  <LockedStrip className="mt-5" />
                </CardContent>
              </Card>

              <div className="flex min-h-14 items-center justify-center gap-4 rounded-lg border border-dashed border-[#bfc8c5] bg-white px-5 text-center text-sm text-[#66706c]">
                <Package />
                <span>هذه الواجهة قيد التطوير. سيتم تفعيل جميع الميزات قريباً لتمنحك تجربة متكاملة لإدارة عملك والتواصل مع عملائك بذكاء.</span>
              </div>
      </div>
    </DashboardShell>
  );
}
