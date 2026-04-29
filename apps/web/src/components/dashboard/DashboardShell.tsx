import {
  BarChart3,
  Bell,
  FileText,
  Grid2X2,
  MessageSquare,
  ReceiptText,
  Settings,
  ShoppingBag,
  Sparkles,
  UploadCloud,
  UsersRound,
} from 'lucide-react';
import { type ReactNode, type UIEvent, useState } from 'react';

import logoUrl from '../../assets/logo.svg';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from '../ui/sidebar';
import { TooltipProvider } from '../ui/tooltip';

const navItems = [
  { label: 'لوحة التحكم', icon: Grid2X2, href: '/dashboard' },
  { label: 'المحادثات', icon: MessageSquare, href: '#' },
  { label: 'الكتالوج', icon: ShoppingBag, href: '#' },
  { label: 'تخصيص الذكاء الاصطناعي', icon: Sparkles, href: '#' },
  { label: 'القوالب', icon: FileText, href: '#' },
  { label: 'رفع البيانات', icon: UploadCloud, href: '/dashboard/upload' },
  { label: 'التحليلات', icon: BarChart3, href: '#' },
  { label: 'الفريق', icon: UsersRound, href: '#' },
  { label: 'الفواتير', icon: ReceiptText, href: '#' },
  { label: 'الإعدادات', icon: Settings, href: '#' },
];

function DashboardSidebar({ activePath }: { activePath: string }) {
  const [showOverflowShadow, setShowOverflowShadow] = useState(true);

  const handleNavigationScroll = (event: UIEvent<HTMLDivElement>) => {
    const target = event.target;

    if (target instanceof HTMLElement && target.dataset.slot === 'scroll-area-viewport') {
      setShowOverflowShadow(target.scrollTop <= 0);
    }
  };

  return (
    <Sidebar dir="rtl" side="right" collapsible="icon" className="top-[var(--header-height)] h-[calc(100svh-var(--header-height))] border-s border-[#dde4e0] shadow-[-2px_0_10px_rgba(22,35,29,0.05)]">
      <SidebarContent className="relative bg-white px-3 py-6 group-data-[icon-layout=collapsed]:px-0">
        <ScrollArea
          onScrollCapture={handleNavigationScroll}
          className="min-h-0 flex-1 **:data-[slot=scroll-area-scrollbar]:start-0 **:data-[slot=scroll-area-scrollbar]:end-auto **:data-[slot=scroll-area-viewport]:ps-3 group-data-[icon-layout=collapsed]:**:data-[slot=scroll-area-viewport]:ps-0"
        >
          <SidebarGroup className="group-data-[icon-layout=collapsed]:p-0">
            <SidebarGroupContent>
              <SidebarMenu className="gap-3">
                {navItems.map(({ label, icon: Icon, href }) => {
                  const isActive = activePath === href;
                  const isPlaceholder = href === '#';

                  return (
                    <SidebarMenuItem key={label}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        size="lg"
                        tooltip={{ children: label, side: 'left' }}
                        className="min-h-16.5 rounded-lg px-4 text-base font-semibold text-[#2d3331] data-active:bg-linear-to-l data-active:from-[#e8f3ee] data-active:to-[#f4faf7] data-active:text-[#087a43] hover:bg-[#f5f8f6] group-data-[icon-layout=collapsed]:size-12! group-data-[icon-layout=collapsed]:min-h-12 group-data-[icon-layout=collapsed]:rounded-lg group-data-[icon-layout=collapsed]:p-3!"
                      >
                        <a
                          href={href}
                          data-placeholder={isPlaceholder ? 'true' : undefined}
                          onClick={isPlaceholder ? (event) => event.preventDefault() : undefined}
                          className="grid grid-cols-[1.25rem_minmax(0,1fr)] items-center gap-3 group-data-[icon-layout=collapsed]:grid-cols-1 group-data-[icon-layout=collapsed]:justify-items-center group-data-[icon-layout=collapsed]:gap-0"
                        >
                          <Icon className="justify-self-start stroke-[1.9] group-data-[icon-layout=collapsed]:justify-self-center" />
                          <span className="min-w-0 overflow-hidden text-start leading-6 wrap-break-word hyphens-auto group-data-[icon-layout=collapsed]:hidden">{label}</span>
                        </a>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </ScrollArea>
        <div
          aria-hidden="true"
          data-testid="sidebar-bottom-overflow-shadow"
          data-visible={showOverflowShadow}
          className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-linear-to-t from-white via-white/90 to-transparent opacity-0 transition-opacity duration-500 data-[visible=true]:opacity-100"
        />
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}

export function DashboardShell({ activePath, children }: { activePath: string; children: ReactNode }) {
  return (
    <div dir="rtl" className="min-h-screen bg-[#fbfcfc] font-arabic text-[#1f2925]">
      <TooltipProvider>
        <SidebarProvider defaultOpen>
          <header className="fixed inset-x-0 top-0 z-30 h-[var(--header-height)] border-b border-[#dfe4e2] bg-white/95 shadow-[0_2px_10px_rgba(15,23,20,0.08)] backdrop-blur">
            <div className="flex h-full items-center justify-between px-5 sm:px-7">
              <div className="flex items-center gap-3 text-[#0a7a43]">
                <img src={logoUrl} alt="" aria-hidden="true" className="size-12 object-contain" />
                <span className="text-4xl font-black leading-none">رضا</span>
              </div>

              <div className="flex items-center gap-4" dir="ltr">
                <SidebarTrigger className="text-[#202825] hover:bg-[#ecf5ef] lg:hidden" aria-label="القائمة" />
                <Avatar className="size-12 bg-linear-to-br from-[#159957] to-[#0a6139] text-lg font-bold text-white shadow-[0_10px_24px_rgba(13,116,67,0.25)]">
                  <AvatarFallback className="bg-transparent text-white">OB</AvatarFallback>
                </Avatar>
                <Button variant="ghost" size="icon-lg" className="relative text-[#202825] hover:bg-[#ecf5ef]" aria-label="الإشعارات">
                  <Bell />
                  <span className="absolute end-2 top-2 size-2.5 rounded-full bg-[#09844a]" />
                </Button>
                <div className="hidden h-8 w-px bg-[#d8dddc] sm:block" />
                <nav className="hidden items-center gap-3 text-sm font-semibold sm:flex">
                  <a href="#" aria-disabled="true" onClick={(event) => event.preventDefault()} className="text-[#242b29]">English</a>
                  <span className="h-5 w-px bg-[#cfd5d3]" />
                  <a href="#" aria-disabled="true" onClick={(event) => event.preventDefault()} className="border-b-2 border-[#0d7c47] px-1 pb-2 text-[#0d7c47]">العربية</a>
                </nav>
              </div>
            </div>
          </header>

          <DashboardSidebar activePath={activePath} />

          <SidebarInset className="min-h-screen bg-[#fbfcfc] pt-[var(--header-height)]">
            <main className="w-full px-4 py-5 sm:px-7">{children}</main>
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </div>
  );
}
