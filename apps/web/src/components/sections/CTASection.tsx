import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ArrowLeft } from '../icons';
import { Link } from '../router/HonoRouter';

gsap.registerPlugin(ScrollTrigger);

export function CTASection() {
  const container = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    gsap.from('.cta-content', {
      scrollTrigger: {
        trigger: container.current,
        start: 'top 80%',
      },
      scale: 0.95,
      y: 40,
      opacity: 0,
      duration: 1,
      ease: 'power4.out'
    });
  }, { scope: container });

  return (
    <section ref={container} className="scroll-mt-header-offset py-12 md:py-16 px-6 relative z-10" >
      <div className="max-w-5xl mx-auto cta-content bg-[#11231a] rounded-4xl md:rounded-[40px] overflow-hidden relative border border-white/5 shadow-2xl">
        
        {/* Subtle dot pattern background (SVG instead of gradients) */}
        <div 
          className="absolute inset-0 opacity-[0.8]" 
          style={{ 
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='24' height='24' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='2' cy='2' r='1' fill='rgba(255,255,255,0.03)'/%3E%3C/svg%3E")`,
            backgroundSize: '24px 24px'
          }} 
        />
        
        {/* Decorative solid shapes with blur (no gradients) */}
        <div className="absolute -top-32 -right-32 w-80 h-80 bg-secondary rounded-full mix-blend-overlay opacity-10 blur-[80px] pointer-events-none" />
        <div className="absolute -bottom-32 -left-32 w-80 h-80 bg-emerald-500 rounded-full mix-blend-overlay opacity-10 blur-[80px] pointer-events-none" />

        <div className="relative z-10 px-6 py-14 md:py-20 flex flex-col items-center text-center">

          <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-white mb-6 leading-[1.2] max-w-4xl tracking-tight">
            دع الذكاء الاصطناعي <br className="hidden md:block"/> 
            <span className="text-secondary relative inline-block group">
              يتولى مهام الرد
              {/* Solid underline accent */}
              <span className="absolute -bottom-1 left-0 w-full h-1.5 bg-secondary/30 rounded-full transform origin-left transition-transform duration-500 group-hover:bg-secondary/60" />
            </span> بدءًا من اليوم.
          </h2>
          
          <p className="text-lg md:text-xl text-white/70 mb-10 max-w-2xl leading-relaxed font-medium">
            تكلفة تشغيلية منخفضة جداً، دقة متناهية مبنية على كتالوج منتجاتك، وراحة بال تامة لك ولفريقك.
          </p>
          
          <Link href="/trial" className="bg-secondary text-[#11231a] px-8 md:px-10 py-4 md:py-5 rounded-full font-bold text-lg md:text-xl hover:bg-white transition-all duration-300 shadow-[0_8px_32px_rgba(227,178,60,0.25)] hover:shadow-[0_12px_40px_rgba(227,178,60,0.4)] flex items-center justify-center gap-3 group translate-y-0 hover:-translate-y-1">
            اطلب نسختك التجريبية
            <ArrowLeft className="w-6 h-6 transform group-hover:-translate-x-1.5 transition-transform duration-300" />
          </Link>

          <div className="mt-8 text-white/40 text-sm font-medium flex items-center gap-2  px-4 py-2 rounded-full border border-white/5">
             <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/80 ring-[3px] ring-emerald-500/20 animate-pulse"></span>
             نعمل حالياً بنظام الدعوات المحدودة
          </div>
        </div>
      </div>
    </section>
  );
}
