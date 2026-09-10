/* ============================================================
   بثّ الصوت عبر نطاقنا — /audio/{sha}.ogg
   سببه: تخزين Firebase توقّف (402) فصار المصدر مرآة R2 على
   `media.menbar.app`، وشبكات جزائرية تحجب عناوين Cloudflare
   المبروكسة (حادثة 2026-08-30). فهذا المسار يجعل الصوت يصل من
   **نفس النطاق الذي يصل منه الكتالوج** — إن وصل الكتالوج وصل الصوت.

   - يمرّر Range كما هو (البثّ والقفز في المشغّل يحتاجانه).
   - الاسم بصمةُ محتواه (SHA-256) فالكاش دائم `immutable`.
   - لا يقبل إلا 64 خانة ست عشرية — لا بروكسي مفتوحاً لأي رابط.
   ============================================================ */
'use strict';

const ORIGIN = process.env.MEDIA_ORIGIN || 'https://media.menbar.app';
const SHA = /^[0-9a-f]{64}$/;

module.exports = async (req, res) => {
  const raw = String(req.url || '').split('?')[0];
  const name = decodeURIComponent(raw.replace(/^.*\//, '')).replace(/\.ogg$/i, '');
  if (!SHA.test(name)) {
    res.statusCode = 400;
    return res.end('bad sha');
  }
  const headers = {};
  if (req.headers.range) headers.Range = req.headers.range;
  if (req.headers['if-none-match']) headers['If-None-Match'] = req.headers['if-none-match'];

  let upstream;
  try {
    upstream = await fetch(`${ORIGIN}/serving/${name}.ogg`, {
      headers,
      method: req.method === 'HEAD' ? 'HEAD' : 'GET',
    });
  } catch (e) {
    res.statusCode = 502;
    return res.end('upstream unreachable');
  }

  res.statusCode = upstream.status;
  for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag']) {
    const v = upstream.headers.get(h);
    if (v) res.setHeader(h, v);
  }
  res.setHeader('Content-Type', upstream.headers.get('content-type') || 'audio/ogg');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'HEAD' || !upstream.body) return res.end();
  const reader = upstream.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(Buffer.from(value));
  }
  res.end();
};
