import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden">
      <nav className="w-full fixed top-0 left-0 bg-bg-light/80 backdrop-blur-md z-50 border-b border-primary/5">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="text-2xl font-black text-primary tracking-tight">CSCB</div>
          <div className="hidden md:flex gap-8 items-center text-primary/80 font-medium">
            <a href="#features" className="hover:text-primary transition-colors">المميزات</a>
            <a href="#how-it-works" className="hover:text-primary transition-colors">كيف يعمل</a>
            <a href="#pricing" className="hover:text-primary transition-colors">التكلفة</a>
            <button className="bg-primary text-white px-6 py-2.5 rounded-full hover:bg-primary/90 transition-all font-semibold shadow-sm hover:shadow-md">
              تواصل معنا
            </button>
          </div>
        </div>
      </nav>
      <main className="flex-1 w-full pt-20">
        {children}
      </main>
      <footer className="bg-primary text-bg-light py-12 border-t border-white/10">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <div className="text-2xl font-black mb-4">CSCB</div>
            <p className="text-bg-light/70 max-w-sm">
              مساعدك الذكي على واتساب. ردود مبنية على متجرك الخاص، 24/7، بدون تأخير.
            </p>
          </div>
          <div className="flex md:justify-end items-end text-bg-light/50 text-sm">
            © 2026 جميع الحقوق محفوظة
          </div>
        </div>
      </footer>
    </div>
  );
}
