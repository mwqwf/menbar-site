/* ============================================================
   /sitemap.xml — خريطة الموقع، تُولَّد ذاتياً من نفس كتالوج التطبيق.
   لماذا دالة لا ملفاً ثابتاً؟ لأن المكتبة تتغيّر يومياً: أي درس يُنشر
   من اللوحة يدخل الخريطة تلقائياً، وأي درس يُحذف يخرج منها — بلا أي
   خطوة يدوية تُنسى.
   الكاش (s-maxage) يمنع أي ضغط على Firestore مهما تكرّر زحف محركات البحث.
   ============================================================ */
'use strict';

const {
  SITE, fetchCollection, toCategory, toSubcategory, toLesson,
  escapeHtml, isPublished,
} = require('./_lib');

const iso = (ms) => new Date(ms > 0 ? ms : Date.now()).toISOString();

function urlEntry(loc, lastmod, changefreq, priority) {
  return (
    '  <url>\n' +
    '    <loc>' + escapeHtml(loc) + '</loc>\n' +
    (lastmod ? '    <lastmod>' + lastmod + '</lastmod>\n' : '') +
    '    <changefreq>' + changefreq + '</changefreq>\n' +
    '    <priority>' + priority + '</priority>\n' +
    '  </url>\n'
  );
}

module.exports = async (req, res) => {
  try {
    const [categories, subcategories, lessons] = await Promise.all([
      fetchCollection('categories', toCategory),
      fetchCollection('subcategories', toSubcategory),
      fetchCollection('lessons', toLesson),
    ]);
    const now = Date.now();
    const published = lessons.filter((l) => isPublished(l, now));

    // أحدث تعديل في المكتبة = أحدث درس منشور؛ يخبر محركات البحث بجِدّة الصفحة.
    const newest = published.reduce((m, l) => Math.max(m, l.createdAtMs || 0), 0);

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    xml += urlEntry(SITE + '/', iso(newest), 'daily', '1.0');
    xml += urlEntry(SITE + '/privacy', '', 'yearly', '0.3');

    // صفحات الأقسام والأقسام الفرعية (مسارات قابلة للزحف).
    for (const c of categories) {
      xml += urlEntry(SITE + '/category/' + encodeURIComponent(c.id), '', 'weekly', '0.7');
    }
    for (const s of subcategories) {
      xml += urlEntry(SITE + '/section/' + encodeURIComponent(s.id), '', 'weekly', '0.6');
    }

    // كل درس منشور = صفحة مستقلّة قابلة للفهرسة.
    for (const l of published) {
      xml += urlEntry(
        SITE + '/lesson/' + encodeURIComponent(l.id),
        iso(l.createdAtMs),
        'monthly',
        '0.8',
      );
    }

    xml += '</urlset>\n';

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.status(200).send(xml);
  } catch (e) {
    // خريطة صغرى بدل خطأ 500: محرك البحث يبقى قادراً على الوصول للجذر.
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=300');
    res.status(200).send(
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      urlEntry(SITE + '/', '', 'daily', '1.0') +
      '</urlset>\n',
    );
  }
};
