import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { CheckCircle2, Globe2, ShieldCheck, Zap } from '../icons';

gsap.registerPlugin(ScrollTrigger);

const FEATURES = [
  {
    icon: <Zap className="w-6 h-6 text-[#1A2E27]" />,
    title: "مساعد يعمل على مدار الساعة",
    desc: "لا مزيد من رسائل 'نحن خارج أوقات الدوام'. المساعد الذكي جاهز للرد في أي ثانية، نهاراً أو ليلاً."
  },
  {
    icon: <ShieldCheck className="w-6 h-6 text-[#1A2E27]" />,
    title: "لا مجال للتأليف أو الخطأ",
    desc: "نظامنا يعتمد مباشرة على منتجاتك المخزنة. إذا لم يجد المنتج، سيخبر العميل أو يحول المحادثة إليك."
  },
  {
    icon: <Globe2 className="w-6 h-6 text-[#1A2E27]" />,
    title: "يفهم العربية والإنجليزية",
    desc: "يدرك السياق ويجيب بنفس لغة العميل. يدعم اللهجات المحلية بذكاء ودقة مبهرة."
  },
  {
    icon: <CheckCircle2 className="w-6 h-6 text-[#1A2E27]" />,
    title: "تحويل سلس للبشر",
    desc: "عندما يطلب العميل التحدث لموظف مبيعات، يصمت البوت فوراً ويرسل إليك إشعاراً لتستكمل أنت المحادثة."
  }
];

export function SolutionSection() {
  const container = useRef<HTMLDivElement>(null);
  
  useGSAP(() => {
    // Reveal header
    gsap.from('.sol-header', {
      scrollTrigger: {
        trigger: container.current,
        start: 'top 75%',
      },
      y: 30,
      opacity: 0,
      duration: 0.8,
      stagger: 0.1,
      ease: 'power3.out'
    });

    // Reveal Grid Items
    gsap.from('.sol-card', {
      scrollTrigger: {
        trigger: '.sol-grid',
        start: 'top 80%',
      },
      scale: 0.95,
      y: 40,
      opacity: 0,
      duration: 0.8,
      stagger: 0.1,
      ease: 'back.out(1.2)'
    });

  }, { scope: container });

  return (
    <section ref={container} className="py-24 md:py-32 bg-[#1A2E27] relative overflow-hidden text-white" id="features">
      
      {/* Absolute graphic background element */}
      <div className="absolute top-0 right-0 w-full h-full opacity-5 pointer-events-none" 
           style={{ 
             backgroundImage: 'linear-gradient(45deg, #E3B23C 25%, transparent 25%, transparent 75%, #E3B23C 75%, #E3B23C), linear-gradient(45deg, #E3B23C 25%, transparent 25%, transparent 75%, #E3B23C 75%, #E3B23C)',
             backgroundSize: '80px 80px',
             backgroundPosition: '0 0, 40px 40px'
           }} />

      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="sol-header inline-flex items-center px-4 py-2 rounded-full bg-white/10 text-[#E3B23C] font-bold text-sm mb-6 border border-white/10">
            الحل الذكي
          </div>
          <h2 className="sol-header text-4xl md:text-5xl font-black mb-6 leading-tight">
            نظام <span className="text-[#E3B23C]">قوي ومعتمد</span><br />
            لمبيعات الجملة والتجزئة.
          </h2>
          <p className="sol-header text-xl text-white/70 leading-relaxed max-w-2xl mx-auto font-medium">
            نقلة نوعية في تجربة العميل. كل رسالة يتم الرد عليها بتفصيل دقيق، معتمد على الكتالوج الذي رفعته مسبقاً وبأقل تكلفة تشغيل ممكنة.
          </p>
        </div>

        <div className="sol-grid grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
          {FEATURES.map((feat, idx) => (
            <div key={idx} className="sol-card bg-white/5 border border-white/10 p-8 rounded-[32px] hover:bg-white/10 transition-colors duration-300 group">
              <div className="w-14 h-14 bg-[#E3B23C] rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300">
                {feat.icon}
              </div>
              <h3 className="text-2xl font-bold mb-3">{feat.title}</h3>
              <p className="text-white/60 leading-relaxed text-lg">{feat.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
