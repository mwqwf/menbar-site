/* ============================================================
   المصحف الكامل — العرض الخادمي.
   `/quran`            فهرس (السور/الأجزاء/الأحزاب/الصفحات)
   `/quran/<رقم>`      قراءة سورة كاملة بالرسم العثماني

   لماذا خادمي؟ الموقع معتمد على السيو: نصّ السورة كاملاً يصل في HTML مع
   العنوان والوصف وJSON-LD، ثم يتولّى `quran/quran.js` التفاعل (الروايات،
   التلاوة، حجم الخطّ) بلا إعادة تحميل.

   البيانات ملفات ثابتة في `quran/` (فُصلت لكل سورة على حدة حتى لا تُحمَّل
   6236 آية لعرض سورة واحدة). تُقرأ هنا من القرص عبر `includeFiles`
   في vercel.json — لا شبكة ولا Firestore في هذا المسار.
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const { escapeHtml } = require('./_lib');
const { SITE } = require('./_lib');
const { shell, BRAND, PLAY_URL } = require('./_shell');

const DATA = path.join(__dirname, '..', 'quran');

let INDEX = null;
function index() {
  if (!INDEX) INDEX = JSON.parse(fs.readFileSync(path.join(DATA, 'index.json'), 'utf8'));
  return INDEX;
}
function surahText(riwaya, n) {
  return JSON.parse(fs.readFileSync(path.join(DATA, 'text', riwaya, n + '.json'), 'utf8'));
}

/* رقم الآية بالأرقام العربية-الهندية داخل ﴿﴾ كما في المصحف */
const AR_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
const arNum = (n) => String(n).split('').map((d) => AR_DIGITS[+d]).join('');

const PLACE = { makki: 'مكّية', madani: 'مدنية' };

/* صيغة العدد الصحيحة: آية / آيتان / آيات (تُستعمل في العناوين والأوصاف) */
function ayahLabel(n) {
  if (n === 1) return 'آية واحدة';
  if (n === 2) return 'آيتان';
  if (n <= 10) return n + ' آيات';
  return n + ' آية';
}

/* السورة التي تقع فيها آية بفهرسها المسطّح، وترتيبها داخلها */
function locate(flat) {
  const s = index().surahs;
  for (let i = s.length - 1; i >= 0; i--) {
    if (flat >= s[i].start) return { surah: s[i].n, ayah: flat - s[i].start + 1 };
  }
  return { surah: 1, ayah: 1 };
}

/* ---------- الفهرس ---------- */
function renderIndex() {
  const idx = index();
  const canonical = SITE + '/quran';
  const title = 'المصحف الكامل — ثلاث روايات وتلاوة متزامنة | ' + BRAND;
  const description =
    'المصحف الشريف كاملاً بالرسم العثماني في ' + BRAND + ': برواية حفص وورش ' +
    'وقالون، مع تلاوة متزامنة آية بآية لعشرات القرّاء، وفهرسة بالسور والأجزاء ' +
    'والأحزاب والصفحات — مباشرة من المتصفّح بلا حساب.';

  let html = '<div class="wrap">';
  html += '<div class="q-head"><h1>المصحف الكامل</h1>' +
    '<span class="count">114 سورة · 6236 آية</span></div>';
  html += '<p class="q-note">' + escapeHtml(
    'ثلاث روايات (حفص وورش وقالون) وتلاوة متزامنة تُميّز الآية الجارية.',
  ) + '</p>';

  // «تابع القراءة» يملؤه quran.js من localStorage (لا يُخزَّن على الخادم)
  html += '<a class="q-resume" id="qResume" href="/quran/1" hidden></a>';

  html += '<div class="tabs" id="qTabs">' +
    '<button class="on" data-tab="surahs">السور</button>' +
    '<button data-tab="juzs">الأجزاء</button>' +
    '<button data-tab="hizbs">الأحزاب</button>' +
    '<button data-tab="pages">الصفحات</button>' +
    '</div>';

  // قائمة السور تُرسَل كاملة في HTML: هي طريق الزاحف إلى 114 صفحة.
  html += '<div class="q-grid" id="qList">';
  for (const s of idx.surahs) {
    html += '<a class="q-card" href="/quran/' + s.n + '">' +
      '<span class="num">' + s.n + '</span><span><span class="nm">' +
      escapeHtml('سورة ' + s.name) + '</span><br/><span class="mt">' +
      ayahLabel(s.ayahs) + ' · ' + (PLACE[s.place] || '') + '</span></span></a>';
  }
  html += '</div></div>';

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'المصحف الكامل',
    description: description,
    url: canonical,
    inLanguage: 'ar',
    isPartOf: { '@type': 'WebSite', name: BRAND, url: SITE },
    hasPart: idx.surahs.slice(0, 114).map((s) => ({
      '@type': 'WebPage',
      name: 'سورة ' + s.name,
      url: SITE + '/quran/' + s.n,
    })),
  };

  return shell({
    title: title, description: description, canonical: canonical,
    jsonLd: JSON.stringify(ld), bodyIntro: html,
    extraCss: '/quran/quran.css', script: '/quran/quran.js', noPlayer: true,
  });
}

/* ---------- سورة ---------- */
function renderSurah(n) {
  const idx = index();
  const s = idx.surahs.find((x) => x.n === n);
  if (!s) return null;

  const ayahs = surahText('hafs', n);
  const canonical = SITE + '/quran/' + n;
  const title = 'سورة ' + s.name + ' — مكتوبة وبتلاوة متزامنة | ' + BRAND;
  const description =
    'سورة ' + s.name + ' كاملة بالرسم العثماني (' + ayahLabel(s.ayahs) + '، ' +
    (PLACE[s.place] || '') + ') برواية حفص وورش وقالون، مع تلاوة متزامنة ' +
    'تُميّز الآية الجارية — اقرأ واستمع مباشرة في ' + BRAND + '.';

  // البسملة نصّها = أوّل آية من الفاتحة في الرواية نفسها (لا نكتبها يدوياً)
  const basmala = surahText('hafs', 1)[0];
  const showBasmala = n !== 1 && n !== 9;

  let html = '<div class="wrap">';
  html += '<div class="q-head"><a class="back" href="/quran" aria-label="رجوع">→</a>' +
    '<h1>' + escapeHtml('سورة ' + s.name) + '</h1>' +
    '<span class="count">' + ayahLabel(s.ayahs) + ' · ' + (PLACE[s.place] || '') +
    ' · الصفحة ' + s.page + '</span></div>';

  // شريط الأدوات: يعمل كاملاً بعد تحميل quran.js
  html += '<div class="q-bar">' +
    '<label for="qRiwaya">الرواية</label><select id="qRiwaya">';
  for (const r of idx.riwayat) {
    html += '<option value="' + escapeHtml(r.id) + '">' + escapeHtml(r.name) + '</option>';
  }
  html += '</select>' +
    '<label for="qReciter">القارئ</label><select id="qReciter"></select>' +
    '<button class="btn btn-teal" id="qPlay" type="button">▶ تلاوة</button>' +
    '<span class="grow"></span>' +
    '<button class="fbtn" id="qMinus" type="button" title="تصغير الخطّ">−</button>' +
    '<button class="fbtn" id="qPlus" type="button" title="تكبير الخطّ">+</button>' +
    '</div>';
  html += '<p class="q-note" id="qHint">انقر أيّ آية لبدء التلاوة منها.</p>';

  if (showBasmala) html += '<div class="q-basmala" id="qBasmala">' + escapeHtml(basmala) + '</div>';
  html += '<div class="q-text" id="qText" data-surah="' + n + '" data-ayahs="' + s.ayahs + '">';
  for (let i = 0; i < ayahs.length; i++) {
    html += '<span class="q-ayah" id="a' + (i + 1) + '" data-i="' + i + '">' +
      escapeHtml(ayahs[i]) +
      ' <span class="q-mark">﴿' + arNum(i + 1) + '﴾</span></span> ';
  }
  html += '</div>';

  html += '<div class="q-nav">';
  html += n > 1
    ? '<a href="/quran/' + (n - 1) + '">→ سورة ' + escapeHtml(idx.surahs[n - 2].name) + '</a>'
    : '<span></span>';
  html += n < 114
    ? '<a href="/quran/' + (n + 1) + '">سورة ' + escapeHtml(idx.surahs[n].name) + ' ←</a>'
    : '<span></span>';
  html += '</div>';
  html += '<p class="q-note"><a href="' + PLAY_URL + '" rel="noopener">' +
    escapeHtml('المصحف متاح أيضاً داخل تطبيق ' + BRAND + ' على أندرويد') + '</a></p>';
  html += '</div>';

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: 'سورة ' + s.name,
    description: description,
    url: canonical,
    inLanguage: 'ar',
    isAccessibleForFree: true,
    articleSection: 'القرآن الكريم',
    publisher: { '@type': 'Organization', name: BRAND, url: SITE },
    isPartOf: { '@type': 'CollectionPage', name: 'المصحف الكامل', url: SITE + '/quran' },
  };

  return shell({
    title: title, description: description, canonical: canonical,
    jsonLd: JSON.stringify(ld), bodyIntro: html,
    extraCss: '/quran/quran.css', script: '/quran/quran.js', noPlayer: true,
  });
}

module.exports = (req, res) => {
  const p = String(req.url || '').split('?')[0].replace(/\/+$/, '') || '/quran';
  try {
    let html = null;
    if (p === '/quran') html = renderIndex();
    else {
      const m = p.match(/^\/quran\/(\d{1,3})$/);
      if (m) html = renderSurah(Number(m[1]));
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (!html) {
      res.setHeader('Cache-Control', 'public, s-maxage=60');
      return res.status(404).send(renderIndex());
    }
    // بيانات المصحف ثابتة لا تتغيّر: كاش طويل على الحافة.
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).send(html);
  } catch (e) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(500).send('تعذّر عرض المصحف');
  }
};

module.exports.locate = locate;
