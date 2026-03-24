import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const FEATURES = [
  {
    num: "02",
    title: "لا مجال للتأليف أو الخطأ",
    desc: "نظامنا يعتمد مباشرة على منتجاتك المخزنة. إذا لم يجد المنتج، سيخبر العميل أو يحول المحادثة إليك.",
  },
  {
    num: "03",
    title: "يفهم العربية والإنجليزية",
    desc: "يدرك السياق ويجيب بنفس لغة العميل. يدعم اللهجات المحلية بذكاء ودقة مبهرة.",
  },
  {
    num: "04",
    title: "تحويل سلس للبشر",
    desc: "عندما يطلب العميل التحدث لموظف مبيعات، يصمت البوت فوراً ويرسل إليك إشعاراً لتستكمل أنت المحادثة.",
  },
];

export function SolutionSection() {
  const container = useRef<HTMLDivElement>(null);
  
  useGSAP(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      gsap.set('.ed-feature .ed-number', { y: 0, opacity: 0.1 });
      return;
    }

    // Ambient Background parallax & noise animation
    gsap.to('.ambient-gradient', {
      backgroundPosition: '100% 100%',
      duration: 20,
      repeat: -1,
      yoyo: true,
      ease: 'sine.inOut'
    });

    // Abstract Hero Animation
    gsap.to('.ring-element', {
      rotate: 360,
      duration: 40,
      repeat: -1,
      ease: "linear"
    });

    // Abstract Floating Core
    gsap.to('.floating-core', {
      y: -25,
      duration: 3,
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut"
    });

    // Main Header Reveal
    gsap.from('.ed-header', {
      scrollTrigger: {
        trigger: container.current,
        start: 'top 70%',
      },
      y: 50,
      opacity: 0,
      duration: 1,
      ease: 'power4.out'
    });

    // Hero Section Reveal
    gsap.from('.ed-hero', {
      scrollTrigger: {
        trigger: '.ed-hero',
        start: 'top 75%',
      },
      y: 60,
      opacity: 0,
      duration: 1.2,
      ease: 'power3.out'
    });

    // Massive Number Parallax Effect
    gsap.utils.toArray<HTMLElement>('.ed-number').forEach((num) => {
      const trigger = num.parentElement;
      if (!trigger) return;

      gsap.fromTo(
        num,
        { y: -30, opacity: 0 },
        {
          y: 40,
          opacity: 0.1,
          scrollTrigger: {
            trigger,
            start: 'top bottom',
            end: 'bottom top',
            scrub: 1.5
          }
        }
      );
    });

    // Secondary Features Staggered Entry
    gsap.from('.ed-feature', {
      scrollTrigger: {
        trigger: '.ed-features-list',
        start: 'top 85%'
      },
      y: 40,
      opacity: 0,
      duration: 1,
      stagger: 0.2,
      ease: 'power3.out'
    });

    // Decorative Lines
    gsap.from('.ed-line', {
      scrollTrigger: {
        trigger: container.current,
        start: 'top 60%',
      },
      scaleY: 0,
      transformOrigin: 'top',
      duration: 1.5,
      ease: 'expo.inOut'
    });

  }, { scope: container });

  return (
    <section
      ref={container}
      className="py-24 md:py-40 bg-[#0A110E] relative overflow-hidden text-white"
      id="features"
      dir="rtl"
    >
      {/* High-End Editorial Atmosphere */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div
          className="ambient-gradient absolute w-full h-[150%] top-[-25%] left-0 opacity-60 mix-blend-screen"
          style={{
            background:
              "radial-gradient(circle at 30% 20%, #173827 0%, #0A110E 60%, transparent 100%)",
            backgroundSize: "150% 150%",
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.04]"
             style={{
            backgroundImage:
              'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.75%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")',
          }}
        />
      </div>

      {/* Top Transition Curve */}
      <div className="absolute top-0 left-0 w-full overflow-hidden leading-none pointer-events-none z-20">
        <svg
          className="w-full relative block"
          style={{ width: "calc(100% + 2px)", height: "80px" }}
          viewBox="0 0 1200 120"
          preserveAspectRatio="none"
        >
          <path
            d="M321.39,56.44c58-10.79,114.16-30.13,172-41.86,82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53,26.09,214.34,3V0H0V27.35A600.21,600.21,0,0,0,321.39,56.44Z"
            className="fill-bg-light"
          />
        </svg>
      </div>

      {/* Bottom Transition Curve */}
      <div className="absolute bottom-0 left-0 w-full overflow-hidden leading-none pointer-events-none z-20 rotate-180">
        <svg
          className="w-full relative block"
          style={{ width: "calc(100% + 2px)", height: "80px" }}
          viewBox="0 0 1200 120"
          preserveAspectRatio="none"
        >
          <path
            d="M321.39,56.44c58-10.79,114.16-30.13,172-41.86,82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53,26.09,214.34,3V0H0V27.35A600.21,600.21,0,0,0,321.39,56.44Z"
            className="fill-bg-light"
          />
        </svg>
      </div>

      <div className="max-w-360 mx-auto px-6 relative z-10 flex flex-col gap-24">
        {/* Title Area */}
        <div className="flex flex-col md:flex-row justify-between items-end gap-12 border-b border-white/6 pb-16 relative">
          <div className="absolute right-0 top-0 w-px h-50 bg-white/8 ed-line" />
          <div className="ed-header">
            <h2 className="text-4xl md:text-6xl lg:text-7xl font-black leading-[1.1] max-w-4xl tracking-tight">
              نظام{" "}
              <span
                className="text-transparent border-b-2 border-secondary"
                style={{ WebkitTextStroke: "1px #E3B23C" }}
              >
                قوي
              </span>
              <br />
              لمبيعات الجملة والتجزئة.
            </h2>
          </div>
        </div>

        {/* New Layout Stack: Hero Bar + 3 Columns */}
        <div className="flex flex-col gap-12 lg:gap-20 w-full">
          {/* Hero Feature Horizontal Banner */}
          <div className="ed-hero relative w-full min-h-100 lg:min-h-112.5 rounded-4xl overflow-hidden bg-linear-to-br from-white/3 to-transparent border border-white/5 p-10 md:p-16 lg:px-24 flex flex-col md:flex-row items-center justify-between backdrop-blur-3xl shadow-[0_30px_60px_-15px_rgba(0,0,0,0.8)]">
            {/* The Visual Piece: Master Container */}
            <div className="absolute top-1/2 -translate-y-1/2 left-[-10%] md:left-[5%] w-[80vw] md:w-150 aspect-square pointer-events-none flex items-center justify-center">
               
               {/* Abstract Rings Background (Lower Opacity) */}
               <div className="absolute inset-0 flex items-center justify-center opacity-30">
                 <div className="ring-element w-[80%] aspect-square rounded-full border border-dashed border-secondary/60 absolute mix-blend-screen" />
                 <div
                   className="ring-element w-[60%] aspect-square rounded-full border border-secondary/30 absolute"
                   style={{
                     animationDirection: "reverse",
                     animationDuration: "60s",
                   }}
                 />
                 <div className="ring-element w-full aspect-square rounded-full border-2 border-secondary/10 absolute backdrop-blur-[2px]" />
                 <div className="absolute w-32 md:w-48 h-32 md:h-48 rounded-full bg-linear-to-tr from-secondary/20 to-secondary/5 blur-3xl animate-[pulse_4s_infinite]" />
               </div>
               
               {/* Floating High-Contrast Core (100% Opacity) */}
               <div className="floating-core absolute flex items-center justify-center z-10 transition-transform duration-700 ease-out">
                 {/* Glass Shell */}
                 <div className="w-24 h-24 md:w-32 md:h-32 rounded-full border border-white/20 bg-white/5 backdrop-blur-xl shadow-[0_0_50px_rgba(227,178,60,0.2)] flex items-center justify-center relative overflow-hidden">
                   
                   {/* Diagonal Light Sweep */}
                   <div className="absolute -inset-full bg-linear-to-tr from-transparent via-white/10 to-transparent rotate-45 translate-x-1/2" />
                   
                   {/* Central Glowing Diamond */}
                   <div className="w-6 h-6 md:w-8 md:h-8 rounded-sm bg-secondary shadow-[0_0_40px_rgba(227,178,60,1)] relative flex items-center justify-center animate-[spin_10s_linear_infinite]">
                      <div className="absolute w-full h-full border border-white/50 animate-ping" style={{ animationDuration: '3s' }} />
                   </div>
                   
                   {/* Orbiting Satellite Dot */}
                   <div className="absolute w-full h-full animate-[spin_5s_linear_infinite]">
                     <div className="w-0.75 h-0.75 md:w-1 md:h-1 rounded-full bg-white absolute -top-0.5 left-1/2 -translate-x-1/2 shadow-[0_0_15px_rgba(255,255,255,1)]" />
                   </div>
                 </div>
               </div>
               
            </div>

            <div className="relative z-10 ed-hero-content w-full md:w-3/5 text-right mt-16 md:mt-0">
              <div className="ed-number text-[8rem] md:text-[14rem] font-black leading-none select-none text-white/5 absolute top-1/2 -translate-y-1/2 -right-8 md:-right-20 pointer-events-none">
                01
              </div>

              <div className="w-12 h-0.75 bg-secondary mb-8" />
              <h3 className="text-4xl md:text-5xl lg:text-7xl font-black mb-6 leading-[1.2]">
                مساعد يعمل <br />
                <span
                  className="text-transparent border-b border-white/20"
                  style={{ WebkitTextStroke: "1px rgba(255,255,255,0.8)" }}
                >
                  على مدار الساعة
                </span>
              </h3>
              <p className="text-lg md:text-2xl text-white/50 leading-relaxed font-medium max-w-2xl">
                لا مزيد من رسائل "نحن خارج أوقات الدوام". المساعد الذكي جاهز
                للرد في أي ثانية، نهاراً أو ليلاً، دون انقطاع.
              </p>
            </div>
          </div>

          {/* Secondary Features Grid (Below Hero) */}
          <div className="ed-features-list grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12 w-full pt-4">
            {FEATURES.map((feat, idx) => (
              <div key={idx} className="ed-feature relative group">
                <div className="relative z-10 border-t-2 border-white/8 group-hover:border-secondary transition-colors duration-500 bg-[#0A110E] lg:bg-transparent p-6 md:py-8 lg:p-0 lg:pt-8 rounded-2xl lg:rounded-none h-full">
                  {/* Outline Number Behind (Desktop) */}
                  <div
                    className="ed-number hidden lg:block absolute -top-8 left-8 lg:left-0 lg:right-auto text-[6rem] font-black text-transparent select-none pointer-events-none"
                    style={{ WebkitTextStroke: "1px rgba(227,178,60,0.3)" }}
                  >
                    {feat.num}
                  </div>
                  
                  <div className="text-sm font-mono text-secondary/70 mb-5 lg:hidden">
                    {feat.num}
                  </div>
                  <h3 className="text-2xl md:text-[1.6rem] font-bold mb-4 leading-snug group-hover:text-white transition-colors text-white/80">
                    {feat.title}
                  </h3>
                  <p className="text-white/40 leading-relaxed text-base">
                    {feat.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
