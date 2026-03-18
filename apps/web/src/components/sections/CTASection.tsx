import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ArrowLeft } from 'lucide-react';

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
    <section ref={container} className="py-24 md:py-32 px-6">
      <div className="max-w-5xl mx-auto cta-content bg-[#1A2E27] rounded-[40px] overflow-hidden relative">
        
        {/* Decorative backdrop */}
        <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none" 
             style={{ 
               backgroundImage: 'radial-gradient(circle at top right, #E3B23C 0%, transparent 60%), radial-gradient(circle at bottom left, #115C42 0%, transparent 60%)'
             }} />
        
        <div className="relative z-10 px-8 py-20 md:py-32 flex flex-col items-center text-center">
          <h2 className="text-4xl md:text-6xl font-black text-white mb-8 leading-tight max-w-3xl">
            دع الذكاء الاصطناعي <br/> 
            <span className="text-[#E3B23C]">يتولى مهام الرد</span> بدءاً من اليوم.
          </h2>
          <p className="text-xl text-white/70 mb-12 max-w-2xl leading-relaxed">
            تكلفة تشغيلية منخفضة جداً، دقة متناهية مبنية على كتالوج منتجاتك، وراحة بال تامة لك ولفريقك.
          </p>
          
          <button className="bg-[#E3B23C] text-[#1A2E27] px-10 py-5 rounded-full font-bold text-xl hover:bg-white transition-all shadow-xl hover:shadow-2xl flex items-center justify-center gap-3 group">
            اطلب نسختك التجريبية
            <ArrowLeft className="w-6 h-6 group-hover:-translate-x-1 transition-transform" />
          </button>
          <div className="mt-8 text-white/50 text-sm flex items-center gap-2">
             <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
             نعمل حالياً بنظام الدعوات المحدودة
          </div>
        </div>
      </div>
    </section>
  );
}
