<#
  BOXFLOW — package the hosted web app as a Meta Quest APK (PWA wrapper) for sideloading.

  Uses Meta's official "Meta Quest Platform Utility" (ovr-platform-util) PWA packager.
  Prerequisites (one-time):
    1. Host BOXFLOW over HTTPS first (GitHub Pages, see README).
    2. Android SDK with build-tools (install Android Studio or the command-line tools) and a JDK 17+.
    3. ovr-platform-util.exe: https://developer.oculus.com/resources/publish-reference-platform-command-line-utility/

  Usage:
    ./tools/build-apk.ps1 -SiteUrl https://<user>.github.io/<repo>/ -AndroidSdk "$env:LOCALAPPDATA\Android\Sdk"

  Install on the headset (Developer Mode enabled, USB connected):
    adb install -r build/boxflow.apk
#>
param(
  [Parameter(Mandatory = $true)][string]$SiteUrl,
  [string]$AndroidSdk = $env:ANDROID_HOME,
  [string]$PackageName = 'io.github.boxflow',
  [string]$OvrUtil = 'ovr-platform-util',
  [string]$Out = 'build/boxflow.apk'
)
$ErrorActionPreference = 'Stop'
if (-not $SiteUrl.EndsWith('/')) { $SiteUrl += '/' }
if (-not $AndroidSdk) { throw 'Android SDK path not set. Pass -AndroidSdk or set ANDROID_HOME.' }

$root = Split-Path -Parent $PSScriptRoot
New-Item -ItemType Directory -Force (Join-Path $root 'build') | Out-Null

# The packager needs a manifest with absolute URLs plus Meta's ovr_package_name field.
$manifest = Get-Content (Join-Path $root 'manifest.webmanifest') -Raw | ConvertFrom-Json
$manifest.start_url = "${SiteUrl}index.html"
$manifest.scope = $SiteUrl
foreach ($icon in $manifest.icons) { $icon.src = $SiteUrl + $icon.src }
$manifest | Add-Member -NotePropertyName ovr_package_name -NotePropertyValue $PackageName -Force
$manifestPath = Join-Path $root 'build/manifest.packaged.json'
$manifest | ConvertTo-Json -Depth 5 | Out-File -Encoding utf8 $manifestPath

& $OvrUtil create-pwa `
  -o (Join-Path $root $Out) `
  --android-sdk $AndroidSdk `
  --manifest-content-file $manifestPath `
  --package-name $PackageName `
  --web-manifest-url "${SiteUrl}manifest.webmanifest"
if ($LASTEXITCODE -ne 0) { throw "ovr-platform-util failed ($LASTEXITCODE)" }
Write-Host "APK written to $Out — install with: adb install -r $Out"
