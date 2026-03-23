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
      // Text side entrance
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

      // Chat flow staggered entrance
      const flowTl = gsap.timeline({
        scrollTrigger: {
          trigger: ".trust-flow-container",
          start: "top 80%",
        },
      });

      // 1. Customer bubble slides in
      flowTl.from(".trust-bubble-customer", {
        x: 40,
        opacity: 0,
        duration: 0.7,
        ease: "power3.out",
      });

      // 2. First connection line drawsmo
      flowTl.from(
        ".trust-line-1",
        {
          scaleY: 0,
          transformOrigin: "top center",
          duration: 0.5,
          ease: "power2.inOut",
        },
        "-=0.2",
      );

      // 3. First pulse node appears
      flowTl.from(
        ".trust-node-1",
        { scale: 0, opacity: 0, duration: 0.3, ease: "back.out(2)" },
        "-=0.1",
      );

      // 4. AI card scales up with slight rotation
      flowTl.from(
        ".trust-ai-card",
        {
          scale: 0.85,
          opacity: 0,
          rotateX: 8,
          duration: 0.8,
          ease: "power3.out",
        },
        "-=0.1",
      );

      // 5. Second connection line draws
      flowTl.from(
        ".trust-line-2",
        {
          scaleY: 0,
          transformOrigin: "top center",
          duration: 0.5,
          ease: "power2.inOut",
        },
        "-=0.3",
      );

      // 6. Second pulse node appears
      flowTl.from(
        ".trust-node-2",
        { scale: 0, opacity: 0, duration: 0.3, ease: "back.out(2)" },
        "-=0.1",
      );

      // 7. Bot bubble pops in
      flowTl.from(
        ".trust-bubble-bot",
        {
          x: -40,
          opacity: 0,
          duration: 0.7,
          ease: "back.out(1.4)",
        },
        "-=0.1",
      );
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
            سواء كنت تبيع المواد الغذائية، الملابس، أو المواد البلاستيكية.
            العميل يسأل عادة بطريقة غير مرتبة ("بكم المنتج الفلاني؟").
          </p>
          <p className="trust-element text-xl text-primary/70 mb-10 leading-relaxed font-medium">
            النظام مبرمج ليحلل قصد العميل بدقة، ثم يستخرج المنتج الصحيح من مئات
            الأصناف لديك، ويعرض له السعر، الموصفات، وصورة حقيقية فوراً، مما يقلص
            مدة دورة المبيعات من ساعات إلى ثوانٍ.
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

        {/* Left Content - Premium Chat Flow Visualization */}
        <div className="order-1 lg:order-2 trust-element relative min-h-[600px] w-full bg-bg-light rounded-[40px] border border-primary/5 overflow-hidden flex items-center justify-center p-8 md:p-12 lg:p-16">
          {/* Subtle ambient background glow */}
          <div className="absolute top-8 left-1/3 w-48 h-48 bg-secondary/8 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-12 right-1/4 w-36 h-36 bg-primary/5 rounded-full blur-2xl pointer-events-none" />

          <div className="trust-flow-container w-full max-w-sm flex flex-col items-center relative z-10">
            {/* ─── Customer Message Bubble ─── */}
            <div className="trust-bubble-customer self-end w-4/5 flex gap-3 items-start">
              <div className="flex-1 relative">
                <div
                  className="bg-white p-4 rounded-2xl rounded-tr-sm leading-relaxed"
                  style={{
                    boxShadow:
                      "0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.03)",
                  }}
                >
                  <span className="font-semibold text-primary text-[15px]">
                    بكم أكواب السفري؟
                  </span>
                  <div className="text-[10px] text-primary/35 mt-2 text-left font-medium">
                    10:41
                  </div>
                </div>
              </div>
              {/* Avatar */}
              <div className="w-9 h-9 rounded-full bg-primary/8 flex items-center justify-center shrink-0 ring-2 ring-primary/10">
                <UserCircle className="w-5 h-5 text-primary/50" />
              </div>
            </div>

            {/* ─── Connection Line 1 + Node ─── */}
            <div className="flex flex-col items-center py-1">
              <div className="trust-line-1 w-px h-8 bg-gradient-to-b from-primary/15 to-secondary/30" />
              <div className="trust-node-1 pulse-node w-2.5 h-2.5 rounded-full bg-secondary" />
              <div className="trust-line-1 w-px h-8 bg-gradient-to-b from-secondary/30 to-primary/15" />
            </div>

            {/* ─── AI Product Card (RAG Result) ─── */}
            <div
              className="trust-ai-card relative w-full rounded-2xl overflow-hidden"
              style={{
                background:
                  "linear-gradient(145deg, #1A2E27 0%, #162822 50%, #1A2E27 100%)",
                boxShadow:
                  "0 8px 32px rgba(26,46,39,0.25), 0 2px 8px rgba(26,46,39,0.15), inset 0 1px 0 rgba(255,255,255,0.06)",
              }}
            >
              <div className="p-5 flex gap-4 items-start relative z-10">
                {/* Icon container */}
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0 float-subtle"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(227,178,60,0.15) 0%, rgba(227,178,60,0.05) 100%)",
                    border: "1px solid rgba(227,178,60,0.2)",
                  }}
                >
                  <Search className="w-7 h-7 text-secondary" />
                </div>

                <div className="flex-1 min-w-0">
                  {/* Header row */}
                  <div className="flex justify-between items-start gap-2 mb-2">
                    <span className="text-white font-bold text-sm leading-snug">
                      أكواب سفري باك (100 حبه)
                    </span>
                    {/* Confidence badge */}
                    <span
                      className="text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 whitespace-nowrap"
                      style={{
                        background:
                          "linear-gradient(135deg, rgba(227,178,60,0.2) 0%, rgba(227,178,60,0.1) 100%)",
                        color: "#E3B23C",
                        border: "1px solid rgba(227,178,60,0.25)",
                        boxShadow: "0 0 10px rgba(227,178,60,0.2)",
                      }}
                    >
                      <Zap className="w-3 h-3 inline-block ml-1 -mt-0.5" />
                      مطابقة: 98%
                    </span>
                  </div>

                  {/* Product details */}
                  <div className="space-y-1 mt-2">
                    <div className="flex items-center gap-2">
                      <span className="w-1 h-1 rounded-full bg-secondary/60 shrink-0" />
                      <span className="text-white/55 text-xs">
                        الصنف: 8 أونص
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-1 h-1 rounded-full bg-secondary/60 shrink-0" />
                      <span className="text-white/55 text-xs">
                        السعر: 18,000 ريال للكرتون
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-1 h-1 rounded-full bg-emerald-400/60 shrink-0" />
                      <span className="text-emerald-400/70 text-xs font-medium">
                        متوفر بالمخزن ✓
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ─── Connection Line 2 + Node ─── */}
            <div className="flex flex-col items-center py-1">
              <div className="trust-line-2 w-px h-8 bg-gradient-to-b from-primary/15 to-secondary/30" />
              <div
                className="trust-node-2 pulse-node w-2.5 h-2.5 rounded-full bg-secondary"
                style={{ animationDelay: "0.7s" }}
              />
              <div className="trust-line-2 w-px h-8 bg-gradient-to-b from-secondary/30 to-[#D9FDD3]/50" />
            </div>

            {/* ─── Bot Response Bubble ─── */}
            <div className="trust-bubble-bot self-start w-[88%] flex gap-3 items-start">
              {/* Bot avatar */}
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                style={{
                  background:
                    "linear-gradient(135deg, #115C42 0%, #0D4A35 100%)",
                  boxShadow: "0 2px 8px rgba(17,92,66,0.3)",
                }}
              >
                <Bot className="w-4 h-4 text-white" />
              </div>

              <div className="flex-1 relative">
                <div
                  className="bg-[#D9FDD3] p-4 rounded-2xl rounded-tl-sm leading-relaxed"
                  style={{
                    boxShadow:
                      "0 1px 2px rgba(0,0,0,0.03), 0 4px 16px rgba(0,0,0,0.05), 0 0 0 1px rgba(0,0,0,0.02)",
                  }}
                >
                  <span className="font-medium text-primary text-[14px] leading-[1.7]">
                    أهلاً بك! سعر كرتون أكواب السفري (8 أونص) هو 18,000
                    ريال. هل ترغب بصورة للمنتج؟
                  </span>
                  <div className="text-[10px] text-emerald-700/50 mt-2 text-left flex justify-end items-center gap-1 font-medium">
                    ✓✓ 10:41
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
