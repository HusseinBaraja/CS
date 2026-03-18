import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Bot, PackageOpen, TrendingUp } from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

export function TrustSection() {
  const container = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      gsap.from(".trust-element", {
        scrollTrigger: {
          trigger: container.current,
          start: "top 75%",
        },
        y: 40,
        opacity: 0,
        duration: 0.8,
        stagger: 0.15,
        ease: "power3.out",
      });
    },
    { scope: container },
  );

  return (
    <section
      ref={container}
      className="py-24 md:py-32 bg-white relative overflow-hidden"
      id="usecase"
    >
      <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
        {/* Right Content (RTL) - The Context */}
        <div className="order-2 lg:order-1">
          <h2 className="trust-element text-3xl md:text-5xl font-black text-primary mb-6 leading-tight">
            مصمم لطبيعة الاستفسارات
            <br /> <span className="text-secondary">في اليمن.</span>
          </h2>
          <p className="trust-element text-xl text-primary/70 mb-8 leading-relaxed font-medium">
            سواء كنت تبيع الأكياس البلاستيكية، العلب، أو المواد الغذائية
            بالجملة.. العميل يسأل عادة بطريقة غير مرتبة ("بكم علب البرجر؟").
          </p>
          <p className="trust-element text-xl text-primary/70 mb-10 leading-relaxed font-medium">
            النظام مبرمج ليحلل النية بدقة، يستخرج المنتج الصحيح من مئات الأصناف
            لديك، ويعرض له السعر، الموصفات، وصورة حقيقية فوراً، مما يقلص مدة
            دورة المبيعات من ساعات إلى ثوانٍ.
          </p>

          <div className="trust-element flex items-center gap-6 pt-6 border-t border-primary/10">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-secondary" />
              </div>
              <div>
                <div className="font-bold text-2xl text-primary">+80%</div>
                <div className="text-sm text-primary/60">أتمتة للردود</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center">
                <Bot className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="font-bold text-2xl text-primary">&lt; 3ث</div>
                <div className="text-sm text-primary/60">سرعة الرد</div>
              </div>
            </div>
          </div>
        </div>

        {/* Left Content - Abstract visualization of catalog matching */}
        <div className="order-1 lg:order-2 trust-element relative h-125 w-full bg-bg-light rounded-[40px] border border-primary/5 overflow-hidden flex items-center justify-center p-8">
          <div className="w-full max-w-sm flex flex-col gap-6 relative z-10">
            {/* User Input Mock */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-black/5 self-end w-3/4 flex justify-between items-center">
              <span className="font-medium text-primary">
                بكم أكواب الكرافت؟
              </span>
              <div className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center shrink-0">
                <span className="text-xs">👤</span>
              </div>
            </div>

            {/* The "AI Brain" connecting them */}
            <div className="flex justify-center -my-2 opacity-50">
              <div className="w-0.5 h-12 bg-dashed bg-[#115C42]"></div>
            </div>

            {/* Search Match Result (RAG visualization) */}
            <div className="bg-primary p-4 rounded-2xl shadow-lg self-start w-[90%] flex gap-4 items-center">
              <div className="w-16 h-16 bg-white/10 rounded-xl flex items-center justify-center shrink-0">
                <PackageOpen className="w-8 h-8 text-secondary" />
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-white font-bold text-sm">
                    أكواب كرافت دبل (مضلع)
                  </span>
                  <span className="text-secondary text-xs px-2 py-0.5 bg-secondary/10 rounded-full">
                    نسبة مطابقة 98%
                  </span>
                </div>
                <span className="text-white/60 text-xs line-clamp-2">
                  الصنف: مضلع 8 أونص. السعر: 18000 ريال للكرتون. متوفر بالمخزن.
                </span>
              </div>
            </div>

            {/* The "AI Brain" connecting them */}
            <div className="flex justify-center -my-2 opacity-50">
              <div className="w-0.5 h-12 bg-dashed bg-[#115C42]"></div>
            </div>

            {/* Final Output Mock */}
            <div className="bg-[#D9FDD3] p-4 rounded-2xl shadow-sm border border-black/5 self-start w-3/4 flex gap-3 items-center">
              <div className="w-8 h-8 bg-[#115C42] rounded-full flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <span className="font-medium text-primary text-sm leading-relaxed">
                أهلاً بك! سعر كرتون أكواب الكرافت المضلع (8 أونص) هو 18,000
                ريال. هل ترغب بصورة للمنتج؟
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
