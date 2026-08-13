/* ============================================================
   عرض خادمي للصفحات القابلة للفهرسة: /lesson/:id و/category/:id
   و/section/:id.

   لماذا؟ محرّكات البحث كانت ترى صفحة فارغة بعنوان واحد مكرّر لكل
   الدروس، لأن المحتوى كلّه يُرسم في المتصفّح بعد جلب الكتالوج. هنا
   نحقن في HTML — قبل وصوله للزائر — العنوان الحقيقي والوصف وبيانات
   Schema.org ومحتوى نصّياً مقروءاً. ثم يتولّى app.js العرض التفاعلي
   كالمعتاد فلا تتغيّر أي وظيفة للمستخدم.

   خفيف بحكم التصميم: وثيقة واحدة تُجلب للدرس (لا مسح للمجموعة)،
   والنتيجة مخزَّنة في كاش الحافة فلا تتكرّر القراءة لكل زائر.
   ============================================================ */
'use strict';

const {
  SITE, fetchDoc, fetchCollection, toCategory, toSubcategory, toLesson,
  unwrap, text, num, timeMillis, escapeHtml, isoDuration, isPublished,
} = require('./_lib');

const BRAND = 'منبر ادكصهك';
const DEFAULT_DESC =
  'منصّة تحفظ إرث مشايخ ادكصهك: مئات الدروس الصوتية العلمية مصنّفة بحسب ' +
  'العلوم، تستمع إليها مباشرة من المتصفّح.';

/* هيكل الصفحة نفسه المستعمل في الموقع، مع فتحات للحقن. */
function shell({ title, description, canonical, jsonLd, bodyIntro }) {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}"/>
<link rel="canonical" href="${escapeHtml(canonical)}"/>
<meta name="theme-color" content="#0a2b33"/>
<meta property="og:type" content="website"/>
<meta property="og:site_name" content="${escapeHtml(BRAND)}"/>
<meta property="og:locale" content="ar_AR"/>
<meta property="og:title" content="${escapeHtml(title)}"/>
<meta property="og:description" content="${escapeHtml(description)}"/>
<meta property="og:url" content="${escapeHtml(canonical)}"/>
<meta name="twitter:card" content="summary"/>
<meta name="twitter:title" content="${escapeHtml(title)}"/>
<meta name="twitter:description" content="${escapeHtml(description)}"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Amiri:wght@400;700&display=swap" rel="stylesheet"/>
<link rel="stylesheet" href="/assets/app.css"/>
<script type="application/ld+json">${jsonLd}</script>
<script>
/* تطبيق السمة قبل أول رسم لتفادي وميض السمة الخاطئة */
(function(){try{var t=JSON.parse(localStorage.getItem('menbar_theme'));
if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
document.documentElement.setAttribute('data-theme',t);}catch(e){}})();
</script>
</head>
<body>

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
    <a class="store" href="https://play.google.com/store/apps/details?id=com.ali.menbaradkshk" target="_blank" rel="noopener">حمّل التطبيق</a>
  </div>
</header>

<main id="app">
${bodyIntro}
</main>

<script src="/assets/app.js"></script>
</body>
</html>
`;
}

/* محتوى نصّي يراه الزاحف فوراً (ويستبدله app.js بالواجهة التفاعلية). */
function introBlock(heading, paragraphs, links) {
  let html = '<div class="wrap"><article class="ssr-intro">';
  html += '<h1>' + escapeHtml(heading) + '</h1>';
  for (const p of paragraphs) {
    if (p) html += '<p>' + escapeHtml(p) + '</p>';
  }
  if (links && links.length) {
    html += '<ul>';
    for (const l of links) {
      html += '<li><a href="' + escapeHtml(l.href) + '">' + escapeHtml(l.label) + '</a></li>';
    }
    html += '</ul>';
  }
  html += '</article></div>';
  return html;
}

async function renderLesson(id) {
  const raw = await fetchDoc('lessons', id);
  if (!raw) return null;
  const lesson = toLesson(id, raw);
  if (!isPublished(lesson)) return null;

  const canonical = SITE + '/lesson/' + encodeURIComponent(id);
  const speaker = lesson.speaker;
  const title = (lesson.title || 'درس صوتي') + (speaker ? ' — ' + speaker : '') + ' | ' + BRAND;

  const minutes = lesson.durationMs ? Math.round(lesson.durationMs / 60000) : 0;
  const description =
    (lesson.description ||
      'استمع إلى «' + (lesson.title || 'هذا الدرس') + '»' +
      (speaker ? ' للشيخ ' + speaker : '') +
      ' مباشرة من المتصفّح ضمن أرشيف ' + BRAND + ' الصوتي للدروس العلمية.')
      .slice(0, 300);

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'AudioObject',
    name: lesson.title || 'درس صوتي',
    description,
    url: canonical,
    inLanguage: 'ar',
    isAccessibleForFree: true,
    genre: 'دروس علمية',
    publisher: { '@type': 'Organization', name: BRAND, url: SITE },
  };
  if (lesson.audioUrl) ld.contentUrl = lesson.audioUrl;
  if (speaker) ld.creator = { '@type': 'Person', name: speaker };
  if (lesson.durationMs) ld.duration = isoDuration(lesson.durationMs);
  if (lesson.createdAtMs) ld.uploadDate = new Date(lesson.createdAtMs).toISOString();

  const intro = introBlock(
    lesson.title || 'درس صوتي',
    [
      speaker ? 'المتحدّث: ' + speaker : '',
      minutes ? 'مدّة الدرس: نحو ' + minutes + ' دقيقة.' : '',
      lesson.description || '',
      'جارٍ تجهيز المشغّل…',
    ],
    [{ href: '/', label: 'تصفّح مكتبة ' + BRAND + ' كاملة' }],
  );

  return shell({
    title, description, canonical,
    jsonLd: JSON.stringify(ld),
    bodyIntro: intro,
  });
}

async function renderGroup(kind, id) {
  // kind: 'category' (قسم رئيسي) أو 'section' (قسم فرعي)
  const collection = kind === 'category' ? 'categories' : 'subcategories';
  const raw = await fetchDoc(collection, id);
  if (!raw) return null;
  const d = unwrap(raw);
  const name = text(d.name);
  if (!name) return null;

  const canonical = SITE + '/' + kind + '/' + encodeURIComponent(id);
  const title = name + ' — دروس صوتية | ' + BRAND;
  const description =
    'كل دروس «' + name + '» الصوتية في ' + BRAND +
    ': استمع إليها مباشرة من المتصفّح أو نزّلها عبر التطبيق، محدَّثة باستمرار.';

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name,
    description,
    url: canonical,
    inLanguage: 'ar',
    isPartOf: { '@type': 'WebSite', name: BRAND, url: SITE },
  };

  const intro = introBlock(
    name,
    [description, 'جارٍ تحميل دروس هذا القسم…'],
    [{ href: '/', label: 'العودة إلى المكتبة' }],
  );

  return shell({
    title, description, canonical,
    jsonLd: JSON.stringify(ld),
    bodyIntro: intro,
  });
}

function fallback(canonical) {
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: BRAND,
    url: SITE,
    inLanguage: 'ar',
  };
  return shell({
    title: BRAND + ' | استمع للدروس العلمية مباشرة',
    description: DEFAULT_DESC,
    canonical: canonical || SITE + '/',
    jsonLd: JSON.stringify(ld),
    bodyIntro: introBlock(BRAND, [DEFAULT_DESC, 'جارٍ تحميل المكتبة…'], []),
  });
}

module.exports = async (req, res) => {
  const path = String(req.url || '').split('?')[0];
  const m = path.match(/^\/(lesson|category|section)\/([^/]+)\/?$/);

  try {
    let html = null;
    if (m) {
      const id = decodeURIComponent(m[2]);
      html = m[1] === 'lesson' ? await renderLesson(id) : await renderGroup(m[1], id);
    }
    if (!html) {
      // معرّف غير موجود أو محذوف: لا نعطي 200 لصفحة فارغة كي لا تُفهرس.
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, s-maxage=60');
      return res.status(404).send(fallback(SITE + path));
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=86400');
    return res.status(200).send(html);
  } catch (e) {
    // تعذّر الجلب: نخدم الهيكل العام (الموقع يعمل) بلا كاش طويل.
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=30');
    return res.status(200).send(fallback(SITE + path));
  }
};
