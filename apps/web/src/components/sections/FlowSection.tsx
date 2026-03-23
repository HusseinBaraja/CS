import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Bot, ImageIcon, Search, UserCircle } from '../icons';

gsap.registerPlugin(ScrollTrigger);

const STEPS = [
  {
    icon: <Search className="w-5 h-5" />,
    title: "1. فهم واستعلام",
    desc: "العميل يسأل بطريقته. البوت يحلل الطلب ويبحث في قاعدة البيانات عن المنتج الأنسب."
  },
  {
    icon: <Bot className="w-5 h-5" />,
    title: "2. رد مدعّم بالبيانات",
    desc: "تجهيز رد احترافي يحوي السعر والتفاصيل من الكتالوج الخاص بك دون تأخير."
  },
  {
    icon: <ImageIcon className="w-5 h-5" />,
    title: "3. إرسال الوسائط",
    desc: "طلب صورة؟ يتم إرفاق صورة المنتج مباشرة لتسريع قرار الشراء."
  },
  {
    icon: <UserCircle className="w-5 h-5" />,
    title: "4. تدخل بشري (عند الحاجة)",
    desc: "إذا طلب العميل التحدث لموظف أو لإتمام صفقة كبيرة، يتم التنبيه فوراً."
  }
];

export function FlowSection() {
  const container = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const cards = gsap.utils.toArray<HTMLElement>('.step-card');
    const connectors = gsap.utils.toArray<HTMLElement>('.step-connector');

    if (cards.length === 0) return;

    // Create a paused timeline holding the entire sequence
    const tl = gsap.timeline({ paused: true });

    // First card appears
    tl.from(cards[0], {
      opacity: 0,
      x: 30, // From right (RTL)
      duration: 1,
      ease: 'power3.out'
    });

    // Sequence the line growth, then the next card
    connectors.forEach((conn, index) => {
      // Make the line draw take slightly longer than cards to emphasize the scroll distance
      tl.from(conn, {
        scaleY: 0,
        transformOrigin: 'top',
        duration: 1.5,
        ease: 'none'
      });
      
      if (cards[index + 1]) {
        tl.from(cards[index + 1], {
          opacity: 0,
          x: 30,
          duration: 1,
          ease: 'power3.out'
        }, "-=0.2"); // slight overlap
      }
    });

    // Track the highest scroll progress achieved
    let maxProgress = 0;

    ScrollTrigger.create({
      trigger: '.steps-container',
      start: 'top 75%',
      end: 'bottom 50%', // Complete the animation by the time the bottom is at 50% of the screen
      onUpdate: (self) => {
        // Only progress forwards, never backwards
        if (self.progress > maxProgress) {
          maxProgress = self.progress;
          // Smoothly animate the timeline's progress to catch up with the scroll
          gsap.to(tl, { 
            progress: maxProgress, 
            duration: 0.4, 
            ease: 'power2.out',
            overwrite: true
          });
        }
      }
    });

  }, { scope: container });

  return (
    <section ref={container} className="py-24 md:py-32 bg-white relative" id="how-it-works">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-20">
          <h2 className="text-3xl md:text-5xl font-black text-[#1A2E27] mb-6">
            كيف يعمل رضا؟
          </h2>
        </div>

        <div className="steps-container max-w-3xl mx-auto relative">

          <div className="flex flex-col gap-12 relative z-10">
            {STEPS.map((step, idx) => (
              <div key={idx} className="step-card flex flex-col md:flex-row gap-6 md:gap-12 relative w-full">
                
                {/* Connector segments */}
                {idx !== STEPS.length - 1 && (
                  <>
                    {/* Background track */}
                    <div 
                      className="absolute top-14 right-[27px] w-0.5 bg-gray-200 hidden md:block z-0" 
                      style={{ bottom: '-3rem' }} 
                    />
                    {/* Animated fill */}
                    <div 
                      className="step-connector absolute top-14 right-[27px] w-0.5 bg-[#115C42] origin-top hidden md:block z-[1]" 
                      style={{ bottom: '-3rem' }} 
                    />
                  </>
                )}

                {/* Number/Icon indicator */}
                <div className="shrink-0 flex items-start z-10 w-auto">
                  <div className="w-14 h-14 rounded-2xl bg-[#F8F7F4] border-2 border-white shadow-md flex items-center justify-center text-[#115C42] relative z-20">
                    {step.icon}
                  </div>
                </div>

                {/* Content */}
                <div className="bg-[#F8F7F4] p-8 rounded-3xl border border-[#1A2E27]/5 flex-1 hover:shadow-lg transition-shadow duration-300 z-10 relative">
                  <h3 className="text-xl font-bold text-[#1A2E27] mb-3">{step.title}</h3>
                  <p className="text-[#1A2E27]/70 text-lg leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
