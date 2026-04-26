import {
  BarChart3,
  Bell,
  FileText,
  Grid2X2,
  LockKeyhole,
  MessageSquare,
  Package,
  ReceiptText,
  Settings,
  ShoppingBag,
  Sparkles,
  UploadCloud,
  UserRound,
  UsersRound,
} from 'lucide-react';

import dashboardMuralUrl from '../assets/dashboard/dashboard-mural.png';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';

const navItems = [
  { label: 'لوحة التحكم', icon: Grid2X2, active: true },
  { label: 'المحادثات', icon: MessageSquare },
  { label: 'الكتالوج', icon: ShoppingBag },
  { label: 'تخصيص الذكاء الاصطناعي', icon: Sparkles },
  { label: 'القوالب', icon: FileText },
  { label: 'رفع البيانات', icon: UploadCloud },
  { label: 'التحليلات', icon: BarChart3 },
  { label: 'الفريق', icon: UsersRound },
  { label: 'الفواتير', icon: ReceiptText },
  { label: 'الإعدادات', icon: Settings },
];

const metricCards = [
  { title: 'المحادثات الأخيرة', icon: MessageSquare, kind: 'chat' },
  { title: 'ملخص الكتالوج', icon: ShoppingBag, kind: 'catalog' },
  { title: 'نظرة عامة على الأداء', icon: BarChart3, kind: 'chart' },
] as const;

function LockedStrip({ className = '' }: { className?: string }) {
  return (
    <div className={`flex h-9 items-center justify-center gap-2 rounded-md border border-[#cfe1d7] bg-[#f2f8f4] text-sm font-medium text-[#23654b] ${className}`}>
      <LockKeyhole className="h-4 w-4" />
      <span>البيانات غير متاحة حالياً</span>
    </div>
  );
}

function SkeletonLine({ className = '' }: { className?: string }) {
  return <div className={`h-2.5 rounded-full bg-[#e5e8ea] ${className}`} />;
}

function MetricPreview({ kind }: { kind: (typeof metricCards)[number]['kind'] }) {
  if (kind === 'catalog') {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-[120px_1fr] gap-4">
          <div className="flex h-28 items-center justify-center rounded-md bg-gradient-to-br from-[#e7e9ec] to-[#f3f4f5] text-[#c8cdd1]">
            <Package className="h-12 w-12" />
          </div>
          <div className="space-y-4 pt-5">
            <SkeletonLine className="w-[82%]" />
            <SkeletonLine className="w-[64%]" />
            <SkeletonLine className="w-[48%]" />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-12 rounded-md bg-gradient-to-br from-[#e8eaec] to-[#f7f8f8]" />
          ))}
        </div>
      </div>
    );
  }

  if (kind === 'chart') {
    return (
      <div className="space-y-4">
        <div className="relative h-28 overflow-hidden rounded-md border border-[#eef0f1] bg-[linear-gradient(#eef1f2_1px,transparent_1px)] bg-[length:100%_25%]">
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
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="flex h-10 items-center gap-2 rounded-md border border-[#e6eaec] px-3">
              <div className="h-5 w-5 rounded-full bg-[#e7eaec]" />
              <SkeletonLine className="w-12" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pt-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="grid grid-cols-[32px_1fr_48px] items-center gap-4">
          <div className="h-8 w-8 rounded-full bg-[#e5e8ea]" />
          <div className="space-y-3">
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
    <Card className="flex min-h-[260px] flex-col p-3 sm:p-4">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#eef8f2] text-[#16874f]">
          <Icon className="h-5 w-5" />
        </div>
        <h2 className="text-lg font-bold text-[#1d2522]">{title}</h2>
      </div>
      <div className="flex-1 opacity-80">
        <MetricPreview kind={kind} />
      </div>
      <LockedStrip className="mt-4" />
    </Card>
  );
}

export function DashboardPage() {
  return (
    <div dir="rtl" className="min-h-screen bg-[#fbfcfc] font-arabic text-[#1f2925]">
      <header className="fixed inset-x-0 top-0 z-30 h-[82px] border-b border-[#dfe4e2] bg-white/95 shadow-[0_2px_10px_rgba(15,23,20,0.08)] backdrop-blur">
        <div className="flex h-full items-center justify-between px-5 sm:px-7">
          <div className="flex items-center gap-3 text-[#0a7a43]">
            <MessageSquare className="h-12 w-12 stroke-[2.4]" />
            <span className="text-4xl font-black leading-none">رضا</span>
          </div>

          <div className="flex items-center gap-4" dir="ltr">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#159957] to-[#0a6139] text-lg font-bold text-white shadow-[0_10px_24px_rgba(13,116,67,0.25)]">
              OB
            </div>
            <Button className="relative h-11 w-11 p-0" aria-label="الإشعارات">
              <Bell className="h-6 w-6" />
              <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-[#09844a]" />
            </Button>
            <div className="hidden h-8 w-px bg-[#d8dddc] sm:block" />
            <nav className="hidden items-center gap-3 text-sm font-semibold sm:flex">
              <a href="/dashboard" className="text-[#242b29]">English</a>
              <span className="h-5 w-px bg-[#cfd5d3]" />
              <a href="/dashboard" className="border-b-2 border-[#0d7c47] px-1 pb-2 text-[#0d7c47]">العربية</a>
            </nav>
          </div>
        </div>
      </header>

      <div className="flex min-h-screen pt-[82px]">
        <aside className="fixed bottom-0 right-0 top-[82px] z-20 hidden w-[276px] border-l border-[#dde4e0] bg-white px-4 py-8 shadow-[-2px_0_10px_rgba(22,35,29,0.05)] lg:block">
          <nav className="space-y-3">
            {navItems.map(({ label, icon: Icon, active }) => (
              <a
                key={label}
                href="/dashboard"
                className={`flex h-[66px] items-center justify-between rounded-lg px-4 text-base font-semibold transition-colors ${
                  active
                    ? 'bg-gradient-to-l from-[#e8f3ee] to-[#f4faf7] text-[#087a43]'
                    : 'text-[#2d3331] hover:bg-[#f5f8f6]'
                }`}
              >
                <span>{label}</span>
                <Icon className="h-6 w-6 stroke-[1.9]" />
              </a>
            ))}
          </nav>
        </aside>

        <main className="w-full px-4 py-5 sm:px-7 lg:mr-[276px]">
          <div className="mx-auto max-w-[1120px] space-y-5">
            <Card className="grid min-h-[330px] grid-cols-1 items-center overflow-hidden p-6 lg:grid-cols-[1.15fr_0.85fr] md:p-8">
              <div className="order-2 flex justify-center lg:order-2">
                <img
                  src={dashboardMuralUrl}
                  alt=""
                  className="h-auto w-full max-w-[520px] object-contain"
                />
              </div>
              <div className="order-1 mx-auto max-w-[430px] text-center lg:order-1">
                <div className="mb-5 flex items-center justify-center gap-3">
                  <Sparkles className="h-7 w-7 text-[#0d7d48]" />
                  <h1 className="text-3xl font-black leading-tight text-[#101916] sm:text-4xl">
                    هذه الصفحة قيد الإنشاء
                  </h1>
                </div>
                <p className="mx-auto mb-6 max-w-[390px] text-xl leading-9 text-[#4f5654]">
                  نعمل حالياً على تجهيز هذه الواجهة لتكون جاهزة قريباً.
                </p>
                <div className="mx-auto flex min-h-[76px] max-w-[380px] items-center gap-4 rounded-lg border border-[#cdded5] bg-[#f5faf7] px-6 text-[#45514d]">
                  <LockKeyhole className="h-6 w-6 shrink-0 text-[#0d7c47]" />
                  <span className="text-base leading-7">نحن نعمل بجد لنقدم لك تجربة رائعة تلبي احتياجات عملك.</span>
                </div>
              </div>
            </Card>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {metricCards.map((card) => (
                <MetricCard key={card.title} {...card} />
              ))}
            </div>

            <Card className="p-4">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#eef8f2] text-[#16874f]">
                  <UserRound className="h-5 w-5" />
                </div>
                <h2 className="text-lg font-bold">نشاط الفريق</h2>
              </div>
              <div className="space-y-3 opacity-75">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="grid grid-cols-[34px_1fr_64px_160px_56px] items-center gap-5 max-md:grid-cols-[34px_1fr_56px]">
                    <div className="h-8 w-8 rounded-full bg-[#e0e4e6]" />
                    <SkeletonLine className="w-full" />
                    <SkeletonLine className="w-16 bg-[#dceee5]" />
                    <SkeletonLine className="w-full max-md:hidden" />
                    <SkeletonLine className="w-14 max-md:hidden" />
                  </div>
                ))}
              </div>
              <LockedStrip className="mt-5" />
            </Card>

            <div className="flex min-h-14 items-center justify-center gap-4 rounded-lg border border-dashed border-[#bfc8c5] bg-white px-5 text-center text-sm text-[#66706c]">
              <Package className="h-6 w-6" />
              <span>هذه الواجهة قيد التطوير. سيتم تفعيل جميع الميزات قريباً لتمنحك تجربة متكاملة لإدارة عملك والتواصل مع عملائك بذكاء.</span>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
