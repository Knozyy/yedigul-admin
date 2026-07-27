# Dönem seçimi ve hafta ritminin yeniden kurulması

Tarih: 2026-07-27
Durum: Onaylandı, uygulanmayı bekliyor
Depolar: `Yedigül` (istatistik ucu) · `Yediguladmin` (pano kartı)

## 1. Neden

Panodaki "Hafta ritmi" ısı haritası okunmuyordu. Somut nedenler:

- **İki farklı "boş" ters ağırlıkta çiziliyordu.** Pencere dışı gün kesikli
  çerçeveyle göze çarpıyor, sıfır ziyaretli GERÇEK gün `transparent` olduğu için
  hiç görünmüyordu. Anlamı olmayan hücre, veri taşıyan günden baskındı.
- **Hafta sonu çerçevesi ikinci bir kodlama olarak yarışıyordu** — dolgunun
  üstüne binen altın `outline`, 30 günün ~%30'unda.
- **`1H/2H` etiketi yanıltıcıydı**: `1H` en ESKİ haftaydı. "1 hafta önce" diye
  okuyan yanlış satıra bakardı.
- Efsanede sıfır yoktu; en sık durum hiçbir yerde açıklanmıyordu.

Ayrıca kart yalnızca **son 30 günü** gösterebiliyordu. İşletmenin sorduğu
"geçen ay nasıldı", "geçen yıl bu ay ne oldu" sorularının cevabı yoktu.

## 2. Veri gerçeği (tasarımı belirleyen kısıt)

`stats_daily` sayacı **2026-07-07**'de eklendi (Yedigül `df369d1`) ve tablo
**hiç budanmıyor** — tüm geçmiş sunucuda duruyor. Sorun API'de:
`/api/admin/stats` son 30 günü sabit kodluyor.

| Karşılaştırma | Ne zaman mümkün |
|---|---|
| Hafta ↔ hafta | Şimdi |
| Serbest tarih aralığı | Şimdi |
| Ay ↔ ay | Ağustos↔Eylül için 1 Ekim 2026 (Temmuz eksik ay) |
| Yıl ↔ yıl | Temmuz 2027 |

**Karar:** sistem bugün tam kurulur, veri yetmeyen dönem dürüstçe söylenir.
Zaman geçtikçe kendiliğinden dolar; ikinci bir tur gerekmez.

## 3. Sunucu (Yedigül)

`GET /api/admin/stats` isteğe bağlı `from` / `to` alır (`YYYY-MM-DD`).

- **Parametresiz çağrı bugünkü davranışı aynen korur** (son 30 gün). Panonun
  `siteStats` konektörü bu ucu parametresiz çağırıyor; ona dokunulmaz.
- `from`/`to` verilirse yalnız **`days[]`** o aralığı kapsar.
  `today` / `week` / `month` alanları **değişmez** — mevcut tüketici onları
  kullanıyor ve anlamları aralıktan bağımsız.
- Biçim `^\d{4}-\d{2}-\d{2}$` değilse veya `from > to` ise **400**.
- Aralık en fazla **730 gün**; üstü 400. Yıllık aralık ~15 KB JSON, tünel için
  sorun değil.
- Yanıta **`firstDay`** eklenir: `SELECT MIN(day) FROM stats_daily`. Sayacın ne
  zaman başladığını panel böylece **gerçek veriden** öğrenir; tarih gömülmez.
  Tablo boşsa `null`.

Reddedilen alternatifler:
- *Pano snapshot'larından okumak* (`site.menu_view`, `/admin/snapshots` zaten
  `from`/`to` destekliyor): Yedigül'e hiç dokunmadan çalışırdı ama snapshot'lar
  2026-07-26'da başladı — 1 günlük geçmiş. Ayrıca `stats_daily`'de zaten olan
  veriyi ikinci kez saklamak olurdu.
- *Ayrı `/admin/stats/range` ucu*: `/stats` mantığını kopyalar, iki bakım yeri.

## 4. Panel: dönem seçici

Mevcut `.chips` deseniyle, kartın başlığının yanında:

`Son 4 hafta` · `Bu ay` · `Geçen ay` · `Bu yıl` · `Özel`

- Varsayılan **Son 4 hafta**.
- `Özel` iki tarih kutusu açar (`type="date"`).
- Seçim **ayrı bir istek** yapar (`/admin/stats?from=…&to=…`), konektör
  önbelleğine YAZILMAZ: seçim kullanıcıya özel ve anlıktır, `siteStats`'ın
  paylaşılan 30 günlük önbelleğini kirletmemeli.
- Pano açılışı değişmez; kart ilk render'da konektörün zaten getirdiği
  30 günlük seriyi kullanır, ağa çıkmaz.

## 5. Panel: biçim aralığa göre seçilir

İki biçim var ve **kullanıcı seçmez** — gün sayısı belirler.

| Aralık | Biçim |
|---|---|
| ≤ 70 gün (10 hafta) | **B** — 7 gün paneli |
| > 70 gün | **C** — kronolojik çubuk |

**B (küçük çoklu).** Haftanın her günü için bir mini panel: o günün aralıktaki
tekrarları çubuk çubuk, altında son değer ve bir öncekine göre yüzde.
Eşik 70 günden geliyor: 7 panele bölününce panel başına ~120px kalıyor, 6px
çubuk + 2px boşlukla ~14 çubuk sığıyor; 10 hafta güvenli sınır. Çubuklar
`flex: 1` ile esner, dar ekranda sıkışır ama taşmaz.

**C (kronolojik).** Soldan sağa günler; hafta sonları altın. Kendi içinde bir
eşik daha var: **≤ 120 çubuk günlük**, üstü **haftalık kovaya** toplanır.
Yıl seçilince 365 değil 52 çubuk çizilir — 365 çubuk 680px'te 1.8px eder.

**B'deki delta artık her günün kendi içinden çıkar.** Mevcut `weekdayDelta()`
tüm serinin son gününe bakıyor (`filled[len-1]` vs `filled[len-8]`); yeni
yardımcı her gün için o günün aralıktaki **son iki tekrarını** karşılaştırır.

`weekdayDelta()` **silinmez**: panonun üstündeki kahraman satırı ("▲ %20 ·
önceki pazartesi: 56") onu kullanıyor ve orada doğru soruyu soruyor.

**Kaldırılanlar:** ısı haritası ızgarası, `1H/2H` sütunu, hafta sonu `outline`'ı,
`az→çok` efsanesi ve `RAMP`. Renk artık büyüklük kodlamıyor — yükseklik kodluyor.
Hafta sonu bilgisi sütun/etiket renginde kalır (`--gold` ailesi, metin değil).

## 6. Veri yetmediğinde

Önümüzdeki 11 ay boyunca en sık görülecek durum bu; sessiz sıfır göstermek
"iş kötü gidiyor" diye okunur.

`firstDay` ile üç durum ayrılır:

| Durum | Ne gösterilir |
|---|---|
| Aralık tamamen `firstDay`'den önce | Grafik yok: "Bu dönemde kayıt yok. Sayaç 7 Tem 2026'da başladı." |
| Aralık kısmen kapsıyor | Grafik çizilir + altında: "1 Oca – 6 Tem arası kayıt yok; sayaç 7 Tem 2026'da başladı." |
| Tam kapsıyor | Normal |

Kısmi durumda **kapsanmayan günler seriden düşülür**, sıfır olarak çizilmez.

## 7. Kapsam dışı

| İş | Not |
|---|---|
| İkinci dönem seçici (iki aralığı yan yana) | Karşılaştırma aralığın kendi içinden çıkıyor; ekranı kalabalıklaştırır |
| Biçimi elle seçme (B/C düğmesi) | Otomatik karar yeterli; YAGNI |
| `qr_scan` için ayrı kart | Aynı seri, gerekirse sonra metrik seçici |
| Ürün bazlı dönem seçimi | "En çok bakılan ürünler" kartının kendi 7g/30g çipi var |

## 8. Test planı

**Saf yardımcılar.** Dönem/aralık mantığı **yeni `shared/period.js`**'e
(`resolvePreset`, `pickForm`, `bucketDays`, `coverageNote`); haftanın günüyle
ilgili olanlar mevcut **`shared/rhythm.js`**'e (`groupByWeekday`,
`weekdayDeltas`) eklenir — `WEEKDAYS`/`weekdayIndex` orada.
- `resolvePreset(cip, bugun)` → `{from, to}`; ay/yıl sınırları doğru (28/29/30/31)
- `pickForm(gunSayisi)` → 70'te B, 71'de C
- `bucketDays(days)` → 120 altı günlük, üstü haftalık; kova toplamları doğru
- `groupByWeekday(days)` → 7 grup, her grup kendi içinde tarih sırasında
- `weekdayDeltas(days)` → gün başına son iki tekrar; tek tekrar varsa `null`
  (sonsuz yüzde yok — mevcut `weekdayDelta` kuralının aynısı)
- `coverageNote(firstDay, from, to)` → üç durum, kısmi durumda doğru tarih aralığı

**Sunucu (Yedigül):**
- Parametresiz `/stats` eski davranışı korur (son 30 gün, `today/week/month` yerinde)
- `from`/`to` yalnız `days[]`'i etkiler
- Bozuk biçim, `from > to`, 730 günden uzun aralık → 400
- `firstDay` en eski günü döner; tablo boşken `null`
- Oturumsuz 401

**Panel:**
- Çip değişince istek atılır ve konektör önbelleği YAZILMAZ
- Veri yetmeyen dönemde grafik yerine metin
- Kısmi kapsamada uyarı metni + kapsanmayan günler seride yok
