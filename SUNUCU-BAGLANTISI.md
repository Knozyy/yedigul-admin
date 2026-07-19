# Canlı Sunucu Bağlantı Planı

Bu belge canlı veritabanına erişimi internete açık bir admin paneli oluşturmadan kurmak için uygulanacak kontrol listesidir.

## Hedef mimari

```text
Tarayıcı
  │  yalnızca localhost
  ▼
Yedigül Lokal Yönetim :4310
  │  SSH port yönlendirme :43002
  ▼
Uzak sunucu 127.0.0.1:3002
  │
  ▼
Canlı server/data.db + uploads
```

Public `:3001` uygulaması sadece menü, ana site, public API ve görselleri sunar. Private `:3002` uygulaması sadece yönetim kimlik doğrulaması ve yönetim API'sini sunar.

## Uzak uygulama değişiklikleri

- Public süreçte admin arayüzü build edilmemeli veya servis edilmemeli.
- Public süreçte eski `/menu/admin` ve `/admin` sayfa yolları ana menüye
  yönlenmeli; `/api/auth/*` ve `/api/admin/*` ise `404` dönmeli.
- Private süreç yalnızca `127.0.0.1:3002` adresine bind edilmeli.
- İki süreç aynı mutlak SQLite ve uploads yolunu kullanmalı.
- SQLite WAL, `busy_timeout` ve mevcut leased-connection yaklaşımı korunmalı.
- Değişiklik öncesi zaman damgalı veritabanı yedeği alınmalı.
- Her yönetim yazma işlemi mevcut `audit_log` kaydını üretmeye devam etmeli.

## Kısıtlı SSH anahtarı

Sunucudaki `authorized_keys` girdisi en az şu kısıtları taşımalı:

```text
restrict,port-forwarding,permitopen="127.0.0.1:3002" ssh-ed25519 AAAA... yedigul-local-admin
```

Sunucunun OpenSSH sürümünde `restrict` davranışı doğrulanmalı. Kullanıcıya shell, TTY, agent forwarding ve X11 forwarding yetkisi verilmemeli. Güvenlik duvarında `3002` portu hiçbir dış arayüze açılmamalı.

## Lokal `.env`

```dotenv
LOCAL_HOST=127.0.0.1
LOCAL_PORT=4310
SSH_ENABLED=1
SSH_HOST=SUNUCU_ADRESI
SSH_PORT=22
SSH_USER=yedigul-admin
SSH_KEY_PATH=C:\\Users\\KULLANICI\\.ssh\\yedigul_admin
SSH_KNOWN_HOSTS_PATH=C:\\Users\\KULLANICI\\.ssh\\known_hosts
LOCAL_TUNNEL_PORT=43002
REMOTE_ADMIN_HOST=127.0.0.1
REMOTE_ADMIN_PORT=3002
REMOTE_ADMIN_BASE_URL=http://127.0.0.1:43002
REMOTE_AUTH_PATH=/api/auth
REMOTE_ADMIN_PATH=/api/admin
PUBLIC_MENU_URL=https://www.yedigulrestorant.com/menu/
```

Özel anahtar ve `.env` dosyası Git'e eklenmez.

## Devreye alma doğrulaması

1. Public internetten admin ve auth yollarının kapalı olduğunu doğrula.
2. Sunucuda `3002` portunun sadece `127.0.0.1` üzerinde dinlediğini doğrula.
3. Kısıtlı SSH anahtarıyla interaktif shell açılamadığını doğrula.
4. Panel tüneli açtıktan sonra canlı menüyü okuyabildiğini doğrula.
5. Geçici bir test ürünü oluştur, düzenle, görsel yükle ve sil.
6. `audit_log`, uploads ve canlı menü çıktısını doğrula.
7. Tüneli kapat; `43002` portunun kapandığını ve panel oturumunun silindiğini doğrula.
8. Yedekten geri dönüş komutunu ayrıca prova et.
