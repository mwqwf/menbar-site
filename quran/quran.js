/* ============================================================
   المصحف الكامل — منطق الصفحة (JS خالص، بلا أي مكتبة خارجية).

   ⚠️ لماذا ملف مستقلّ عن assets/app.js؟ لأن موجّه app.js يمسح `#app` ويعيد
   رسم «المكتبة» على أي مسار لا يعرفه، فكان سيمحو المصحف المرسوم خادمياً.
   لذلك صفحة المصحف تحمّل هذا الملف وحده، وفيه ما تحتاجه من سلوك مشترك
   (مبدّل السمة).

   الخِفّة: الفهرس يُجلب مرّة واحدة عند الحاجة فقط (التبويبات/القرّاء)، ونصّ
   الرواية يُجلب لسورة واحدة فقط وعند طلبها فعلاً. لا يُحمَّل المصحف كاملاً أبداً.
   ============================================================ */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var LS = {
    theme: 'menbar_theme',
    riwaya: 'menbar_quran_riwaya',
    reciter: 'menbar_quran_reciter',
    fs: 'menbar_quran_fs',
    last: 'menbar_quran_last',
  };
  function get(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  /* ---------- السمة (نفس مفتاح app.js حتى لا تختلف الصفحتان) ---------- */
  (function theme() {
    var btn = $('#themeBtn');
    if (!btn) return;
    var cur = function () { return document.documentElement.getAttribute('data-theme'); };
    var paint = function () { btn.textContent = cur() === 'dark' ? '☀️' : '🌙'; };
    paint();
    btn.addEventListener('click', function () {
      var t = cur() === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', t);
      set(LS.theme, t); paint();
    });
  })();

  var toastEl = null;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'q-toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { toastEl.classList.remove('show'); }, 1800);
  }

  var indexPromise = null;
  function loadIndex() {
    if (!indexPromise) indexPromise = fetch('/quran/index.json').then(function (r) { return r.json(); });
    return indexPromise;
  }

  var AR = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  function arNum(n) { return String(n).split('').map(function (d) { return AR[+d]; }).join(''); }
  function pad3(n) { return ('00' + n).slice(-3); }

  /* ============================================================
     صفحة الفهرس
     ============================================================ */
  function initIndex() {
    var tabs = $('#qTabs'), list = $('#qList');
    if (!tabs || !list) return;

    // «تابع القراءة»
    var last = get(LS.last, null);
    var resume = $('#qResume');
    if (resume && last && last.s) {
      resume.href = '/quran/' + last.s + '#a' + (last.a || 1);
      resume.innerHTML = '<b>تابع القراءة</b><span>سورة ' + escapeText(last.name || '') +
        ' — الآية ' + arNum(last.a || 1) + '</span><small>محفوظ على هذا الجهاز</small>';
      resume.hidden = false;
    }

    var surahsHtml = list.innerHTML; // قائمة السور جاءت خادمياً: لا نعيد بناءها
    var PLACE = { makki: 'مكّية', madani: 'مدنية' };

    function locate(idx, flat) {
      var s = idx.surahs;
      for (var i = s.length - 1; i >= 0; i--) {
        if (flat >= s[i].start) return { s: s[i], a: flat - s[i].start + 1 };
      }
      return { s: s[0], a: 1 };
    }

    function renderRange(idx, arr, label) {
      var html = '';
      for (var i = 0; i < arr.length; i++) {
        var at = locate(idx, arr[i].start);
        html += '<a class="q-card" href="/quran/' + at.s.n + '#a' + at.a + '">' +
          '<span class="num">' + arr[i].n + '</span><span>' +
          '<span class="nm">' + label + ' ' + arNum(arr[i].n) + '</span><br/>' +
          '<span class="mt">' + escapeText(at.s.name) + ' · الآية ' + arNum(at.a) + '</span>' +
          '</span></a>';
      }
      list.className = 'q-grid small';
      list.innerHTML = html;
    }

    tabs.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-tab]');
      if (!b) return;
      Array.prototype.forEach.call(tabs.children, function (x) { x.classList.remove('on'); });
      b.classList.add('on');
      var tab = b.getAttribute('data-tab');
      if (tab === 'surahs') { list.className = 'q-grid'; list.innerHTML = surahsHtml; return; }
      list.innerHTML = '<p class="q-note">جارٍ التحميل…</p>';
      loadIndex().then(function (idx) {
        if (tab === 'juzs') renderRange(idx, idx.juzs, 'الجزء');
        else if (tab === 'hizbs') renderRange(idx, idx.hizbs, 'الحزب');
        else renderRange(idx, idx.pages, 'صفحة');
      }).catch(function () { list.innerHTML = '<p class="q-note">تعذّر التحميل.</p>'; });
    });
    void PLACE;
  }

  function escapeText(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }

  /* ============================================================
     صفحة السورة
     ============================================================ */
  function initSurah() {
    var box = $('#qText');
    if (!box) return;

    var surah = Number(box.getAttribute('data-surah'));
    var count = Number(box.getAttribute('data-ayahs'));
    var riwayaSel = $('#qRiwaya'), reciterSel = $('#qReciter');
    var texts = {};      // نصّ السورة لكل رواية حُمّلت
    var basmalas = {};   // البسملة لكل رواية (= أولى آيات الفاتحة)
    var idx = null;
    var surahName = '';
    var current = -1;    // الآية الجارية (0-based)

    /* --- حجم الخطّ --- */
    var fs = get(LS.fs, 22);
    function applyFs() {
      fs = Math.max(16, Math.min(44, fs));
      document.documentElement.style.setProperty('--qfs', fs + 'px');
      set(LS.fs, fs);
    }
    applyFs();
    $('#qPlus').addEventListener('click', function () { fs += 2; applyFs(); });
    $('#qMinus').addEventListener('click', function () { fs -= 2; applyFs(); });

    /* --- النصّ ورسمه --- */
    texts.hafs = Array.prototype.map.call(box.querySelectorAll('.q-ayah'), function (el) {
      return el.firstChild.nodeValue.trim();
    });

    function paint(list) {
      var html = '';
      for (var i = 0; i < list.length; i++) {
        html += '<span class="q-ayah' + (i === current ? ' on' : '') + '" id="a' + (i + 1) +
          '" data-i="' + i + '">' + escapeText(list[i]) +
          ' <span class="q-mark">﴿' + arNum(i + 1) + '﴾</span></span> ';
      }
      box.innerHTML = html;
    }

    function fetchText(r) {
      if (texts[r]) return Promise.resolve(texts[r]);
      return fetch('/quran/text/' + r + '/' + surah + '.json')
        .then(function (x) { return x.json(); })
        .then(function (t) { texts[r] = t; return t; });
    }
    function fetchBasmala(r) {
      if (basmalas[r]) return Promise.resolve(basmalas[r]);
      if (surah === 1) return Promise.resolve('');
      return fetch('/quran/text/' + r + '/1.json')
        .then(function (x) { return x.json(); })
        .then(function (t) { basmalas[r] = t[0]; return t[0]; });
    }

    function setRiwaya(r, silent) {
      set(LS.riwaya, r);
      riwayaSel.value = r;
      fillReciters(r);
      return fetchText(r).then(function (t) {
        paint(t);
        return fetchBasmala(r);
      }).then(function (b) {
        var el = $('#qBasmala');
        if (el && b) el.textContent = b;
        if (!silent) toast('الرواية: ' + riwayaSel.options[riwayaSel.selectedIndex].text);
      });
    }

    /* --- القرّاء --- */
    function fillReciters(r) {
      if (!idx) return;
      var rw = idx.riwayat.filter(function (x) { return x.id === r; })[0];
      if (!rw) return;
      var saved = get(LS.reciter, {})[r];
      var html = '';
      rw.reciters.forEach(function (rc) {
        html += '<option value="' + rc.id + '" data-mode="' + rc.mode + '" data-base="' +
          escapeText(rc.base) + '"' + (rc.id === saved ? ' selected' : '') + '>' +
          escapeText(rc.name) + (rc.mode === 'surah' ? ' — سورة كاملة (بلا تمييز الآيات)' : '') +
          '</option>';
      });
      reciterSel.innerHTML = html;
    }
    reciterSel.addEventListener('change', function () {
      var m = get(LS.reciter, {});
      m[riwayaSel.value] = reciterSel.value;
      set(LS.reciter, m);
      stop();
    });

    /* --- التلاوة --- */
    var audio = new Audio();
    audio.preload = 'auto';
    var playing = false;
    var playBtn = $('#qPlay');

    function opt() { return reciterSel.options[reciterSel.selectedIndex]; }
    function urlFor(i) {
      var o = opt();
      if (!o) return null;
      var base = o.getAttribute('data-base');
      return o.getAttribute('data-mode') === 'surah'
        ? base + pad3(surah) + '.mp3'
        : base + pad3(surah) + pad3(i + 1) + '.mp3';
    }

    function highlight(i) {
      var prev = box.querySelector('.q-ayah.on');
      if (prev) prev.classList.remove('on');
      current = i;
      if (i < 0) return;
      var el = box.querySelector('.q-ayah[data-i="' + i + '"]');
      if (!el) return;
      el.classList.add('on');
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      remember(i + 1);
    }

    function remember(a) {
      set(LS.last, { s: surah, a: a, name: surahName });
    }

    function play(i) {
      var o = opt();
      if (!o) { toast('لا يوجد قارئ متاح.'); return; }
      if (o.getAttribute('data-mode') === 'surah') {
        // ملف واحد للسورة كلّها: لا يمكن تمييز الآية الجارية
        highlight(-1);
        audio.src = urlFor(0);
        toast('تلاوة السورة كاملة — لا تمييز للآيات مع هذا القارئ.');
      } else {
        highlight(i);
        audio.src = urlFor(i);
      }
      audio.play().then(function () {
        playing = true; playBtn.textContent = '⏸ إيقاف';
      }).catch(function () {
        toast('تعذّر تشغيل التلاوة.');
      });
    }

    function stop() {
      audio.pause();
      playing = false;
      playBtn.textContent = '▶ تلاوة';
    }

    audio.addEventListener('ended', function () {
      if (!opt() || opt().getAttribute('data-mode') === 'surah') { stop(); return; }
      if (current + 1 < count) play(current + 1);
      else stop();
    });
    audio.addEventListener('error', function () {
      if (playing) { stop(); toast('تعذّر تحميل ملف التلاوة.'); }
    });

    playBtn.addEventListener('click', function () {
      if (playing) stop();
      else play(current < 0 ? 0 : current);
    });

    /* --- النقر على آية: تلاوة من عندها + أدوات النسخ والمشاركة --- */
    var tools = document.createElement('div');
    tools.className = 'q-tools';
    tools.hidden = true;
    tools.innerHTML = '<button type="button" data-act="copy">نسخ الآية</button>' +
      '<button type="button" data-act="share">مشاركة</button>' +
      '<button type="button" data-act="close">إغلاق</button>';
    box.parentNode.insertBefore(tools, box.nextSibling);

    function ayahText(i) {
      var r = riwayaSel.value;
      var t = (texts[r] || texts.hafs)[i] || '';
      return '﴿' + t + '﴾ [' + surahName + ': ' + (i + 1) + ']';
    }

    tools.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var act = b.getAttribute('data-act');
      if (act === 'close') { tools.hidden = true; return; }
      var i = current < 0 ? 0 : current;
      var txt = ayahText(i);
      var url = location.origin + '/quran/' + surah + '#a' + (i + 1);
      if (act === 'copy') {
        copy(txt + '\n' + url).then(function () { toast('نُسخت الآية.'); },
          function () { toast('تعذّر النسخ.'); });
      } else if (navigator.share) {
        navigator.share({ title: 'سورة ' + surahName, text: txt, url: url }).catch(function () {});
      } else {
        copy(txt + '\n' + url).then(function () { toast('نُسخ رابط الآية.'); },
          function () { toast('تعذّر النسخ.'); });
      }
    });

    function copy(t) {
      if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t);
      return new Promise(function (res, rej) {
        var ta = document.createElement('textarea');
        ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy') ? res() : rej(); } catch (e) { rej(e); }
        document.body.removeChild(ta);
      });
    }

    box.addEventListener('click', function (e) {
      var el = e.target.closest('.q-ayah');
      if (!el) return;
      tools.hidden = false;
      play(Number(el.getAttribute('data-i')));
    });

    /* --- الإقلاع --- */
    loadIndex().then(function (data) {
      idx = data;
      var s = idx.surahs.filter(function (x) { return x.n === surah; })[0];
      surahName = s ? s.name : '';
      var r = get(LS.riwaya, 'hafs');
      if (!idx.riwayat.some(function (x) { return x.id === r; })) r = 'hafs';
      if (r === 'hafs') { riwayaSel.value = 'hafs'; fillReciters('hafs'); }
      else setRiwaya(r, true);
      var m = location.hash.match(/^#a(\d+)$/);
      remember(m ? Number(m[1]) : 1);
    }).catch(function () { $('#qHint').textContent = 'تعذّر تحميل قائمة القرّاء.'; });

    riwayaSel.addEventListener('change', function () { stop(); setRiwaya(riwayaSel.value); });
  }

  initIndex();
  initSurah();
})();
