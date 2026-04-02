import React from 'react';
import logoUrl from '../../assets/Reda_logo.svg';
import { Link, useLocation } from '../router/HonoRouter';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { path } = useLocation();
  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  // Only show section links if on the landing page
  const isLandingPage = path === '/';

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden">
      <nav className="w-full fixed top-0 left-0 bg-bg-light/80 backdrop-blur-md z-50 border-b border-primary/5">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <Link
            href="/"
            aria-label="CSCB"
            className="flex items-center gap-3"
            onClick={(event: React.MouseEvent) => {
              if (isLandingPage) {
                event.preventDefault();
                scrollToTop();
              }
            }}
          >
            <img src={logoUrl} alt="" className="h-10 w-auto" />
            <span className="text-2xl font-black text-primary tracking-tight">رضا</span>
          </Link>
          <div className="hidden md:flex gap-8 items-center text-primary/80 font-medium">
            {isLandingPage && (
              <>
                <Link href="/#features" className="hover:text-primary transition-colors">المميزات</Link>
                <Link href="/#how-it-works" className="hover:text-primary transition-colors">كيف يعمل</Link>
                <Link href="/#pricing" className="hover:text-primary transition-colors">أسعارنا</Link>
              </>
            )}
            <Link href="/contact" className="bg-primary text-white px-6 py-2.5 rounded-full hover:bg-primary/90 transition-all font-semibold shadow-sm hover:shadow-md">
              تواصل معنا
            </Link>
          </div>
        </div>
      </nav>
      <main className="flex-1 w-full pt-20">
        {children}
      </main>
      <footer className="relative bg-primary overflow-hidden border-t border-white/5 py-12 md:py-16">
        {/* Giant Watermark Background */}
        <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-[20%] pointer-events-none opacity-[0.08] select-none z-0">
          <img src={logoUrl} alt="" className="h-150 md:h-225 w-auto brightness-0 invert drop-shadow-2xl" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-10 items-center">
          
          {/* Logo Element */}
          <div className="flex justify-center md:justify-start">
            <button
              type="button"
              className="flex items-center gap-4 group cursor-pointer"
              onClick={scrollToTop}
              aria-label="العودة إلى أعلى الصفحة"
            >
              <img src={logoUrl} alt="" className="h-12 md:h-14 w-auto brightness-0 invert opacity-90 transition-all duration-700 group-hover:scale-105" />
              <div className="text-4xl font-black tracking-tight text-white/90">رضا</div>
            </button>
          </div>
          
          {/* Return to Top Arrow (Center) */}
          <div className="flex justify-center order-last md:order-0 mt-8 md:mt-0">
            <button 
              type="button"
              onClick={scrollToTop}
              className="flex items-center justify-center p-4 rounded-full border border-white/10 text-white/30 hover:text-white/80 hover:bg-white/5 hover:border-white/20 transition-all duration-300 focus:outline-none group"
              aria-label="العودة للأعلى"
            >
              <svg className="w-6 h-6 group-hover:-translate-y-1.5 transition-transform duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
              </svg>
            </button>
          </div>

          {/* Copyright Section */}
          <div className="flex justify-center md:justify-end">
            <div className="flex items-center gap-3 text-white/40 text-sm tracking-wide font-light">
              <span>© 2026 جميع الحقوق محفوظة</span>
              <span className="w-1 h-1 rounded-full bg-white/10"></span>
              <span className="text-white/50 font-semibold tracking-[0.2em] uppercase text-xs">REDA</span>
            </div>
          </div>

        </div>
      </footer>
    </div>
  );
}
