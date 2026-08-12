# واجهة منبر ادكصهك البرمجية المجانية (API)

واجهة قراءة مجانية لكل مهتم بادكصهك يريد الاستفادة من محتوى منبر برمجياً
في تطبيقه أو مشروعه — **بنفس شروط رخصة المشروع**: النسبة للمطوّر الأصلي
[mwqwf](https://github.com/mwqwf) إلزامية، والاستخدام التجاري ممنوع دون إذن
كتابي صريح. المشروع خيري ووقف لله: لا نتربّح منه ولا نسمح لأحد بالتربّح.

## النقطة الوحيدة

```
GET https://minbar-adkassahk.vercel.app/api/catalog
```

تعيد JSON فيه:

| الحقل | الوصف |
|---|---|
| `categories` | الأقسام الرئيسية `{id, name, createdAtMs}` |
| `subcategories` | الأقسام الفرعية `{id, name, categoryId, createdAtMs}` |
| `lessons` | الدروس **المنشورة** `{id, title, categoryId, subcategoryId, audioUrl, speaker, description, durationMs, views, createdAtMs}` |
| `counts` | أعداد كل مجموعة |

- **مزامنة حيّة**: البيانات هي نفسها بيانات التطبيق واللوحة لحظياً (بكاش CDN
  يمتد 5 دقائق).
- **CORS مفتوح** — تستدعيها من متصفح أو خادم أو تطبيق جوال مباشرة.
- **قراءة فقط** — لا كتابة عبر هذه الواجهة إطلاقاً، ولا مفاتيح ولا أسرار
  مطلوبة منك.
- روابط `audioUrl` تُشغَّل مباشرة في أي مشغّل صوت.

## مثال (JavaScript)

```js
const res = await fetch('https://minbar-adkassahk.vercel.app/api/catalog');
const { categories, lessons } = await res.json();
console.log(categories.length, 'قسم —', lessons.length, 'درس');
```

## قواعد الاستخدام

1. اذكر المصدر بوضوح: «المحتوى من منبر ادكصهك — github.com/mwqwf».
2. لا استخدام تجارياً بأي صورة دون إذن كتابي صريح من المطوّر شخصياً.
3. لا تُغرق الواجهة بالطلبات؛ الكاش يخدمك — استعلام كل بضع دقائق يكفي.
4. المحتوى ديني علمي؛ لا يجوز وضعه في سياق مسيء أو مضلّل.
