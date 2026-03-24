import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ArrowLeft } from '../icons';

gsap.registerPlugin(ScrollTrigger);

const DiamondIcon = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 12 12"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="mt-1.5 shrink-0"
  >
    <path d="M6 0L12 6L6 12L0 6L6 0Z" fill="currentColor" />
  </svg>
);

export function PricingSection() {
  const container = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: container.current,
          start: "top 80%",
        },
      });

      // 1. Title entrance
      tl.from(".pricing-header", {
        y: 40,
        opacity: 0,
        duration: 0.8,
        ease: "power3.out",
      });

      // 2. Cards staggered reveal with a subtle 3D flip/unfold effect
      tl.from(
        ".pricing-card",
        {
          y: 50,
          scale: 0.95,
          rotateX: -10,
          opacity: 0,
          duration: 0.8,
          stagger: 0.15,
          ease: "power3.out",
          transformOrigin: "top center",
        },
        "-=0.4",
      );

      // 3. Draw in the divider lines inside the cards
      tl.from(
        ".pricing-divider",
        {
          scaleX: 0,
          duration: 0.6,
          stagger: 0.1,
          ease: "power3.inOut",
          transformOrigin: "right center",
        },
        "-=0.4",
      );

      // 4. Reveal feature lists inside cards
      tl.from(
        ".pricing-feature",
        {
          x: 20,
          opacity: 0,
          duration: 0.5,
          stagger: 0.05,
          ease: "power2.out",
        },
        "-=0.2",
      );
    },
    { scope: container },
  );

  return (
    <section
      id="pricing"
      ref={container}
      className="scroll-mt-28 py-24 md:py-32 px-6 relative z-10 perspective-[1000px]"
    >
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16 md:mb-24 pricing-header">
          <h2 className="text-4xl md:text-5xl lg:text-5xl font-black text-primary mb-6 tracking-tight">
            باقات مصممة لتناسب <span className="text-emerald-700/80">احتياجات أعمالك</span>
          </h2>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-12 w-full max-w-4xl mx-auto items-center">
          {/* Starter Tier */}
          <div className="pricing-card bg-surface border border-primary/5 rounded-4xl p-8 md:p-12 shadow-[0_12px_40px_rgba(26,46,39,0.03)] flex flex-col h-[calc(100%-2rem)]">
            <div className="mb-8">
              <span className="inline-block px-4 py-1.5 rounded-full bg-primary/5 text-primary text-sm font-bold mb-6">
                الأساسية
              </span>
              <h3 className="text-4xl md:text-5xl font-black text-primary mb-4">
                ٩٩${" "}
                <span className="text-xl md:text-2xl font-bold text-primary/50">
                  / شهرياً
                </span>
              </h3>
              <p className="text-primary/70 font-medium text-base md:text-lg leading-relaxed">
                الخيار الأمثل للشركات الناشئة والمشاريع التي تخطو خطواتها الأولى
                في أتمتة الردود.
              </p>
            </div>

            <div className="pricing-divider h-px w-full bg-linear-to-l from-primary/10 via-primary/10 to-transparent mb-8"></div>

            <ul className="space-y-4 md:space-y-5 mb-10 grow">
              {[
                "ردود آلية غير محدودة",
                "ربط بكتالوج المنتجات الأساسي",
                "دعم فني عبر البريد الإلكتروني",
                "إحصائيات مبسطة للأداء",
              ].map((feature, i) => (
                <li
                  key={i}
                  className="pricing-feature flex items-start gap-4 text-primary/80 font-medium text-base md:text-lg"
                >
                  <span className="text-primary/30">
                    <DiamondIcon />
                  </span>
                  {feature}
                </li>
              ))}
            </ul>

            <button className="w-full bg-primary/5 text-primary py-4 rounded-xl font-bold text-lg hover:bg-primary/10 transition-colors duration-300">
              ابدأ التجربة
            </button>
          </div>

          {/* Professional Tier (Recommended) */}
          <div className="pricing-card relative bg-[#11231a] rounded-4xl p-8 md:p-12 shadow-[0_24px_60px_rgba(26,46,39,0.2)] flex flex-col border border-white/5 h-full overflow-hidden z-10">
            {/* Subtle glow effect instead of busy gradients */}
            <div className="absolute top-0 right-0 w-100 h-100 bg-secondary/5 rounded-full opacity-50 blur-[80px] pointer-events-none" />

            <div className="absolute top-6 left-6">
              <span className="inline-block px-4 py-1.5 rounded-full bg-secondary/10 border border-secondary/20 text-secondary text-xs font-bold uppercase tracking-wider">
                يُنصح بها
              </span>
            </div>

            <div className="mb-8 relative z-10">
              <span className="inline-block relative text-secondary text-sm font-bold mb-6">
                الاحترافية
                <span className="absolute -bottom-1.5 right-0 w-full h-0.5 bg-secondary/40 rounded-full" />
              </span>
              <h3 className="text-4xl md:text-5xl font-black text-white mb-4">
                ١٩٩${" "}
                <span className="text-xl md:text-2xl font-bold text-white/50">
                  / شهرياً
                </span>
              </h3>
              <p className="text-white/70 font-medium text-base md:text-lg leading-relaxed">
                للعلامات التجارية المتنامية التي تحتاج تحكماً كاملاً وخيارات ربط
                متقدمة.
              </p>
            </div>

            <div className="pricing-divider h-px w-full bg-linear-to-l from-white/10 via-white/10 to-transparent mb-8 relative z-10"></div>

            <ul className="space-y-4 md:space-y-5 mb-10 grow relative z-10">
              {[
                "كل ما في الباقة الأساسية",
                "نقل المحادثة لفريق المبيعات (Handoff)",
                "تحليلات واستراتيجيات متقدمة",
                "ربط API مفتوح مع أنظمتك الخاصة",
                "مدير حساب مخصص لعملك",
              ].map((feature, i) => (
                <li
                  key={i}
                  className="pricing-feature flex items-start gap-4 text-white/90 font-medium text-base md:text-lg"
                >
                  <span className="text-secondary">
                    <DiamondIcon />
                  </span>
                  {feature}
                </li>
              ))}
            </ul>

            <button className="relative z-10 w-full bg-secondary text-[#11231a] py-4 rounded-xl font-bold text-lg hover:bg-white transition-all duration-300 shadow-[0_4px_14px_rgba(227,178,60,0.15)] hover:shadow-[0_6px_20px_rgba(227,178,60,0.25)] flex items-center justify-center gap-2 group translate-y-0 hover:-translate-y-0.5">
              اطلب نسختك الآن
              <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1.5 transition-transform duration-300" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
