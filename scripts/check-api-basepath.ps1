# =============================================================================
# API basePath 검증 스크립트 (PowerShell)
# 프론트엔드 코드에서 basePath 누락된 API 호출을 검출합니다.
# =============================================================================

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$AppJs = Join-Path $ProjectRoot "web\static\js\app.js"

$Errors = 0
$Warnings = 0

Write-Host "========================================"
Write-Host "API basePath 검증 스크립트"
Write-Host "========================================"
Write-Host ""

$content = Get-Content $AppJs -Raw
$lines = Get-Content $AppJs

# 1. authFetch에서 /api로 시작하는 호출 (허용됨 - 자동 추가)
Write-Host "[INFO] authFetch 호출 검사 (basePath 자동 추가됨)..."

$authFetchPattern = "authFetch\s*\(\s*[`'""]/api"
$authFetchMatches = [regex]::Matches($content, $authFetchPattern)
if ($authFetchMatches.Count -gt 0) {
    Write-Host -ForegroundColor Green "[OK] authFetch('/api/...') 호출 $($authFetchMatches.Count)개 발견 (basePath 자동 추가됨)"
}

$authFetchBasePathPattern = "authFetch\s*\(\s*basePath"
$authFetchBasePathMatches = [regex]::Matches($content, $authFetchBasePathPattern)
if ($authFetchBasePathMatches.Count -gt 0) {
    Write-Host -ForegroundColor Yellow "[INFO] authFetch(basePath + ...) 호출 $($authFetchBasePathMatches.Count)개 발견 (중복이지만 정상)"
}
Write-Host ""

# 2. 일반 fetch에서 /api로 시작하는 경우 (basePath 필수)
Write-Host "[CHECK] 일반 fetch 호출 검사 (basePath 필수)..."

$fetchErrors = @()
$lineNum = 0
foreach ($line in $lines) {
    $lineNum++
    # fetch('/api 또는 fetch("/api 또는 fetch(`/api 패턴 검색 (authFetch 제외)
    if ($line -match "fetch\s*\(\s*[`'""]/api" -and $line -notmatch "authFetch") {
        $fetchErrors += "${lineNum}: $($line.Trim())"
    }
}

if ($fetchErrors.Count -gt 0) {
    Write-Host -ForegroundColor Red "[ERROR] basePath 누락된 fetch 호출 발견!"
    $fetchErrors | ForEach-Object { Write-Host "  $_" }
    $Errors++
} else {
    Write-Host -ForegroundColor Green "[OK] basePath 누락된 fetch 호출 없음"
}
Write-Host ""

# 3. fetch(basePath + ...) 패턴 확인
Write-Host "[INFO] 정상적인 fetch 호출 패턴 확인..."

$fetchBasePathPattern = "fetch\s*\(\s*basePath"
$fetchBasePathMatches = [regex]::Matches($content, $fetchBasePathPattern)
Write-Host "  - fetch(basePath + ...) 패턴: $($fetchBasePathMatches.Count)개"

$fetchTemplatePattern = "fetch\s*\(\s*``\`$\{basePath\}"
$fetchTemplateMatches = [regex]::Matches($content, $fetchTemplatePattern)
Write-Host "  - fetch(template literal) 패턴: $($fetchTemplateMatches.Count)개"
Write-Host ""

# 4. window.location.href 검사
Write-Host "[CHECK] window.location.href 검사..."

$locationErrors = @()
$lineNum = 0
foreach ($line in $lines) {
    $lineNum++
    if ($line -match "window\.location\.href\s*=\s*[`'""]/[^`'""]*[`'""]" -and $line -notmatch "basePath") {
        $locationErrors += "${lineNum}: $($line.Trim())"
    }
}

if ($locationErrors.Count -gt 0) {
    Write-Host -ForegroundColor Red "[ERROR] basePath 누락된 location.href 발견!"
    $locationErrors | ForEach-Object { Write-Host "  $_" }
    $Errors++
} else {
    Write-Host -ForegroundColor Green "[OK] basePath 누락된 location.href 없음"
}
Write-Host ""

# 5. 모든 API 엔드포인트 목록 출력
Write-Host "========================================"
Write-Host "발견된 API 엔드포인트 목록"
Write-Host "========================================"

$apiPattern = "/api/[a-zA-Z0-9/_-]+"
$apiMatches = [regex]::Matches($content, $apiPattern)
$apiEndpoints = $apiMatches | ForEach-Object { $_.Value } | Group-Object | Sort-Object Count -Descending

foreach ($ep in $apiEndpoints) {
    Write-Host ("  {0,3} {1}" -f $ep.Count, $ep.Name)
}
Write-Host ""

# 결과 요약
Write-Host "========================================"
Write-Host "검증 결과 요약"
Write-Host "========================================"

if ($Errors -eq 0 -and $Warnings -eq 0) {
    Write-Host -ForegroundColor Green "[PASS] 모든 검사 통과!"
    exit 0
} elseif ($Errors -eq 0) {
    Write-Host -ForegroundColor Yellow "[PASS] 통과 (경고 $Warnings 개)"
    exit 0
} else {
    Write-Host -ForegroundColor Red "[FAIL] 오류 $Errors 개, 경고 $Warnings 개"
    exit 1
}
