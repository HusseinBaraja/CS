import { useRef, useState } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Link } from '../components/router/HonoRouter';
import { ArrowLeft, CheckCircle2 } from '../components/icons';
import logoUrl from '../../assets/Reda_logo.svg';

export function TrialPage() {
  const container = useRef<HTMLDivElement>(null);
  const [formData, setFormData] = useState({ name: '', phone: '', company: '' });

  useGSAP(() => {
    const tl = gsap.timeline();
    
    // Abstract background ambient animation
    gsap.to('.trial-ambient-blob', {
      x: 'random(-50, 50)',
      y: 'random(-50, 50)',
      rotation: 'random(-20, 20)',
      duration: 10,
      ease: 'sine.inOut',
      repeat: -1,
      yoyo: true,
      stagger: 2,
    });

    tl.from('.trial-card', {
      y: 40,
      scale: 0.95,
      opacity: 0,
      duration: 1,
      ease: 'power4.out',
    })
    .from('.trial-content', {
      y: 20,
      opacity: 0,
      duration: 0.6,
      stagger: 0.1,
      ease: 'power2.out',
    }, '-=0.4');
  }, { scope: container });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Dummy Trial Form Submit: ', formData);
    alert('نشكرك على تسجيلك! سيقوم فريقنا بالتواصل معك قريباً لتفعيل النسخة التجريبية.');
  };

  return (
    <div ref={container} className="min-h-screen bg-bg-light relative overflow-hidden flex items-center justify-center p-6">
      
      {/* Dynamic Ambient Background */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="trial-ambient-blob absolute top-[10%] -right-[10%] w-[60vw] h-[60vw] max-w-[800px] max-h-[800px] rounded-full bg-secondary/10 blur-[100px]" />
        <div className="trial-ambient-blob absolute bottom-[10%] -left-[10%] w-[50vw] h-[50vw] max-w-[600px] max-h-[600px] rounded-full bg-[#115C42]/5 blur-[100px]" />
      </div>

      <div className="relative z-10 w-full max-w-[1000px] flex flex-col items-center">
        {/* Minimal Header */}
        <Link href="/" className="trial-content flex items-center justify-center gap-3 mb-10 hover:opacity-80 transition-opacity">
          <img src={logoUrl} alt="" className="h-10 w-auto" />
          <span className="text-3xl font-black text-primary tracking-tight">رضا</span>
        </Link>
        
        {/* Main Card */}
        <div className="trial-card w-full bg-surface/80 backdrop-blur-3xl border border-primary/5 rounded-[2.5rem] shadow-[0_20px_80px_rgba(26,46,39,0.08)] overflow-hidden grid grid-cols-1 md:grid-cols-5">
          
          {/* Form Section */}
          <div className="p-8 md:p-12 md:col-span-3">
            <div className="mb-10 text-center">
              <h1 className="trial-content text-3xl md:text-4xl font-black text-primary mb-4 leading-tight">
                ابدأ رحلة <span className="text-emerald-700">النمو</span> مجاناً
              </h1>
              <p className="trial-content text-primary/60 text-lg font-medium">
                قم بتسجيل بياناتك وسنوفر لك بيئة تجريبية متكاملة لتقييم المساعد الذكي.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
               <div className="trial-content">
                 <input 
                   type="text" 
                   required
                   value={formData.name}
                   onChange={e => setFormData({...formData, name: e.target.value})}
                   placeholder="الاسم الكريم"
                   className="w-full bg-white border border-primary/10 rounded-2xl px-5 py-4 text-primary font-medium placeholder-primary/30 focus:outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/10 transition-all shadow-sm"
                 />
               </div>
               
               <div className="trial-content">
                 <input 
                   type="tel" 
                   required
                   value={formData.phone}
                   onChange={e => setFormData({...formData, phone: e.target.value})}
                   style={{ direction: 'ltr' }}
                   placeholder="+966 5x xxx xxxx"
                   className="w-full text-right bg-white border border-primary/10 rounded-2xl px-5 py-4 text-primary font-medium placeholder-primary/30 focus:outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/10 transition-all shadow-sm"
                 />
               </div>
               
               <div className="trial-content">
                 <input 
                   type="text" 
                   required
                   value={formData.company}
                   onChange={e => setFormData({...formData, company: e.target.value})}
                   placeholder="اسم المتجر أو العلامة التجارية"
                   className="w-full bg-white border border-primary/10 rounded-2xl px-5 py-4 text-primary font-medium placeholder-primary/30 focus:outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/10 transition-all shadow-sm"
                 />
               </div>

               <button 
                 type="submit"
                 className="trial-content relative overflow-hidden group mt-4 w-full bg-primary text-white py-4 rounded-2xl font-bold text-lg hover:bg-primary/90 transition-all duration-300 shadow-xl shadow-primary/20 hover:shadow-2xl hover:shadow-primary/30 flex items-center justify-center gap-3 translate-y-0 hover:-translate-y-1"
               >
                 <span className="relative z-10">اطلب النسخة التجريبية</span>
                 <ArrowLeft className="w-5 h-5 relative z-10 group-hover:-translate-x-1 transition-transform" />
                 {/* Shine effect */}
                 <div className="absolute top-0 -inset-full h-full w-1/2 z-0 block transform -skew-x-12 bg-gradient-to-r from-transparent to-white opacity-20 group-hover:animate-shine" />
               </button>
               <p className="trial-content text-center text-primary/40 text-sm mt-3 font-medium">لن نطلب منك أي بطاقة ائتمانية في هذه المرحلة.</p>
            </form>
          </div>

          {/* Features / Benefits column */}
          <div className="bg-primary p-8 md:p-12 md:col-span-2 flex flex-col justify-center text-white/90 relative overflow-hidden">
            <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_top_right,var(--color-secondary),transparent_70%)]" />
            
            <h3 className="trial-content text-2xl font-black text-white mb-8">ماذا تقدم لك النسخة التجريبية؟</h3>
            
            <ul className="space-y-6">
              {[
                { title: 'ردود آلية سريعة', desc: 'نظام مدرب للرد على الأسئلة الشائعة.' },
                { title: 'فهم دقيق للعملاء', desc: 'تعرف على المنتجات والسياق بسهولة.' },
                { title: 'تحويل للمبيعات', desc: 'إحالة المحادثات المعقدة للموظف المختص.' },
                { title: 'لوحة تحكم كاملة', desc: 'تتبع كافة المحادثات والتقارير.' },
              ].map((item, idx) => (
                <li key={idx} className="trial-content flex items-start gap-4">
                  <CheckCircle2 className="w-6 h-6 text-secondary shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-white text-lg mb-1">{item.title}</h4>
                    <p className="text-white/60 text-sm">{item.desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Footer Link */}
        <div className="mt-8">
          <Link href="/" className="trial-content text-primary/50 hover:text-primary font-medium flex items-center gap-2 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            العودة إلى الصفحة الرئيسية
          </Link>
        </div>
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes shine {
          100% { left: 125%; }
        }
        .animate-shine {
          animation: shine 1s ease-in-out;
        }
      `}}/>
    </div>
  );
}
