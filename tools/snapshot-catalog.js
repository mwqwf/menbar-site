/* يحدّث اللقطة الاحتياطية من الواجهة الحية: `node tools/snapshot-catalog.js`
   ثم يُدفع الملف. هي شبكةُ أمانٍ لا مصدرُ حقيقة — تُجدَّد بعد كل نشر محتوى. */
'use strict';
const fs = require('fs');
const path = require('path');
(async () => {
  const r = await fetch('https://minbar-adkassahk.vercel.app/api/catalog?fresh=' + Date.now());
  if (!r.ok) throw new Error('catalog ' + r.status);
  const d = await r.json();
  if (d.stale) throw new Error('المصدر يقدّم اللقطة نفسها — لا تُحدَّث من نفسها');
  if (!d.lessons || d.lessons.length < 100) throw new Error('لقطة ناقصة: ' + (d.lessons || []).length);
  d.snapshotAt = d.generatedAt;
  fs.writeFileSync(path.join(__dirname, '..', 'api', 'catalog-fallback.json'), JSON.stringify(d));
  console.log('snapshot', d.counts);
})();
