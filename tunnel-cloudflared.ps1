# tunnel-cloudflared.ps1 - Lance Expo via Cloudflare Tunnel
# Expo croit utiliser ngrok mais utilise cloudflared en realite
# Usage : depuis C:\Users\USER\Desktop\Seculiv\seculivapp, executer .\tunnel-cloudflared.ps1
# Utile quand le PC et le telephone ne sont pas sur le meme reseau Wi-Fi.

$ErrorActionPreference = "Stop"
$appDir = $PSScriptRoot

# --- Verifier / installer cloudflared ---
if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
    Write-Host ""
    Write-Host "  [!] cloudflared non trouve." -ForegroundColor Red
    Write-Host "  Installation via winget..." -ForegroundColor Yellow
    Write-Host ""
    winget install cloudflare.cloudflared --source winget --accept-source-agreements --accept-package-agreements

    # Rafraichir le PATH depuis le registre + repertoire shims WinGet (scope user)
    $machinePath = [System.Environment]::GetEnvironmentVariable("PATH", "Machine")
    $userPath    = [System.Environment]::GetEnvironmentVariable("PATH", "User")
    $wingetLinks = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Links"
    $env:PATH = "$machinePath;$userPath;$wingetLinks"

    if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
        Write-Host "  Ouvre un nouveau terminal et relance ce script." -ForegroundColor Yellow
        exit 1
    }
}

# --- Synchroniser le shim @expo/ngrok avec ngrok-localtunnel-shim ---
# node_modules/@expo/ngrok est gere par npm. On ecrase quand meme pour
# garantir la version cloudflared apres chaque npm install.
$ngrokDir = Join-Path $appDir "node_modules\@expo\ngrok"
$null = [System.IO.Directory]::CreateDirectory($ngrokDir)

# Utiliser WriteAllText (UTF-8 sans BOM) car Set-Content -Encoding UTF8 ajoute un BOM en PS 5.1
$utf8NoBom = New-Object System.Text.UTF8Encoding $false

[System.IO.File]::WriteAllText(
    (Join-Path $ngrokDir "package.json"),
    "{`n  `"name`": `"@expo/ngrok`",`n  `"version`": `"4.1.0`",`n  `"main`": `"index.js`"`n}`n",
    $utf8NoBom
)

$shimSrc = Join-Path $appDir "ngrok-localtunnel-shim\index.js"
if (Test-Path $shimSrc) {
    [System.IO.File]::WriteAllText(
        (Join-Path $ngrokDir "index.js"),
        [System.IO.File]::ReadAllText($shimSrc, $utf8NoBom),
        $utf8NoBom
    )
} else {
    Write-Error "Shim introuvable : $shimSrc"
    exit 1
}

# --- Patcher le timeout Expo (10s -> 90s) dans AsyncNgrok.js ---
$asyncNgrokPath = Join-Path $appDir "node_modules\expo\node_modules\@expo\cli\build\src\start\server\AsyncNgrok.js"
if (Test-Path $asyncNgrokPath) {
    $content = [System.IO.File]::ReadAllText($asyncNgrokPath, $utf8NoBom)
    $patched = $content -replace 'const TUNNEL_TIMEOUT = 10 \* 1000;', 'const TUNNEL_TIMEOUT = 90 * 1000;'
    if ($patched -ne $content) {
        [System.IO.File]::WriteAllText($asyncNgrokPath, $patched, $utf8NoBom)
        Write-Host "  [OK] Timeout tunnel patche (10s -> 90s)" -ForegroundColor Green
    }
} else {
    Write-Host "  [!] AsyncNgrok.js introuvable, timeout non patche" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "  SECULIV - Expo start (Cloudflare Tunnel)" -ForegroundColor Yellow
Write-Host "  Demarrage... le tunnel se lance automatiquement." -ForegroundColor Cyan
Write-Host ""

Push-Location $appDir
try {
    npx expo start --tunnel --go --clear
} finally {
    Pop-Location
}
