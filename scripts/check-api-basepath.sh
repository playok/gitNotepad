#!/bin/bash
# =============================================================================
# API basePath 검증 스크립트
# 프론트엔드 코드에서 basePath 누락된 API 호출을 검출합니다.
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
APP_JS="$PROJECT_ROOT/web/static/js/app.js"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================"
echo "API basePath 검증 스크립트"
echo "========================================"
echo ""

ERRORS=0
WARNINGS=0

# 1. authFetch에서 basePath 없이 호출하는 경우 (허용됨 - 자동 추가)
echo "[INFO] authFetch 호출 검사 (basePath 자동 추가됨)..."
AUTH_FETCH_CALLS=$(grep -n "authFetch(" "$APP_JS" | grep -v "async function authFetch" || true)
AUTH_FETCH_WITHOUT_BASEPATH=$(echo "$AUTH_FETCH_CALLS" | grep "authFetch('/api" || true)
AUTH_FETCH_WITH_BASEPATH=$(echo "$AUTH_FETCH_CALLS" | grep "authFetch(basePath" || true)

if [ -n "$AUTH_FETCH_WITHOUT_BASEPATH" ]; then
    echo -e "${GREEN}[OK]${NC} authFetch('/api/...') 호출 발견 (basePath 자동 추가됨)"
    echo "$AUTH_FETCH_WITHOUT_BASEPATH" | head -5
    echo ""
fi

if [ -n "$AUTH_FETCH_WITH_BASEPATH" ]; then
    echo -e "${YELLOW}[INFO]${NC} authFetch(basePath + '/api/...') 호출 발견 (중복이지만 정상 동작)"
    echo "$AUTH_FETCH_WITH_BASEPATH" | head -5
    echo ""
fi

# 2. 일반 fetch에서 /api로 시작하는 경우 (basePath 필수)
echo "[CHECK] 일반 fetch 호출 검사 (basePath 필수)..."
FETCH_WITHOUT_BASEPATH=$(grep -n "fetch('/api" "$APP_JS" || true)
FETCH_WITHOUT_BASEPATH2=$(grep -n 'fetch("/api' "$APP_JS" || true)
FETCH_WITHOUT_BASEPATH3=$(grep -n 'fetch(`/api' "$APP_JS" || true)

if [ -n "$FETCH_WITHOUT_BASEPATH" ] || [ -n "$FETCH_WITHOUT_BASEPATH2" ] || [ -n "$FETCH_WITHOUT_BASEPATH3" ]; then
    echo -e "${RED}[ERROR]${NC} basePath 누락된 fetch 호출 발견!"
    [ -n "$FETCH_WITHOUT_BASEPATH" ] && echo "$FETCH_WITHOUT_BASEPATH"
    [ -n "$FETCH_WITHOUT_BASEPATH2" ] && echo "$FETCH_WITHOUT_BASEPATH2"
    [ -n "$FETCH_WITHOUT_BASEPATH3" ] && echo "$FETCH_WITHOUT_BASEPATH3"
    ERRORS=$((ERRORS + 1))
    echo ""
else
    echo -e "${GREEN}[OK]${NC} basePath 누락된 fetch 호출 없음"
    echo ""
fi

# 3. fetch(basePath + '/api/...') 패턴 확인
echo "[INFO] 정상적인 fetch 호출 패턴 확인..."
FETCH_WITH_BASEPATH=$(grep -n "fetch(basePath" "$APP_JS" | wc -l)
FETCH_WITH_TEMPLATE=$(grep -n 'fetch(`\${basePath}' "$APP_JS" | wc -l)
echo "  - fetch(basePath + ...) 패턴: $FETCH_WITH_BASEPATH 개"
echo "  - fetch(\`\${basePath}...) 패턴: $FETCH_WITH_TEMPLATE 개"
echo ""

# 4. window.location.href 검사
echo "[CHECK] window.location.href 검사..."
LOCATION_WITHOUT_BASEPATH=$(grep -n "window.location.href = '/\|window.location.href = \"/" "$APP_JS" || true)
if [ -n "$LOCATION_WITHOUT_BASEPATH" ]; then
    echo -e "${RED}[ERROR]${NC} basePath 누락된 location.href 발견!"
    echo "$LOCATION_WITHOUT_BASEPATH"
    ERRORS=$((ERRORS + 1))
else
    echo -e "${GREEN}[OK]${NC} basePath 누락된 location.href 없음"
fi
echo ""

# 5. 이미지/파일 URL 검사 (/images/, /files/, /s/)
echo "[CHECK] 정적 리소스 URL 검사..."
STATIC_WITHOUT_BASEPATH=$(grep -En "src=['\"]/(images|files|s)/" "$APP_JS" || true)
STATIC_WITHOUT_BASEPATH2=$(grep -En "href=['\"]/(images|files|s)/" "$APP_JS" || true)
if [ -n "$STATIC_WITHOUT_BASEPATH" ] || [ -n "$STATIC_WITHOUT_BASEPATH2" ]; then
    echo -e "${YELLOW}[WARNING]${NC} basePath 없는 정적 리소스 URL 발견 (동적 생성 확인 필요)"
    [ -n "$STATIC_WITHOUT_BASEPATH" ] && echo "$STATIC_WITHOUT_BASEPATH"
    [ -n "$STATIC_WITHOUT_BASEPATH2" ] && echo "$STATIC_WITHOUT_BASEPATH2"
    WARNINGS=$((WARNINGS + 1))
else
    echo -e "${GREEN}[OK]${NC} 정적 리소스 URL 검사 통과"
fi
echo ""

# 6. 모든 API 엔드포인트 목록 출력
echo "========================================"
echo "발견된 API 엔드포인트 목록"
echo "========================================"
grep -oE "/api/[a-zA-Z0-9/_-]+" "$APP_JS" | sort | uniq -c | sort -rn
echo ""

# 결과 요약
echo "========================================"
echo "검증 결과 요약"
echo "========================================"
if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}[PASS]${NC} 모든 검사 통과!"
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}[PASS]${NC} 통과 (경고 $WARNINGS 개)"
else
    echo -e "${RED}[FAIL]${NC} 오류 $ERRORS 개, 경고 $WARNINGS 개"
    exit 1
fi
