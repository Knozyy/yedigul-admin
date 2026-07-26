# Kategorileri sürükle-bırak sıralama

Tarih: 2026-07-26
Durum: Onaylandı, uygulanmayı bekliyor
Depolar: `Yedigül` (sunucu) · `Yediguladmin` (panel)

## 1. Amaç

Kategori sırası şu an yalnızca düzenleme kutusundaki "Menü sırası" sayı alanıyla
değiştirilebiliyor — sıralamayı görmek için listeye, değiştirmek için kutuya
bakmak gerekiyor. Kategori listesinde **zaten bir `≡` sürükleme işareti var**
ama hiçbir şey yapmıyor; arayüz sürüklenebilirlik vaat edip karşılığını
vermiyor.

Bu iş o boşluğu dolduruyor: kategoriler doğrudan listede sürüklenerek
sıralanacak.

## 2. Kapsam

### Dahil
- Yedigül'de toplu sıralama ucu (atomik)
- Panelde tutamaçtan sürükleme, bırakınca anında kayıt
- Hata hâlinde eski sıraya dönüş

### Hariç
| İş | Not |
|---|---|
| Ürün sıralaması (`products.sort`) | Aynı desen; ayrı tur |
| Klavyeyle sürükleme | Mevcut "Menü sırası" alanı klavye yolunu zaten sağlıyor |
| Mobil uygulama (`yedigul-admin-app`) | Ayrı depo, etkilenmiyor |

## 3. Sunucu API'si (Yedigül)

### `PUT /api/admin/categories/order`

```jsonc
{ "ids": ["fish", "meat", "salad", "cold", "hot", "dessert", "drink"] }
```

**Doğrulama — `ids` tam permütasyon olmalı:**
- Mevcut kategorilerin **hepsi** bulunmalı, eksiksiz
- Tekrar eden id olmamalı
- Bilinmeyen id olmamalı

Aksi hâlde **400**, hiçbir şey yazılmaz.

**Neden sıkı:** `sort` sütunu benzersiz değil. Yarım liste kabul edilirse iki
kategori aynı `sort` değerini alır ve `ORDER BY sort` ikisi arasında rastgele
karar verir — sıra her yüklemede değişebilir, tekrarlanması zor bir hata olur.

**Yazma:** tek transaction, `sort = <dizideki indeks>` (0'dan başlar). Atomik:
ya hepsi ya hiçbiri.

**Denetim:** `logChange` ile kaydedilir; diğer menü mutasyonları gibi.

**Yanıt:** `{ ok: true, count: <kategori sayısı> }`

## 4. Panel arayüzü (Yediguladmin)

### Sürükleme ve tıklama ayrımı

Satır şu an bir `<button>` ve tıklayınca düzenleme kutusu açıyor. Tarayıcı
sürüklemeyi tıklamadan ayırt etmediği için `draggable` satırın tamamına
konulamaz — tutamaca basılınca açılır:

```jsx
<li draggable={surukleAktif} onDragStart={...} onDragOver={...} onDrop={...}>
  <span className="drag-mark" onPointerDown={() => setSurukleAktif(true)}>≡</span>
  <button className="category-row" onClick={() => setEditing(category)}>…</button>
</li>
```

`surukleAktif`, `onDragEnd`'de tekrar `false` olur.

Tarayıcının **yerleşik sürükleme API'si** kullanılır — yeni bağımlılık yok.
Projenin çizgisi bu: üretim bağımlılıkları 5 tane, UI kütüphanesi hiç yok.

### Bırakınca

1. Arayüz yeni sırayı **hemen** gösterir (iyimser güncelleme)
2. `PUT /admin/categories/order` gider
3. Başarılıysa `onReload()` menüyü tazeler
4. **Hata olursa eski sıraya dönülür**, `alert error` ile mesaj gösterilir

Kaydetme düğmesi yok — "kaydetmeyi unuttum" durumu oluşmaz. Toplu uç atomik
olduğu için her bırakış tek güvenli istek.

### Saf yardımcı

Yeniden sıralama mantığı test edilebilir olsun diye ayrılır — `src/lib/reorder.js`:

```js
tasi(liste, kaynakIndeks, hedefIndeks) → yeni dizi
```

Arayüz kodundan ayrı bir saf fonksiyon olduğu için `node:test` ile doğrudan
sınanır; `src/lib/product-model.js`'in `server/test/product-model.test.js`
tarafından test edilmesiyle aynı desen.

## 5. Sıralamanın kaynağı

`GET /admin/menu` kategorileri zaten `ORDER BY sort` döndürüyor; yeniden
yükleme yeni sırayı doğru getirir. Ek bir şey gerekmiyor.

## 6. Hata yönetimi

| Durum | Davranış |
|---|---|
| Geçersiz `ids` (eksik/fazla/tekrar) | Sunucu 400, hiçbir şey yazılmaz |
| Tünel kapalı / istek düşer | Arayüz eski sıraya döner, hata gösterilir |
| Aynı anda başka değişiklik | Son yazan kazanır; tek kullanıcılı sistem, çakışma yönetimi gereksiz |

## 7. Test planı

### Sunucu (`Yedigül/server/test/`)
- Tam permütasyon yazılır; `GET /menu` yeni sırayı döndürür
- Eksik id → 400, veritabanı değişmez
- Fazla / bilinmeyen id → 400
- Tekrarlı id → 400
- `sort` değerleri 0'dan başlayarak ardışık olur
- Denetim kaydına yazılır
- Oturumsuz 401

### Panel (`Yediguladmin/server/test/` ve saf fonksiyon)
- `tasi()` — yukarı taşıma, aşağı taşıma, aynı yere bırakma, uç indeksler
