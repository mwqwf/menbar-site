/* ============================================================
   مرآة القراءة لواجهة minbar-api عبر نطاق الموقع — /v1/*
   السبب: minbar-api على Cloudflare، وبعض الشبكات الجزائرية تحجب عناوين
   Cloudflare (حادثة 2026-08-30). فالتطبيق يجرّب minbar-api ثم هذا المسار:
   إن وصله الموقع وصلته المكتبة والمسبار والدلتا والنصوص والإعدادات.
   قراءة فقط (GET) — الكتابة تذهب إلى minbar-api مباشرة.
   ============================================================ */
'use strict';
const { MINBAR_API } = require('./_lib');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  const raw = String(req.url || '');
  const m = raw.match(/^\/v1\/([A-Za-z0-9_./-]*)(\?.*)?$/);
  if (!m) return res.status(400).json({ error: 'مسار غير صالح' });
  try {
    const up = await fetch(MINBAR_API + '/v1/' + m[1] + (m[2] || ''), {
      headers: { 'User-Agent': 'menbar-site', 'If-None-Match': req.headers['if-none-match'] || '' },
    });
    const body = await up.arrayBuffer();
    for (const h of ['content-type', 'etag', 'cache-control']) {
      const v = up.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    if (!up.headers.get('cache-control')) res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=600');
    res.status(up.status).end(Buffer.from(body));
  } catch (e) {
    res.status(502).json({ error: 'minbar-api غير متاح مؤقتاً' });
  }
};
