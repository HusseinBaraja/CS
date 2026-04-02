import { useRef, useState } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Mail, MessageCircle, MapPin, ArrowRight } from '../components/icons';
import { Link } from '../components/router/HonoRouter';

export function ContactPage() {
  const container = useRef<HTMLDivElement>(null);
  const [formData, setFormData] = useState({ name: '', phone: '', company: '', message: '' });

  useGSAP(() => {
    const tl = gsap.timeline();
    
    tl.fromTo('.contact-brand', 
      { x: -40, opacity: 0 },
      { x: 0, opacity: 1, duration: 0.8, ease: 'power3.out', force3D: true }
    )
    .fromTo('.contact-left-anim', 
      { y: 40, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.8, stagger: 0.15, ease: 'power3.out', force3D: true },
      '-=0.4'
    )
    .fromTo('.contact-right-anim', 
      { x: 60, opacity: 0 },
      { x: 0, opacity: 1, duration: 0.8, stagger: 0.1, ease: 'power3.out', force3D: true },
      '-=0.6'
    )
    .fromTo('.contact-shape', 
      { scale: 0.5, opacity: 0, rotation: 45 },
      { scale: 1, opacity: 1, rotation: 0, duration: 1.5, ease: 'elastic.out(1, 0.5)', force3D: true },
      0
    );
  }, { scope: container });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Dummy Contact Form Submit: ', formData);
    alert('شكراً لتواصلك معنا. هذه نسخة تجريبية، وتم استلام طلبك بنجاح.');
    setFormData({ name: '', phone: '', company: '', message: '' });
  };

  return (
    <div ref={container} className="min-h-screen bg-primary relative overflow-hidden flex items-center">
      {/* Decorative luxury shapes and noise */}
      <div className="absolute inset-0 z-0 opacity-10 pointer-events-none" 
           style={{ backgroundImage: 'radial-gradient(circle at 100% 0%, var(--color-secondary) 0%, transparent 50%)' }} />
      <div className="contact-shape absolute top-1/4 -right-32 w-96 h-96 border border-secondary/20 rounded-full z-0" />
      <div className="contact-shape absolute bottom-0 left-0 w-150 h-150 bg-secondary/5 rounded-tr-[200px] z-0 blur-3xl mix-blend-screen" />
      
      <div className="max-w-7xl mx-auto px-6 py-20 w-full grid grid-cols-1 lg:grid-cols-2 gap-16 relative z-10 min-h-[90vh]">
        
        {/* Left Side: Information */}
        <div className="flex flex-col justify-center text-white/90">
          <Link href="/" className="contact-brand flex items-center gap-3 mb-16 hover:opacity-80 transition-opacity w-fit">
            <ArrowRight className="w-6 h-6 text-secondary" />
            <span className="text-xl font-medium">العودة للرئيسية</span>
          </Link>

          <h1 className="contact-left-anim text-5xl md:text-6xl font-black text-white leading-tight mb-6">
            جاهزين نسمع منك <br/>
            <span className="text-secondary italic font-light">ونرتب معك البداية</span>
          </h1>
          <p className="contact-left-anim text-lg text-white/60 mb-12 max-w-md font-light leading-relaxed">
            مخصص للأعمال في اليمن التي تريد خدمة عملاء أسرع على واتساب بدون تعقيد.
          </p>

          <div className="contact-left-anim space-y-8">
            <div className="flex items-center gap-6 group cursor-pointer">
              <div className="w-14 h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-secondary/20 group-hover:border-secondary/40 transition-all duration-500">
                <MessageCircle className="w-6 h-6 text-secondary" />
              </div>
              <div>
                <h3 className="text-white/50 text-sm mb-1">واتساب للتواصل</h3>
                <p className="font-medium text-lg text-white group-hover:text-secondary transition-colors">+967 77 000 0000</p>
              </div>
            </div>

            <div className="flex items-center gap-6 group cursor-pointer">
              <div className="w-14 h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-secondary/20 group-hover:border-secondary/40 transition-all duration-500">
                <Mail className="w-6 h-6 text-secondary" />
              </div>
              <div>
                <h3 className="text-white/50 text-sm mb-1">البريد الإلكتروني</h3>
                <p className="font-medium text-lg text-white group-hover:text-secondary transition-colors" style={{ direction: 'ltr' }}>hello@cscb.com</p>
              </div>
            </div>
            
            <div className="flex items-center gap-6 group cursor-pointer">
              <div className="w-14 h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-secondary/20 group-hover:border-secondary/40 transition-all duration-500">
                <MapPin className="w-6 h-6 text-secondary" />
              </div>
              <div>
                <h3 className="text-white/50 text-sm mb-1">المقر الرئيسي</h3>
                <p className="font-medium text-lg text-white group-hover:text-secondary transition-colors">صنعاء، اليمن</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Luxury Form */}
        <div className="flex items-center justify-center">
          <div className="bg-white/[0.03] backdrop-blur-2xl border border-white/10 rounded-[2rem] p-8 md:p-12 w-full max-w-lg shadow-[0_32px_64px_-12px_rgba(0,0,0,0.5)]">
            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              
              <div className="contact-right-anim flex flex-col gap-2">
                <label className="text-white/70 text-sm font-medium pr-2">الاسم الكامل</label>
                <input 
                  type="text" 
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  required
                  placeholder="مثال: محمد الآنسي"
                  className="bg-primary/50 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder-white/20 focus:outline-none focus:border-secondary/60 focus:bg-white/5 transition-colors duration-300 w-full"
                />
              </div>

              <div className="contact-right-anim flex flex-col gap-2">
                <label className="text-white/70 text-sm font-medium pr-2">رقم الواتساب</label>
                <input 
                  type="tel" 
                  value={formData.phone}
                  onChange={e => setFormData({...formData, phone: e.target.value})}
                  required
                  style={{ direction: 'ltr' }}
                  placeholder="+967 7xx xxx xxx"
                  className="text-right bg-primary/50 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder-white/20 focus:outline-none focus:border-secondary/60 focus:bg-white/5 transition-all w-full"
                />
              </div>

              <div className="contact-right-anim flex flex-col gap-2">
                <label className="text-white/70 text-sm font-medium pr-2">اسم المحل أو الشركة</label>
                <input 
                  type="text" 
                  value={formData.company}
                  onChange={e => setFormData({...formData, company: e.target.value})}
                  required
                  placeholder="مثال: مؤسسة الخير للتجارة"
                  className="bg-primary/50 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder-white/20 focus:outline-none focus:border-secondary/60 focus:bg-white/5 transition-colors duration-300 w-full"
                />
              </div>

              <div className="contact-right-anim flex flex-col gap-2 mb-2">
                <label className="text-white/70 text-sm font-medium pr-2">كيف نقدر نخدمك؟</label>
                <textarea 
                  rows={4}
                  value={formData.message}
                  onChange={e => setFormData({...formData, message: e.target.value})}
                  placeholder="اكتب لنا طبيعة شغلك أو عدد الرسائل التي تستقبلها يومياً"
                  className="bg-primary/50 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder-white/20 focus:outline-none focus:border-secondary/60 focus:bg-white/5 transition-all w-full resize-none"
                />
              </div>

              <button 
                type="submit" 
                className="contact-right-anim w-full bg-secondary text-primary font-bold text-lg py-4 rounded-xl shadow-[0_0_20px_rgba(227,178,60,0.3)] hover:shadow-[0_0_30px_rgba(227,178,60,0.5)] hover:-translate-y-1 transition-[background-color,box-shadow,color] duration-300"
              >
                أرسل طلبك
              </button>
            </form>
          </div>
        </div>

      </div>
    </div>
  );
}
