import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { BarChart, Building2, Coins, Database, MessageCircle } from '../icons';

gsap.registerPlugin(ScrollTrigger);

const DIFFS = [
  {
    icon: <Database className="w-8 h-8 text-[#1A2E27]" />,
    title: "مبني على بياناتك",
    desc: "لا هلوسة. لا يقترح البوت منتجات منافسة أو أسعاراً وهمية. أجوبته مقيدة بنسبة 100% بالكتالوج الذي تقدمه."
  },
  {
    icon: <MessageCircle className="w-8 h-8 text-[#1A2E27]" />,
    title: "مصمم للواتساب الأساسي",
    desc: "يدعم Baileys لجهات العمل التي لم تنتقل بعد للواتساب الرسمي، مما يضمن خفض التكلفة الأولية للتجربة."
  },
  {
    icon: <Building2 className="w-8 h-8 text-[#1A2E27]" />,
    title: "متعدد الشركات",
    desc: "بنية تحتية (Multi-tenant) آمنة تعزل بياناتك بالكامل في سيرفراتنا المبنية على Convex."
  },
  {
    icon: <BarChart className="w-8 h-8 text-[#1A2E27]" />,
    title: "تحليلات للمالك",
    desc: "احصل على تقارير عبر الواتساب بأكثر المنتجات طلباً، وسرعة الرد، ونسبة التدخل البشري."
  },
  {
    icon: <Coins className="w-8 h-8 text-[#1A2E27]" />,
    title: "تكلفة تشغيل شبه معدومة",
    desc: "نعتمد على نماذج قوية واقتصادية مثل DeepSeek V3 و Gemini لنوفر لك سعراً لا يُنافس في السوق."
  }
];

export function DifferentiatorSection() {
  const container = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    gsap.from('.diff-card', {
      scrollTrigger: {
        trigger: container.current,
        start: 'top 70%',
      },
      scale: 0.9,
      opacity: 0,
      duration: 0.8,
      stagger: 0.1,
      ease: 'power3.out'
    });
  }, { scope: container });

  return (
    <section ref={container} className="py-24 bg-bg-light border-t border-[#1A2E27]/5">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-black text-[#1A2E27] mb-6">ما الذي يجعلنا مختلفين؟</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {DIFFS.map((diff, idx) => (
             // Span the first two cards on tablet/desktop nicely if needed, or just let auto CSS grid handle it
             <div key={idx} className={`diff-card bg-white p-8 rounded-3xl border border-[#1A2E27]/10 shadow-sm hover:shadow-md transition-shadow`}>
               <div className="w-16 h-16 bg-[#E3B23C]/20 rounded-2xl flex items-center justify-center mb-6">
                 {diff.icon}
               </div>
               <h3 className="text-xl font-bold text-[#1A2E27] mb-3">{diff.title}</h3>
               <p className="text-[#1A2E27]/60 leading-relaxed text-lg">{diff.desc}</p>
             </div>
          ))}
        </div>
      </div>
    </section>
  );
}
