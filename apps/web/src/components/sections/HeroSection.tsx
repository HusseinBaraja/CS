import React, { useRef, useState } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ArrowLeft, BarChart3, Bot, MessageCircle } from '../icons';
import { Link } from '../router/HonoRouter';
import logoUrl from '../../assets/Reda_logo.svg';

export function HeroSection() {
  const container = useRef<HTMLDivElement>(null);
  const [hasScrolled, setHasScrolled] = useState(false);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (!hasScrolled && e.currentTarget.scrollTop > 10) {
      setHasScrolled(true);
    }
  };

  useGSAP(
    () => {
      const tl = gsap.timeline();

      // Animate text elements
      tl.from(".hero-text-anim", {
        y: 40,
        opacity: 0,
        duration: 1,
        stagger: 0.15,
        ease: "power3.out",
        delay: 0.2,
      });

      // Animate the phone mockup from bottom
      tl.from(
        ".hero-phone-anim",
        {
          y: 60,
          opacity: 0,
          duration: 1.2,
          ease: "power4.out",
        },
        "-=0.8",
      );

      // Chat messages pop in
      tl.from(
        ".hero-chat-message",
        {
          y: 20,
          opacity: 0,
          duration: 0.6,
          stagger: 0.2,
          ease: "power3.out",
        },
        "-=0.4",
      );
    },
    { scope: container },
  );

  return (
    <section
      ref={container}
      className="relative pt-8 pb-24 md:pt-12 md:pb-40 min-h-[90vh] flex items-center"
    >
      {/* Background ambient shapes */}
      <div className="absolute top-0 right-0 w-200 h-200 -translate-y-1/2 translate-x-1/3 pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(227,178,60,0.08) 0%, transparent 70%)' }} />
      <div className="absolute bottom-0 left-0 w-150 h-150 translate-y-1/3 -translate-x-1/4 pointer-events-none z-0" style={{ background: 'radial-gradient(circle, rgba(26,46,39,0.08) 0%, transparent 70%)' }} />

      <div className="max-w-7xl mx-auto px-6 flex flex-col gap-10 lg:grid lg:grid-cols-2 lg:gap-16 items-center relative z-10 w-full">
        {/* Right Content (RTL) */}
        <div className="contents lg:block max-w-2xl w-full">
          <div className="order-1 lg:order-none flex flex-col w-full">
            <h1 className="hero-text-anim text-5xl md:text-6xl lg:text-7xl font-black text-primary leading-[1.1] mb-6 tracking-tight">
              خدمة عملاء عبر واتساب <br />
              <span className="text-[#115C42] relative inline-block">
                دقة عالية، على مدار الساعة
                <svg
                  className="absolute w-full h-3 -bottom-1 left-0 text-secondary/40"
                  fill="currentColor"
                  viewBox="0 0 100 10"
                  preserveAspectRatio="none"
                >
                  <path d="M0 5 Q 50 10 100 5 L 100 10 L 0 10 Z" />
                </svg>
              </span>
            </h1>

            <p className="hero-text-anim text-xl text-primary/70 mb-0 lg:mb-10 leading-relaxed font-medium">
              اربط كتالوج منتجاتك، وسيقوم المساعد الذكي بالرد على عملائك، وتحويل
              المحادثة إليك عند الحاجة.
            </p>
          </div>

          <div className="hero-text-anim order-4 lg:order-none flex flex-col sm:flex-row gap-4 w-full lg:w-auto">
            <Link href="/trial" className="bg-primary text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-primary/90 transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-3 group w-full sm:w-auto">
              ابدأ الآن مجاناً
              <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            </Link>
          </div>

          <div className="hero-text-anim order-3 lg:order-none mt-0 lg:mt-12 grid grid-cols-3 gap-6 pt-8 border-t border-primary/10 w-full">
            <div className="flex flex-col gap-2">
              <MessageCircle className="w-6 h-6 text-primary/50" />
              <span className="font-bold text-primary">ردود فورية 24/7</span>
            </div>
            <div className="flex flex-col gap-2">
              <Bot className="w-6 h-6 text-primary/50" />
              <span className="font-bold text-primary">
                تطابق المنتجات بدقة
              </span>
            </div>
            <div className="flex flex-col gap-2">
              <BarChart3 className="w-6 h-6 text-primary/50" />
              <span className="font-bold text-primary">تحليلات وتقارير</span>
            </div>
          </div>
        </div>

        {/* Left Content - Abstract Phone UI Mockup */}
        <div className="hero-phone-anim order-2 lg:order-none relative h-150 w-full max-w-105 mx-auto lg:mr-auto lg:ml-0 perspective-[1000px]">
          {/* Main Device Box */}
          <div className="absolute inset-0 bg-[#fefefe] rounded-[40px] shadow-2xl border-8 border-primary overflow-hidden flex flex-col transform lg:rotate-y-12 lg:rotate-x-6 lg:translate-z-0 transition-transform duration-700 hover:rotate-y-0 hover:rotate-x-0">
            {/* WhatsApp Header Mock */}
            <div className="bg-[#115C42] text-white px-5 py-4 flex items-center gap-4">
              <ArrowLeft className="w-5 h-5 opacity-80" />
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center overflow-hidden">
                <img
                  src={logoUrl}
                  alt=""
                  className="h-6 w-6 object-contain brightness-0 invert"
                />
              </div>
              <div>
                <div className="font-bold text-[15px]">
                  المساعد الذكي للشركة
                </div>
                <div className="text-xs opacity-70">متصل الآن</div>
              </div>
            </div>
            {/* Chat Body Wrapper */}
            <div className="flex-1 relative flex flex-col min-h-0 bg-[#EFEAE2]">
              {/* Pattern Overlay */}
              <div
                className="absolute inset-0 opacity-5 pointer-events-none"
                style={{
                  backgroundImage:
                    "radial-gradient(circle at center, #1A2E27 1px, transparent 1px)",
                  backgroundSize: "12px 12px",
                }}
              />

              <div
                className="flex-1 p-5 flex flex-col gap-4 overflow-y-auto overflow-x-hidden relative scroll-smooth z-10"
                style={{ scrollbarWidth: "thin" }}
                onScroll={handleScroll}
              >
                {/* We removed the inner pattern overlay line because we hoisted it to the wrapper */}

                <div className="hero-chat-message self-start bg-white text-primary p-3 rounded-2xl rounded-tr-sm shadow-sm max-w-[85%] text-[15px] font-medium leading-normal border border-black/5">
                  مرحباً، هل عندكم علب برجر ورق مقاس وسط؟
                  <div className="text-[10px] text-primary/35 mt-1 text-left">
                    10:41
                  </div>
                </div>

                <div className="hero-chat-message self-end bg-[#D9FDD3] text-primary p-3 rounded-2xl rounded-tl-sm shadow-sm max-w-[85%] text-[15px] font-medium leading-normal border border-black/5 mt-2">
                  أهلاً بك! نعم متوفر لدينا "علبة برجر كرافت وسط" (رقم الصنف:
                  BX-102).
                  <br />
                  <br />
                  السعر: 1,200 ريال للكرتون (500 حبة).
                  <div className="text-[10px] text-emerald-600 mt-1 text-left flex justify-end items-center gap-1">
                    ✓✓ 10:41
                  </div>
                </div>

                <div className="hero-chat-message self-start bg-white text-primary p-3 rounded-2xl rounded-tr-sm shadow-sm max-w-[85%] text-[15px] font-medium leading-normal border border-black/5 mt-2">
                  ممكن صورة لها؟
                  <div className="text-[10px] text-primary/35 mt-1 text-left">
                    10:42
                  </div>
                </div>

                {/* Bot sending Image */}
                <div className="hero-chat-message self-end bg-[#D9FDD3] p-1 rounded-2xl rounded-tl-sm shadow-sm max-w-[70%] border border-black/5 mt-2">
                  <div className="w-full aspect-square bg-primary/10 rounded-xl mb-1 flex items-center justify-center overflow-hidden">
                    {/* Abstract representation of a product image */}
                    <div className="w-1/2 h-1/2 bg-secondary rounded-lg shadow-inner rotate-3 opacity-90"></div>
                  </div>
                  <div className="px-2 pb-1 text-[13px] text-primary font-medium">
                    علبة برجر كرافت وسط
                  </div>
                  <div className="px-2 pb-1 text-[10px] text-emerald-600 text-left flex justify-end items-center gap-1">
                    ✓✓ 10:42
                  </div>
                </div>

                <div className="hero-chat-message self-start bg-white text-primary p-3 rounded-2xl rounded-tr-sm shadow-sm max-w-[85%] text-[15px] font-medium leading-normal border border-black/5 mt-2">
                  ممتاز، أحتاج 5 كراتين. هل يوجد توصيل؟
                  <div className="text-[10px] text-primary/35 mt-1 text-left">
                    10:43
                  </div>
                </div>

                <div className="hero-chat-message self-end bg-[#D9FDD3] text-primary p-3 rounded-2xl rounded-tl-sm shadow-sm max-w-[85%] text-[15px] font-medium leading-normal border border-black/5 mt-2">
                  نعم، نوفر توصيل داخل المدينة مجاناً للطلبات من 3 كراتين فأكثر.
                  سيتم التوصيل غداً صباحاً.
                  <div className="text-[10px] text-emerald-600 mt-1 text-left flex justify-end items-center gap-1">
                    ✓✓ 10:43
                  </div>
                </div>

                <div className="hero-chat-message self-start bg-white text-primary p-3 rounded-2xl rounded-tr-sm shadow-sm max-w-[85%] text-[15px] font-medium leading-normal border border-black/5 mt-2">
                  التوصيل للحي التجاري؟
                  <div className="text-[10px] text-primary/35 mt-1 text-left">
                    10:45
                  </div>
                </div>

                <div className="hero-chat-message self-end bg-[#D9FDD3] text-primary p-3 rounded-2xl rounded-tl-sm shadow-sm max-w-[85%] text-[15px] font-medium leading-normal border border-black/5 mt-2">
                  بالتأكيد. يرجى تزويدنا برقم للتواصل أو مشاركة الموقع لاستكمال
                  الطلب.
                  <div className="text-[10px] text-emerald-600 mt-1 text-left flex justify-end items-center gap-1">
                    ✓✓ 10:45
                  </div>
                </div>
              </div>

              {/* Scroll Indicator */}
              <div
                className={`absolute bottom-0 left-0 w-full h-20 bg-linear-to-t from-[#EFEAE2] to-transparent pointer-events-none flex items-end justify-center pb-2 z-20 transition-opacity duration-500 ${hasScrolled ? "opacity-0" : "opacity-100"}`}
              >
                <div className="bg-black/15 backdrop-blur-md text-primary text-[11px] font-bold px-4 py-1.5 rounded-full flex gap-1.5 items-center float-subtle shadow-sm border border-black/5">
                  <ArrowLeft className="w-3 h-3 -rotate-90" />
                  اسحب للمزيد
                </div>
              </div>
            </div>

            {/* Input Bar Mock */}
            <div className="bg-[#f0f2f5] px-4 py-3 flex gap-3 items-center border-t border-black/5">
              <div className="w-6 h-6 rounded-full bg-black/10 shrink-0"></div>
              <div className="flex-1 bg-white h-10 rounded-full shadow-sm border border-black/5"></div>
              <div className="w-10 h-10 rounded-full bg-[#115C42] text-white flex items-center justify-center shrink-0 shadow-sm">
                <ArrowLeft className="w-5 h-5 -rotate-45 relative right-px top-px" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
