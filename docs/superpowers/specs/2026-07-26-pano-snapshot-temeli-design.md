# Pano anlık görüntü temeli + ürün fiyat geçmişi

Tarih: 2026-07-26
Durum: Onaylandı, uygulanmayı bekliyor
Depolar: `Yedigül` (sunucu) · `Yediguladmin` (panel)

## 1. Amaç

Instagram takipçi sayısı, Google puanı ve ürün fiyatı gibi ölçütlerin **geçmişi
hiçbir API'den alınamaz** — kaynak yalnızca "şu an"ı verir. Biriktirmezsek o gün
kalıcı olarak kaybolur.

Bu iş, o birikimin temelini kurar: gün başına tek kayıt tutan bir anlık görüntü
deposu, panelin bunu canlı sunucuya göndermesi ve yıllık analizi kaldıracak bir
okuma ucu.

Ayrıca bugünden itibaren **ürün fiyatlarını** toplamaya başlar; "zam yapalım mı"
sorusunun cevabı olan fiyat serisi ancak bugün başlarsa yarın var olur.

## 2. Kapsam

### Dahil
- `pano_snapshots` şeması `entity` sütunuyla (varlık başına ölçüt desteği)
- Ölçüt kaydı (registry) — sabit liste yerine kurallı doğrulama
- Gün aralığıyla okuma (`from`/`to`) — yıllık analiz için
- Panelden sunucuya otomatik gönderim (ateşle-unut backfill)
- Elle basılan senkron düğmesi (sunucudan çekme)
- `menu.price` toplama — her senkronda mevcut menüden

### Hariç (ayrı spec'ler)
| İş | Not |
|---|---|
| Fix menü + masa senaryosu (ürün seti modeli) | Bu işin biriktirdiği fiyat serisini tüketir |
| Google yorumları (iyi/kötü + fotoğraf) | Places vs Business Profile API forkü doğrulanacak |
| Yıllık tablo/grafik arayüzü | Gösterecek veri birikince |

`menu.setPrice` ölçütü registry'de **yeri ayrılmış** ama bu turda kimse yazmaz.

## 3. Veri modeli

Aynı şema iki yerde: `Yedigül/server/db.js` (`pano_snapshots`) ve
`Yediguladmin/server/cache.js` (`snapshots`).

```sql
CREATE TABLE pano_snapshots (
  day    TEXT NOT NULL,           -- YYYY-MM-DD, sunucunun yerel günü
  metric TEXT NOT NULL,
  entity TEXT NOT NULL DEFAULT '', -- '' = global ölçüt
  value  REAL NOT NULL,
  PRIMARY KEY (day, metric, entity)
);
CREATE INDEX idx_pano_snapshots_seri ON pano_snapshots(metric, entity, day);
```

`entity` boş dize varsayılanı sayesinde mevcut global ölçütler aynı tabloda,
tek senkron yolunda ve tek testte yaşamaya devam eder.

### Migration

`CREATE TABLE IF NOT EXISTS` mevcut tabloyu değiştirmez ve `ALTER TABLE` birincil
anahtarı genişletemez. `entity` sütunu yoksa tablo **yeniden kurulur**: yeni tablo
oluştur → satırları `entity=''` ile kopyala → eskisini düşür → yeniden adlandır.

Bu özellik hiç dağıtılmadı; etkilenen tek veri yerel geliştirme kaydı. Yine de
kopyalayarak yapılır, `DROP` ile değil.

## 4. Ölçüt kaydı (registry)

Sabit `Set` yerine, her ölçütün kendi kuralını taşıdığı bir kayıt:

| metric | entity | yazan | durum |
|---|---|---|---|
| `ig.followers` | yok | Instagram konektörü | aktif |
| `ig.reach` | yok | Instagram konektörü | aktif |
| `reviews.rating` | yok | Google yorumları | yeri ayrıldı |
| `reviews.count` | yok | Google yorumları | yeri ayrıldı |
| `menu.price` | **zorunlu** | fiyat toplayıcı | **bu turda açılıyor** |
| `menu.setPrice` | **zorunlu** | ürün seti işi | yeri ayrıldı |

Doğrulama kuralları:
- `metric` kayıtta bulunmalı
- `entity` kuralı: `yok` → boş dize olmalı; `zorunlu` → boş olmamalı
- `entity` biçimi: `^[A-Za-z0-9_.-]{1,80}$`
- `value` sonlu sayı olmalı
- `day` `YYYY-MM-DD` biçiminde ve **gelecekte olmamalı**

Gelecek tarih reddi korunur: saati yanlış kurulmuş bir istemci seriyi ileri
taşıyıp grafiği kalıcı bozabilirdi.

### Depolar arası tutarlılık

Sunucu ve panel **ayrı depolar**; `shared/rhythm.js` gibi gerçek modül paylaşımı
mümkün değil. Bu yüzden:

- **Sunucu otoritedir** — doğrulamayı o yapar.
- Panel yalnızca *ne toplayacağını* bilir; doğrulamayı tekrar etmez.
- POST yanıtı reddedilen ölçüt adlarını döner; panel bunları loglar, böylece
  iki taraf ayrışırsa sessiz kalmaz.

## 5. Sunucu API'si (Yedigül)

### `POST /admin/snapshots`

```jsonc
{ "items": [ { "day": "2026-07-26", "metric": "menu.price",
               "entity": "42", "value": 185 } ] }
```

- En çok **2000** kayıt (bir günün ~100 ürünü + backfill sığsın)
- Upsert: `ON CONFLICT(day, metric, entity) DO UPDATE`
- Geçersiz satır atlanır, geçerliler yazılır (tek bozuk kayıt partiyi düşürmez)
- Yanıt: `{ written, skipped, unknown: [...] }` — `unknown` en çok 10 farklı ad

### `GET /admin/snapshots`

Parametreler: `metric` (zorunlu), `entity`, `from`, `to`, `limit`

- Aralık verilmezse son 90 gün
- Satır tavanı 5000 (çok yıllık seri sığar)
- `entity` verilmezse o ölçütün tüm varlıkları döner (ör. tüm ürün fiyatları)
- Bilinmeyen ölçüt → 400
- Sıra: eskiden yeniye

## 6. Panel akışı (Yediguladmin)

```
Konektör onLoad ──► cache.snapshot()               (yerel — mevcut davranış)
Fiyat toplayıcı ──► GET /admin/menu → her ürün ──► cache.snapshot('menu.price', …)

GET /local-api/panel ──► [otomatik push, ateşle-unut]
                           cache.allSnapshots() ──► POST /admin/snapshots

POST /local-api/panel/sync ──► push (beklenir)
                           └─► pull: GET /admin/snapshots ──► cache'e upsert
```

### Otomatik gönderim
Panel her açıldığında, oturum açıksa (`remoteToken` var), yereldeki son 90 günün
kayıtları tek POST ile gönderilir. **Yanıt beklenmez** — hata pano yanıtını
etkilemez, yalnız loglanır. Upsert olduğu için tekrar göndermek zararsız; senkron
bir tur gecikirse kendini düzeltir.

### Elle senkron
`POST /local-api/panel/sync` (CSRF korumalı, oturum ister): önce push, sonra
kayıttaki her ölçüt için sunucudan çekip yerele upsert eder. `{pushed, pulled}`
döner. Panonun üst başlığında **"Sunucuyla eşitle"** düğmesi bunu çağırır,
ardından panoyu tazeler.

### Okuma
Görüntüleme yerelden okumaya devam eder (`cache.history`) — hızlı, ekstra tünel
çağrısı yok. Senkron düğmesi basıldığında yerel zaten birleşik hale gelir.

### Fiyat toplama
Kaynak `GET /admin/menu`. Her ürün için:

- `price` sonlu bir sayıysa → `entity = "<ürünId>"`, değer = `price`
- Aksi hâlde varyant varsa → her varyant ayrı satır,
  `entity = "<ürünId>-<varyantSırası>"` (0'dan başlayan dizi indeksi)

**Öncelik kesindir:** ikisi birden doluysa (`price` hem dolu hem varyant var)
tekil fiyat kazanır, varyantlar yazılmaz. Böylece aynı ürün iki ayrı seriye
bölünmez. Ürün id'leri sunucuda `^[A-Za-z0-9_-]{1,64}$` ile sınırlı olduğundan
`entity` biçim kuralına her zaman uyar.

**Kabul edilen risk:** varyantlar yeniden sıralanırsa indeks kayar ve o seri
bozulur. Alternatif olan varyant adı çeviriyle değişebildiği için daha kırılgan.
Varyant sıralaması pratikte değişmiyor; sık değişmeye başlarsa yeniden ele alınır.

Fiyatı olmayan/gizli ürün atlanır.

**Sıklık:** ölçüt günlük çözünürlükte olduğu için menüyü günde bir kez çekmek
yeterli. Panel açılışında, o güne ait `menu.price` kaydı yereldeyse toplama
atlanır — yani günün ilk açılışında bir kez çalışır. Senkron düğmesi bu kontrolü
atlar ve her zaman taze çeker (kullanıcı fiyat değiştirdikten hemen sonra
basabilmeli).

## 7. Saklama

Hiçbir şey budanmaz. Bu verinin geri getirilme yolu yok; tabloyu küçültmek uğruna
geçmiş silinmez. 100 ürün × 365 gün ≈ 36 bin satır/yıl — SQLite için önemsiz.

## 8. Hata yönetimi

| Durum | Davranış |
|---|---|
| Tünel kapalı / oturum yok | Push atlanır; yerel birikim sürer, sonraki açılışta gider |
| Sunucu POST'u düşer | Sessiz log; pano kararmaz |
| Kısmen geçersiz parti | Geçerliler yazılır, `unknown` ile bildirilir |
| Senkron düğmesi hatası | Kullanıcıya hata mesajı gösterilir (elle işlem, sessiz kalmamalı) |
| `/admin/menu` okunamaz | Fiyat toplama atlanır, diğer ölçütler yine gider |

## 9. Test planı

### Sunucu (`Yedigül/server/test/admin-snapshots.test.js` genişletilir)
Mevcut 7 test geçiyor; eklenecekler:
- `entity` ile yazma/okuma; aynı gün farklı entity çakışmaz
- `entity` kuralı: zorunlu olanda boş → red; olmayanda dolu → red
- `entity` biçim kısıtı (uzun/geçersiz karakter → red)
- `from`/`to` aralığıyla okuma; aralıksız varsayılan
- `entity`siz okuma tüm varlıkları döner
- `unknown` alanı reddedilen ölçüt adlarını bildirir
- Migration: eski şemadaki satırlar `entity=''` ile korunur

### Panel (`Yediguladmin/server/test/`)
- `remote-client.write` — başarı, hata, zaman aşımı
- Fiyat toplayıcı — tekil fiyat, varyant, gizli/fiyatsız ürün
- `/local-api/panel/sync` — push+pull, oturumsuz 401, CSRF
- Otomatik push'un pano yanıtını **geciktirmediği** ve hatanın yanıtı bozmadığı

Sahte uzak sunucu: mevcut `server/test/fixtures/mock-remote.js`.

## 10. Yol haritası bağlantısı

```
A. Bu iş  ──► menu.price serisi birikir
              ├──► Ürün seti (fix menü + masa senaryosu)
              │      set toplamının zaman içindeki seyri = "zam yapalım mı"
              └──► Google yorumları (reviews.* serisi hazır bekliyor)
```

`entity` sütunu ve registry, bu üç işin hiçbirinde şema veya API değişikliği
gerektirmeyecek şekilde tasarlandı — yeni ölçüt eklemek registry'ye bir satır.
