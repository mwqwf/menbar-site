/* ============================================================
   واجهة منبر ادكصهك البرمجية المجانية — /api/catalog
   تعيد كتالوج المكتبة كاملاً (الأقسام، الأقسام الفرعية، الدروس
   المنشورة) بصيغة JSON بسيطة لكل مهتم بادكصهك يريد البناء فوقها.

   أفضل الممارسات المطبَّقة:
   - لا أسرار هنا إطلاقاً: مفتاح الويب علني بحكم تصميم Firebase،
     وقواعد Firestore لا تسمح إلا بالقراءة العامة لهذه المجموعات.
   - كاش CDN (s-maxage=300 + stale-while-revalidate) يحمي حصص
     قاعدة البيانات من أي إغراق ويجعل الاستجابة شبه فورية.
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
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
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
    res.status(502).json({ error: 'تعذّر جلب الكتالوج من المصدر مؤقتاً. أعد المحاولة.' });
  }
};
