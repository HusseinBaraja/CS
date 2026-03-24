import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Bot, Search, TrendingUp, UserCircle, Zap } from '../icons';

gsap.registerPlugin(ScrollTrigger);

export function TrustSection() {
  const container = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      // Ambient slow rotation for background glow
      gsap.to(".ambient-glow", {
        rotate: 360,
        duration: 25,
        repeat: -1,
        ease: "linear",
      });

      gsap.to(".ambient-glow-slow-reverse", {
        rotate: -360,
        duration: 30,
        repeat: -1,
        ease: "linear",
      });

      // Text section reveals
      gsap.from(".trust-text-element", {
        scrollTrigger: {
          trigger: container.current,
          start: "top 75%",
        },
        y: 45,
        opacity: 0,
        duration: 1,
        stagger: 0.12,
        ease: "power4.out",
      });

      // Chat orchestration sequence
      const flowTl = gsap.timeline({
        scrollTrigger: {
          trigger: ".trust-visual-container",
          start: "top 65%",
        },
      });

      // 1. Light glass container drops in
      flowTl.from(".trust-interface-bg", {
        scale: 0.96,
        opacity: 0,
        duration: 1.2,
        ease: "expo.out",
        clearProps: "all"
      });

      // 2. Customer message slides in with 3D tilt
      flowTl.from(".message-customer", {
        y: 25,
        opacity: 0,
        rotationX: -15,
        transformOrigin: "bottom center",
        duration: 0.8,
        ease: "back.out(1.2)",
      }, "-=0.6");

      // 3. First segment of data pipeline
      flowTl.from(".pipeline-line-1", {
        scaleY: 0,
        transformOrigin: "top center",
        duration: 0.6,
        ease: "power2.inOut",
      }, "-=0.2");

      flowTl.from(".pipeline-node-1", {
        scale: 0,
        opacity: 0,
        duration: 0.4,
        ease: "back.out(2.5)",
      }, "-=0.2");

      // 4. RAG Engine Card pop
      flowTl.from(".data-card", {
        y: 35,
        opacity: 0,
        scale: 0.92,
        filter: "blur(8px)",
        duration: 0.8,
        ease: "power3.out",
      }, "-=0.1");

      // Intricate stagger for interior data items
      flowTl.from(".data-card-item", {
        opacity: 0,
        x: -15,
        duration: 0.5,
        stagger: 0.1,
        ease: "power2.out",
      }, "-=0.4");

      // 5. Second data pipeline
      flowTl.from(".pipeline-line-2", {
        scaleY: 0,
        transformOrigin: "top center",
        duration: 0.5,
        ease: "power2.inOut",
      }, "-=0.1");

      flowTl.from(".pipeline-node-2", {
        scale: 0,
        opacity: 0,
        duration: 0.4,
        ease: "back.out(2.5)",
      }, "-=0.2");

      // 6. Bot Response appearance
      flowTl.from(".message-bot", {
        y: 25,
        opacity: 0,
        rotationX: 15,
        transformOrigin: "top left",
        duration: 0.8,
        ease: "back.out(1.2)",
      }, "-=0.1");
    },
    { scope: container }
  );

  return (
    <section ref={container} className="py-24 md:py-32 relative overflow-hidden" id="usecase">
      <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center">
        
        {/* Right Content - Editorial Typography */}
        <div className="order-2 lg:order-1 relative z-10">
          <h2 className="trust-text-element text-4xl md:text-5xl lg:text-5xl xl:text-6xl font-black text-primary mb-6 leading-[1.15] tracking-tight">
            مصمم لطبيعة الاستفسارات
            <br />
            <span className="text-transparent bg-clip-text bg-linear-to-r from-secondary via-amber-600 to-amber-700">في اليمن.</span>
          </h2>
          
          <p className="trust-text-element text-[1.15rem] text-primary/75 mb-6 leading-relaxed font-semibold">
            سواء كنت تبيع المواد الغذائية، الملابس، أو المواد البلاستيكية. العميل يسأل عادة بطريقة غير مرتبة <span className="text-primary font-black bg-primary/5 px-2 py-0.5 rounded-md">("بكم المنتج الفلاني؟").</span>
          </p>
          
          <p className="trust-text-element text-lg text-primary/60 mb-12 leading-relaxed font-medium">
            النظام مبرمج ليحلل قصد العميل بدقة، ثم يستخرج المنتج الصحيح من مئات الأصناف لديك، ويعرض له السعر، الموصفات، وصورة حقيقية فوراً، مما يقلص مدة دورة المبيعات من ساعات إلى ثوانٍ.
          </p>

          <div className="trust-text-element grid grid-cols-2 gap-8 pt-8 border-t border-primary/10">
            <div className="flex flex-col gap-2 relative">
              <div className="flex items-center gap-2 text-secondary mb-1">
                <TrendingUp className="w-5 h-5 shrink-0" />
                <span className="text-xs font-bold uppercase tracking-wider">الأداء</span>
              </div>
              <div className="font-black text-5xl lg:text-6xl text-primary tracking-tight" style={{ fontFeatureSettings: '"tnum"' }}>+80<span className="text-2xl lg:text-3xl text-primary/40 font-bold ml-1">%</span></div>
              <div className="text-sm text-primary/60 font-semibold mt-1">أتمتة كاملة للردود</div>
              
              {/* Subtle divider for grid */}
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-px h-16 bg-primary/10 hidden md:block" />
            </div>
            
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-primary mb-1">
                <Zap className="w-5 h-5 shrink-0" />
                <span className="text-xs font-bold uppercase tracking-wider">السرعة</span>
              </div>
              <div className="font-black text-5xl lg:text-6xl text-primary tracking-tight" style={{ fontFeatureSettings: '"tnum"' }}>&lt; 3<span className="text-2xl lg:text-3xl text-primary/40 font-bold ml-1">ث</span></div>
              <div className="text-sm text-primary/60 font-semibold mt-1">زمن الاستجابة</div>
            </div>
          </div>
        </div>

        {/* Left Content - Refined Light Mode SaaS Aesthetic */}
        <div className="order-1 lg:order-2 trust-visual-container relative w-full aspect-square md:aspect-4/3 lg:aspect-4/5 xl:aspect-square max-w-lg mx-auto rounded-[2.5rem] flex items-center justify-center p-6 md:p-10 perspective-distant">
          
          {/* Soft Light Background Container */}
          <div className="trust-interface-bg absolute inset-0 bg-linear-to-br from-[#FAFAFA] via-[#F3F4F6] to-[#E5E7EB] rounded-[2.5rem] border border-primary/5 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] overflow-hidden">
            {/* Ambient Lighting Orbs */}
            <div className="ambient-glow absolute -top-[30%] -left-[30%] w-[90%] h-[90%] rounded-full bg-secondary/20 blur-[120px] pointer-events-none" />
            <div className="ambient-glow-slow-reverse absolute -bottom-[20%] -right-[20%] w-[70%] h-[70%] rounded-full bg-emerald-500/15 blur-[100px] pointer-events-none" />
            
            {/* Engineer Grid Pattern */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.03)_1px,transparent_1px)] bg-size-[32px_32px] mask-[radial-gradient(ellipse_60%_60%_at_50%_50%,#000_10%,transparent_100%)] opacity-80 pointer-events-none" />
          </div>

          {/* Chat Flow & Data Orchestration Stack */}
          <div className="relative z-10 w-full max-w-sm xl:max-w-md flex flex-col items-center select-none" dir="rtl">
            
            {/* 1. Customer Message */}
            <div className="message-customer self-start w-[88%] flex gap-3.5 items-end mb-2">
              <div className="w-9 h-9 rounded-full bg-white border border-primary/10 flex items-center justify-center shrink-0 shadow-sm">
                <UserCircle className="w-5 h-5 text-primary/50" />
              </div>
              <div className="flex-1">
                <div className="bg-white/80 backdrop-blur-xl border border-primary/10 px-5 py-4 rounded-3xl rounded-br-sm shadow-[0_8px_32px_-8px_rgba(0,0,0,0.06)]">
                  <p className="text-primary/95 font-semibold text-[15px] leading-snug">
                    بكم أكواب السفري؟
                  </p>
                  <div className="text-[10px] text-primary/40 mt-1.5 text-left font-mono font-medium tracking-wide">
                    10:41 ص
                  </div>
                </div>
              </div>
            </div>

            {/* Pipeline Segment 1 */}
            <div className="flex flex-col items-center h-10 xl:h-12 w-full">
              <div className="pipeline-line-1 w-px h-full bg-linear-to-b from-primary/10 via-secondary/70 to-secondary/30 relative">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-5 bg-secondary rounded-full filter blur-[1px] shadow-[0_0_8px_rgba(227,178,60,0.6)] animate-[flowPacket_1.6s_infinite_linear]" />
              </div>
            </div>
            <div className="pipeline-node-1 relative z-10 flex items-center justify-center">
              <div className="w-2.5 h-2.5 rounded-full bg-secondary shadow-[0_0_12px_rgba(227,178,60,0.6)]" />
              <div className="absolute w-6 h-6 rounded-full border border-secondary/40 animate-ping opacity-60" style={{ animationDuration: '2s' }} />
            </div>

            {/* 2. RAG Data Card (The Engine) */}
            <div className="data-card relative w-full p-px rounded-3xl bg-linear-to-b from-white/60 to-white/20 mt-2.5 mb-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.06)]">
              
              <div className="relative bg-white/70 backdrop-blur-xl rounded-[23px] p-5 xl:p-6 overflow-hidden border border-white/50">
                {/* Decoration ray */}
                <div className="absolute top-0 right-10 w-32 h-px bg-linear-to-r from-transparent via-white to-transparent opacity-60" />
                
                {/* Card Header */}
                <div className="flex justify-between items-start gap-4 mb-5">
                  <div className="flex gap-3.5 items-center">
                    <div className="w-11 h-11 rounded-xl bg-linear-to-br from-secondary/15 to-secondary/5 border border-secondary/20 flex items-center justify-center shadow-sm shrink-0">
                      <Search className="w-5 h-5 text-secondary" />
                    </div>
                    <div>
                      <div className="text-primary/60 text-xs font-semibold mb-1">الصنف المستخرج</div>
                      <h4 className="text-primary font-bold text-sm xl:text-[15px] leading-tight flex items-center gap-2">أكواب سفري باك</h4>
                    </div>
                  </div>
                  
                  {/* Match Badge */}
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary/8 border border-secondary/25 shadow-sm shrink-0 mt-0.5">
                    <Zap className="w-3.5 h-3.5 text-secondary animate-[pulse_2s_infinite]" />
                    <span className="text-xs font-mono font-bold text-secondary tracking-tight">98%</span>
                  </div>
                </div>

                {/* Structured Data Grid */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="data-card-item bg-primary/2 border border-primary/4 rounded-xl p-3 flex flex-col justify-between">
                    <div className="text-primary/60 text-xs font-semibold mb-1.5">النوع</div>
                    <div className="text-primary/90 text-xs xl:text-[13px] font-bold">8 أونص (100 حبة)</div>
                  </div>
                  <div className="data-card-item bg-primary/2 border border-primary/4 rounded-xl p-3 flex flex-col justify-between">
                    <div className="text-primary/60 text-xs font-semibold mb-1.5">السعر</div>
                    <div className="text-emerald-600 text-xs xl:text-[13px] font-black" style={{ fontFeatureSettings: '"tnum"' }}>18,000 ريال</div>
                  </div>
                  <div className="data-card-item col-span-2 bg-linear-to-r from-emerald-500/5 to-transparent border border-emerald-500/15 rounded-xl p-3.5 flex justify-between items-center relative overflow-hidden">
                    {/* Tiny green accent line */}
                    <div className="absolute top-0 right-0 w-1 h-full bg-emerald-500/40" />
                    
                    <div className="flex items-center gap-2.5">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" />
                      <span className="text-primary/60 text-xs font-medium uppercase tracking-wide">المخزون</span>
                    </div>
                    <span className="text-emerald-600 text-xs font-bold uppercase tracking-wide">متوفر ✓</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Pipeline Segment 2 */}
            <div className="pipeline-node-2 relative z-10 flex items-center justify-center">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)]" />
              <div className="absolute w-6 h-6 rounded-full border border-emerald-500/40 animate-ping opacity-60" style={{ animationDuration: '2s', animationDelay: '0.5s' }} />
            </div>
            <div className="flex flex-col items-center h-10 xl:h-12 w-full">
              <div className="pipeline-line-2 w-px h-full bg-linear-to-b from-emerald-500/50 to-emerald-500/10 relative">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-5 bg-emerald-500 rounded-full filter blur-[1px] shadow-[0_0_8px_rgba(16,185,129,0.6)] animate-[flowPacket_1.6s_infinite_linear_0.8s]" />
              </div>
            </div>

            {/* 3. Bot Response Bubble */}
            <div className="message-bot self-end w-[92%] flex gap-3.5 items-end mt-2">
              <div className="flex-1">
                <div className="bg-[#E8F8F1]/90 backdrop-blur-xl border border-emerald-500/20 px-5 py-4.5 rounded-3xl rounded-bl-sm shadow-[0_12px_32px_-8px_rgba(0,0,0,0.06)]">
                  <p className="text-primary/90 font-semibold text-[14.5px] leading-relaxed">
                    أهلاً بك! سعر كرتون أكواب السفري (8 أونص) هو <strong className="text-emerald-700 font-extrabold mx-1 px-1.5 py-0.5 rounded-md bg-emerald-500/10">18,000 ريال</strong>. هل ترغب بصورة للمنتج؟
                  </p>
                  <div className="text-[10px] text-emerald-600/60 mt-2.5 flex justify-end items-center gap-1.5 font-mono font-medium">
                    <span className="tracking-tighter font-black">✓✓</span> 10:41 ص
                  </div>
                </div>
              </div>
              <div className="w-9 h-9 rounded-full bg-linear-to-b from-emerald-500 to-emerald-600 flex items-center justify-center shrink-0 shadow-[0_4px_12px_rgba(16,185,129,0.3)] border border-emerald-400/40 relative">
                <div className="absolute inset-0 rounded-full border border-white/40 mix-blend-overlay" />
                <Bot className="w-4 h-4 text-white drop-shadow-sm" />
              </div>
            </div>

          </div>
        </div>
      </div>
      
      <style>{`
        @keyframes flowPacket {
          0% { top: 0; opacity: 1; transform: translateX(-50%) scaleY(1); }
          80% { top: 100%; opacity: 0.8; transform: translateX(-50%) scaleY(1.2); }
          100% { top: 100%; opacity: 0; transform: translateX(-50%) scaleY(0.5); }
        }
      `}</style>
    </section>
  );
}
