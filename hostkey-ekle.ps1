# Sunucunun host anahtarini known_hosts dosyasina ekler.
# Anahtar aga sorulmaz; kurulum paketiyle gelen dosyadan okunur.
# kurulum.bat tarafindan cagrilir.

param(
  [Parameter(Mandatory = $true)][string]$Source,
  [Parameter(Mandatory = $true)][string]$KnownHosts
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $Source)) {
  Write-Host '      host anahtari dosyasi pakette yok, bu adim atlandi'
  exit 2
}

$add = @(
  Get-Content -LiteralPath $Source |
    ForEach-Object { $_.Trim() } |
    Where-Object { $_ -ne '' -and -not $_.StartsWith('#') }
)

if ($add.Count -eq 0) {
  Write-Host '      host anahtari dosyasi bos, bu adim atlandi'
  exit 2
}

$dir = Split-Path -Parent $KnownHosts
if (-not (Test-Path -LiteralPath $dir)) {
  New-Item -ItemType Directory -Path $dir -Force | Out-Null
}

$current = @()
if (Test-Path -LiteralPath $KnownHosts) {
  $current = @(Get-Content -LiteralPath $KnownHosts | ForEach-Object { $_.TrimEnd() })
}

$missing = @($add | Where-Object { $current -notcontains $_ })
if ($missing.Count -eq 0) {
  Write-Host '      host anahtari zaten kayitli'
  exit 0
}

# Var olan dosyayi yeniden yazacagiz; once yedek.
if (Test-Path -LiteralPath $KnownHosts) {
  Copy-Item -LiteralPath $KnownHosts -Destination "$KnownHosts.bak" -Force
}

# OpenSSH LF bekler; CRLF ve BOM birakmadan yaz.
$lines = @($current | Where-Object { $_ -ne '' }) + $missing
[System.IO.File]::WriteAllText($KnownHosts, ($lines -join "`n") + "`n")

Write-Host ('      host anahtari eklendi (' + $missing.Count + ' satir)')
exit 0
