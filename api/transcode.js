/* ============================================================
   خطّ الصوت القانوني — ترميز درسٍ جديد إلى Opus أحادي ~40k VBR، بعلوّ موحّد
   (−18 LUFS) وسقف قمّة حقيقية −1.5 dBTP، فلا تشبّع ولا تفاوت في الصوت بين الدروس.

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
/** ogg/opus دون هذا المعدّل يُبقى كما هو — بشرط أن يكون علوّه وقمّته سليمين. */
const KEEP_MAX_BPS = 48000;
/** الكلام الأحادي: 40k VBR يحفظ عرض الحزمة كاملاً بلا أثر مسموع (قياس 2026-11-27). */
const OPUS_KBPS = 40;
/** مصدرٌ opus يُعاد ترميزه بالمعدّل نفسه: تجربة الاستماع أولى من فرق الحجم الصغير. */
const OPUS_REENCODE_KBPS = 40;
const TARGET_LUFS = -18;
const TARGET_TP = -1.5;
/** قمّة/علوّ مقبولان للإبقاء على opus كما هو. */
const KEEP_MAX_TP = -1.0;
const KEEP_LUFS_TOLERANCE = 3;

/**
 * مفكّك Opus المرجعيّ (libopus) لا مفكّك ffmpeg الأصليّ: الأصليّ يسيء فكّ مقاطع SILK
 * (ملاحظات واتساب الصوتيّة) فيرفعها ~١١ dB ويقصّها، بينما أندرويد
 * يفكّ بمفكّكٍ مرجعيّ. فالقياس وإعادة الترميز يجب أن يريا ما يراه المستمع.
 */
const decoderFor = (opus) => (opus ? ['-c:a', 'libopus'] : []);

/** قياس العلوّ المتكامل والقمّة الحقيقية (EBU R128) — يُعاد {i, tp} أو null. */
async function measureLoudness(ffmpeg, file, opus = false) {
  const err = await run(ffmpeg, ['-hide_banner', '-nostats', ...decoderFor(opus), '-i', file, '-vn', '-ac', '1',
    '-af', 'ebur128=peak=true:framelog=quiet', '-f', 'null', '-'], {}, 4000);
  const sum = err.slice(err.lastIndexOf('Summary:'));
  const i = Number((sum.match(/I:\s+(-?[\d.]+) LUFS/) || [])[1]);
  const tp = Number((sum.match(/Peak:\s+(-?[\d.]+|-inf) dBFS/) || [])[1]);
  return Number.isFinite(i) && Number.isFinite(tp) ? { i, tp } : null;
}

/** المرور الثاني: كسبٌ ثابت إلى −18 LUFS ثمّ محدِّد قمم عند −4 dBFS (هامشٌ لتجاوز Opus
 *  فيبقى الناتج ≤ −1.5 dBTP). أسرع بكثير من loudnorm الديناميكي (لا رفع إلى 192k)،
 *  ولا يغيّر ديناميكية الكلام. الكسب محدود بـ+10 dB كي لا يُضخَّم ضجيج تسجيلٍ خافت
 *  (تقييم الترميم: تنقية الضجيج لم تُفِد) — والمصدر الخافت جداً يبقى دون −18. */
const LIMIT_DBFS = -4;
const MAX_GAIN_DB = 10;
function levelFilter(m, trimDb = 0) {
  // التقليم يخفض سقف المحدِّد لا الكسبَ قبله: القمم بعد المحدِّد عند سقفه مهما قلّ الكسب،
  // فتقليم الكسب وحده لا يخفض تجاوز Opus (قياس m4a هادئ: −0.9 dBTP بعد إعادة).
  const gain = (m ? Math.min(MAX_GAIN_DB, TARGET_LUFS - m.i) : 0);
  const limit = Math.pow(10, (LIMIT_DBFS - trimDb) / 20).toFixed(4);
  return `volume=${gain.toFixed(2)}dB,alimiter=limit=${limit}:attack=5:release=50:level=disabled`;
}

function run(bin, args, opts = {}, keep = 4000) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, opts);
    let err = '';
    p.stderr.on('data', (d) => { err = (err + d.toString()).slice(-keep); });
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

    // 2) القياس ثمّ الترميز — أو الإبقاء إن كان opus مضغوطاً وعلوّه وقمّته سليمين.
    const info = await probe(ffprobe, src);
    const srcOpus = info.codec === 'opus';
    const loud = await measureLoudness(ffmpeg, src, srcOpus);
    const compressedOpus = info.codec === 'opus' && info.bitRate > 0 && info.bitRate <= KEEP_MAX_BPS;
    const keepAsIs = compressedOpus && !!loud && loud.tp <= KEEP_MAX_TP
      && Math.abs(loud.i - TARGET_LUFS) <= KEEP_LUFS_TOLERANCE;
    const kbps = compressedOpus ? OPUS_REENCODE_KBPS : OPUS_KBPS;
    const encode = (trimDb) => run(ffmpeg, ['-v', 'error', '-y', ...decoderFor(srcOpus), '-i', src, '-vn', '-ac', '1',
      '-af', levelFilter(loud, trimDb), '-ar', '48000', '-c:a', 'libopus', '-b:a', `${kbps}k`, '-vbr', 'on',
      '-application', 'audio', '-frame_duration', '20', '-f', 'ogg', out]);
    let outLoud = null;
    if (keepAsIs) {
      await run(ffmpeg, ['-v', 'error', '-y', '-i', src, '-vn', '-c:a', 'copy', '-f', 'ogg', out]);
    } else {
      await encode(0);
      // تحقّق الناتج: إن تجاوزت القمّةُ الحقيقية السقفَ (تجاوز Opus بين العيّنات) يُعاد مرّةً بكسبٍ أقلّ.
      outLoud = await measureLoudness(ffmpeg, out, true);
      if (outLoud && outLoud.tp > TARGET_TP) {
        await encode(outLoud.tp - TARGET_TP + 0.3);
        outLoud = await measureLoudness(ffmpeg, out, true);
      }
    }

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
      kbps: keepAsIs ? null : kbps, loudness: loud, output: outLoud,
    });
  } catch (e) {
    cleanup();
    return res.status(500).json({ error: String((e && e.message) || e).slice(0, 500) });
  }
};
