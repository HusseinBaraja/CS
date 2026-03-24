import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Clock, Frown, MessageSquareOff } from '../icons';

gsap.registerPlugin(ScrollTrigger);

const CHAOS_MESSAGES = [
  {
    text: "متى تفتحون؟",
    style: { top: "34%", right: "6%" },
  },
  {
    text: "عندكم توصيل لصنعاء؟",
    style: { bottom: "16%", right: "14%" },
  },
  {
    text: "بكم ذا الكرتون؟",
    style: { bottom: "8%", left: "28%" },
  },
  {
    text: "ممكن صوره واضحه؟",
    style: { bottom: "32%", left: "4%" },
  },
  {
    text: "ردوا بسرعة لو سمحتم!",
    style: { top: "28%", left: "8%" },
  },
  {
    text: "ألووو",
    style: { top: "10%", left: "38%" },
  },
  {
    text: "كم سعر الجملة؟",
    style: { top: "18%", right: "18%" },
  },
] as const;

export function ProblemSection() {
  const container = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      // Reveal text
      gsap.from(".problem-text", {
        scrollTrigger: {
          trigger: container.current,
          start: "top 75%",
        },
        y: 30,
        opacity: 0,
        stagger: 0.15,
        duration: 0.8,
        ease: "power3.out",
      });

      // Chaos bubbles pop in randomly
      gsap.from(".chaos-bubble", {
        scrollTrigger: {
          trigger: ".chaos-container",
          start: "top 70%",
        },
        scale: 0,
        opacity: 0,
        rotation: () => gsap.utils.random(-10, 10),
        x: () => gsap.utils.random(-50, 50),
        y: () => gsap.utils.random(-30, 30),
        duration: 0.6,
        stagger: 0.1,
        ease: "back.out(1.7)",
      });

      // Cards stagger in
      gsap.from(".pain-card", {
        scrollTrigger: {
          trigger: ".pain-cards-container",
          start: "top 80%",
        },
        y: 40,
        opacity: 0,
        stagger: 0.15,
        duration: 0.8,
        ease: "power3.out",
      });
    },
    { scope: container },
  );

  return (
    <section
      ref={container}
      className="py-24 md:py-32 relative"
      id="problem"
    >
      <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
        {/* Right Content (RTL) */}
        <div>
          <h2 className="problem-text text-4xl md:text-5xl font-black text-primary mb-6 leading-tight">
            الرد اليدوي يضيع وقتك
            <br /> <span className="text-red-600/80">ويخسرك مبيعات.</span>
          </h2>
          <p className="problem-text text-xl text-primary/70 mb-10 leading-relaxed font-medium">
            قد تصلك مئات الرسائل يومياً تسأل نفس الأسئلة. وتأخرك في الرد يعني
            ذهاب عميلك لمنافسك. فتضطر للإجابة حتى خارج أوقات العمل لتدارك
            الأمر.
          </p>

          <div className="pain-cards-container grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="pain-card bg-white p-6 rounded-2xl border border-primary/5 shadow-sm">
              <Clock className="w-8 h-8 text-red-500 mb-4" />
              <h3 className="text-lg font-bold text-primary mb-2">
                وقت ضائع
              </h3>
              <p className="text-primary/60 text-sm leading-relaxed">
                ساعات يومياً تضيع في نسخ ولصق تفاصيل المنتجات وصورها.
              </p>
            </div>
            <div className="pain-card bg-white p-6 rounded-2xl border border-primary/5 shadow-sm">
              <MessageSquareOff className="w-8 h-8 text-red-500 mb-4" />
              <h3 className="text-lg font-bold text-primary mb-2">
                فرص ضائعة
              </h3>
              <p className="text-primary/60 text-sm leading-relaxed">
                التأخير في الرد يعني غالباً فقدان العميل واهتزاز الثقة.
              </p>
            </div>
          </div>
        </div>

        {/* Left Content - Abstract visual of message chaos */}
        <div className="chaos-container relative h-112.5 bg-white rounded-[40px] border border-primary/5 overflow-hidden flex items-center justify-center shadow-lg">
          {/* subtle background pattern */}
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage:
                "radial-gradient(circle at center, #1A2E27 1.5px, transparent 1.5px)",
              backgroundSize: "24px 24px",
            }}
          />

          <div className="relative w-full h-full flex items-center justify-center p-8">
            {/* Center anchor icon representing the overwhelmed owner */}
            <div className="absolute z-10 w-20 h-20 bg-white rounded-full shadow-lg border border-red-100 flex items-center justify-center">
              <Frown className="w-10 h-10 text-red-400" />
            </div>

            {/* Floating random bubbles */}
            {CHAOS_MESSAGES.map((message, idx) => (
              <div
                key={idx}
                className="chaos-bubble absolute bg-white px-4 py-3 rounded-2xl shadow-md text-[15px] font-bold text-primary whitespace-nowrap border border-black/5 z-20"
                style={message.style}
              >
                {message.text}
                <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-red-500 flex items-center justify-center text-[10px] text-white font-bold border-2 border-white shadow-sm">
                  1
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
