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
   - الاستخدام بنفس شروط رخصة المشروع: النسبة للمطوّر الأصلي
     إلزامية، والاستخدام التجاري ممنوع دون إذن كتابي صريح.
   ============================================================ */
'use strict';

const PROJECT = 'mxqp-8d1e8';
const API_KEY = 'AIzaSyCWAHqbzhfQ-ZcjSSVCAhFFqCTgQ66SdCs'; // علني مقصود
const RUN_QUERY_URL =
  'https://firestore.googleapis.com/v1/projects/' + PROJECT +
  '/databases/(default)/documents:runQuery?key=' + API_KEY;
const PAGE_SIZE = 300;

/* فكّ ترميز قيم Firestore REST إلى JSON عادي */
function decodeValue(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('mapValue' in v) return decodeFields((v.mapValue && v.mapValue.fields) || {});
  if ('arrayValue' in v) return ((v.arrayValue && v.arrayValue.values) || []).map(decodeValue);
  if ('referenceValue' in v) return v.referenceValue;
  return null;
}
function decodeFields(fields) {
  const out = {};
  for (const k in fields) out[k] = decodeValue(fields[k]);
  return out;
}

const unwrap = (d) => (d && typeof d.data === 'object' && d.data !== null ? d.data : d);
const text = (v) => (v == null ? '' : String(v).trim());
const num = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };
function timeMillis(v) {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') { const t = Date.parse(v); return isNaN(t) ? (Number(v) || 0) : t; }
  if (typeof v === 'object' && v.seconds != null) return Number(v.seconds) * 1000;
  return 0;
}

async function runQuery(structuredQuery) {
  const res = await fetch(RUN_QUERY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery }),
  });
  if (!res.ok) throw new Error('Firestore HTTP ' + res.status);
  return res.json();
}

async function fetchCollection(collectionId, mapDoc) {
  const items = [];
  let lastName = null;
  for (;;) {
    const q = {
      from: [{ collectionId }],
      orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
      limit: PAGE_SIZE,
    };
    if (lastName) q.startAt = { values: [{ referenceValue: lastName }], before: false };
    const rows = await runQuery(q);
    let count = 0;
    for (const row of rows) {
      if (!row.document) continue;
      count++;
      lastName = row.document.name;
      const id = row.document.name.split('/').pop();
      items.push(mapDoc(id, decodeFields(row.document.fields || {})));
    }
    if (count < PAGE_SIZE) break;
  }
  return items;
}

const toCategory = (id, raw) => {
  const d = unwrap(raw);
  return { id, name: text(d.name), createdAtMs: timeMillis(d.createdAt) };
};
const toSubcategory = (id, raw) => {
  const d = unwrap(raw);
  return { id, name: text(d.name), categoryId: text(d.categoryId), createdAtMs: timeMillis(d.createdAt) };
};
const toLesson = (id, raw) => {
  const d = unwrap(raw);
  const publishAt = d.publishAt != null ? timeMillis(d.publishAt) : 0;
  let subId = text(d.subcategoryId);
  if (!subId && d.subcategory && typeof d.subcategory === 'object') subId = text(d.subcategory._id);
  return {
    id,
    title: text(d.title) || text(d.name),
    categoryId: text(d.categoryId),
    subcategoryId: subId,
    audioUrl: text(d.audioUrl),
    createdAtMs: timeMillis(d.createdAt),
    views: num(d.views),
    speaker: text(d.speaker) || text(d.sheikh) || text(d.reader) || text(d.sheikhName),
    description: text(d.description),
    durationMs: num(d.durationMs) || num(d.duration),
    publishAtMs: publishAt > 0 ? publishAt : null,
  };
};

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
    const published = lessons.filter((l) => l.publishAtMs == null || l.publishAtMs <= now);
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
    res.status(200).json({
      project: 'منبر ادكصهك',
      license: 'خيري وقف لله — النسبة إلزامية لـ github.com/mwqwf والاستخدام التجاري ممنوع دون إذن كتابي. انظر LICENSE.',
      docs: 'https://github.com/mwqwf/menbar-site/blob/main/API.md',
      generatedAt: new Date().toISOString(),
      counts: { categories: categories.length, subcategories: subcategories.length, lessons: published.length },
      categories,
      subcategories,
      lessons: published,
    });
  } catch (e) {
    res.status(502).json({ error: 'تعذّر جلب الكتالوج من المصدر مؤقتاً. أعد المحاولة.' });
  }
};
