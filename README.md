# Yedigül Lokal Yönetim

Yedigül QR menüsünün canlı veritabanını **yalnızca bu bilgisayarda çalışan** bir panelden yönetmek için ayrı uygulama.

Panel dış ağ arayüzüne bağlanmaz. Tarayıcı, canlı sunucuyla doğrudan konuşmaz; bütün yönetim trafiği `127.0.0.1` üzerindeki kontrol katmanından geçer. Canlı kullanımda kontrol katmanı uzak sunucunun yalnızca loopback adresinde çalışan özel yönetim API'sine SSH tüneli açar.

## Şu anki durum

- Genel bakış, istatistik ve değişiklik geçmişi
- Ürün listeleme, arama, ekleme, düzenleme ve silme
- Dört dilde ad/açıklama/içindekiler/alerjen yönetimi; AR/RU eksik filtresi ve güvenli EN → TR fallback
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

Doğrudan lokal backend ile geliştirmek için `.env` içinde `SSH_ENABLED=0` ve
`REMOTE_ADMIN_BASE_URL=http://127.0.0.1:3001` kullanılır. Canlı kullanımda
`SSH_ENABLED=1` olmalıdır. Gerçek `.env` Git'e dahil edilmez.

## Tek komutla panel

```powershell
npm run panel
```

Bu komut arayüzü derler ve paneli `http://127.0.0.1:4310/` adresinde açılmaya hazır hale getirir. Windows'ta `run.bat` da aynı akışı başlatır; ek olarak `OPEN_BROWSER=1` ayarladığı için sunucu dinlemeye başladığı anda panel varsayılan tarayıcıda otomatik açılır. Tarayıcının açılmasını istemezseniz paneli `npm run panel` ile başlatın.

## Yeni bir bilgisayara kurulum

Panel loopback'e bağlı olduğu için ağ üzerinden paylaşılmaz; kullanılacak her
bilgisayara ayrı kurulur. Canlı veri tek yerde kaldığı için kurulumlar birbirinden
bağımsızdır.

Klasörü zip'leyip taşırken `node_modules`, `dist` ve `.env` dışarıda bırakılır;
üçünü de kurulum üretir. `.env` yanlışlıkla zip'e girerse script bunu fark edip
uyarır, çünkü içindeki anahtar yolu diğer bilgisayarı gösterir.

```powershell
.\kurulum.bat
```

Script Node.js ve OpenSSH varlığını doğrular, sunucu adresini sorar, o bilgisayara
**ayrı** bir SSH anahtarı üretir, sunucunun host anahtarını `known_hosts` dosyasına
yazar, `.env` dosyasını doğru yollarla yazar ve paketleri kurar. Mevcut `.env`,
anahtar veya kayıt varsa dokunmaz; tekrar çalıştırmak güvenlidir.

Host anahtarı **ağdan sorulmaz**: paketle gelen `sunucu-hostkey.txt` dosyasından
yazılır ve o dosya güvenilen bir makinenin `known_hosts` dosyasından üretilir.
`ssh-keyscan` ile otomatik çekmek, ilk bağlantıda araya giren birinin anahtarını
"güvenilir" diye kaydetme riskini taşıdığı için tercih edilmemiştir. Dosya pakette
yoksa script bunu söyler ve adım elle yapılır.

Bitince tek adım elle yapılır:

1. Script sonunda hazır bir komut basar; sunucuya root olarak bağlanıp o komutu
   çalıştırmak yeterlidir. Biçimi şudur (`AAAA...` yerine script'in bastığı
   gerçek anahtar gelir):

   ```bash
   printf '\n%s\n' 'restrict,port-forwarding,permitopen="127.0.0.1:3002" ssh-ed25519 AAAA... yedigul-DUKKAN-PC' >> /home/yedigul-admin/.ssh/authorized_keys
   ```

   Baştaki `printf '\n'` mevcut son satırın sonunda yeni satır karakteri
   olmama ihtimaline karşıdır; olmazsa iki anahtar birbirine yapışır ve ikisi de
   çalışmaz. Tek tırnaklar `permitopen="..."` içindeki çift tırnakları korur.

   Doğrulama — anahtar sayısını verir:

   ```bash
   grep -c ssh-ed25519 /home/yedigul-admin/.ssh/authorized_keys
   ```

   Her bilgisayarın kendi satırı olması, bir cihaz elden çıktığında yalnızca o
   satırı silerek erişimi kesmeyi sağlar.

Sonrasında günlük kullanım `run.bat` ile devam eder.

Script `.env` içine pano ayarlarını da yazar. `PANO_DB_PATH` bilerek
`%LOCALAPPDATA%\YedigulPano\pano.db` seçilmiştir: depo dışındadır ve Masaüstü
veya Belgeler gibi OneDrive'a yönlendirilmiş olabilecek bir klasörde değildir —
eşlenen klasördeki SQLite dosyası kilitlenme ve bozulma riski taşır. Bu anahtar
eksik kalırsa önbellek bellek içinde çalışır ve günlük anlık görüntüler her
kapanışta silinir; takipçi ve puan trendleri hiçbir zaman dolmaz. Pano
eklenmeden önce kurulmuş bir `.env` varsa script eksik satırları sonuna ekler,
tekrar çalıştırıldığında ikinci kez eklemez.

`IG_*`, `GA4_*` ve `PLACES_*` anahtarları boş bırakılır; ilgili kart "bağlı
değil" görünür ve panonun geri kalanı çalışır.

`sunucu-hostkey.txt` yeni bir kurulum paketi hazırlarken şöyle üretilir:

```powershell
Select-String -Path "$env:USERPROFILE\.ssh\known_hosts" -Pattern 'SUNUCU_ADRESI' -SimpleMatch
```

Çıkan satır dosyaya yazılır. Sunucu adresi veya host anahtarı değişirse dosya
yeniden üretilmelidir; `.env` gibi Git'e dahil edilmez.

## Test ve kalite

```powershell
npm test
npm run lint
npm run build
```

Testler dört dilli arama ve payload bütünlüğünü, ürün formu veri dönüşümlerini, piyasa ürünü günlük fiyat kuralını,
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
