/* ============================================================
   منبر ادكصهك — تطبيق الويب (ملف واحد، بلا تبعيّات)
   - يقرأ نفس بيانات تطبيق أندرويد مباشرة من Firestore (REST)
   - مكتبة → أقسام فرعية → دروس، بحث عربي مطبَّع، مشغّل سفلي دائم
   - تخصيص محلي بالكامل عبر localStorage (لا حسابات)
   ============================================================ */
(function () {
  'use strict';

  /* ------------------------------------------------------------
     ثوابت
     المفتاح عام ومقصود نشره: هو نفسه المفتاح المضمَّن في تطبيق
     أندرويد مفتوح المصدر، وقواعد Firestore تسمح بالقراءة فقط.
     ------------------------------------------------------------ */
  const PROJECT = 'mxqp-8d1e8';
  const API_KEY = 'AIzaSyCWAHqbzhfQ-ZcjSSVCAhFFqCTgQ66SdCs';
  const RUN_QUERY_URL =
    'https://firestore.googleapis.com/v1/projects/' + PROJECT +
    '/databases/(default)/documents:runQuery?key=' + API_KEY;
  const PAGE_SIZE = 300;              // نفس حجم صفحة الدروس في التطبيق
  const CACHE_KEY = 'menbar_catalog_v2';
  const CACHE_TTL_MS = 5 * 60 * 1000; // طزاجة الكتالوج قبل تحديث خلفي
  const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.ali.menbaradkshk';
  const GITHUB_URL = 'https://github.com/mwqwf';
  const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];

  /* ------------------------------------------------------------
     أدوات عامة
     ------------------------------------------------------------ */
  const $ = (sel, root) => (root || document).querySelector(sel);

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** تخزين محلي آمن: أي عطل (خصوصية/امتلاء) لا يكسر التطبيق. */
  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* تجاهُل */ }
    },
  };

  /** تطبيع عربي للبحث: حذف التشكيل وتوحيد الألف والتاء المربوطة والألف المقصورة. */
  function normalizeArabic(text) {
    return String(text || '')
      .replace(/[ً-ْٰـ]/g, '') // التشكيل والتطويل
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  /** تنسيق مدّة بالمللي ثانية إلى m:ss أو h:mm:ss. */
  function fmtTime(ms) {
    if (!isFinite(ms) || ms <= 0) return '0:00';
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const two = (n) => String(n).padStart(2, '0');
    return h > 0 ? h + ':' + two(m) + ':' + two(s) : m + ':' + two(s);
  }

  const fmtNum = (n) => Number(n || 0).toLocaleString('ar-EG');

  /* ------------------------------------------------------------
     فكّ ترميز قيم Firestore REST إلى قيم JavaScript عادية
     ------------------------------------------------------------ */
  function decodeValue(v) {
    if (v == null) return null;
    if ('stringValue' in v) return v.stringValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return v.doubleValue;
    if ('booleanValue' in v) return v.booleanValue;
    if ('timestampValue' in v) return v.timestampValue; // ISO string
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

  /* ------------------------------------------------------------
     تحويل الوثائق إلى نماذج — بنفس دلالات Models.kt في التطبيق
     ------------------------------------------------------------ */

  /** بعض الوثائق القديمة مغلَّفة داخل حقل data — كما في التطبيق. */
  function unwrap(data) {
    return data && typeof data.data === 'object' && data.data !== null ? data.data : data;
  }
  const text = (v) => (v == null ? '' : String(v).trim());
  function longValue(v) {
    const n = Number(v);
    return isFinite(n) ? n : 0;
  }
  /** طابع زمني بالمللي: رقم أو نص ISO أو {seconds}. */
  function timeMillis(v) {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
      const t = Date.parse(v);
      return isNaN(t) ? (Number(v) || 0) : t;
    }
    if (typeof v === 'object' && v.seconds != null) return Number(v.seconds) * 1000;
    return 0;
  }

  function toCategory(id, raw) {
    const d = unwrap(raw);
    return { id, name: text(d.name), createdAtMs: timeMillis(d.createdAt) };
  }
  function toSubcategory(id, raw) {
    const d = unwrap(raw);
    return {
      id,
      name: text(d.name),
      categoryId: text(d.categoryId),
      createdAtMs: timeMillis(d.createdAt),
    };
  }
  function toLesson(id, raw) {
    const d = unwrap(raw);
    const publishAt = d.publishAt != null ? timeMillis(d.publishAt) : 0;
    let subId = text(d.subcategoryId);
    if (!subId && d.subcategory && typeof d.subcategory === 'object') {
      subId = text(d.subcategory._id);
    }
    return {
      id,
      title: text(d.title) || text(d.name),
      categoryId: text(d.categoryId),
      subcategoryId: subId,
      audioUrl: text(d.audioUrl),
      createdAtMs: timeMillis(d.createdAt),
      views: longValue(d.views),
      // التطبيق يقرأ speaker/sheikh/reader — ونضيف sheikhName الموجود فعلاً بالبيانات
      speaker: text(d.speaker) || text(d.sheikh) || text(d.reader) || text(d.sheikhName),
      description: text(d.description),
      durationMs: longValue(d.durationMs) || longValue(d.duration),
      featured: d.featured === true,
      featuredUntilMs: timeMillis(d.featuredUntil),
      publishAtMs: publishAt > 0 ? publishAt : null,
    };
  }
  /** عنوان العرض — نفس منطق displayTitle في التطبيق. */
  const displayTitle = (l) => l.title || l.speaker || 'درس صوتي';
  /** منشور الآن؟ (الدروس المجدولة تُخزَّن في نفس المجموعة وتُرشَّح محلياً). */
  const isPublished = (l) => l.publishAtMs == null || l.publishAtMs <= Date.now();

  /* ------------------------------------------------------------
     الجلب من Firestore عبر runQuery (بترقيم مستقرّ على __name__)
     ------------------------------------------------------------ */
  async function runQuery(structuredQuery) {
    const res = await fetch(RUN_QUERY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ structuredQuery }),
    });
    if (!res.ok) throw new Error('Firestore HTTP ' + res.status);
    return res.json();
  }

  /** يجلب مجموعة كاملة على صفحات — الترتيب بمعرّف الوثيقة كما في التطبيق. */
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

  /* ------------------------------------------------------------
     حالة الكتالوج + كاش ثم مزامنة (مثل التطبيق)
     ------------------------------------------------------------ */
  const state = {
    categories: [],
    subcategories: [],
    lessons: [],       // المنشورة فقط
    loaded: false,     // هل لدينا بيانات (من الكاش أو الشبكة)؟
    error: null,
    syncing: false,
  };
  const byId = {
    lesson: new Map(),
    category: new Map(),
    subcategory: new Map(),
  };

  function applyCatalog(categories, subcategories, lessons) {
    state.categories = categories;
    state.subcategories = subcategories;
    state.lessons = lessons.filter(isPublished);
    state.loaded = state.categories.length > 0 || state.lessons.length > 0;
    byId.lesson = new Map(state.lessons.map((l) => [l.id, l]));
    byId.category = new Map(state.categories.map((c) => [c.id, c]));
    byId.subcategory = new Map(state.subcategories.map((s) => [s.id, s]));
  }

  function readCache() {
    const c = store.get(CACHE_KEY, null);
    if (!c || !Array.isArray(c.lessons)) return null;
    return c;
  }

  async function syncCatalog() {
    if (state.syncing) return;
    state.syncing = true;
    setSyncNote(state.loaded); // «يتم التحديث…» فقط حين يوجد محتوى معروض
    try {
      const [categories, subcategories, lessons] = await Promise.all([
        fetchCollection('categories', toCategory),
        fetchCollection('subcategories', toSubcategory),
        fetchCollection('lessons', toLesson),
      ]);
      applyCatalog(categories, subcategories, lessons);
      state.error = null;
      store.set(CACHE_KEY, { at: Date.now(), categories, subcategories, lessons });
      render();
    } catch (e) {
      if (!state.loaded) {
        state.error = 'تعذّر الاتصال بالخادم. تأكّد من اتصالك بالإنترنت ثم أعد المحاولة.';
        render();
      }
      // مع وجود كاش نكتفي بالنسخة المحفوظة بصمت — كما يفعل التطبيق
    } finally {
      state.syncing = false;
      setSyncNote(false);
    }
  }

  function setSyncNote(show) {
    const el = $('#syncNote');
    if (el) el.classList.toggle('show', !!show);
  }

  /* ------------------------------------------------------------
     استعلامات محلية — بنفس ترتيب ContentRepository
     ------------------------------------------------------------ */
  const withAudio = () => state.lessons.filter((l) => l.audioUrl);
  const lessonsForSubcategory = (subId) =>
    state.lessons.filter((l) => l.subcategoryId === subId)
      .sort((a, b) => a.createdAtMs - b.createdAtMs);
  const lessonsForCategory = (catId) =>
    state.lessons.filter((l) => l.categoryId === catId)
      .sort((a, b) => a.createdAtMs - b.createdAtMs);
  const subcategoriesForCategory = (catId) =>
    state.subcategories.filter((s) => s.categoryId === catId)
      .sort((a, b) => b.createdAtMs - a.createdAtMs);
  const newest = (limit) =>
    withAudio().slice().sort((a, b) => b.createdAtMs - a.createdAtMs).slice(0, limit || 15);
  function featured(limit) {
    const now = Date.now();
    return withAudio()
      .filter((l) => l.featured && (l.featuredUntilMs <= 0 || l.featuredUntilMs > now))
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
      .slice(0, limit || 12);
  }
  function searchLessons(query) {
    const q = normalizeArabic(query);
    if (!q) return [];
    return withAudio().filter((l) => {
      const hay = normalizeArabic(displayTitle(l) + ' ' + l.speaker);
      return hay.includes(q);
    }).sort((a, b) => b.createdAtMs - a.createdAtMs);
  }

  /* ------------------------------------------------------------
     التخصيص المحلي: مفضّلة / مواضع استئناف / سجلّ / مكتمل
     ------------------------------------------------------------ */
  const personal = {
    favorites: () => store.get('menbar_favorites', []),
    isFavorite: (id) => personal.favorites().includes(id),
    toggleFavorite(id) {
      let favs = personal.favorites().filter((x) => x !== id);
      const added = !personal.isFavorite(id);
      if (added) favs = [id].concat(favs);
      store.set('menbar_favorites', favs);
      return added;
    },
    positions: () => store.get('menbar_positions', {}),
    savePosition(id, ms) {
      const p = personal.positions();
      p[id] = Math.floor(ms);
      store.set('menbar_positions', p);
    },
    clearPosition(id) {
      const p = personal.positions();
      delete p[id];
      store.set('menbar_positions', p);
    },
    completed: () => store.get('menbar_completed', []),
    markCompleted(id) {
      const c = personal.completed();
      if (!c.includes(id)) { c.push(id); store.set('menbar_completed', c); }
      personal.clearPosition(id);
    },
    history: () => store.get('menbar_history', []), // [{id, at}] الأحدث أولاً
    recordPlay(id) {
      const h = personal.history().filter((e) => e.id !== id);
      h.unshift({ id, at: Date.now() });
      store.set('menbar_history', h.slice(0, 120));
      // إعادة التشغيل تُخرج الدرس من قائمة «المكتمل» ليعود لتابع الاستماع
      const c = personal.completed();
      const idx = c.indexOf(id);
      if (idx >= 0) { c.splice(idx, 1); store.set('menbar_completed', c); }
    },
    /** «تابع الاستماع»: من السجلّ، غير مكتمل، وتقدّمه تجاوز 3 ثوانٍ. */
    continueListening() {
      const completed = new Set(personal.completed());
      const positions = personal.positions();
      return personal.history()
        .map((e) => byId.lesson.get(e.id))
        .filter((l) => l && !completed.has(l.id) && (positions[l.id] || 0) > 3000);
    },
  };

  /* ------------------------------------------------------------
     السمة: اتباع النظام افتراضياً + مبدّل يدوي محفوظ
     ------------------------------------------------------------ */
  const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function currentTheme() {
    const saved = store.get('menbar_theme', null);
    if (saved === 'light' || saved === 'dark') return saved;
    return media && media.matches ? 'dark' : 'light';
  }
  function applyTheme() {
    const t = currentTheme();
    document.documentElement.setAttribute('data-theme', t);
    const btn = $('#themeBtn');
    if (btn) btn.textContent = t === 'dark' ? '☀️' : '🌙';
  }
  function toggleTheme() {
    store.set('menbar_theme', currentTheme() === 'dark' ? 'light' : 'dark');
    applyTheme();
  }
  if (media && media.addEventListener) media.addEventListener('change', applyTheme);
  applyTheme();

  /* ------------------------------------------------------------
     المشغّل السفلي الدائم
     ------------------------------------------------------------ */
  const player = {
    audio: new Audio(),
    queue: [],          // معرّفات الدروس في القائمة الحالية
    index: -1,
    lastSaveMs: 0,
    speedIdx: (() => {
      const saved = store.get('menbar_speed', 1);
      const i = SPEEDS.indexOf(saved);
      return i >= 0 ? i : 1;
    })(),

    current() { return this.index >= 0 ? byId.lesson.get(this.queue[this.index]) : null; },

    /** تشغيل درس ضمن قائمة (تسبقه/تليه دروس «التالي/السابق»). */
    play(lessonId, queueIds) {
      const lesson = byId.lesson.get(lessonId);
      if (!lesson || !lesson.audioUrl) return;
      if (Array.isArray(queueIds) && queueIds.length) {
        this.queue = queueIds.slice();
      } else if (!this.queue.includes(lessonId)) {
        this.queue = [lessonId];
      }
      this.index = this.queue.indexOf(lessonId);
      const resume = personal.positions()[lessonId] || 0;
      this.audio.src = lesson.audioUrl;
      this.audio.playbackRate = SPEEDS[this.speedIdx];
      // الاستئناف من آخر موضع محفوظ (مع هامش رجوع بسيط كما تفعل المشغّلات)
      if (resume > 3000) {
        const target = Math.max(0, resume - 1500) / 1000;
        this.audio.currentTime = target; // قد يُضبط مجدداً بعد loadedmetadata
        this.audio.addEventListener('loadedmetadata', function once() {
          if (Math.abs(player.audio.currentTime - target) > 2) player.audio.currentTime = target;
          player.audio.removeEventListener('loadedmetadata', once);
        });
      }
      this.audio.play().catch(() => {});
      personal.recordPlay(lessonId);
      this.updateBar();
      this.updateMediaSession();
      markPlayingRows();
      $('#player').classList.add('show');
    },

    toggle() {
      if (!this.audio.src) return;
      if (this.audio.paused) this.audio.play().catch(() => {}); else this.audio.pause();
    },
    skip(deltaSec) {
      if (!this.audio.src) return;
      this.audio.currentTime = Math.max(0, this.audio.currentTime + deltaSec);
    },
    next() {
      if (this.index < this.queue.length - 1) this.play(this.queue[this.index + 1], this.queue);
    },
    prev() {
      // ضغطة «السابق» بعد أكثر من 5 ثوانٍ تعيد الدرس للبداية (سلوك مألوف)
      if (this.audio.currentTime > 5 || this.index <= 0) this.audio.currentTime = 0;
      else this.play(this.queue[this.index - 1], this.queue);
    },
    cycleSpeed() {
      this.speedIdx = (this.speedIdx + 1) % SPEEDS.length;
      this.audio.playbackRate = SPEEDS[this.speedIdx];
      store.set('menbar_speed', SPEEDS[this.speedIdx]);
      $('#speedBtn').textContent = SPEEDS[this.speedIdx] + '×';
    },
    close() {
      this.savePositionNow();
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.audio.load();
      this.index = -1;
      $('#player').classList.remove('show');
      markPlayingRows();
    },

    savePositionNow() {
      const lesson = this.current();
      if (!lesson || !isFinite(this.audio.currentTime)) return;
      const pos = this.audio.currentTime * 1000;
      if (pos > 3000) personal.savePosition(lesson.id, pos);
    },

    updateBar() {
      const lesson = this.current();
      if (!lesson) return;
      const sub = byId.subcategory.get(lesson.subcategoryId);
      $('#playerTitle').innerHTML =
        esc(displayTitle(lesson)) +
        '<small>' + esc(sub ? sub.name : (byId.category.get(lesson.categoryId) || {}).name || '') + '</small>';
      $('#speedBtn').textContent = SPEEDS[this.speedIdx] + '×';
      this.updateSeek();
    },
    updateSeek() {
      const dur = this.audio.duration;
      const cur = this.audio.currentTime || 0;
      const range = $('#seek');
      if (isFinite(dur) && dur > 0) {
        range.max = dur;
        if (!range.matches(':active')) range.value = cur;
        range.style.setProperty('--filled', (cur / dur) * 100 + '%');
        $('#tTotal').textContent = fmtTime(dur * 1000);
      } else {
        const lesson = this.current();
        $('#tTotal').textContent = fmtTime(lesson ? lesson.durationMs : 0);
      }
      $('#tCur').textContent = fmtTime(cur * 1000);
      $('#playBtn').textContent = this.audio.paused ? '▶' : '⏸';
    },

    updateMediaSession() {
      if (!('mediaSession' in navigator)) return;
      const lesson = this.current();
      if (!lesson) return;
      const sub = byId.subcategory.get(lesson.subcategoryId);
      const cat = byId.category.get(lesson.categoryId);
      navigator.mediaSession.metadata = new MediaMetadata({
        title: displayTitle(lesson),
        artist: lesson.speaker || 'منبر ادكصهك',
        album: [cat && cat.name, sub && sub.name].filter(Boolean).join(' — ') || 'منبر ادكصهك',
      });
    },
  };

  // حفظ الموضع كل ~5 ثوانٍ أثناء التشغيل + تحديث شريط التقدّم
  player.audio.addEventListener('timeupdate', () => {
    player.updateSeek();
    const now = Date.now();
    if (now - player.lastSaveMs > 5000) {
      player.lastSaveMs = now;
      player.savePositionNow();
    }
  });
  player.audio.addEventListener('pause', () => { player.savePositionNow(); player.updateSeek(); });
  player.audio.addEventListener('play', () => player.updateSeek());
  player.audio.addEventListener('ended', () => {
    const lesson = player.current();
    if (lesson) personal.markCompleted(lesson.id);
    player.next();
  });
  window.addEventListener('beforeunload', () => player.savePositionNow());

  // أزرار قفل الشاشة / سماعات البلوتوث عبر Media Session API
  if ('mediaSession' in navigator) {
    const ms = navigator.mediaSession;
    const safe = (action, fn) => { try { ms.setActionHandler(action, fn); } catch (e) { /* غير مدعوم */ } };
    safe('play', () => player.audio.play());
    safe('pause', () => player.audio.pause());
    safe('seekbackward', () => player.skip(-10));
    safe('seekforward', () => player.skip(10));
    safe('previoustrack', () => player.prev());
    safe('nexttrack', () => player.next());
    safe('seekto', (d) => { if (d.seekTime != null) player.audio.currentTime = d.seekTime; });
  }

  // اختصارات لوحة المفاتيح: مسافة = تشغيل/إيقاف، أسهم = قفز ±10 ثوانٍ
  document.addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
    if (e.code === 'Space') { e.preventDefault(); player.toggle(); }
    else if (e.code === 'ArrowLeft') player.skip(-10);
    else if (e.code === 'ArrowRight') player.skip(10);
  });

  /* ------------------------------------------------------------
     قوالب HTML للمكوّنات
     ------------------------------------------------------------ */
  function lessonRowHtml(lesson, extra) {
    const sub = byId.subcategory.get(lesson.subcategoryId);
    const positions = personal.positions();
    const pos = positions[lesson.id] || 0;
    const dur = lesson.durationMs;
    const progress = pos > 3000 && dur > 0 ? Math.min(100, (pos / dur) * 100) : 0;
    const playing = player.current() && player.current().id === lesson.id;
    const fav = personal.isFavorite(lesson.id);
    const bits = [];
    if (dur > 0) bits.push('⏱ ' + fmtTime(dur));
    if (lesson.views > 0) bits.push('🎧 ' + fmtNum(lesson.views));
    if (extra && sub) bits.push(esc(sub.name));
    if (lesson.speaker) bits.push(esc(lesson.speaker));
    return (
      '<div class="lesson-row' + (playing ? ' playing' : '') + '" data-lesson="' + esc(lesson.id) + '">' +
        '<button class="playbtn" aria-label="تشغيل">' + (playing && !player.audio.paused ? '⏸' : '▶') + '</button>' +
        '<div class="info">' +
          '<div class="title">' + esc(displayTitle(lesson)) + '</div>' +
          '<div class="sub">' + bits.join(' · ') + '</div>' +
        '</div>' +
        '<button class="fav' + (fav ? ' on' : '') + '" data-fav="' + esc(lesson.id) + '" aria-label="مفضّلة">' + (fav ? '★' : '☆') + '</button>' +
        (progress ? '<div class="prog" style="width:' + progress.toFixed(1) + '%"></div>' : '') +
      '</div>'
    );
  }

  function lessonListHtml(lessons, extra) {
    if (!lessons.length) return emptyHtml('لا توجد دروس هنا بعد.');
    return '<div class="lesson-list">' + lessons.map((l) => lessonRowHtml(l, extra)).join('') + '</div>';
  }

  function emptyHtml(msg, icon) {
    return '<div class="state-box"><div class="big">' + (icon || '🗂️') + '</div><h3>' + esc(msg) + '</h3></div>';
  }

  function appBannerHtml() {
    return (
      '<div class="app-banner">' +
        '<p>للتنزيل دون إنترنت، ومؤقّت النوم، والودجت، وكل المزايا — حمّل تطبيق منبر ادكصهك المجاني.</p>' +
        '<a href="' + PLAY_URL + '" target="_blank" rel="noopener">حمّل التطبيق</a>' +
      '</div>'
    );
  }

  /* ------------------------------------------------------------
     الموجّه (توجيه بالوسم #/…) + دعم مسار /lesson/:id العميق
     ------------------------------------------------------------ */
  function parseRoute() {
    // المسارات الحقيقية القابلة للفهرسة: /lesson/<id> و/category/<id>
    // و/section/<id>. الخادم يعرضها بعنوانها ووصفها الحقيقيين (api/render.js)،
    // وهنا نكمل العرض التفاعلي بنفس العروض المستعملة في التوجيه بالوسم.
    const pathMatch = location.pathname.match(/^\/(lesson|category|section)\/([^/]+)\/?$/);
    const hash = location.hash.replace(/^#\/?/, '');
    if (hash) {
      const parts = hash.split('/');
      return { name: parts[0] || 'home', arg: decodeURIComponent(parts[1] || ''), query: parts.slice(1).join('/') };
    }
    if (pathMatch) {
      const kind = pathMatch[1] === 'section' ? 'sub' : pathMatch[1];
      return { name: kind, arg: decodeURIComponent(pathMatch[2]) };
    }
    return { name: 'home', arg: '' };
  }

  function render() {
    const app = $('#app');
    if (!app) return;
    const route = parseRoute();

    // حالة ما قبل وصول أي بيانات
    if (!state.loaded) {
      if (state.error) {
        app.innerHTML =
          '<div class="wrap"><div class="state-box"><div class="big">📡</div>' +
          '<h3>تعذّر تحميل المكتبة</h3><p>' + esc(state.error) + '</p>' +
          '<button class="btn btn-teal retry" id="retryBtn">إعادة المحاولة</button></div></div>';
        $('#retryBtn').addEventListener('click', () => { state.error = null; render(); syncCatalog(); });
      } else {
        app.innerHTML =
          '<div class="wrap"><div class="state-box"><div class="spinner"></div>' +
          '<h3>جارٍ تحميل المكتبة…</h3><p>يُجلب الكتالوج مباشرة من قاعدة بيانات التطبيق.</p></div></div>';
      }
      return;
    }

    const views = { home: viewHome, category: viewCategory, sub: viewSub, lesson: viewLesson, search: viewSearch, mylists: viewMyLists };
    (views[route.name] || viewHome)(app, route.arg);
    highlightNav(route.name);
    bindLessonRows(app);
    window.scrollTo({ top: 0 });
  }

  function highlightNav(name) {
    document.querySelectorAll('.navlinks a').forEach((a) => {
      a.classList.toggle('active', a.dataset.route === name);
    });
  }

  /** ربط النقر على صفوف الدروس وأزرار المفضّلة داخل العرض الحالي. */
  function bindLessonRows(root) {
    root.querySelectorAll('.lesson-row').forEach((row) => {
      const id = row.dataset.lesson;
      row.addEventListener('click', (e) => {
        if (e.target.closest('[data-fav]')) return;
        if (e.target.closest('.playbtn')) {
          // زر التشغيل: يشغّل/يوقف مباشرة دون مغادرة الصفحة
          const cur = player.current();
          if (cur && cur.id === id) player.toggle();
          else player.play(id, currentQueueFor(row));
          markPlayingRows();
          return;
        }
        location.hash = '#/lesson/' + encodeURIComponent(id);
      });
      const favBtn = row.querySelector('[data-fav]');
      if (favBtn) favBtn.addEventListener('click', () => {
        const on = personal.toggleFavorite(id);
        favBtn.classList.toggle('on', on);
        favBtn.textContent = on ? '★' : '☆';
      });
    });
  }

  /** قائمة «التالي/السابق»: كل معرّفات الدروس المعروضة في نفس القائمة. */
  function currentQueueFor(row) {
    const list = row.closest('.lesson-list');
    if (!list) return null;
    return Array.from(list.querySelectorAll('.lesson-row')).map((r) => r.dataset.lesson);
  }

  /** تحديث وسم «قيد التشغيل» على الصفوف الظاهرة دون إعادة رسم كاملة. */
  function markPlayingRows() {
    const cur = player.current();
    document.querySelectorAll('.lesson-row').forEach((row) => {
      const isCur = cur && row.dataset.lesson === cur.id;
      row.classList.toggle('playing', !!isCur);
      const btn = row.querySelector('.playbtn');
      if (btn) btn.textContent = isCur && !player.audio.paused ? '⏸' : '▶';
    });
  }
  player.audio.addEventListener('play', markPlayingRows);
  player.audio.addEventListener('pause', markPlayingRows);

  /* ------------------------------------------------------------
     العروض
     ------------------------------------------------------------ */
  function viewHome(app) {
    const cont = personal.continueListening();
    const feat = featured(8);
    const latest = newest(15);
    let html =
      '<div class="hero"><div class="wrap">' +
        '<span class="chip">استمع الآن مباشرة من المتصفّح</span>' +
        '<h1>منبر ادكصهك — أرشيف مشايخكم صوتاً</h1>' +
        '<p>مئات الدروس العلمية مصنّفة بحسب العلوم، متزامنة لحظياً مع مكتبة التطبيق — بلا حساب وبلا إعلانات.</p>' +
        '<form class="searchbar" id="heroSearch"><input type="search" placeholder="ابحث عن درس أو شيخ…" aria-label="بحث"/></form>' +
      '</div></div><div class="wrap">';

    if (cont.length) {
      html += '<section class="block"><div class="sec-title"><h2>تابع الاستماع</h2>' +
        '<a class="more" href="#/mylists">قوائمي ←</a></div>' + lessonListHtml(cont.slice(0, 5), true) + '</section>';
    }
    if (feat.length) {
      html += '<section class="block"><div class="sec-title"><h2>مختارات المنبر</h2></div>' +
        lessonListHtml(feat, true) + '</section>';
    }
    html += '<section class="block"><div class="sec-title"><h2>أحدث الدروس</h2></div>' +
      lessonListHtml(latest, true) + '</section>';

    // شبكة الأقسام الرئيسية مع العدّادات
    html += '<section class="block"><div class="sec-title"><h2>المكتبة بحسب العلوم</h2></div><div class="grid-cats">';
    const cats = state.categories.slice().sort((a, b) => b.createdAtMs - a.createdAtMs);
    for (const cat of cats) {
      const subCount = state.subcategories.filter((s) => s.categoryId === cat.id).length;
      const lessonCount = state.lessons.filter((l) => l.categoryId === cat.id).length;
      html += '<a class="cat-card" href="#/category/' + encodeURIComponent(cat.id) + '">' +
        '<h3>' + esc(cat.name) + '</h3><div class="meta">' +
        '<span>' + fmtNum(subCount) + ' قسم فرعي</span><span>' + fmtNum(lessonCount) + ' درس</span>' +
        '</div></a>';
    }
    html += '</div></section>' + appBannerHtml() + '</div>';
    app.innerHTML = html;

    $('#heroSearch').addEventListener('submit', (e) => {
      e.preventDefault();
      const q = e.target.querySelector('input').value.trim();
      location.hash = '#/search/' + encodeURIComponent(q);
    });
  }

  function viewCategory(app, catId) {
    const cat = byId.category.get(catId);
    if (!cat) { app.innerHTML = '<div class="wrap">' + emptyHtml('القسم غير موجود.') + '</div>'; return; }
    const subs = subcategoriesForCategory(catId);
    let html = '<div class="wrap"><div class="page-head">' +
      '<a class="back" href="#/" aria-label="رجوع">→</a><h1>' + esc(cat.name) + '</h1>' +
      '<span class="count">' + fmtNum(lessonsForCategory(catId).length) + ' درس</span></div>';
    if (!subs.length) {
      html += emptyHtml('لا أقسام فرعية هنا بعد.');
    } else {
      html += '<div class="grid-cats" style="margin-top:12px">';
      for (const sub of subs) {
        const n = state.lessons.filter((l) => l.subcategoryId === sub.id).length;
        html += '<a class="cat-card" href="#/sub/' + encodeURIComponent(sub.id) + '">' +
          '<h3>' + esc(sub.name) + '</h3><div class="meta"><span>' + fmtNum(n) + ' درس</span></div></a>';
      }
      html += '</div>';
    }
    app.innerHTML = html + '</div>';
  }

  function viewSub(app, subId) {
    const sub = byId.subcategory.get(subId);
    if (!sub) { app.innerHTML = '<div class="wrap">' + emptyHtml('القسم غير موجود.') + '</div>'; return; }
    const cat = byId.category.get(sub.categoryId);
    const lessons = lessonsForSubcategory(subId);
    app.innerHTML = '<div class="wrap"><div class="page-head">' +
      '<a class="back" href="#/category/' + encodeURIComponent(sub.categoryId) + '" aria-label="رجوع">→</a>' +
      '<h1>' + esc(sub.name) + '</h1>' +
      '<span class="count">' + fmtNum(lessons.length) + ' درس</span></div>' +
      (cat ? '<p style="color:var(--muted);font-size:13px;margin-bottom:10px">ضمن: ' + esc(cat.name) + '</p>' : '') +
      lessonListHtml(lessons) + '</div>';
  }

  function viewLesson(app, lessonId) {
    const lesson = byId.lesson.get(lessonId);
    if (!lesson) {
      app.innerHTML = '<div class="wrap">' + emptyHtml('هذا الدرس غير متاح — ربما حُذف أو لم يُنشر بعد.', '🔎') +
        '<div style="text-align:center">' + appBannerHtml() + '</div></div>';
      return;
    }
    const sub = byId.subcategory.get(lesson.subcategoryId);
    const cat = byId.category.get(lesson.categoryId);
    const fav = personal.isFavorite(lesson.id);
    const path = [];
    if (cat) path.push('<a href="#/category/' + encodeURIComponent(cat.id) + '">' + esc(cat.name) + '</a>');
    if (sub) path.push('<a href="#/sub/' + encodeURIComponent(sub.id) + '">' + esc(sub.name) + '</a>');
    const meta = [];
    if (lesson.durationMs > 0) meta.push('⏱ ' + fmtTime(lesson.durationMs));
    if (lesson.views > 0) meta.push('🎧 ' + fmtNum(lesson.views) + ' استماع');
    if (lesson.speaker) meta.push('🎙️ ' + esc(lesson.speaker));

    app.innerHTML = '<div class="wrap">' +
      '<div class="lesson-hero">' +
        '<div class="logo"><svg viewBox="0 0 24 24"><path d="M12 3a4 4 0 0 1 4 4v5a4 4 0 0 1-8 0V7a4 4 0 0 1 4-4zm-6 9a6 6 0 0 0 12 0h2a8 8 0 0 1-7 7.94V22h-2v-2.06A8 8 0 0 1 4 12h2z"/></svg></div>' +
        '<h1>' + esc(displayTitle(lesson)) + '</h1>' +
        (path.length ? '<div class="path">' + path.join(' › ') + '</div>' : '') +
        (meta.length ? '<div class="path">' + meta.join(' · ') + '</div>' : '') +
        (lesson.description ? '<p class="desc">' + esc(lesson.description) + '</p>' : '') +
        '<div class="actions">' +
          (lesson.audioUrl
            ? '<button class="btn btn-gold" id="playHero">▶ استمع الآن</button>'
            : '<span class="btn btn-ghost">لا ملف صوتي لهذا الدرس</span>') +
          '<button class="btn btn-ghost" id="favHero">' + (fav ? '★ في المفضّلة' : '☆ أضِف للمفضّلة') + '</button>' +
        '</div>' +
      '</div>' +
      appBannerHtml() +
      (sub ? '<section class="block"><div class="sec-title"><h2>من نفس القسم</h2>' +
        '<a class="more" href="#/sub/' + encodeURIComponent(sub.id) + '">عرض الكل ←</a></div>' +
        lessonListHtml(lessonsForSubcategory(sub.id).filter((l) => l.id !== lesson.id).slice(0, 8)) + '</section>' : '') +
      '</div>';

    const playHero = $('#playHero');
    if (playHero) playHero.addEventListener('click', () => {
      // قائمة التشغيل = دروس القسم الفرعي بترتيبها (التالي/السابق يعملان)
      const queue = sub ? lessonsForSubcategory(sub.id).filter((l) => l.audioUrl).map((l) => l.id) : [lesson.id];
      player.play(lesson.id, queue.length ? queue : [lesson.id]);
    });
    $('#favHero').addEventListener('click', function () {
      const on = personal.toggleFavorite(lesson.id);
      this.textContent = on ? '★ في المفضّلة' : '☆ أضِف للمفضّلة';
    });
  }

  function viewSearch(app, initial) {
    app.innerHTML = '<div class="wrap"><div class="page-head"><a class="back" href="#/" aria-label="رجوع">→</a><h1>البحث</h1></div>' +
      '<form class="searchbar inpage" id="searchForm" style="margin:8px 0 18px">' +
      '<input type="search" id="searchInput" placeholder="ابحث عن درس أو شيخ… (يتجاهل التشكيل والهمزات)" value="' + esc(initial || '') + '"/></form>' +
      '<div id="searchResults"></div></div>';
    const input = $('#searchInput');
    const results = $('#searchResults');
    function run() {
      const q = input.value.trim();
      if (!q) { results.innerHTML = emptyHtml('اكتب كلمة للبحث في عناوين الدروس والمشايخ.', '🔍'); return; }
      const found = searchLessons(q);
      results.innerHTML = found.length
        ? '<p style="color:var(--muted);font-size:13px;margin-bottom:10px">' + fmtNum(found.length) + ' نتيجة</p>' + lessonListHtml(found.slice(0, 100), true)
        : emptyHtml('لا نتائج لهذا البحث — جرّب كلمة أخرى.', '🔍');
      bindLessonRows(results);
    }
    $('#searchForm').addEventListener('submit', (e) => { e.preventDefault(); run(); });
    let t;
    input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(run, 250); });
    run();
    input.focus();
  }

  function viewMyLists(app) {
    const tab = store.get('menbar_mylists_tab', 'fav');
    app.innerHTML = '<div class="wrap"><div class="page-head"><a class="back" href="#/" aria-label="رجوع">→</a><h1>قوائمي</h1></div>' +
      '<div class="tabs">' +
        '<button data-tab="fav" class="' + (tab === 'fav' ? 'on' : '') + '">المفضّلة</button>' +
        '<button data-tab="cont" class="' + (tab === 'cont' ? 'on' : '') + '">تابع الاستماع</button>' +
        '<button data-tab="hist" class="' + (tab === 'hist' ? 'on' : '') + '">سجلّ الاستماع</button>' +
      '</div><div id="tabBody"></div>' +
      '<p style="color:var(--muted);font-size:12.5px;margin-top:14px">تُحفظ هذه القوائم على جهازك فقط (localStorage) — لا حسابات ولا تتبّع.</p></div>';

    function renderTab(which) {
      store.set('menbar_mylists_tab', which);
      document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === which));
      const body = $('#tabBody');
      let lessons = [];
      if (which === 'fav') lessons = personal.favorites().map((id) => byId.lesson.get(id)).filter(Boolean);
      else if (which === 'cont') lessons = personal.continueListening();
      else lessons = personal.history().map((e) => byId.lesson.get(e.id)).filter(Boolean);
      const emptyMsgs = {
        fav: 'لا مفضّلة بعد — اضغط ☆ على أي درس لإضافته.',
        cont: 'لا دروس غير مكتملة — ابدأ الاستماع وسنحفظ موضعك تلقائياً.',
        hist: 'سجلّ الاستماع فارغ بعد.',
      };
      body.innerHTML = lessons.length ? lessonListHtml(lessons, true) : emptyHtml(emptyMsgs[which], '📂');
      bindLessonRows(body);
    }
    document.querySelectorAll('.tabs button').forEach((b) =>
      b.addEventListener('click', () => renderTab(b.dataset.tab)));
    renderTab(tab);
  }

  /* ------------------------------------------------------------
     ربط شريط المشغّل والترويسة
     ------------------------------------------------------------ */
  function bindChrome() {
    $('#themeBtn').addEventListener('click', toggleTheme);
    $('#playBtn').addEventListener('click', () => player.toggle());
    $('#nextBtn').addEventListener('click', () => player.next());
    $('#prevBtn').addEventListener('click', () => player.prev());
    $('#fwdBtn').addEventListener('click', () => player.skip(10));
    $('#backBtn').addEventListener('click', () => player.skip(-10));
    $('#speedBtn').addEventListener('click', () => player.cycleSpeed());
    $('#closePlayer').addEventListener('click', () => player.close());
    $('#seek').addEventListener('input', (e) => {
      player.audio.currentTime = Number(e.target.value);
    });
    $('#playerTitle').addEventListener('click', () => {
      const cur = player.current();
      if (cur) location.hash = '#/lesson/' + encodeURIComponent(cur.id);
    });
  }

  /* ------------------------------------------------------------
     الإقلاع: كاش فوري → مزامنة خلفية (نفس فلسفة التطبيق)
     ------------------------------------------------------------ */
  function boot() {
    applyTheme();
    bindChrome();
    window.addEventListener('hashchange', render);

    const cached = readCache();
    if (cached) {
      applyCatalog(cached.categories || [], cached.subcategories || [], cached.lessons || []);
      render();
      // الكاش الطازج يُكتفى به؛ الأقدم من TTL يُحدَّث في الخلفية ثم يُعاد الرسم
      if (Date.now() - (cached.at || 0) > CACHE_TTL_MS) syncCatalog();
    } else {
      render();       // حالة «جارٍ التحميل»
      syncCatalog();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
