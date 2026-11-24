import { useState } from "react";
import { ArrowLeft, ArrowUpLeft, BookOpenCheck, Braces, Check, ChevronDown, FileText, GitBranch, Languages, Menu, MessageCircle, ShieldCheck, Sparkles, UsersRound, WandSparkles, X, Zap } from "lucide-react";

export default function LandingPage({ onGetStarted }: { onGetStarted: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const start = () => {
    setMenuOpen(false);
    onGetStarted();
  };

  return (
    <div className="landing-page" dir="rtl" lang="ar">
      <header className="landing-nav">
        <a className="landing-brand" href="#" aria-label="OmniLearn AI">
          <span className="landing-brand-mark"><Sparkles size={19} /></span>
          <span>omni<span>learn</span><i>AI</i></span>
        </a>
        <button className="landing-mobile-menu" aria-label={menuOpen ? "إغلاق القائمة" : "فتح القائمة"} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={21} /> : <Menu size={21} />}</button>
        <nav className={`landing-links ${menuOpen ? "is-open" : ""}`} aria-label="التنقل الرئيسي">
          <a href="#features" onClick={() => setMenuOpen(false)}>المميزات</a>
          <a href="#how-it-works" onClick={() => setMenuOpen(false)}>كيف تعمل المنصة</a>
          <a href="#about" onClick={() => setMenuOpen(false)}>عن OmniLearn</a>
          <button className="landing-nav-cta" onClick={start}>ابدأ مجانًا <ArrowLeft size={15} /></button>
        </nav>
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <div className="landing-eyebrow"><span><Sparkles size={13} /></span> منصة AI مصرية للطلاب والمبرمجين</div>
            <h1>مش مجرد ذكاء اصطناعي.<br /><span>ده شريك رحلتك.</span></h1>
            <p>من الكود للمحاضرة، OmniLearn بيجمع أدوات الفهم والتعلّم والتعاون في مساحة واحدة — بتجربة عربية قريبة منك.</p>
            <div className="landing-hero-actions">
              <button className="landing-primary" onClick={start}>ابدأ رحلتك دلوقتي <ArrowLeft size={17} /></button>
              <a className="landing-secondary" href="#features">اكتشف المنصة <ChevronDown size={15} /></a>
            </div>
            <div className="landing-trust"><span><ShieldCheck size={15} /></span> مساحة آمنة لحسابك وتقدّمك</div>
          </div>

          <div className="landing-hero-art" aria-label="مساحات OmniLearn للكود والدراسة">
            <div className="landing-art-glow" />
            <div className="landing-art-ring ring-one" />
            <div className="landing-art-ring ring-two" />
            <div className="landing-art-core"><Sparkles size={36} /><span>فكّر. افهم. اتقدّم.</span></div>
            <div className="landing-float-card float-code"><span className="float-icon code"><Braces size={16} /></span><div><strong>CodeLingo</strong><small>افهم الكود خطوة بخطوة</small></div><GitBranch size={16} /></div>
            <div className="landing-float-card float-study"><span className="float-icon study"><BookOpenCheck size={16} /></span><div><strong>EduNotes AI</strong><small>ملخصك واختبارك في ثواني</small></div><Sparkles size={15} /></div>
            <div className="landing-float-card float-live"><span className="landing-live-dot" /><div><strong>غرفة دراسة مباشرة</strong><small>اتعلموا سوا، لحظة بلحظة</small></div><UsersRound size={16} /></div>
            <span className="landing-art-star star-a">✦</span><span className="landing-art-star star-b">✧</span>
          </div>
          <a className="landing-scroll-cue" href="#features"><span>اكتشف أكتر</span><ChevronDown size={15} /></a>
        </section>

        <section className="landing-proof" aria-label="أدوات OmniLearn">
          <span>كل اللي تحتاجه للتعلّم في مكان واحد</span>
          <div><Braces size={16} /> CodeLingo</div><i /><div><BookOpenCheck size={16} /> EduNotes AI</div><i /><div><UsersRound size={16} /> Study Rooms</div>
        </section>

        <section className="landing-features landing-section" id="features">
          <div className="landing-section-heading">
            <span className="landing-section-kicker">أدوات بتشتغل معاك</span>
            <h2>من أول سؤال، <span>لحد ما الفكرة تثبت.</span></h2>
            <p>كل مساحة معمولة عشان تنقلك من الحيرة للفهم — مش مجرد إجابة وخلاص.</p>
          </div>
          <div className="landing-feature-grid">
            <article className="landing-feature-card feature-code">
              <span className="landing-feature-icon"><Braces size={21} /></span><span className="landing-feature-label">للمبرمجين والطلاب</span>
              <h3>CodeLingo</h3><p>افهم أي كود، اكتشف المشاكل، حوّل المنطق لمخطط، أو ترجم بين لغات البرمجة.</p>
              <div className="landing-feature-chips"><span><Sparkles size={12} /> شرح ذكي</span><span><GitBranch size={12} /> مخططات</span><span><Languages size={12} /> ترجمة</span></div>
              <div className="landing-code-preview"><span><i /> <i /> <i /></span><code><b>if</b> (idea.isClear) {"{"}<br />&nbsp;&nbsp;learn.nextStep();<br />{"}"}</code><span className="preview-check"><Check size={13} /></span></div>
            </article>
            <article className="landing-feature-card feature-notes">
              <span className="landing-feature-icon"><BookOpenCheck size={21} /></span><span className="landing-feature-label">للمذاكرة والبحث</span>
              <h3>EduNotes AI</h3><p>ارفع PDF أو الصق محاضرتك، واطلع بملخص وخريطة مفاهيم واختبار وبطاقات مراجعة.</p>
              <div className="landing-notes-preview"><div><FileText size={15} /><span>محاضرة_الذكاء_الاصطناعي.pdf</span><Check size={14} /></div><span className="notes-progress"><i /></span><small><Sparkles size={12} /> ملخصك وخريطتك جاهزين للمراجعة</small></div>
            </article>
            <article className="landing-feature-card feature-rooms">
              <span className="landing-feature-icon"><UsersRound size={21} /></span><span className="landing-feature-label">اتعلّموا مع بعض</span>
              <h3>غرف الدراسة الحية</h3><p>اعمل غرفة لفريقك، شاركوا الرسائل والملاحظات، واتابعوا الشرح في نفس المكان.</p>
              <div className="landing-room-preview"><div className="room-avatar avatar-one">م</div><div className="room-avatar avatar-two">ع</div><div className="room-avatar avatar-three">س</div><span><b>المجموعة بتذاكر دلوقتي</b><small><i /> ملاحظات مشتركة ورسائل مباشرة</small></span><MessageCircle size={17} /></div>
            </article>
          </div>
        </section>

        <section className="landing-how landing-section" id="how-it-works">
          <div className="landing-section-heading">
            <span className="landing-section-kicker">ببساطة ومن غير تعقيد</span>
            <h2>ابدأ في <span>٣ خطوات.</span></h2>
          </div>
          <div className="landing-steps">
            <article><span className="step-number">١</span><div className="step-icon"><Zap size={19} /></div><h3>اعمل حسابك</h3><p>سجّل ببريدك أو بحساب Google، وأكّد بريدك عشان تحافظ على أمان حسابك.</p></article>
            <article><span className="step-number">٢</span><div className="step-icon"><WandSparkles size={19} /></div><h3>اختار مساحة</h3><p>حلّل كودك، حوّل محاضرتك لدليل مذاكرة، أو افتح غرفة مع فريقك.</p></article>
            <article><span className="step-number">٣</span><div className="step-icon"><ArrowUpLeft size={19} /></div><h3>اتقدّم وكمّل</h3><p>راجع أفكارك، اختبر فهمك، وخلي نشاطك ونتايجك محفوظة في حسابك.</p></article>
          </div>
        </section>

        <section className="landing-about landing-section" id="about">
          <div className="about-spark"><Sparkles size={24} /></div>
          <div><span className="landing-section-kicker">عن OmniLearn AI</span><h2>تكنولوجيا عالمية،<br /><span>بتجربة قريبة منك.</span></h2><p>OmniLearn منصة تعليمية مصرية بتجمع أدوات الذكاء الاصطناعي للكود والمذاكرة والتعاون. الطلبات بتتعالج عبر OpenRouter ونماذج متخصصة من خلال خادم آمن؛ راجع النتائج دايمًا، ومحتواك ما بيتحفظش في قاعدة بيانات OmniLearn.</p></div>
          <div className="about-points"><span><Check size={15} /> واجهة بسيطة بالعربي والإنجليزي</span><span><Check size={15} /> حساب وتقدّم محفوظين بأمان</span><span><Check size={15} /> أدوات AI متخصصة للكود والصور والصوت</span></div>
        </section>

        <section className="landing-final-cta">
          <div className="final-cta-stars"><Sparkles size={21} /></div>
          <span>خطوتك الجاية تبدأ من هنا</span><h2>جاهز تفهم أكتر؟</h2><p>اعمل حسابك وابدأ استخدم مساحات OmniLearn.</p>
          <button className="landing-primary" onClick={start}>يلا نبدأ <ArrowLeft size={17} /></button>
        </section>
      </main>

      <footer className="landing-footer"><a className="landing-brand" href="#"><span className="landing-brand-mark"><Sparkles size={16} /></span><span>omni<span>learn</span><i>AI</i></span></a><span>مصممة عشان التعلّم يبقى أوضح وأسهل.</span><span>© 2026 OmniLearn AI</span></footer>
    </div>
  );
}
