/* ============================================================
   هيكل صفحة منبر الموحَّد (خادمي).

   ⚠️ لماذا موحَّد؟ أول نسخة من العرض الخادمي أعادت هيكلاً ناقصاً بلا وسوم
   المشغّل، و`app.js` يربط `#playBtn` بلا فحص، فكان يتوقّف كلياً على صفحات
   الدروس وتبقى عالقة على «جارٍ تجهيز المشغّل». الهيكل هنا **مطابق** لما
   يحتاجه app.js: `#app` و`#syncNote` و`#player` بكل أبنائه و`#themeBtn`.
   أي عنصر يُضاف إلى الواجهة يجب أن يُضاف هنا أيضاً.
   ============================================================ */
'use strict';

const { escapeHtml } = require('./_lib');

const BRAND = 'منبر ادكصهك';
const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.ali.menbaradkshk';

/**
 * @param o.title/description/canonical/jsonLd  وسوم الرأس
 * @param o.bodyIntro  محتوى `#app` الذي يراه الزاحف قبل أن يستبدله app.js
 */
function shell(o) {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(o.title)}</title>
<meta name="description" content="${escapeHtml(o.description)}"/>
<link rel="canonical" href="${escapeHtml(o.canonical)}"/>
<meta name="theme-color" content="#0a2b33"/>
<meta property="og:type" content="website"/>
<meta property="og:site_name" content="${escapeHtml(BRAND)}"/>
<meta property="og:locale" content="ar_AR"/>
<meta property="og:title" content="${escapeHtml(o.title)}"/>
<meta property="og:description" content="${escapeHtml(o.description)}"/>
<meta property="og:url" content="${escapeHtml(o.canonical)}"/>
<meta name="twitter:card" content="summary"/>
<meta name="twitter:title" content="${escapeHtml(o.title)}"/>
<meta name="twitter:description" content="${escapeHtml(o.description)}"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Amiri:wght@400;700&display=swap" rel="stylesheet"/>
<link rel="stylesheet" href="/assets/app.css"/>
<script type="application/ld+json">${o.jsonLd}</script>
<script>
/* تطبيق السمة قبل أول رسم لتفادي وميض السمة الخاطئة */
(function(){try{var t=JSON.parse(localStorage.getItem('menbar_theme'));
if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
document.documentElement.setAttribute('data-theme',t);}catch(e){}})();
</script>
</head>
<body>

<!-- الترويسة الثابتة -->
<header class="site">
  <div class="wrap nav">
    <a class="brand" href="/"><span class="dot"><svg viewBox="0 0 24 24"><path d="M12 3a4 4 0 0 1 4 4v5a4 4 0 0 1-8 0V7a4 4 0 0 1 4-4zm-6 9a6 6 0 0 0 12 0h2a8 8 0 0 1-7 7.94V22h-2v-2.06A8 8 0 0 1 4 12h2z"/></svg></span>${escapeHtml(BRAND)}</a>
    <nav class="navlinks">
      <a href="/#/" data-route="home">المكتبة</a>
      <a href="/#/search" data-route="search">بحث</a>
      <a href="/#/mylists" data-route="mylists">قوائمي</a>
    </nav>
    <span class="spacer"></span>
    <button class="iconbtn" id="themeBtn" title="السمة الفاتحة/الداكنة" aria-label="تبديل السمة">🌙</button>
    <a class="store" href="${PLAY_URL}" target="_blank" rel="noopener">حمّل التطبيق</a>
  </div>
</header>

<!-- محتوى التطبيق: يُرسَل مرسوماً من الخادم ثم يتولّاه app.js -->
<main id="app">
${o.bodyIntro}
</main>

<!-- إشعار «يتم التحديث في الخلفية» -->
<div class="sync-note" id="syncNote">يتم تحديث المكتبة…</div>

<!-- شريط المشغّل السفلي الدائم -->
<div id="player" dir="rtl">
  <div class="player-inner">
    <div class="player-top">
      <div class="player-title" id="playerTitle" title="فتح صفحة الدرس"></div>
      <button class="pbtn speed" id="speedBtn" title="سرعة التشغيل">1×</button>
      <button class="pbtn" id="prevBtn" title="الدرس السابق">⏮</button>
      <button class="pbtn" id="backBtn" title="رجوع 10 ثوانٍ">↺10</button>
      <button class="pbtn main" id="playBtn" title="تشغيل/إيقاف">▶</button>
      <button class="pbtn" id="fwdBtn" title="تقديم 10 ثوانٍ">10↻</button>
      <button class="pbtn" id="nextBtn" title="الدرس التالي">⏭</button>
      <button class="pbtn close" id="closePlayer" title="إغلاق المشغّل">✕</button>
    </div>
    <div class="player-seek">
      <time id="tCur">0:00</time>
      <input type="range" id="seek" min="0" max="100" step="0.1" value="0" aria-label="موضع التشغيل"/>
      <time id="tTotal">0:00</time>
    </div>
  </div>
</div>

<!-- التذييل -->
<footer class="site">
  <div class="wrap row">
    <div>© 2026 ${escapeHtml(BRAND)}</div>
    <div>
      <a href="/">المكتبة</a>
      <a href="${PLAY_URL}" target="_blank" rel="noopener">Google Play</a>
      <a href="/privacy">سياسة الخصوصية</a>
    </div>
    <div class="oss">
      هذا الموقع مفتوح المصدر، وهو واجهة ويب لنفس مكتبة التطبيق.
      <a href="https://github.com/mwqwf" target="_blank" rel="noopener">اطّلع على جميع مشاريعنا مفتوحة المصدر</a>
      — مشروع مفتوح للمهتمّين بادكصهك وما يهمّهم: النسبة لمطوّره الأصلي
      إلزامية، والاستخدام التجاري ممنوع دون إذن كتابي صريح من
      <a href="https://github.com/mwqwf" target="_blank" rel="noopener">mwqwf</a>.
      <a href="https://youtube.com/@mtfail" target="_blank" rel="noopener">قناتنا على يوتيوب</a>
      فيها فيديوهات توضيحية عن الجديد وكيفية الاستعمال.
      <br/>🕌 هذا المشروع خيريٌّ ووقفٌ لله تعالى: لا نتربّح منه ولن نتربّح، ولا
      نسمح لأحد بالتربّح منه — وهو مفتوح لكل من يريد خدمة تراث هذه القبيلة.
      وللمطوّرين: واجهة برمجية مجانية للمحتوى على
      <a href="https://github.com/mwqwf/menbar-site/blob/main/API.md" target="_blank" rel="noopener">‎/api/catalog</a>
      بنفس شروط الرخصة.
    </div>
  </div>
</footer>

<script src="/assets/app.js"></script>
</body>
</html>
`;
}

module.exports = { shell, BRAND, PLAY_URL };
