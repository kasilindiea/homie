param([switch]$SkipWebBuild)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$toolchainPath = Join-Path $projectRoot '.tools\toolchain.json'
if (-not (Test-Path -LiteralPath $toolchainPath)) { throw 'Run scripts/setup-android.ps1 -AcceptSdkLicenses after accepting the Android SDK terms.' }
$toolchain = Get-Content -LiteralPath $toolchainPath -Raw | ConvertFrom-Json
$env:JAVA_HOME = $toolchain.javaHome
$env:ANDROID_HOME = $toolchain.sdkRoot
$env:ANDROID_SDK_ROOT = $toolchain.sdkRoot
$env:ANDROID_USER_HOME = $toolchain.androidUserHome
$env:GRADLE_USER_HOME = $toolchain.gradleUserHome
$env:PATH = (Join-Path $env:SystemRoot 'System32') + ';' + (Join-Path $env:JAVA_HOME 'bin') + ';' + $env:PATH
# Use a project-local socket directory instead of the host's redirected TEMP path.
$socketTemp = Join-Path $projectRoot '.tools\sockets'
New-Item -ItemType Directory -Force -Path $socketTemp | Out-Null
$env:JAVA_TOOL_OPTIONS = ($env:JAVA_TOOL_OPTIONS + ' -Djdk.net.unixdomain.tmpdir="' + $socketTemp + '"').Trim()
Push-Location $projectRoot
try {
    if (-not $SkipWebBuild) {
        & npm.cmd run android:sync
        if ($LASTEXITCODE -ne 0) { throw 'Frontend build or Android asset sync failed.' }
    }
    Push-Location (Join-Path $projectRoot 'android')
    try {
        & .\gradlew.bat --no-daemon --no-watch-fs --max-workers=1 :app:assembleDebug --stacktrace
        if ($LASTEXITCODE -ne 0) { throw 'Android build failed.' }
    } finally { Pop-Location }
    $outputRoot = Join-Path $projectRoot 'artifacts'
    New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null
    $package = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
    $apk = Join-Path $outputRoot ("homie-" + $package.version + '.apk')
    Copy-Item -LiteralPath (Join-Path $projectRoot 'android\app\build\outputs\apk\debug\app-debug.apk') -Destination $apk -Force
    & (Join-Path $env:ANDROID_HOME 'build-tools\36.0.0\apksigner.bat') verify --verbose $apk
    if ($LASTEXITCODE -ne 0) { throw 'APK signature validation failed.' }
    $hasher = [Security.Cryptography.SHA256]::Create()
    $apkStream = [IO.File]::OpenRead($apk)
    try {
        $sha256 = [BitConverter]::ToString($hasher.ComputeHash($apkStream)).Replace('-', '').ToLowerInvariant()
    } finally {
        $apkStream.Dispose()
        $hasher.Dispose()
    }
    Write-Host "SHA-256: $sha256"
    Write-Host "APK: $apk"
} finally { Pop-Location }
