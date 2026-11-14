param([switch]$AcceptSdkLicenses)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$env:PATH = (Join-Path $env:SystemRoot 'System32') + ';' + $env:PATH
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$projectRoot = Split-Path -Parent $PSScriptRoot
$toolRoot = Join-Path $projectRoot '.tools'
$downloads = Join-Path $toolRoot 'downloads'
$sdkRoot = Join-Path $toolRoot 'android-sdk'
New-Item -ItemType Directory -Force -Path $downloads,$sdkRoot | Out-Null

function Download-Verified([string]$Url, [string]$Path, [string]$Sha256) {
    if ((Test-Path -LiteralPath $Path) -and ((Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash -eq $Sha256)) { return }
    Write-Host "Downloading $(Split-Path -Leaf $Path)..."
    Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $Path -TimeoutSec 900
    if ((Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash -ne $Sha256) { throw "Checksum mismatch: $Path" }
}

$jdkRoot = Join-Path $toolRoot 'jdk'
$java = Get-ChildItem -LiteralPath $jdkRoot -Filter java.exe -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.Directory.Name -eq 'bin' } | Select-Object -First 1
if (-not $java) {
    $metadataPath = Join-Path $downloads 'jdk-metadata.json'
    Write-Host 'Finding the official Temurin JDK 21 Windows x64 package...'
    Invoke-WebRequest -UseBasicParsing -TimeoutSec 60 -OutFile $metadataPath -Uri 'https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse'
    $metadata = Get-Content -LiteralPath $metadataPath -Raw | ConvertFrom-Json
    $jdkPackage = $metadata[0].binary.package
    $jdkArchive = Join-Path $downloads 'jdk21.zip'
    Download-Verified $jdkPackage.link $jdkArchive $jdkPackage.checksum
    Write-Host 'Extracting JDK...'
    Expand-Archive -LiteralPath $jdkArchive -DestinationPath $jdkRoot -Force
    $java = Get-ChildItem -LiteralPath $jdkRoot -Filter java.exe -Recurse | Where-Object { $_.Directory.Name -eq 'bin' } | Select-Object -First 1
}
$env:JAVA_HOME = Split-Path -Parent $java.Directory.FullName
$env:ANDROID_HOME = $sdkRoot
$env:ANDROID_SDK_ROOT = $sdkRoot
$env:ANDROID_USER_HOME = Join-Path $toolRoot 'android-user'
$env:GRADLE_USER_HOME = Join-Path $toolRoot 'gradle-home'
New-Item -ItemType Directory -Force -Path $env:ANDROID_USER_HOME,$env:GRADLE_USER_HOME | Out-Null

$sdkManager = Join-Path $sdkRoot 'cmdline-tools\latest\bin\sdkmanager.bat'
$unversionedTools = Join-Path $sdkRoot 'cmdline-tools\cmdline-tools'
$versionedTools = Join-Path $sdkRoot 'cmdline-tools\latest'
function Set-ToolsDirectory {
    if ((Test-Path -LiteralPath $unversionedTools) -and -not (Test-Path -LiteralPath $versionedTools)) {
        $allowedRoot = [IO.Path]::GetFullPath($toolRoot) + [IO.Path]::DirectorySeparatorChar
        foreach ($candidate in @($unversionedTools,$versionedTools)) {
            if (-not [IO.Path]::GetFullPath($candidate).StartsWith($allowedRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Tool directory is outside the project.' }
        }
        Rename-Item -LiteralPath $unversionedTools -NewName 'latest'
    }
}
Set-ToolsDirectory
if (-not (Test-Path -LiteralPath $sdkManager)) {
    if (-not $AcceptSdkLicenses) { throw 'Accept the Android SDK terms and rerun with -AcceptSdkLicenses to download the SDK.' }
    $sdkArchive = Join-Path $downloads 'android-commandlinetools.zip'
    Download-Verified 'https://dl.google.com/android/repository/commandlinetools-win-15859902_latest.zip' $sdkArchive '90ae805d20434428bffcb699c290860f19bb5f66a67e6b330067e3de801fb04a'
    Write-Host 'Extracting Android SDK command-line tools...'
    Expand-Archive -LiteralPath $sdkArchive -DestinationPath (Join-Path $sdkRoot 'cmdline-tools') -Force
    Set-ToolsDirectory
}
Write-Host 'Installing Android platform 36 and build tools...'
if ($AcceptSdkLicenses) {
    1..20 | ForEach-Object { 'y' } | & $sdkManager "--sdk_root=$sdkRoot" 'platforms;android-36' 'build-tools;36.0.0' 'platform-tools'
} else {
    & $sdkManager "--sdk_root=$sdkRoot" 'platforms;android-36' 'build-tools;36.0.0' 'platform-tools'
}
if ($LASTEXITCODE -ne 0) { throw 'Android SDK package installation failed.' }
foreach ($packageFile in @('platforms\android-36\android.jar','build-tools\36.0.0\aapt2.exe','build-tools\36.0.0\apksigner.bat')) {
    if (-not (Test-Path -LiteralPath (Join-Path $sdkRoot $packageFile))) { throw "Android package is missing: $packageFile" }
}
@{ javaHome=$env:JAVA_HOME; sdkRoot=$sdkRoot; androidUserHome=$env:ANDROID_USER_HOME; gradleUserHome=$env:GRADLE_USER_HOME } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $toolRoot 'toolchain.json') -Encoding utf8
Write-Host 'Android toolchain is ready.'
& $java.FullName -version
