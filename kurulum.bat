@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Yedigul Lokal Yonetim - Kurulum

echo ==========================================
echo   Yedigul Lokal Yonetim - ilk kurulum
echo ==========================================
echo.
echo Bu script yeni bir bilgisayarda calistirilir. Bir kez yeter.
echo Gunluk kullanim icin run.bat kullanilir.
echo.

rem --- 1) Node.js kontrolu -------------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo [HATA] Node.js bulunamadi.
  echo        https://nodejs.org adresinden 22 LTS veya ustunu kurun,
  echo        sonra bu scripti tekrar calistirin.
  echo.
  pause
  exit /b 1
)

for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set "NODE_MAJOR=%%v"
if !NODE_MAJOR! LSS 22 (
  echo [HATA] Node.js surumu cok eski ^(v!NODE_MAJOR!^). En az 22 gerekiyor.
  echo        https://nodejs.org adresinden guncelleyin.
  echo.
  pause
  exit /b 1
)
echo [1/6] Node.js tamam ^(v!NODE_MAJOR!^).

rem --- 2) OpenSSH kontrolu -------------------------------------------------
where ssh >nul 2>nul
if errorlevel 1 (
  echo [HATA] ssh komutu bulunamadi.
  echo        Ayarlar ^> Uygulamalar ^> Istege bagli ozellikler ^> OpenSSH Client kurun.
  echo.
  pause
  exit /b 1
)
echo [2/6] OpenSSH istemcisi tamam.

rem --- 3) SSH anahtari -----------------------------------------------------
set "SSH_DIR=%USERPROFILE%\.ssh"
set "KEY_PATH=%SSH_DIR%\yedigul_admin"
set "KNOWN_HOSTS=%SSH_DIR%\known_hosts"

if not exist "%SSH_DIR%" mkdir "%SSH_DIR%"

if exist "%KEY_PATH%" (
  echo [3/6] Anahtar zaten var, yenisi uretilmedi: %KEY_PATH%
) else (
  echo [3/6] Bu bilgisayara ozel SSH anahtari uretiliyor...
  ssh-keygen -t ed25519 -f "%KEY_PATH%" -N "" -C "yedigul-%COMPUTERNAME%" >nul
  if errorlevel 1 (
    echo [HATA] Anahtar uretilemedi.
    pause
    exit /b 1
  )
  echo       Uretildi: %KEY_PATH%
)

rem --- 4) Sunucunun host anahtari ------------------------------------------
rem Anahtar agdan sorulmaz; paketle gelen dosyadan yazilir. Aksi halde ilk
rem baglantida araya giren birinin anahtari "guvenilir" olarak kaydedilebilirdi.
set "HOSTKEY_SRC=%~dp0sunucu-hostkey.txt"
set "HOSTKEY_OK=0"
echo [4/6] Sunucunun host anahtari kaydediliyor...
if exist "%HOSTKEY_SRC%" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0hostkey-ekle.ps1" -Source "%HOSTKEY_SRC%" -KnownHosts "%KNOWN_HOSTS%"
  if not errorlevel 1 set "HOSTKEY_OK=1"
) else (
  echo       sunucu-hostkey.txt pakette yok, bu adim elle yapilacak.
)

rem --- 5) .env -------------------------------------------------------------
if exist ".env" (
  echo [5/6] .env zaten var, dokunulmadi.

  rem Baska bilgisayardan kopyalanmis .env, o makinenin anahtar yolunu tasir.
  set "ENV_KEY_PATH="
  for /f "usebackq eol=# tokens=1,* delims==" %%a in (".env") do (
    if /i "%%a"=="SSH_KEY_PATH" set "ENV_KEY_PATH=%%b"
  )
  if defined ENV_KEY_PATH if not exist "!ENV_KEY_PATH!" (
    echo.
    echo       [UYARI] .env icindeki anahtar yolu bu bilgisayarda yok:
    echo               !ENV_KEY_PATH!
    echo               .env baska bir bilgisayardan kopyalanmis olabilir.
    echo               .env dosyasini silip bu scripti tekrar calistirin.
    echo.
  )
) else (
  echo [5/6] .env olusturuluyor. Iki bilgi gerekiyor:
  echo.
  set "SSH_HOST_IN="
  set /p "SSH_HOST_IN=      Sunucu adresi (IP): "
  if "!SSH_HOST_IN!"=="" (
    echo [HATA] Sunucu adresi bos birakilamaz.
    pause
    exit /b 1
  )
  set "SSH_USER_IN="
  set /p "SSH_USER_IN=      SSH kullanicisi [yedigul-admin]: "
  if "!SSH_USER_IN!"=="" set "SSH_USER_IN=yedigul-admin"

  > .env (
    echo LOCAL_HOST=127.0.0.1
    echo LOCAL_PORT=4310
    echo SSH_ENABLED=1
    echo SSH_HOST=!SSH_HOST_IN!
    echo SSH_PORT=22
    echo SSH_USER=!SSH_USER_IN!
    echo SSH_KEY_PATH=%KEY_PATH%
    echo SSH_KNOWN_HOSTS_PATH=%KNOWN_HOSTS%
    echo LOCAL_TUNNEL_PORT=43002
    echo REMOTE_ADMIN_HOST=127.0.0.1
    echo REMOTE_ADMIN_PORT=3002
    echo REMOTE_ADMIN_BASE_URL=http://127.0.0.1:43002
    echo REMOTE_AUTH_PATH=/api/auth
    echo REMOTE_ADMIN_PATH=/api/admin
    echo PUBLIC_MENU_URL=https://www.yedigulrestorant.com/menu/
  )
  echo       .env yazildi.
)

rem --- 6) Bagimliliklar ----------------------------------------------------
echo [6/6] Paketler kuruluyor, biraz surebilir...
call npm install
if errorlevel 1 (
  echo [HATA] npm install basarisiz oldu.
  pause
  exit /b 1
)

rem --- Kapanis: elle yapilacak iki adim ------------------------------------
set "PUBKEY="
if exist "%KEY_PATH%.pub" set /p "PUBKEY=" < "%KEY_PATH%.pub"

set "SSH_USER_OUT=yedigul-admin"
if exist ".env" (
  for /f "usebackq eol=# tokens=1,* delims==" %%a in (".env") do (
    if /i "%%a"=="SSH_USER" set "SSH_USER_OUT=%%b"
  )
)
set "AUTH_KEYS=/home/!SSH_USER_OUT!/.ssh/authorized_keys"

echo.
echo ==========================================
echo   Kurulum bitti. Geriye tek adim kaldi:
echo ==========================================
echo.
echo Sunucuya root olarak baglanip ASAGIDAKI KOMUTU calistirin.
echo (Tek satirdir. Varolan anahtarlari silmez, alt satir olarak ekler.)
echo.
echo printf '\n%%s\n' 'restrict,port-forwarding,permitopen="127.0.0.1:3002" !PUBKEY!' ^>^> !AUTH_KEYS!
echo.
echo Dogrulama - asagidaki komut anahtar sayisini verir, 2 gormelisiniz:
echo.
echo grep -c ssh-ed25519 !AUTH_KEYS!
echo.

if "!HOSTKEY_OK!"=="0" (
  echo [DIKKAT] Sunucunun host anahtari yazilamadi. Panel tuneli acamaz.
  echo          Panelin kurulu oldugu DIGER bilgisayardaki
  echo          %%USERPROFILE%%\.ssh\known_hosts dosyasindan sunucu adresiyle
  echo          baslayan satiri su dosyaya ekleyin:
  echo          %KNOWN_HOSTS%
  echo          Satiri internetten degil, guvendiginiz makineden kopyalayin.
  echo.
)

echo Bu adim bitince paneli run.bat ile acabilirsiniz.
echo.
pause
