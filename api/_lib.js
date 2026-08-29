/* ============================================================
   مكتبة مشتركة لدوال منبر الخادمية: جلب الكتالوج من Firestore REST.
   تُستعمل في /api/catalog و/api/sitemap و/api/lesson فلا يتكرّر الكود.
   لا أسرار هنا: مفتاح الويب علني بحكم تصميم Firebase، وقواعد Firestore
   لا تسمح إلا بالقراءة العامة لهذه المجموعات.
   ============================================================ */
'use strict';

const PROJECT = 'mxqp-8d1e8';
const API_KEY = 'AIzaSyCWAHqbzhfQ-ZcjSSVCAhFFqCTgQ66SdCs'; // علني مقصود
const RUN_QUERY_URL =
  'https://firestore.googleapis.com/v1/projects/' + PROJECT +
  '/databases/(default)/documents:runQuery?key=' + API_KEY;
const PAGE_SIZE = 300;

const SITE = 'https://minbar-adkassahk.vercel.app';

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

/* جلب وثيقة واحدة بالمعرّف — أرخص بكثير من مسح المجموعة كلها،
   وهو ما تحتاجه صفحة الدرس المفردة. */
async function fetchDoc(collectionId, id) {
  const url =
    'https://firestore.googleapis.com/v1/projects/' + PROJECT +
    '/databases/(default)/documents/' + collectionId + '/' +
    encodeURIComponent(id) + '?key=' + API_KEY;
  const res = await fetch(url);
  if (!res.ok) return null;
  const doc = await res.json();
  if (!doc || !doc.fields) return null;
  return decodeFields(doc.fields);
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
