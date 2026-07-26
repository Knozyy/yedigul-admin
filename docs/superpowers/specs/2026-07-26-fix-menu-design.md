# Fix menü (ürün seti modeli)

Tarih: 2026-07-26
Durum: Onaylandı, uygulanmayı bekliyor
Depolar: `Yedigül` (sunucu + müşteri menüsü) · `Yediguladmin` (panel)

## 1. Amaç

Restoranın "Fix Menü 1/2/3" gibi paket menüleri tanımlayabilmesi ve bunların
QR menüde müşteriye görünmesi.

İçerik **sabittir** — müşteri seçim yapmaz. Fix menü belirli ürünlerden ve
adetlerden oluşur, kendi satış fiyatı vardır (bileşenlerin toplamından bağımsız).

## 2. Ortak "ürün seti" modeli

Fix menü ile ileride gelecek **masa senaryosu** (alkollü/alkolsüz masa, panoda
toplam) aynı ilkeli paylaşır: *adetli ürün listesi*. Tek şemadan türerler,
`kind` alanı ayırır. Masa senaryosu sonradan **şema değişmeden** açılacak.

```sql
CREATE TABLE product_sets (
  id        TEXT PRIMARY KEY,
  kind      TEXT NOT NULL DEFAULT 'fix_menu',   -- 'fix_menu' | 'senaryo'
  name_tr   TEXT NOT NULL,
  name_en   TEXT NOT NULL,
  name_ar   TEXT NOT NULL DEFAULT '',
  name_ru   TEXT NOT NULL DEFAULT '',
  desc_tr   TEXT NOT NULL DEFAULT '',
  desc_en   TEXT NOT NULL DEFAULT '',
  desc_ar   TEXT NOT NULL DEFAULT '',
  desc_ru   TEXT NOT NULL DEFAULT '',
  price     REAL,                    -- fix_menu: satış fiyatı; senaryo: NULL
  is_active INTEGER NOT NULL DEFAULT 1,
  sort      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE product_set_items (
  set_id     TEXT NOT NULL REFERENCES product_sets(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id)     ON DELETE RESTRICT,
  qty        INTEGER NOT NULL DEFAULT 1,
  sort       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (set_id, product_id)
);
```

- **PK `(set_id, product_id)`** — bir ürün sette bir kez bulunur; "2 acılı ezme"
  ikinci satır değil, `qty = 2`.
- **`ON DELETE CASCADE`** (set silinince satırları gider) ve
  **`ON DELETE RESTRICT`** (fix menüde kullanılan ürün silinemez). Veritabanında
  `foreign_keys = ON` olduğu için bu kısıtlar gerçekten uygulanır.
- Kategori silme davranışıyla tutarlı: kullanımda olan şey silinmez, önce
  bağımlılığı çözülür.

## 3. Sunucu API'si (Yedigül)

### Yönetim
| Uç | İş |
|---|---|
| `GET /admin/sets` | Tüm setler + içerikleri (`kind` süzgeciyle) |
| `POST /admin/sets` | Yeni set (içerik satırlarıyla birlikte) |
| `PATCH /admin/sets/:id` | Günceller; `items` verilirse içerik tamamen değişir |
| `DELETE /admin/sets/:id` | Siler (satırları cascade) |
| `PUT /admin/sets/order` | Toplu sıralama — kategorilerdeki desenin aynısı, tam permütasyon şartı |

Doğrulama: `id` biçimi `^[A-Za-z0-9_-]{1,64}$` (ürün/kategori ile aynı),
`name_tr`/`name_en` zorunlu, `price` negatif olamaz, `items` içindeki her
`product_id` var olmalı, `qty` ≥ 1.

`logChange` ile denetim kaydına yazılır.

### Genel menü
`/api/menu` yanıtına `sets` eklenir:

```jsonc
{ "categories": [...], "products": [...], "meta": {...},
  "sets": [ { "id": "fix1", "name": {...4 dil}, "desc": {...},
              "price": 850,
              "items": [ { "qty": 2, "name": {...4 dil} } ] } ] }
```

- Yalnız `kind='fix_menu'` **ve** `is_active=1` olanlar
- İçerik adları mevcut `i18nText` yardımcısıyla çözülür (boş çeviri → EN → TR)
- Gizli/tükenmiş ürün içeren set yine görünür; içerik **metin** olarak yazılır,
  ürün kartına bağlanmaz

## 4. Panel (Yediguladmin)

Yeni **"Fix Menü"** ekranı:
- Liste (sürükleyerek sıralama — mevcut `tasi()` ve sıralama deseni)
- Form: 4 dilde ad + açıklama, fiyat, aktiflik
- İçerik editörü: ürün seçici (kategoriye göre gruplu) + adet, satır ekle/kaldır
- Bileşenlerin **toplam ham fiyatı** ve fix menü fiyatıyla farkı gösterilir —
  indirim marjı gözle görünür olsun

## 5. Müşteri menüsü (Yedigül/src)

Fix menüler menünün **en üstünde kendi bölümünde** görünür. `sections` tek bir
`useMemo`'dan türediği ve üstteki kategori çubuğu ondan beslendiği için bölüm
gezinme çipini otomatik alır.

`ProductCard` uymuyor: fix menünün adı, fiyatı ve **içindekiler listesi** var.
Kendi kartı yazılır — görsel tasarım `frontend-design` skill'iyle ele alınır.

Arapça için `dir="rtl"`, para birimi ve dil sözlüğü mevcut `data/ui.js`
desenine uyar.

## 6. Fiyat geçmişi — bedava kazanç

`menu.setPrice` ölçütü snapshot registry'sinde **zaten yeri ayrılmıştı**.
Fix menüler `/admin/menu` yanıtına girince panelin fiyat toplayıcısı onları da
kaydetmeye başlar; şemaya, API'ye veya senkrona dokunulmaz.

`entity` = set id. Fix menü fiyatı bileşenlerin toplamından bağımsız
belirlendiği için aradaki indirim marjı fiyatlar oynadıkça sessizce erir —
bu seri tam da onu görünür kılar.

## 7. Kapsam dışı

| İş | Not |
|---|---|
| Masa senaryosu (`kind='senaryo'`) | Aynı şemadan, ayrı tur |
| Seçmeli gruplar ("5 meze seçin") | İçerik sabit kararlaştırıldı |
| Fix menü görseli | Ürünlerin görselleri var; set için ayrı görsel şimdilik yok |
| Mobil uygulama | Ayrı depo, etkilenmiyor |

## 8. Test planı

**Sunucu**
- Şema + migration (mevcut `data.db`'ye tablolar eklenir)
- CRUD: oluştur / oku / güncelle / sil
- `items` güncellenince eski satırlar tamamen değişir
- Geçersiz: eksik ad, negatif fiyat, olmayan `product_id`, `qty` < 1, bozuk id
- Fix menüde kullanılan ürün **silinemez** (RESTRICT)
- Set silinince satırları gider (CASCADE)
- `PUT /sets/order` — tam permütasyon, eksik/tekrarlı → 400
- `/api/menu`: yalnız aktif `fix_menu` setleri döner, 4 dil çözülmüş
- Pasif set genel menüde görünmez
- Oturumsuz 401

**Panel**
- Fix menü ekranı istekleri doğru gönderir (mevcut test deseni)

**Müşteri menüsü**
- Fix menü bölümü render olur, içerik listesi ve fiyat görünür
- Set yoksa bölüm hiç çıkmaz
