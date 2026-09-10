/* ============================================================
   واجهة منبر ادكصهك البرمجية المجانية — /api/catalog
   تعيد كتالوج المكتبة كاملاً (الأقسام، الأقسام الفرعية، الدروس
   المنشورة) بصيغة JSON بسيطة لكل مهتم بادكصهك يريد البناء فوقها.

   أفضل الممارسات المطبَّقة:
   - لا أسرار هنا إطلاقاً: مفتاح الويب علني بحكم تصميم Firebase،
     وقواعد Firestore لا تسمح إلا بالقراءة العامة لهذه المجموعات.
   - كاش CDN طويل (s-maxage=3600 + stale-while-revalidate يوماً) —
     ⛔ 2026-09-10: بـ300ث كانت الواجهة وحدها تقرأ ‏485 وثيقة ‏288 مرّة
     يومياً (~140 ألف قراءة) فاستُنفدت حصّة Firestore المجانية وردّت
     429 على الجميع. ساعةٌ تكفي: المحتوى يُنشر مرّات في اليوم لا في
     الدقيقة، والتطبيق له مسبارُه الخاص للتغيّر العاجل.
   - **لقطة احتياطية** على jsDelivr: إن سقط Firestore (حصّة أو فوترة)
     تُقدَّم آخر لقطة معروفة بدل خطأ — فالمكتبة لا تختفي من الأجهزة.
   - CORS مفتوح للقراءة فقط (GET) — لا كتابة عبر هذه الواجهة أصلاً.
   - منطق الجلب وفكّ الترميز مشترك في `_lib.js` مع خريطة الموقع
     والعرض الخادمي، فلا يتكرّر الكود ولا يتفرّق تصحيحه.
   - الاستخدام بنفس شروط رخصة المشروع: النسبة للمطوّر الأصلي
     إلزامية، والاستخدام التجاري ممنوع دون إذن كتابي صريح.
   ============================================================ */
'use strict';

const {
  fetchCollection, toCategory, toSubcategory, toLesson, isPublished,
} = require('./_lib');

/** لقطة الكتالوج الاحتياطية (تُحدَّث بـ`node tools/snapshot-catalog.js`). */
const FALLBACK_URL = 'https://cdn.jsdelivr.net/gh/mwqwf/menbar-site@main/api/catalog-fallback.json';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  try {
    const [categories, subcategories, lessons] = await Promise.all([
      fetchCollection('categories', toCategory),
      fetchCollection('subcategories', toSubcategory),
      fetchCollection('lessons', toLesson),
    ]);
    const now = Date.now();
    // الدروس المنشورة فقط — المجدولة تبقى خارج الواجهة حتى موعدها.
    const published = lessons.filter((l) => isPublished(l, now));
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.status(200).json({
      project: 'منبر ادكصهك',
      license: 'خيري وقف لله — النسبة إلزامية لـ github.com/mwqwf والاستخدام التجاري ممنوع دون إذن كتابي. انظر LICENSE.',
      docs: 'https://github.com/mwqwf/menbar-site/blob/main/API.md',
      generatedAt: new Date().toISOString(),
      counts: {
        categories: categories.length,
        subcategories: subcategories.length,
        lessons: published.length,
      },
      categories,
      subcategories,
      lessons: published,
    });
  } catch (e) {
    // المصدر ساقط (حصّة/فوترة/شبكة) — نقدّم آخر لقطة معروفة بدل خطأ.
    try {
      const snap = await fetch(FALLBACK_URL, { headers: { 'User-Agent': 'menbar-site' } });
      if (snap.ok) {
        const body = await snap.json();
        body.stale = true;
        res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400');
        return res.status(200).json(body);
      }
    } catch (_) { /* اللقطة أيضاً تعذّرت — نُبلغ بالخطأ الأصلي */ }
    res.status(502).json({ error: 'تعذّر جلب الكتالوج من المصدر مؤقتاً. أعد المحاولة.' });
  }
};
