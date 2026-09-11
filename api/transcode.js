/* ============================================================
   خطّ الصوت القانوني — ترميز درسٍ جديد إلى Opus أحادي 24k.

   ⛔ لماذا هنا لا على GitHub Actions؟ تشغيلُ Actions من الخادم يستلزم رمز
   GitHub، وأضيقُ رمزٍ يقبله `repository_dispatch` يفتح **كلّ** مستودعات
   المالك. فنُقل العمل إلى وظيفة على نفس حسابه (Vercel) تُستدعى بمفتاح
   الإدارة نفسه — فلا رمز جديد ولا صلاحية زائدة في أيّ مكان.

   المسار: minbar-api ← (مفتاح الإدارة) ← هنا ← يقرأ الأصل من الـWorker،
   يرمّز بـffmpeg، يرفع `serving/{sha}.ogg`، ثمّ يثبّت الدرس ويحذف الأصل.
   والخطأ يُعاد إلى الـWorker نصّاً فيبقى الدرس `pending` ويُعاد فحصه.
   ============================================================ */
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const API = process.env.MINBAR_API || 'https://minbar-api.mushafak.workers.dev';
/** ogg/opus دون هذا المعدّل يُبقى كما هو — لا إعادة ترميز للمضغوط أصلاً. */
const KEEP_MAX_BPS = 48000;
const OPUS_KBPS = 24;

function run(bin, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, opts);
    let err = '';
    p.stderr.on('data', (d) => { err += d.toString().slice(0, 4000); });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve(err) : reject(new Error(`${path.basename(bin)} ${code}: ${err.slice(-800)}`))));
  });
}

async function probe(ffprobe, file) {
  const out = await new Promise((resolve, reject) => {
    const p = spawn(ffprobe, [
      '-v', 'error', '-show_entries', 'stream=codec_name:format=bit_rate,duration',
      '-of', 'default=nw=1', file,
    ]);
    let s = '';
    p.stdout.on('data', (d) => { s += d.toString(); });
    p.on('error', reject);
    p.on('close', () => resolve(s));
  });
  const get = (k) => (out.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1] || '';
  return {
    codec: get('codec_name').trim(),
    bitRate: Number(get('bit_rate')) || 0,
    duration: Math.floor(Number(get('duration')) || 0),
  };
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const key = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!key) return res.status(401).json({ error: 'مفتاح الإدارة مطلوب' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const lessonId = String((body && body.lessonId) || '').trim();
  const originalKey = String((body && body.originalKey) || '').trim();
  if (!lessonId || !originalKey.startsWith('originals/')) {
    return res.status(400).json({ error: 'lessonId/originalKey' });
  }

  const auth = { Authorization: `Bearer ${key}` };
  // المفتاح يُتحقَّق منه لدى الـWorker نفسه قبل أيّ عمل — فلا يُحرق المعالج
  // على نداءٍ بلا صلاحية.
  const who = await fetch(`${API}/admin/whoami`, { headers: auth });
  if (!who.ok) return res.status(401).json({ error: 'مفتاح غير مقبول' });

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'minbar-'));
  const src = path.join(dir, 'original.bin');
  const out = path.join(dir, 'out.ogg');
  const cleanup = () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* لا شيء */ } };

  try {
    const ffmpeg = require('ffmpeg-static');
    const ffprobe = require('ffprobe-static').path;

    // 1) الأصل من التخزين عبر الـWorker (لا مفاتيح R2 هنا).
    const got = await fetch(`${API}/admin/media/raw?key=${encodeURIComponent(originalKey)}`, { headers: auth });
    if (!got.ok) throw new Error(`تعذّر جلب الأصل (${got.status})`);
    fs.writeFileSync(src, Buffer.from(await got.arrayBuffer()));

    // 2) الترميز — أو الإبقاء إن كان opus مضغوطاً أصلاً.
    const info = await probe(ffprobe, src);
    const keepAsIs = info.codec === 'opus' && info.bitRate > 0 && info.bitRate <= KEEP_MAX_BPS;
    await run(ffmpeg, keepAsIs
      ? ['-v', 'error', '-y', '-i', src, '-vn', '-c:a', 'copy', '-f', 'ogg', out]
      : ['-v', 'error', '-y', '-i', src, '-vn', '-ac', '1', '-c:a', 'libopus',
        '-b:a', `${OPUS_KBPS}k`, '-application', 'voip', '-f', 'ogg', out]);

    const bytes = fs.readFileSync(out);
    const sha = crypto.createHash('sha256').update(bytes).digest('hex');
    const durationSeconds = (await probe(ffprobe, out)).duration || info.duration;

    // 3) الرفع ثمّ التثبيت — الكتابة في الوثيقة آخر خطوة دائماً.
    const put = await fetch(`${API}/admin/upload/serving/${sha}.ogg`, {
      method: 'PUT', headers: { ...auth, 'Content-Type': 'audio/ogg' }, body: bytes,
    });
    if (!put.ok) throw new Error(`تعذّر رفع الناتج (${put.status})`);

    const patch = await fetch(`${API}/admin/lessons/${encodeURIComponent(lessonId)}/audio`, {
      method: 'PATCH', headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sha256: sha, durationSeconds }),
    });
    const patched = await patch.json().catch(() => ({}));
    if (!patch.ok) throw new Error(`تعذّر تثبيت الدرس (${patch.status}) ${patched.error || ''}`);

    cleanup();
    return res.status(200).json({
      ok: true, lessonId, sha256: sha, sizeBytes: bytes.length, durationSeconds, keptAsIs: keepAsIs,
    });
  } catch (e) {
    cleanup();
    return res.status(500).json({ error: String((e && e.message) || e).slice(0, 500) });
  }
};
