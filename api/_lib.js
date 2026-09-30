/* ============================================================
   مكتبة مشتركة لدوال منبر الخادمية: جلب الكتالوج.
   تُستعمل في /api/catalog و/api/sitemap و/api/lesson فلا يتكرّر الكود.

   ⭐ 2026-09-10: المصدر الأول صار **minbar-api** (Cloudflare Workers + D1)
   بعد عطل فوترة Firebase؛ وهو يعيد الكتالوج بالشكل النهائي نفسه (العقد
   مع تطبيق أندرويد). الترتيب: minbar-api → اللقطة الاحتياطية على jsDelivr.
   (كان Firestore REST ملاذاً ثالثاً؛ حُذف لأنّ بياناته متجمّدة منذ الهجرة.)
   ============================================================ */
'use strict';
const MINBAR_API = process.env.MINBAR_API || 'https://minbar-api.mushafak.workers.dev';
const FALLBACK_URL = 'https://cdn.jsdelivr.net/gh/mwqwf/menbar-site@main/api/catalog-fallback.json';
const UA = { 'User-Agent': 'menbar-site' };

/* كتالوج minbar-api كاملاً مع كاش ذاكرة قصير — الدالة الخادمية قد تخدم
   عدة طلبات في عمر واحد فلا نعيد الجلب لكلّ واحد. */
let apiCache = { at: 0, data: null };
async function apiCatalog() {
  if (apiCache.data && Date.now() - apiCache.at < 60000) return apiCache.data;
  const res = await fetch(MINBAR_API + '/v1/catalog', { headers: UA });
  if (!res.ok) throw new Error('minbar-api HTTP ' + res.status);
  const data = await res.json();
  if (!data || !Array.isArray(data.lessons) || data.lessons.length < 50) throw new Error('minbar-api: كتالوج ناقص');
  apiCache = { at: Date.now(), data };
  return data;
}
async function snapshotCatalog() {
  const res = await fetch(FALLBACK_URL, { headers: UA });
  if (!res.ok) throw new Error('snapshot HTTP ' + res.status);
  const data = await res.json();
  data.stale = true;
  return data;
}
/* وثيقة بشكل الكتالوج النهائي تُعاد إلى الشكل الذي تفهمه toLesson/toCategory
   (تقرأ updatedAt/publishAt/featuredUntil بأسمائها الخام). */
function rawFromFinal(o) {
  if (!o) return null;
  return Object.assign({}, o, {
    updatedAt: o.updatedAtMs, publishAt: o.publishAtMs, createdAt: o.createdAtMs,
  });
}

const SITE = 'https://minbar-adkassahk.vercel.app';

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

async function fetchCollection(collectionId) {
  // 1) minbar-api ثم 2) اللقطة — كلاهما بالشكل النهائي.
  for (const source of [apiCatalog, snapshotCatalog]) {
    try {
      const data = await source();
      if (Array.isArray(data[collectionId])) return data[collectionId];
    } catch (_) { /* نجرّب التالي */ }
  }
  throw new Error('تعذّر الكتالوج من minbar-api ومن اللقطة');
}

/* جلب وثيقة واحدة بالمعرّف — أرخص بكثير من مسح المجموعة كلها،
   وهو ما تحتاجه صفحة الدرس المفردة. */
async function fetchDoc(collectionId, id) {
  try {
    if (collectionId === 'lessons') {
      const res = await fetch(MINBAR_API + '/v1/lessons/' + encodeURIComponent(id), { headers: UA });
      if (res.ok) return rawFromFinal(await res.json());
      if (res.status === 404) return null;
    } else {
      const data = await apiCatalog();
      const hit = (data[collectionId] || []).find((x) => x.id === id);
      if (hit) return rawFromFinal(hit);
    }
  } catch (_) { /* اللقطة أدناه */ }
  try {
    const hit = ((await snapshotCatalog())[collectionId] || []).find((x) => x.id === id);
    return hit ? rawFromFinal(hit) : null;
  } catch (_) { return null; }
}

/* `createdAt` رقمياً باسمه الأصلي أيضاً + `updatedAtMs`: تطبيق أندرويد صار
   يستهلك هذا الكتالوج كقناة جلبٍ كامل (طلب واحد بدل مئات قراءات Firestore)
   ويبني منه علامات مزامنته التفاضلية — أسماء الحقول عقدٌ معه فلا تُغيَّر. */
const toCategory = (id, raw) => {
  const d = unwrap(raw);
  return {
    id, name: text(d.name),
    createdAtMs: timeMillis(d.createdAt), createdAt: timeMillis(d.createdAt),
    updatedAtMs: timeMillis(d.updatedAt),
  };
};

const toSubcategory = (id, raw) => {
  const d = unwrap(raw);
  return {
    id, name: text(d.name), categoryId: text(d.categoryId),
    createdAtMs: timeMillis(d.createdAt), createdAt: timeMillis(d.createdAt),
    updatedAtMs: timeMillis(d.updatedAt),
  };
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
    durationMs: num(d.durationMs) || num(d.duration) || (num(d.durationSeconds) * 1000),
    publishAtMs: publishAt > 0 ? publishAt : null,
    createdAt: timeMillis(d.createdAt),
    updatedAtMs: timeMillis(d.updatedAt),
    featured: d.featured === true,
    featuredUntil: d.featuredUntil != null ? timeMillis(d.featuredUntil) : 0,
    // هوية المحتوى (معمارية «المكتبة الكاملة»): بصمة البايتات المُقدَّمة وحجمها.
    sha256: text(d.sha256),
    sizeBytes: num(d.sizeBytes),
    durationSeconds: num(d.durationSeconds),
  };
};

/* هروب آمن للنصّ داخل HTML/XML — يمنع كسر الوسوم أو حقن سكربت
   من عنوان درس فيه محارف خاصّة. */
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* مدّة ISO-8601 لبيانات Schema.org (مثال: PT1H23M45S) */
function isoDuration(ms) {
  const total = Math.max(0, Math.floor(Number(ms) / 1000));
  if (!total) return '';
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return 'PT' + (h ? h + 'H' : '') + (m ? m + 'M' : '') + (s ? s + 'S' : '');
}

const isPublished = (l, now) => l.publishAtMs == null || l.publishAtMs <= (now || Date.now());

module.exports = {
  SITE,
  MINBAR_API,
  apiCatalog,
  fetchCollection,
  fetchDoc,
  toCategory,
  toSubcategory,
  toLesson,
  unwrap,
  text,
  num,
  timeMillis,
  escapeHtml,
  isoDuration,
  isPublished,
};
