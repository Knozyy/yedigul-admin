# Yedigül Lokal Yönetim

Yedigül QR menüsünün canlı veritabanını **yalnızca bu bilgisayarda çalışan** bir panelden yönetmek için ayrı uygulama.

Panel dış ağ arayüzüne bağlanmaz. Tarayıcı, canlı sunucuyla doğrudan konuşmaz; bütün yönetim trafiği `127.0.0.1` üzerindeki kontrol katmanından geçer. Canlı kullanımda kontrol katmanı uzak sunucunun yalnızca loopback adresinde çalışan özel yönetim API'sine SSH tüneli açar.

## Şu anki durum

- Genel bakış, istatistik ve değişiklik geçmişi
- Ürün listeleme, arama, ekleme, düzenleme ve silme
- Dört dilde ad/açıklama/içindekiler/alerjen yönetimi
- Kalori, porsiyon, diyet etiketleri, fiyat seçenekleri ve günlük piyasa fiyatı
- En çok 6 görsellik galeri; kapak seçme, sıralama ve kalıcı görsel silme
- Kategori ekleme, düzenleme ve silme
- Çok dilli duyuru ve restoran ayarları
- Masaüstü ve mobil arayüz
- Bellekte tutulan uzak yönetim oturumu
- Host, Origin, CSRF, gövde boyutu ve güvenlik başlığı kontrolleri
- Sıkı host-key doğrulamalı SSH tünel yöneticisi

Panel yalnızca canlı yönetim API'sine bağlanır; public menüde admin kodu bulunmaz.
Ürün ve görsel değişiklikleri kaydedildiği anda canlı veritabanına uygulanır ve
sunucudaki denetim kaydına yazılır.

## Lokal geliştirme

Mevcut `Yedigül` backend'i `http://127.0.0.1:3001` üzerinde çalışırken:

```powershell
cd C:\Users\kanad\Desktop\Yediguladmin
npm install
npm run dev
```

Arayüz: `http://127.0.0.1:4311/`  
Kontrol katmanı: `http://127.0.0.1:4310/`

Depodaki yerel `.env` geliştirme modundadır ve yalnızca `127.0.0.1:3001` adresine bağlanır. Git'e dahil edilmez.

## Tek komutla panel

```powershell
npm run panel
```

Bu komut arayüzü derler ve paneli `http://127.0.0.1:4310/` adresinde açılmaya hazır hale getirir. Windows'ta `run.bat` da aynı akışı başlatır.

## Test ve kalite

```powershell
npm test
npm run lint
npm run build
```

Testler ürün formu veri dönüşümlerini, piyasa ürünü günlük fiyat kuralını,
CSRF/Origin korumasını ve multipart görsellerin SSH tüneli arkasındaki API'ye
bozulmadan aktarılmasını kapsar.

## Canlı sunucuya geçiş

1. Uzak sunucuda yönetim API'si public uygulamadan ayrılıp yalnızca `127.0.0.1:3002` üzerinde dinletilir.
2. Public uygulamada `/menu/admin`, `/api/auth` ve `/api/admin` kapatılır.
3. Yalnızca port yönlendirmeye izin verilen ayrı bir SSH kullanıcısı ve anahtarı oluşturulur.
4. `.env`, `.env.example` içindeki SSH alanlarıyla doldurulur ve `SSH_ENABLED=1` yapılır.
5. Panelde “SSH tünelini aç” ile bağlantı kurulur.

Ayrıntılı kontrol listesi: [SUNUCU-BAGLANTISI.md](./SUNUCU-BAGLANTISI.md)

## Güvenlik sınırı

- `LOCAL_HOST` ve `REMOTE_ADMIN_BASE_URL` loopback dışında bir adres olursa uygulama başlamaz.
- SSH parolası kullanılmaz; `BatchMode=yes` ile yalnızca anahtar tabanlı bağlantı açılır.
- `StrictHostKeyChecking=yes` ve ayrı `known_hosts` dosyası zorunludur.
- Uzak JWT tarayıcıya verilmez, diske yazılmaz ve uygulama kapanınca kaybolur.
- Canlı sunucu parolası diske kaydedilmez.
- WebSocket kullanılmaz. Düzenleme işlemleri için kısa ömürlü HTTP istekleri yeterlidir.
