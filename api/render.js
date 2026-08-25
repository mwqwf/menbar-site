/* ============================================================
   العرض الخادمي لكل صفحات منبر القابلة للفهرسة:
   `/` و`/lesson/:id` و`/category/:id` و`/section/:id`.

   لماذا؟ محرّكات البحث كانت ترى صفحة فارغة مكتوباً فيها «هذا الموقع يحتاج
   JavaScript»، لأن المحتوى كلّه يُرسم في المتصفّح — فلم تُفهرس ولا صفحة
   واحدة. هنا يصل HTML وفيه العنوان الحقيقي والوصف وبيانات Schema.org
   **ومحتوى نصّي وروابط داخلية** يمشي عليها الزاحف إلى كل درس. ثم يتولّى
   `app.js` العرض التفاعلي كالمعتاد، فلا تتغيّر أي وظيفة للمستخدم.

   خفيف بحكم التصميم: صفحة الدرس تجلب وثيقة واحدة (لا مسح للمجموعة)،
   والرئيسية تُخزَّن في كاش الحافة فلا تتكرّر قراءتها لكل زائر.
   ============================================================ */
'use strict';

const {
  SITE, fetchDoc, fetchCollection, toCategory, toSubcategory, toLesson,
  unwrap, text, escapeHtml, isoDuration, isPublished,
} = require('./_lib');
const { shell, BRAND, PLAY_URL, inviteBar } = require('./_shell');

const DEFAULT_DESC =
  'منصّة تحفظ إرث مشايخ ادكصهك: مئات الدروس الصوتية العلمية مصنّفة بحسب ' +
  'العلوم، تستمع إليها مباشرة من المتصفّح.';

/* المحتوى الذي يراه الزاحف داخل #app قبل أن يستبدله app.js. */
function introBlock(heading, paragraphs, links, banner) {
  let html = '<div class="wrap"><article class="ssr-intro">';
  html += '<h1>' + escapeHtml(heading) + '</h1>';
  for (const p of paragraphs) {
    if (p) html += '<p>' + escapeHtml(p) + '</p>';
  }
  if (banner) html += banner;
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

/* ---------- الرئيسية ---------- */
async function renderHome() {
  const [categories, subcategories, lessons] = await Promise.all([
    fetchCollection('categories', toCategory),
    fetchCollection('subcategories', toSubcategory),
    fetchCollection('lessons', toLesson),
  ]);
  const now = Date.now();
  const published = lessons.filter((l) => isPublished(l, now));

  const canonical = SITE + '/';
  const title = BRAND + ' | استمع لمئات الدروس الصوتية العلمية مباشرة';
  const description =
    'أرشيف صوتي لمشايخ ادكصهك: ' + published.length + ' درساً علمياً في ' +
    categories.length + ' فنّاً، تستمع إليها مباشرة من المتصفّح بلا حساب وبلا إعلانات.';

  // ترتيب الأحدث أولاً، ونعرض عيّنة كافية لتفتح للزاحف طرقاً إلى المكتبة.
  const newest = published
    .slice()
    .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0))
    .slice(0, 60);

  let html = '<div class="wrap"><article class="ssr-intro">';
  html += '<h1>' + escapeHtml(BRAND) + ' — أرشيف مشايخكم الصوتي</h1>';
  html += '<p>' + escapeHtml(
    'منصّة تحفظ إرث مشايخ ادكصهك وتوفّر لهم منبراً لنشر صوتياتهم: مئات ' +
    'الصوتيات العلمية التي تشرح كتباً مختلفة، وتسجيلات نادرة، محدّثة باستمرار. ' +
    'استمع مباشرة من المتصفّح، أو نزّل التطبيق للاستماع دون إنترنت.',
  ) + '</p>';
  html += '<p>' + escapeHtml(
    published.length + ' درساً منشوراً · ' + categories.length + ' فنّاً · ' +
    subcategories.length + ' قسماً فرعياً',
  ) + '</p>';

  // الأقسام: روابط حقيقية يزحف عليها المفهرس.
  html += '<h2>الفنون العلمية</h2><ul>';
  for (const c of categories) {
    const count = published.filter((l) => l.categoryId === c.id).length;
    html += '<li><a href="/category/' + encodeURIComponent(c.id) + '">' +
      escapeHtml(c.name) + '</a> — ' + count + ' درساً</li>';
  }
  html += '</ul>';

  html += '<h2>أحدث الدروس</h2><ul>';
  for (const l of newest) {
    html += '<li><a href="/lesson/' + encodeURIComponent(l.id) + '">' +
      escapeHtml(l.title || 'درس صوتي') + '</a>' +
      (l.speaker ? ' — ' + escapeHtml(l.speaker) : '') + '</li>';
  }
  html += '</ul>';
  html += '<p><a href="' + PLAY_URL + '">حمّل تطبيق ' + escapeHtml(BRAND) +
    ' على أندرويد</a></p>';
  html += '</article></div>';

  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': SITE + '/#website',
        name: BRAND,
        alternateName: ['منبر ادكصهك الصوتي', 'Minbar Adkshk'],
        url: SITE + '/',
        inLanguage: 'ar',
        description: description,
        potentialAction: {
          '@type': 'SearchAction',
          target: SITE + '/#/search/{search_term_string}',
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@type': 'Organization',
        '@id': SITE + '/#org',
        name: BRAND,
        url: SITE + '/',
        sameAs: [
          'https://github.com/mwqwf',
          'https://youtube.com/@mtfail',
          PLAY_URL,
        ],
      },
      {
        '@type': 'MobileApplication',
        name: BRAND,
        operatingSystem: 'Android',
        applicationCategory: 'MultimediaApplication',
        url: PLAY_URL,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      },
    ],
  };

  return shell({
    title: title,
    description: description,
    canonical: canonical,
    jsonLd: JSON.stringify(ld),
    bodyIntro: html,
  });
}

/* ---------- صفحة درس ---------- */
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
    description: description,
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

  const links = [{ href: '/', label: 'تصفّح مكتبة ' + BRAND + ' كاملة' }];
  if (lesson.subcategoryId) {
    links.unshift({
      href: '/section/' + encodeURIComponent(lesson.subcategoryId),
      label: 'بقيّة دروس هذا القسم',
    });
  }

  const intro = introBlock(
    lesson.title || 'درس صوتي',
    [
      speaker ? 'المتحدّث: ' + speaker : '',
      minutes ? 'مدّة الدرس: نحو ' + minutes + ' دقيقة.' : '',
      lesson.description || '',
      'جارٍ تجهيز المشغّل…',
    ],
    links,
    inviteBar(),
  );

  return shell({
    title: title, description: description, canonical: canonical,
    jsonLd: JSON.stringify(ld), bodyIntro: intro,
  });
}

/* ---------- قسم رئيسي أو فرعي ---------- */
async function renderGroup(kind, id) {
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

  // روابط دروس القسم: الطريق الذي يمشي عليه الزاحف من القسم إلى دروسه.
  const lessons = await fetchCollection('lessons', toLesson);
  const now = Date.now();
  const mine = lessons.filter((l) =>
    isPublished(l, now) &&
    (kind === 'category' ? l.categoryId === id : l.subcategoryId === id));

  let html = '<div class="wrap"><article class="ssr-intro">';
  html += '<h1>' + escapeHtml(name) + '</h1>';
  html += '<p>' + escapeHtml(description) + '</p>';
  html += '<p>' + mine.length + ' درساً في هذا القسم.</p>';
  if (mine.length) {
    html += '<ul>';
    for (const l of mine.slice(0, 200)) {
      html += '<li><a href="/lesson/' + encodeURIComponent(l.id) + '">' +
        escapeHtml(l.title || 'درس صوتي') + '</a>' +
        (l.speaker ? ' — ' + escapeHtml(l.speaker) : '') + '</li>';
    }
    html += '</ul>';
  }
  html += '<p><a href="/">العودة إلى المكتبة</a></p>';
  html += '</article></div>';

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: name,
    description: description,
    url: canonical,
    inLanguage: 'ar',
    isPartOf: { '@type': 'WebSite', name: BRAND, url: SITE },
  };

  return shell({
    title: title, description: description, canonical: canonical,
    jsonLd: JSON.stringify(ld), bodyIntro: html,
  });
}

function fallback(canonical) {
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: BRAND, url: SITE, inLanguage: 'ar',
  };
  return shell({
    title: BRAND + ' | استمع للدروس العلمية مباشرة',
    description: DEFAULT_DESC,
    canonical: canonical || SITE + '/',
    jsonLd: JSON.stringify(ld),
    bodyIntro: introBlock(BRAND, [DEFAULT_DESC, 'جارٍ تحميل المكتبة…'],
      [{ href: '/', label: 'المكتبة' }]),
  });
}

module.exports = async (req, res) => {
  const path = String(req.url || '').split('?')[0];
  const m = path.match(/^\/(lesson|category|section)\/([^/]+)\/?$/);
  const isHome = path === '/' || path === '';

  try {
    let html = null;
    if (isHome) {
      html = await renderHome();
    } else if (m) {
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
