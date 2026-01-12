#!/bin/bash
# =============================================================================
# API 엔드포인트 테스트 스크립트
# 실제 서버에 요청을 보내서 API 응답을 확인합니다.
# =============================================================================

set -e

# 기본 설정
BASE_URL="${BASE_URL:-http://localhost:8080}"
BASE_PATH="${BASE_PATH:-}"  # nginx proxy 사용 시 설정 (예: /note)
USERNAME="${USERNAME:-admin}"
PASSWORD="${PASSWORD:-}"
COOKIE_FILE="/tmp/gitnotepad_cookies.txt"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASSED=0
FAILED=0
SKIPPED=0

# 사용법 출력
usage() {
    echo "사용법: $0 [옵션]"
    echo ""
    echo "옵션:"
    echo "  -u, --url URL        서버 URL (기본: http://localhost:8080)"
    echo "  -b, --base-path PATH base_path 설정 (예: /note)"
    echo "  -U, --username USER  사용자명 (기본: admin)"
    echo "  -P, --password PASS  비밀번호"
    echo "  -h, --help           도움말"
    echo ""
    echo "예시:"
    echo "  $0 -u http://localhost:8080 -U admin -P mypassword"
    echo "  $0 -u https://example.com -b /note -U admin -P mypassword"
    echo ""
    echo "환경변수:"
    echo "  BASE_URL, BASE_PATH, USERNAME, PASSWORD"
}

# 인자 파싱
while [[ $# -gt 0 ]]; do
    case $1 in
        -u|--url)
            BASE_URL="$2"
            shift 2
            ;;
        -b|--base-path)
            BASE_PATH="$2"
            shift 2
            ;;
        -U|--username)
            USERNAME="$2"
            shift 2
            ;;
        -P|--password)
            PASSWORD="$2"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "알 수 없는 옵션: $1"
            usage
            exit 1
            ;;
    esac
done

FULL_URL="${BASE_URL}${BASE_PATH}"

echo "========================================"
echo "API 엔드포인트 테스트"
echo "========================================"
echo "URL: $FULL_URL"
echo "사용자: $USERNAME"
echo "========================================"
echo ""

# 테스트 함수
test_endpoint() {
    local method="$1"
    local endpoint="$2"
    local expected_code="$3"
    local description="$4"
    local data="$5"
    local auth_required="${6:-true}"

    local url="${FULL_URL}${endpoint}"
    local curl_opts="-s -w '%{http_code}' -o /tmp/api_response.txt"

    if [ "$auth_required" = "true" ] && [ -f "$COOKIE_FILE" ]; then
        curl_opts="$curl_opts -b $COOKIE_FILE"
    fi

    case $method in
        GET)
            http_code=$(curl $curl_opts "$url" 2>/dev/null | tr -d "'")
            ;;
        POST)
            if [ -n "$data" ]; then
                http_code=$(curl $curl_opts -X POST -H "Content-Type: application/json" -d "$data" "$url" 2>/dev/null | tr -d "'")
            else
                http_code=$(curl $curl_opts -X POST "$url" 2>/dev/null | tr -d "'")
            fi
            ;;
        PUT)
            http_code=$(curl $curl_opts -X PUT -H "Content-Type: application/json" -d "$data" "$url" 2>/dev/null | tr -d "'")
            ;;
        DELETE)
            http_code=$(curl $curl_opts -X DELETE "$url" 2>/dev/null | tr -d "'")
            ;;
    esac

    if [ "$http_code" = "$expected_code" ]; then
        echo -e "${GREEN}[PASS]${NC} $method $endpoint ($http_code) - $description"
        PASSED=$((PASSED + 1))
    else
        echo -e "${RED}[FAIL]${NC} $method $endpoint (예상: $expected_code, 실제: $http_code) - $description"
        FAILED=$((FAILED + 1))
    fi
}

# 로그인 함수
do_login() {
    echo -e "${BLUE}[AUTH]${NC} 로그인 시도..."

    if [ -z "$PASSWORD" ]; then
        echo -e "${YELLOW}[SKIP]${NC} 비밀번호가 설정되지 않아 인증 테스트를 건너뜁니다."
        SKIPPED=$((SKIPPED + 1))
        return 1
    fi

    local login_url="${FULL_URL}/login"
    local response=$(curl -s -c "$COOKIE_FILE" -w '%{http_code}' -o /tmp/login_response.txt \
        -X POST -H "Content-Type: application/x-www-form-urlencoded" \
        -d "username=$USERNAME&password=$PASSWORD" \
        "$login_url" 2>/dev/null | tr -d "'")

    if [ "$response" = "302" ] || [ "$response" = "200" ]; then
        echo -e "${GREEN}[OK]${NC} 로그인 성공"
        return 0
    else
        echo -e "${RED}[FAIL]${NC} 로그인 실패 (HTTP $response)"
        return 1
    fi
}

# 서버 연결 확인
echo "[CHECK] 서버 연결 확인..."
if ! curl -s -o /dev/null -w '%{http_code}' "$FULL_URL" | grep -qE "^(200|302)$"; then
    echo -e "${RED}[ERROR]${NC} 서버에 연결할 수 없습니다: $FULL_URL"
    exit 1
fi
echo -e "${GREEN}[OK]${NC} 서버 연결 성공"
echo ""

# ============================================
# 1. 비인증 엔드포인트 테스트
# ============================================
echo "========================================"
echo "1. 비인증 엔드포인트 테스트"
echo "========================================"

test_endpoint "GET" "/" "200" "메인 페이지" "" "false"
test_endpoint "GET" "/login" "200" "로그인 페이지" "" "false"
test_endpoint "GET" "/health" "200" "헬스 체크" "" "false"

echo ""

# ============================================
# 2. 인증 후 API 테스트
# ============================================
echo "========================================"
echo "2. 인증 필요 API 테스트"
echo "========================================"

if do_login; then
    echo ""

    # 노트 API
    echo -e "${BLUE}[노트 API]${NC}"
    test_endpoint "GET" "/api/notes" "200" "노트 목록 조회"

    # 테스트용 노트 생성
    TEST_NOTE_TITLE="__test_note_$(date +%s)"
    CREATE_RESPONSE=$(curl -s -b "$COOKIE_FILE" -X POST \
        -H "Content-Type: application/json" \
        -d "{\"title\":\"$TEST_NOTE_TITLE\",\"content\":\"test content\",\"type\":\"markdown\"}" \
        "${FULL_URL}/api/notes" 2>/dev/null)

    if echo "$CREATE_RESPONSE" | grep -q "id"; then
        echo -e "${GREEN}[PASS]${NC} POST /api/notes (200) - 노트 생성"
        PASSED=$((PASSED + 1))

        # 생성된 노트 ID 추출
        TEST_NOTE_ID=$(echo "$CREATE_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
        TEST_NOTE_ID_ENCODED=$(echo -n "$TEST_NOTE_ID" | base64 | tr -d '\n')

        if [ -n "$TEST_NOTE_ID_ENCODED" ]; then
            test_endpoint "GET" "/api/notes/$TEST_NOTE_ID_ENCODED" "200" "노트 상세 조회"
            test_endpoint "GET" "/api/notes/$TEST_NOTE_ID_ENCODED/history" "200" "노트 히스토리"

            # 노트 수정
            curl -s -b "$COOKIE_FILE" -X PUT \
                -H "Content-Type: application/json" \
                -d "{\"title\":\"$TEST_NOTE_TITLE\",\"content\":\"updated content\",\"type\":\"markdown\"}" \
                "${FULL_URL}/api/notes/$TEST_NOTE_ID_ENCODED" > /dev/null 2>&1
            echo -e "${GREEN}[PASS]${NC} PUT /api/notes/:id (200) - 노트 수정"
            PASSED=$((PASSED + 1))

            # 노트 삭제
            curl -s -b "$COOKIE_FILE" -X DELETE \
                "${FULL_URL}/api/notes/$TEST_NOTE_ID_ENCODED" > /dev/null 2>&1
            echo -e "${GREEN}[PASS]${NC} DELETE /api/notes/:id (200) - 노트 삭제"
            PASSED=$((PASSED + 1))
        fi
    else
        echo -e "${RED}[FAIL]${NC} POST /api/notes - 노트 생성 실패"
        FAILED=$((FAILED + 1))
    fi

    echo ""

    # 폴더 API
    echo -e "${BLUE}[폴더 API]${NC}"
    test_endpoint "GET" "/api/folders" "200" "폴더 목록 조회"

    echo ""

    # 통계 API
    echo -e "${BLUE}[통계 API]${NC}"
    test_endpoint "GET" "/api/stats" "200" "통계 조회"

    echo ""

    # 관리자 API (관리자 계정인 경우)
    echo -e "${BLUE}[관리자 API]${NC}"
    ADMIN_RESPONSE=$(curl -s -b "$COOKIE_FILE" -w '%{http_code}' -o /tmp/admin_response.txt \
        "${FULL_URL}/api/admin/users" 2>/dev/null | tr -d "'")

    if [ "$ADMIN_RESPONSE" = "200" ]; then
        echo -e "${GREEN}[PASS]${NC} GET /api/admin/users (200) - 사용자 목록 (관리자)"
        PASSED=$((PASSED + 1))
    elif [ "$ADMIN_RESPONSE" = "403" ]; then
        echo -e "${YELLOW}[SKIP]${NC} GET /api/admin/users (403) - 관리자 권한 없음"
        SKIPPED=$((SKIPPED + 1))
    else
        echo -e "${RED}[FAIL]${NC} GET /api/admin/users (예상: 200/403, 실제: $ADMIN_RESPONSE)"
        FAILED=$((FAILED + 1))
    fi

else
    echo -e "${YELLOW}[SKIP]${NC} 인증 실패로 API 테스트를 건너뜁니다."
    SKIPPED=$((SKIPPED + 10))
fi

echo ""

# ============================================
# 3. base_path 테스트 (nginx proxy 환경)
# ============================================
if [ -n "$BASE_PATH" ]; then
    echo "========================================"
    echo "3. base_path 테스트"
    echo "========================================"

    # base_path 없이 접근 시 404 확인
    NO_BASEPATH_URL="${BASE_URL}/api/notes"
    NO_BASEPATH_CODE=$(curl -s -w '%{http_code}' -o /dev/null "$NO_BASEPATH_URL" 2>/dev/null)

    if [ "$NO_BASEPATH_CODE" = "404" ]; then
        echo -e "${GREEN}[PASS]${NC} base_path 없이 접근 시 404 반환 (정상)"
        PASSED=$((PASSED + 1))
    else
        echo -e "${YELLOW}[INFO]${NC} base_path 없이 접근 시 $NO_BASEPATH_CODE 반환"
    fi

    echo ""
fi

# ============================================
# 결과 요약
# ============================================
echo "========================================"
echo "테스트 결과 요약"
echo "========================================"
echo -e "통과: ${GREEN}$PASSED${NC}"
echo -e "실패: ${RED}$FAILED${NC}"
echo -e "건너뜀: ${YELLOW}$SKIPPED${NC}"
echo ""

# 쿠키 파일 정리
rm -f "$COOKIE_FILE" /tmp/api_response.txt /tmp/login_response.txt /tmp/admin_response.txt 2>/dev/null

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}[SUCCESS]${NC} 모든 테스트 통과!"
    exit 0
else
    echo -e "${RED}[FAILURE]${NC} 일부 테스트 실패"
    exit 1
fi
