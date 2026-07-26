# En çok bakılan ürünler

Tarih: 2026-07-27
Durum: Onaylandı, uygulanmayı bekliyor
Depolar: `Yedigül` (sunucu + müşteri menüsü) · `Yediguladmin` (panel)

## 1. Amaç

Panoda "misafirler hangi ürünleri merak ediyor" sorusunu cevaplamak. Faz 4'ün
iki parçasından biri; Google yorumları ayrı bir tur.

Yedigül'de **sipariş/satış verisi YOK** — ne satıldığı ölçülemez. Ölçülebilen
tek şey ilgi: menüde bir ürünün detayına bakılması. Bu, satışın vekili değil
kendi başına bir sinyaldir: "fotoğrafı çekilmemiş ürün hiç açılmıyor",
"yeni eklenen ürün ilk hafta ne kadar ilgi gördü" gibi soruları cevaplar.

## 2. Bakılma nedir

**Ürün detayının açılması** sayılır — müşteri karta tıklar, alt sayfa
(`BottomSheet`) açılır. Kartın kaydırılırken ekrandan geçmesi SAYILMAZ.

Gerekçe: tıklama net bir niyet sinyalidir. Görünürlük (impression) ölçmek
`IntersectionObserver` + istemci tarafı toplu gönderim isterdi (66 ürün için
tek tek istek atılamaz); kazanılan bilgi bu maliyeti karşılamıyor.

### Tekrarsızlık penceresi

Mevcut `menu_view` sayacının aynısı: **6 saat**, ama anahtar cihazın kendisi
değil **(cihaz, ürün) ikilisi**.

| Durum | Sonuç |
|---|---|
| Cihaz A ürününe baktı | A +1 |
| Aynı cihaz, 6 saat dolmadan B ürününe baktı | B +1 (farklı anahtar) |
| Aynı cihaz, 6 saat dolmadan tekrar A'ya baktı | sayılmaz |
| Aynı cihaz, 6 saat sonra tekrar A'ya baktı | A +1 |

Engellenen tek şey aynı cihazın **aynı ürünü** tekrar tekrar açıp o ürünün
sayısını şişirmesi (karar verirken üç kez açmak, tezgahta denemek). Farklı
ürünlere bakmak hiç engellenmez — zaten ölçmek istediğimiz şey bir misafirin
kaç **farklı** ürünü merak ettiği.

Karar sunucuda verilir; istemci saatine güvenilmez.

## 3. Şema (Yedigül)

```sql
-- Gün başına ürün görüntülenme sayacı.
CREATE TABLE product_views_daily (
  day        TEXT NOT NULL,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  n          INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, product_id)
);

-- Cihaz+ürün başına tekrarsızlık: son görülme zamanı.
-- Yalnız pencere içindeki (son 6 saat) satırlar kalır; eskiler temizlenir.
CREATE TABLE product_views (
  device_id  TEXT NOT NULL,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  last_at    INTEGER NOT NULL,
  PRIMARY KEY (device_id, product_id)
);

CREATE INDEX idx_product_views_daily_gun ON product_views_daily(day);
```

- **`ON DELETE CASCADE`** — ürün silinince geçmişi de gider. Fix menüdeki
  `RESTRICT`'in bilinçli tersi: "bu ürüne geçmişte bakılmış" bir ürünü silmeyi
  engellemek saçma olurdu. Yan etki: silinen ürün listeden kendiliğinden
  düşer, panelde "silinmiş ürün" durumu yönetmeye gerek kalmaz.
- **`device_id`** yeni bir kimlik DEĞİL; müşteri menüsünün zaten
  `localStorage`'da tuttuğu anonim `device_id` token'ı (`src/lib/deviceId.js`).
- `menu_views` tablosu **olduğu gibi kalır** — menü açılışını sayar, bu tablo
  ürün detayını. İkisi farklı olayları ölçer.

Tablolar `CREATE TABLE IF NOT EXISTS` ile eklenir; mevcut `data.db` migration
gerektirmez (yeni tablo, sütun değişikliği yok).

## 4. Uçlar (Yedigül)

### Sayım — müşteri menüsünden

`POST /api/menu/product-view` · `{ "id": "<device_id>", "product": "<ürün id>" }`

Mevcut `POST /api/menu/view` ile aynı sözleşme: `id` cihaz kimliği. Yanıt
`{ counted: true|false }` — `false`, pencere içinde zaten sayıldığı anlamına
gelir.

Doğrulama:
- `id` veya `product` boşsa → 400
- **Olmayan `product` sessizce yoksayılır** → 200 `{ counted: false }`.
  404 DEĞİL: bu bir izleme çağrısıdır, müşteriye hata göstermez ve menü
  yenilenirken silinmiş bir ürüne tıklamak konsola hata basmamalı.
- Ürünün varlığı **açıkça** kontrol edilir. `foreign_keys = ON` olduğu için
  kontrol yapılmazsa kullanıcıya anlaşılmaz bir SQLite hatası ve 500 dönerdi —
  fix menüde yaşanan aynı sınıf hata.

`logChange` YOK: denetim kaydı personelin yaptığı değişiklikler içindir,
misafir hareketi değil. Denetim kaydını günde binlerce satırla doldurmak
onu kullanılamaz hale getirirdi.

### Okuma — panel için

`GET /api/admin/stats/products` (oturum zorunlu)

```jsonc
{ "week":  [ { "id": "levrek", "name_tr": "Levrek", "views": 34 }, ... ],
  "month": [ ... ] }
```

- İki pencere **tek istekte** döner; `days` parametresi yok. Mevcut
  `/admin/stats` ucunun `week`/`month` sözlüğüyle aynı — panel iki pencere
  arasında geçiş yaparken ağa hiç çıkmaz.
- Her pencerede **ilk 10 ürün**, azalan sırada.
- `week` = son 7 gün, `month` = son 30 gün (`/admin/stats` ile aynı pencereler).
- Gizli (`is_hidden`) ürünler süzülmez: geçmişte görünürken bakılmış olabilir.

## 5. Müşteri menüsü (Yedigül/src)

`MenuPage`'de `onItemClick={setSelectedId}` doğrudan bağlıydı; araya sayım
eklenir. Çağrı `src/lib/track.js` içinde toplanır:

- **Ateşle-unut.** Hata yutulur — sayaç düşerse menü etkilenmez.
- **Statik dışa aktarımda (`VITE_STATIC=1`) hiç çağrılmaz.** O modda arka uç
  yoktur; menü verisi pakete gömülüdür. Menü açılışı ping'indeki aynı koşul.

Fix menü kartına (`FixMenuCard`) tıklama YOK — detay açmıyor, sayacak bir olay
da yok. Değişiklik gerekmez.

## 6. Panel (Yediguladmin)

### Konektör

`server/connectors/product-views.js`, `CONNECTORS` dizisine eklenir.

```js
{ id: 'product-views', label: 'En çok bakılan ürünler', ttlMs: 10 dk, version: 1 }
```

- `guard()` yalnız `remoteToken` ister — dış API anahtarı yok, veri Yedigül'ün
  kendi veritabanında. `site-stats` ile aynı.
- `load()` → `remoteClient.read('/stats/products', token)`; iki pencereyi de
  tek çağrıda alır.
- `onLoad()` YOK: anlık görüntü kaydı gerekmez. O mekanizma API'den geriye
  dönük **alınamayan** ölçütler içindir; bu veri Yedigül'de kalıcı ve her an
  yeniden sorgulanabilir.

### Kart

Zengin kendi bölümü olan konektörler (`site-stats`, `health`) generic
`ConnectorCard` ızgarasının dışında, `Pano.jsx` içinde kendi `panel-card`'ı
olarak çizilir. Bu da öyle.

- Başlık + **7 gün / 30 gün çipleri** (`chips` sınıfı — FixMenus'taki kategori
  çipleriyle aynı dil, panelde tek bir çip alışkanlığı öğrenilsin).
- Altında sıralı liste: sıra numarası, ürün adı, bakılma sayısı ve en yüksek
  değere oranlanmış yatay bar.
- `SERIES` paletine `'product-views'` rengi eklenir. Kremde ölçülen 5.0–6.8
  kontrast aralığında bir ton — koyu tema tonları krem zemine taşınmaz.
- Boş liste (`ok` ama veri yok) → "Henüz yeterli veri yok" (`empty-text`).
- `unconfigured`/`error` → diğer kartlarla aynı metinler.

## 7. Kapsam dışı

| İş | Not |
|---|---|
| Google yorumları | Faz 4'ün diğer yarısı, ayrı tur; konektör iskeleti duruyor |
| Görünürlük (impression) sayımı | Tıklama sinyali yeterli, maliyeti karşılamıyor |
| Ürün başına zaman serisi grafiği | Önce liste; eğilim sorusu gelirse ayrı iş |
| Kategori kırılımı | Liste zaten kategoriyi ima ediyor |
| Mobil uygulama | Ayrı depo, etkilenmiyor |

## 8. Test planı

**Yedigül — sunucu**
- Şema: iki tablo oluşur
- Aynı cihaz+ürün 6 saat içinde tekrar sayılmaz
- Aynı cihaz **farklı** ürüne bakınca ikisi de sayılır (pencere ikili anahtarda)
- Pencere dışına çıkınca tekrar sayılır ve eski satırlar temizlenir
- `POST /menu/product-view`: eksik `id`/`product` → 400; olmayan ürün → 200
  `{counted:false}` ve tabloya satır yazılmaz
- `GET /admin/stats/products`: azalan sıra, ilk 10, `week` ⊆ `month` penceresi
- Ürün silinince görüntülenme geçmişi de gider (CASCADE) ve listeden düşer
- Oturumsuz 401

**Yediguladmin — panel**
- `guard()` `remoteToken` yoksa `Unconfigured` fırlatır
- `load()` uzak yanıtı beklenen şekle sokar
- Uzak sunucu hata dönerse konektör `error` durumuna düşer, pano çökmez
