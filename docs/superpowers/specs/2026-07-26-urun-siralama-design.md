# Ürünleri sürükle-bırak sıralama

Tarih: 2026-07-26
Durum: Onaylandı, uygulanmayı bekliyor
Depolar: `Yedigül` (sunucu) · `Yediguladmin` (panel)

Kategori sıralamasının (`2026-07-26-kategori-siralama-design.md`) ürünlere
uyarlanması. Aynı desen, ama ürün listesinin üç farkı zorunlu sapma yaratıyor.

## Fark 1 — `sort` global, kategoriler bitişik blok

Ürün `sort` değerleri **tek bir global dizi**: 0–66. Kategoriler bu dizide
bitişik bloklar tutuyor:

```
fish    0–16      salad   48–50
hot     17–30     meat    51–53
cold    31–47     dessert 54–63      drink 64–66
```

`GET /menu` global `ORDER BY sort` yapıyor. Bir kategoriyi 0'dan numaralarsak
bloklar iç içe geçer ve menü baştan sona karışır.

**Çözüm:** kategorinin **mevcut sıra yuvaları korunur.** O kategorinin `sort`
değerleri artan sırada toplanır ve yeni diziliş bu yuvalara yerleştirilir.
Kategori küresel konumunu aynen korur, yalnız içindeki ürünler yer değiştirir.

```
fish yuvaları: [0,1,2,3]      yeni sıra: [levrek, hamsi, cipura, lufer]
                                 ↓
levrek=0  hamsi=1  cipura=2  lufer=3      ← blok hâlâ 0–3
```

## Fark 2 — Liste filtrelenebilir

Ürün ekranında kategori çipi, arama kutusu ve "çeviri eksiği" süzgeci var.
Filtrelenmiş listede sürüklemek anlamsız ve tehlikeli: görünen 5 üründen birini
taşıyınca görünmeyen 60 ürünün sırası belirsiz kalır.

**Çözüm:** sürükleme yalnızca **tek bir kategori seçiliyken ve arama/süzgeç
kapalıyken** açılır. Diğer durumlarda tutamaç gösterilmez; kullanıcıya kısa bir
ipucu yazılır.

Zaten anlamlı olan tek işlem bu — müşteri menüsü ürünleri kategoriye göre
gruplar, kategoriler arası sıralama karşılığı olmayan bir kavram.

## Fark 3 — Uç kategori kapsamlı

```jsonc
PUT /api/admin/products/order
{ "category_id": "fish", "ids": ["levrek", "hamsi", "cipura", ...] }
```

- `category_id` var olmalı
- `ids` o kategorideki ürünlerin **tam permütasyonu** olmalı (eksik/fazla/
  tekrarlı/bilinmeyen → 400). Gerekçe kategoridekiyle aynı: `sort` benzersiz
  değil, yarım liste çakışma yaratır.
- Yazma tek transaction; yuvalar yukarıdaki gibi korunur.
- `logChange` ile denetim kaydına yazılır.
- Yanıt: `{ ok: true, count: n }`

## Aynı kalanlar

- Tutamaçtan sürükleme (`onPointerDown` → `draggable`), satıra tıklama hâlâ
  düzenleme kutusunu açar
- Bırakır bırakmaz kaydetme, hata hâlinde eski sıraya dönüş
- `tasi()` saf fonksiyonu yeniden kullanılır — yeni kod gerekmez
- Yeni bağımlılık yok

## Test planı

**Sunucu:**
- Kategori içinde sıralama uygulanır, `GET /menu` yansıtır
- **Diğer kategorilerin `sort` değerleri hiç değişmez** (blok korunur)
- Kategorinin yuvaları aynı kalır (min/max değişmez)
- Eksik / fazla / tekrarlı / bilinmeyen id → 400, hiçbir şey değişmez
- Başka kategorinin ürünü listede → 400
- Bilinmeyen `category_id` → 400
- Denetim kaydına yazılır · oturumsuz 401

**Panel:**
- Süzgeç açıkken tutamaç görünmez (sürükleme kapalı)
