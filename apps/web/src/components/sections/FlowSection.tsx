import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Bot, ImageIcon, Search, UserCircle } from '../icons';

gsap.registerPlugin(ScrollTrigger);

const STEPS = [
  {
    icon: <Search className="w-7 h-7" />,
    title: "1. فهم واستعلام",
    desc: "العميل يسأل بطريقته. البوت يحلل الطلب ويبحث في قاعدة البيانات عن المنتج الأنسب."
  },
  {
    icon: <Bot className="w-7 h-7" />,
    title: "2. رد مدعّم بالبيانات",
    desc: "تجهيز رد احترافي يحوي السعر والتفاصيل من الكتالوج الخاص بك دون تأخير."
  },
  {
    icon: <ImageIcon className="w-7 h-7" />,
    title: "3. إرسال الوسائط",
    desc: "طلب صورة؟ يتم إرفاق صورة المنتج مباشرة لتسريع قرار الشراء."
  },
  {
    icon: <UserCircle className="w-7 h-7" />,
    title: "4. تدخل بشري (عند الحاجة)",
    desc: "إذا طلب العميل التحدث لموظف أو لإتمام صفقة كبيرة، يتم التنبيه فوراً."
  }
];

export function FlowSection() {
  const container = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const containerEl = container.current;
    if (!containerEl) return;

    const dots = gsap.utils.toArray<HTMLElement>('.map-island-dot');
    const basePath = document.querySelector('#base-map-path') as SVGPathElement;
    const activePath = document.querySelector('#active-map-path') as SVGPathElement;
    const maskPath = document.querySelector('#reveal-mask-path') as SVGPathElement;
    const svgEl = document.querySelector('#map-svg') as SVGSVGElement;

    if (dots.length === 0 || !basePath || !activePath || !maskPath || !svgEl) return;

    // Dynamically build the exact path connecting the dots based on actual DOM layout
    const buildPath = () => {
      const svgRect = svgEl.getBoundingClientRect();
      if (svgRect.width === 0 || svgRect.height === 0) return null;

      const points = dots.map(dot => {
        const rect = dot.getBoundingClientRect();
        return {
          x: rect.left + rect.width / 2 - svgRect.left,
          y: rect.top + rect.height / 2 - svgRect.top
        };
      });

      // Construct a smooth S-curve cubic Bezier path through the centers.
      // On mobile all dots share the same X; offset control points to the
      // same side per segment, alternating between segments, so the path
      // flows as a gentle sine wave instead of creating hard kinks.
      const wobble = svgRect.width > 700 ? 0 : Math.min(30, svgRect.width * 0.06);
      let d = `M ${points[0].x},${points[0].y}`;
      for (let i = 0; i < points.length - 1; i++) {
          const p1 = points[i];
          const p2 = points[i+1];
          const dir = i % 2 === 0 ? 1 : -1;
          const ox = dir * wobble;

          // Symmetric sweeping S-curve on desktop; staggered wave on mobile
          const cy1 = wobble === 0 ? (p1.y + p2.y) / 2 : p1.y + (p2.y - p1.y) * 0.33;
          const cy2 = wobble === 0 ? (p1.y + p2.y) / 2 : p1.y + (p2.y - p1.y) * 0.66;

          d += ` C ${p1.x + ox},${cy1} ${p2.x + ox},${cy2} ${p2.x},${p2.y}`;
      }

      basePath.setAttribute('d', d);
      activePath.setAttribute('d', d);
      maskPath.setAttribute('d', d);

      const length = maskPath.getTotalLength();
      return { points, length };
    };

    // Track scroll progress (hoisted so rebuildAndRefresh can reference it)
    let maxProgress = 0;
    let isAnimationInitialized = false;
    let timeline: ReturnType<typeof gsap.timeline> | null = null;
    let scrollTriggerInstance: ReturnType<typeof ScrollTrigger.create> | null = null;

    const initializeAnimation = (pathData: NonNullable<ReturnType<typeof buildPath>>) => {
      if (isAnimationInitialized) {
        return;
      }

      const totalYDistance =
        pathData.points[pathData.points.length - 1].y - pathData.points[0].y;

      timeline = gsap.timeline({ paused: true });

      scrollTriggerInstance = ScrollTrigger.create({
        trigger: containerEl,
        start: 'top 55%',
        end: 'bottom 80%',
        invalidateOnRefresh: true,
        onUpdate: (self) => {
          if (self.progress > maxProgress && timeline) {
            maxProgress = self.progress;
            gsap.to(timeline, {
              progress: maxProgress,
              duration: 0.5,
              ease: 'power2.out',
              overwrite: true
            });
          }
        }
      });

      gsap.set(maskPath, {
        strokeDasharray: pathData.length,
        strokeDashoffset: pathData.length
      });
      timeline.to(maskPath, { strokeDashoffset: 0, duration: 1, ease: 'none' }, 0);

      const cards = gsap.utils.toArray<HTMLElement>('.map-card-content');
      const pointTimes = pathData.points.map(p =>
        totalYDistance > 0 ? (p.y - pathData.points[0].y) / totalYDistance : 0,
      );

      cards.forEach((card, i) => {
        gsap.set(card, { opacity: 0, y: 50, scale: 0.9 });

        const triggerTime = Math.max(0, pointTimes[i] - 0.05);

        timeline?.to(card, {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.15,
          ease: 'back.out(1.5)'
        }, triggerTime);

        timeline?.from(dots[i], {
          scale: 0,
          opacity: 0,
          duration: 0.1,
          ease: 'back.out(2)'
        }, triggerTime);
      });

      isAnimationInitialized = true;
    };

    let disposed = false;
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
    const rebuildAndRefresh = () => {
      const rebuilt = buildPath();
      if (rebuilt) {

        initializeAnimation(rebuilt);
        const len = rebuilt.length;
        gsap.set(maskPath, { strokeDasharray: len, strokeDashoffset: len * (1 - maxProgress) });
        ScrollTrigger.refresh();
      }
    };

    const handleResize = () => {
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }

      resizeTimeout = setTimeout(() => {
        if (!disposed) {
          rebuildAndRefresh();
        }
      }, 150);
    };

    // Rebuild once layout settles (fonts, images, etc.)
    const rafId = requestAnimationFrame(() => {
      if (!disposed) rebuildAndRefresh();
    });
    const fontsReady = document.fonts?.ready;
    if (fontsReady) {
      void fontsReady.then(() => {
        if (!disposed) rebuildAndRefresh();
      });
    }
    window.addEventListener('resize', handleResize);
    rebuildAndRefresh();

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      scrollTriggerInstance?.kill();
      timeline?.kill();
    };
  }, { scope: container });

  return (
    <section
      ref={container}
      className="scroll-mt-header-offset py-24 md:py-32 relative"
      id="how-it-works"
    >
      {/* Decorative environment background */}
      <div className="absolute top-0 end-0 w-200 h-200 pointer-events-none translate-x-1/3 rtl:-translate-x-1/3 z-0" style={{ background: 'radial-gradient(circle, rgba(26,46,39,0.05) 0%, transparent 70%)' }} />
      <div className="absolute bottom-0 start-0 w-200 h-200 translate-y-1/3 -translate-x-1/3 rtl:translate-x-1/3 pointer-events-none z-0" style={{ background: 'radial-gradient(circle, rgba(26,46,39,0.04) 0%, transparent 70%)' }} />

      <div className="max-w-6xl mx-auto px-6 relative z-10 block">

        <div className="text-center max-w-2xl mx-auto mb-20 md:mb-32">
          <h2 className="text-4xl md:text-5xl font-black text-primary mb-6 tracking-tight">
            كيف يعمل <span className="text-primary">رضا؟</span>
          </h2>
          <p className="text-lg text-primary/50 font-medium">
            خريطة كنز لتبسيط أتمتة مبيعاتك وتجربة عملائك
          </p>
        </div>

        {/* Map Interactive Area */}
        <div className="relative w-full pb-16">

          {/* Overlay SVG covering the exact relative space of the steps */}
          {/* pointer-events-none prevents capturing clicks intended for cards */}
          <svg
            id="map-svg"
            className="absolute inset-0 w-full h-full pointer-events-none z-0 overflow-visible"
          >
            <defs>
              <mask id="line-mask" maskUnits="userSpaceOnUse">
                <path
                  id="reveal-mask-path"
                  fill="none"
                  stroke="white"
                  strokeWidth="8"
                  strokeLinecap="round"
                />
              </mask>
              <filter id="map-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Faint unexplored path */}
            <path
              id="base-map-path"
              fill="none"
              stroke="#1A2E27"
              strokeOpacity="0.08"
              strokeWidth="4"
              strokeDasharray="8 12"
              strokeLinecap="round"
            />

            {/* Explored green path, revealed gracefully by mask */}
            <path
              id="active-map-path"
              fill="none"
              stroke="#115C42"
              strokeWidth="4"
              strokeDasharray="8 12"
              strokeLinecap="round"
              filter="url(#map-glow)"
              mask="url(#line-mask)"
            />
          </svg>

          {/* Isometric placement using Flex order instead of absolute offsets */}
          <div className="flex flex-col gap-24 md:gap-32 w-full relative z-10">
            {STEPS.map((step, idx) => {
              // Switch between layout start and end for desktop. Mobile handles stacking nicely.
              // In RTL, "me-auto" is right side, "ms-auto" is left side.
              const alignmentClass = idx % 2 === 0 ? 'md:me-auto' : 'md:ms-auto';

              return (
                <div
                  key={idx}
                  className={`flex flex-col items-center w-full md:w-[48%] lg:w-[45%] map-island-container ${alignmentClass}`}
                >
                  {/* Pin Drop */}
                  <div className="map-island-dot w-6 h-6 rounded-full bg-white border-4 border-[#115C42] shadow-[0_0_15px_rgba(17,92,66,0.5)] z-20 mb-6 shrink-0" />

                  {/* Card Content */}
                  <div className="map-card-content bg-white/70 backdrop-blur-xl p-8 md:p-10 rounded-[2.5rem] border border-white/60 shadow-xl shadow-primary/5 flex flex-col items-center text-center hover:bg-white hover:shadow-2xl hover:shadow-primary/10 hover:-translate-y-2 transition-all duration-300">
                    <div className="w-16 h-16 rounded-[1.25rem] bg-linear-to-br from-primary/10 to-transparent text-[#115C42] flex items-center justify-center mb-6 shadow-sm border border-primary/5 rotate-3 group-hover:rotate-0 transition-transform duration-300">
                      {step.icon}
                    </div>
                    <h3 className="text-xl md:text-2xl font-bold text-primary mb-3">{step.title}</h3>
                    <p className="text-primary/70 text-[15px] md:text-base leading-relaxed max-w-sm">
                      {step.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

        </div>
      </div>
    </section>
  );
}
