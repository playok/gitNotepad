[English](README.md) | **한국어**

# Git Notepad

Git 버전 관리가 통합된 웹 기반 노트 애플리케이션

## 주요 기능

- **다중 문서 형식 지원**: Markdown, AsciiDoc, TXT
- **CodeMirror 에디터**: 문법 강조, 줄 번호, 자동 완성
- **편집 툴바**: Markdown/AsciiDoc 서식 버튼, 표 그리드 선택기
- **AsciiDoc 테이블 에디터**: 드래그로 셀 선택, 병합/해제, span 문법 자동 생성
- **실시간 미리보기**: Markdown/AsciiDoc 실시간 렌더링
- **KaTeX 수식 렌더링**: LaTeX 문법 지원 ($...$, $$...$$)
- **에디터/프리뷰 도킹**: 가로/세로 레이아웃, 탭 모드, 팝아웃 프리뷰
- **Git 버전 관리**: 모든 변경사항 자동 커밋, 3-way diff 비교
- **사용자 인증**: SQLite 기반 다중 사용자 지원
- **비밀번호 보호**: 개별 노트 암호화
- **파일 암호화**: AES-256-GCM 암호화로 저장 파일 보호 (선택적)
- **파일 첨부**: 이미지 및 파일 업로드 (원본 파일명 복원)
- **4개 테마**: Light, Dark, Dark High Contrast, Dark Cyan
- **다국어 지원**: 영어/한국어 (Settings에서 변경)
- **오프라인 지원**: 모든 라이브러리 로컬 포함
- **단축 URL**: 노트 공유용 짧은 링크 생성 (공개/비공개, 만료일 설정)
- **캘린더 뷰**: 사이드바 미니 캘린더, 날짜별 노트 관리, YYYY/MM 폴더 자동 생성
- **폴더 관리**: 드래그 앤 드롭, 펼치기/닫기, 아이콘 변경, 노트 이동 모달
- **새 노트 위치 선택**: 노트 생성 시 폴더 선택 모달
- **태블릿 지원**: 터치 디바이스 최적화 (44px 최소 터치 영역)
- **태그 기능**: YAML frontmatter 저장, 자동완성, 태그별 노트 필터링
- **데이터 관리**: 노트 내보내기/가져오기, 통계 조회
- **크로스 플랫폼**: CGO 없이 Linux/macOS/Windows 빌드
- **Nginx 프록시**: 서브 경로에서 운영 가능
- **단일 바이너리**: 템플릿/정적 파일 임베디드 (go:embed)
- **데몬 모드**: 백그라운드 실행 (start/stop/restart/status)
- **로그 롤링**: 일단위 로그 파일 생성 (`gitnotepad.log.YYYY-MM-DD`)
- **텔레그램 봇**: 텔레그램 메시지를 노트로 자동 저장 (Long Polling 방식)
- **미디어 프리뷰**: 동영상/오디오 파일 프리뷰 재생 (HTML5 video/audio)
- **텔레그램 미디어**: 사진/동영상/오디오/음성/문서 텔레그램에서 자동 다운로드

## 스크린샷

**리스트 뷰 (기본):**
```
┌─────────────────────────────────────────────────────────────┐
│  Git Notepad    [+] [?] [⚙] [☀]                            │
├─────────────┬───────────────────────────────────────────────┤
│ [☰][📅]     │  # 제목                    │  # 제목          │
│ 📄 노트 1   │                            │                  │
│ 📄 노트 2   │  본문 내용...              │  본문 내용...    │
│ 📁 폴더     │                            │                  │
│   📄 하위   │  [Editor]                  │  [Preview]       │
└─────────────┴───────────────────────────────────────────────┘
```

**캘린더 뷰:**
```
┌─────────────────────────────────────────────────────────────┐
│  Git Notepad    [+] [?] [⚙] [☀]                            │
├─────────────┬───────────────────────────────────────────────┤
│ [☰][📅]     │  ◀  January 2025  ▶  [Today]   │ Jan 15, 2025  │
│             │  Su Mo Tu We Th Fr Sa          │ [+ New Note]  │
│             │      1  2  3  4  5  6          │               │
│             │   7  8  9 10 11 12 13          │ 📄 회의록     │
│             │  14 [15] 16 17 18 19 20        │ 📄 일기       │
│             │  21 22 23 24 25 26 27          │               │
│             │  28 29 30 31                   │               │
└─────────────┴───────────────────────────────────────────────┘
```

## 요구 사항

- Go 1.21 이상 (CGO 불필요)
- Git (버전 관리 기능 사용 시)

## 설치 및 실행

### 소스에서 빌드

```bash
# 저장소 클론
git clone https://github.com/playok/gitNotepad.git
cd gitNotepad

# 의존성 설치
make deps

# 빌드
make build

# 실행
./gitnotepad
```

### 바로 실행

```bash
make run
```

브라우저에서 `http://localhost:8080` 접속

### CLI 옵션

```bash
gitnotepad                             # 자동 모드 (초기 설정 필요 시 포그라운드, 아니면 데몬)
gitnotepad --help                      # 도움말 출력
gitnotepad --nginx                     # nginx 프록시 설정 가이드 출력
gitnotepad -config my.yaml             # 설정 파일 지정
gitnotepad --reset-password <username> # 사용자 비밀번호 리셋
```

### 데몬 명령어

```bash
gitnotepad start                       # 백그라운드 데몬 시작
gitnotepad stop                        # 데몬 중지
gitnotepad restart                     # 데몬 재시작
gitnotepad status                      # 데몬 상태 확인
gitnotepad run                         # 포그라운드 실행 (디버깅용)
gitnotepad start -config my.yaml       # 설정 파일 지정하여 시작
```

> **기본 동작**: 인자 없이 실행 시, 초기 설정이 필요하면 포그라운드로 실행하여 관리자 비밀번호를 설정하고, 설정이 완료되어 있으면 데몬 모드로 시작합니다.

## 초기 설정

### 관리자 비밀번호 설정

첫 실행 시 터미널에서 관리자 비밀번호를 입력받습니다:

```
╔════════════════════════════════════════════════════════════╗
║              Initial Admin Password Setup                  ║
╚════════════════════════════════════════════════════════════╝

Enter admin password:
Confirm admin password:
Admin password set successfully!
```

- **사용자명**: `admin` (config.yaml에서 변경 가능)
- **비밀번호**: 터미널에서 직접 입력 (SHA-512 해시로 config.yaml에 저장)

> 비밀번호는 평문으로 저장되지 않으며, SHA-512 해시가 config.yaml에 저장됩니다.

### 사용자 관리

관리자 계정으로 로그인 후:

1. 우측 상단 사용자 아이콘 클릭
2. "Manage Users" 선택
3. 새 사용자 추가 또는 기존 사용자 삭제

## 사용법

### 노트 생성

1. 사이드바 상단의 `+` 버튼 클릭
2. 노트 제목 입력
3. 문서 형식 선택 (MD/ADOC/TXT)
4. 내용 작성

### 노트 형식

| 형식 | 확장자 | 설명 |
|------|--------|------|
| Markdown | `.md` | GitHub Flavored Markdown 지원 |
| AsciiDoc | `.adoc` | 기술 문서 작성에 적합 |
| Text | `.txt` | 일반 텍스트 (미리보기 없음) |

### 폴더 구조

노트 제목에 `/`를 사용하여 폴더 구조 생성:

```
프로젝트/설계문서
프로젝트/회의록/2024-01
개인/일기
```

**노트 이동:**
1. 노트 목록에서 우클릭 → "이동..."
2. 모달에서 대상 폴더 선택
3. 루트 또는 기존 폴더로 이동

**새 노트 생성:**
1. `+` 버튼 클릭 시 위치 선택 모달 표시
2. 루트, 기존 폴더, 새 폴더 중 선택

### 비공개 노트

1. 에디터 상단의 🔒 아이콘 클릭
2. 비밀번호 설정
3. 다음 접근 시 비밀번호 입력 필요

### 파일 첨부

**이미지 붙여넣기:**
- 클립보드의 이미지를 `Ctrl+V`로 직접 붙여넣기

**파일 업로드:**
1. 에디터 상단의 📎 버튼 클릭
2. 파일 선택
3. 자동으로 마크다운 링크 삽입

### 버전 관리

**히스토리 보기:**
1. 에디터 상단의 🕐 버튼 클릭
2. 3패널 뷰: 버전 목록 + 이전 버전 + 현재 버전
3. 색상 범례로 변경 사항 확인 (빨강: 삭제, 초록: 추가)
4. 원하는 버전 선택하여 diff 비교
5. "Restore" 버튼으로 복원

### 노트 공유

**공유 링크 생성:**
1. 에디터 상단의 공유 버튼 클릭
2. 공개/비공개 설정
3. 만료일 설정 (Never 또는 날짜 선택)
4. 생성된 링크 복사하여 공유

**공유 옵션:**
- **공개 (Public)**: 로그인 없이 누구나 접근 가능
- **비공개 (Private)**: 로그인 필요

**만료 옵션:**
- `Never`: 무기한 유효
- 날짜 선택: 해당 날짜까지 유효

> 만료된 링크는 매일 자정에 자동 정리됩니다 (노트는 유지됨)

### 에디터/프리뷰 도킹

에디터 영역 상단의 레이아웃 컨트롤 버튼으로 다양한 레이아웃을 설정할 수 있습니다:

**레이아웃 버튼:**
- **⇔ 레이아웃 방향**: 가로/세로 전환
- **⇉ 프리뷰 위치**: 에디터/프리뷰 순서 변경
- **☷ 탭 모드**: 에디터와 프리뷰를 탭으로 전환
- **⧉ 팝아웃**: 프리뷰를 별도 창으로 분리

**팝아웃 프리뷰:**
- 별도 브라우저 창에서 프리뷰 표시
- 에디터 입력 시 실시간 동기화
- 듀얼 모니터 환경에서 유용

> 레이아웃 설정은 localStorage에 저장되어 브라우저 재시작 후에도 유지됩니다.

### JSON 포맷팅

1. JSON 텍스트 선택 (또는 전체)
2. `Ctrl+Shift+F` 또는 `{ }` 버튼 클릭
3. 자동으로 들여쓰기 적용

### 언어 설정

1. 우측 상단 ⚙ (Settings) 버튼 클릭
2. General 탭에서 Language 선택
3. English 또는 한국어 선택

> 언어 설정은 즉시 적용되며 localStorage에 저장됩니다.

### 캘린더 뷰

**미니 캘린더:**
- 사이드바 상단에 미니 캘린더 표시
- 노트가 있는 날짜는 점으로 표시

**캘린더 사용:**
1. 월 이동: ◀ / ▶ 버튼 또는 "Today" 버튼
2. 날짜 선택: 원하는 날짜 클릭
3. 노트 확인: 에디터 영역에 해당 날짜 노트 패널 표시
4. 노트 열기: 노트 항목 클릭 시 에디터로 이동

**날짜 이동 (드래그 앤 드롭):**
1. 날짜 패널의 노트 항목을 드래그
2. 원하는 날짜 셀에 드롭
3. 노트의 생성일이 해당 날짜로 변경됨

**새 노트 생성:**
1. 날짜 선택 후 "+ New Note" 버튼 클릭
2. `YYYY/MM/` 폴더에 자동 저장 (예: `2026/02/`)
3. 자동으로 날짜가 제목에 입력됨 (YYYY-MM-DD 형식)

## 설정

### config.yaml

```yaml
server:
  port: 8080          # 서버 포트
  host: "0.0.0.0"     # 바인딩 주소
  base_path: ""       # 서브 경로 (nginx 프록시용, 예: "/note")

storage:
  path: "./data"      # 노트 저장 경로
  auto_init_git: true # Git 자동 초기화

logging:
  encoding: ""        # "utf-8" (기본) 또는 "euc-kr"
  file: false         # 파일 로깅 활성화
  dir: "./logs"       # 로그 디렉토리 (일단위 롤링: gitnotepad.log.YYYY-MM-DD)
  max_age: 30         # 로그 보관 일수

editor:
  default_type: "markdown"  # 기본 문서 형식
  auto_save: true           # 자동 저장 (2초 후)

auth:
  enabled: true                # 인증 활성화
  session_timeout: 168         # 세션 만료 (시간)
  admin_username: "admin"      # 초기 관리자 ID
  admin_password_hash: ""      # SHA-512 해시 (첫 실행 시 자동 설정)

database:
  path: "./data/gitnotepad.db" # SQLite DB 경로

encryption:
  enabled: false               # 파일 암호화 활성화
  salt: ""                     # 암호화 salt (첫 실행 시 자동 생성)

daemon:
  pid_file: "./gitnotepad.pid" # PID 파일 경로

telegram:
  enabled: false              # 텔레그램 봇 활성화
  token: ""                   # @BotFather에서 받은 봇 토큰
  allowed_users: []           # 허용된 텔레그램 사용자 ID 목록
  default_folder: "Telegram"  # 노트 저장 기본 폴더
  default_username: "admin"   # 노트 저장 대상 사용자명
```

### 환경별 설정

**개발 환경:**
```yaml
server:
  port: 3000
auth:
  enabled: false  # 인증 비활성화
```

**프로덕션 환경:**
```yaml
server:
  host: "127.0.0.1"  # localhost만 허용
auth:
  enabled: true
encryption:
  enabled: true      # 파일 암호화 활성화
```

### Nginx 리버스 프록시

서브 경로(`/note`)에서 운영하려면:

**config.yaml:**
```yaml
server:
  port: 8080
  host: "127.0.0.1"
  base_path: "/note"  # 서브 경로 설정
```

**nginx.conf:**
```nginx
location /note {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 100M;  # 파일 업로드 크기 제한

    # WebSocket 지원
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

> **참고:** `client_max_body_size`는 파일 업로드 최대 크기를 설정합니다. nginx 기본값은 1MB입니다.

## 키보드 단축키

### 전역

| 단축키 | 기능 |
|--------|------|
| `Ctrl+N` | 새 노트 생성 |
| `Ctrl+S` | 저장 |
| `Ctrl+F` | 검색창 포커스 |
| `Ctrl+B` | 사이드바 토글 |
| `F1` 또는 `Ctrl+/` | 도움말 |
| `Esc` | 모달 닫기 |

### 에디터

| 단축키 | 기능 |
|--------|------|
| `Ctrl+E` | 에디터 전체화면 |
| `Ctrl+P` | 미리보기 전체화면 |
| `Ctrl+Shift+F` | JSON 포맷팅 |
| `Enter` | 마크다운 리스트 자동 계속 |

## Make 명령어

| 명령어 | 설명 |
|--------|------|
| `make` | 현재 OS용 빌드 |
| `make build` | 현재 OS용 빌드 |
| `make run` | 바로 실행 |
| `make dev` | config.yaml로 실행 |
| `make clean` | 빌드 결과물 삭제 |
| `make test` | 테스트 실행 |
| `make deps` | 의존성 설치 |
| `make tidy` | go.mod 정리 |
| `make linux` | Linux 빌드 (amd64, arm64) |
| `make windows` | Windows 빌드 |
| `make darwin` | macOS 빌드 (amd64, arm64) |
| `make release` | 모든 플랫폼 빌드 |

### Windows (make 없이)

Windows에서는 `build.cmd`를 사용할 수 있습니다:

```cmd
build          :: 현재 OS용 빌드
build run      :: 바로 실행
build dev      :: config.yaml로 실행
build clean    :: 빌드 결과물 삭제
build test     :: 테스트 실행
build deps     :: 의존성 설치
build tidy     :: go.mod 정리
build linux    :: Linux 빌드
build windows  :: Windows 빌드
build darwin   :: macOS 빌드
build release  :: 모든 플랫폼 빌드
build help     :: 도움말
```

## 디렉토리 구조

```
gitNotepad/
├── main.go                 # 진입점
├── config.yaml             # 설정 파일
├── internal/
│   ├── config/             # 설정 로드
│   ├── daemon/             # 데몬 관리, 로그 롤링
│   ├── database/           # SQLite 초기화
│   ├── encryption/         # AES-256 암호화
│   ├── git/                # Git 연동
│   ├── handler/            # HTTP 핸들러
│   ├── middleware/         # 인증 미들웨어
│   ├── model/              # 데이터 모델
│   ├── repository/         # DB 레포지토리
│   ├── server/             # 서버 설정
│   └── telegram/           # 텔레그램 봇 연동
├── web/
│   ├── static/
│   │   ├── css/            # 스타일시트
│   │   ├── js/             # JavaScript
│   │   └── lib/            # 외부 라이브러리 (오프라인용)
│   └── templates/          # HTML 템플릿
└── data/                   # 노트 저장소 (gitignore)
    ├── gitnotepad.db       # SQLite DB
    └── {username}/         # 사용자별 노트
        ├── .git/
        ├── note1.md
        └── images/
```

## API 엔드포인트

### 인증

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/auth/login` | 로그인 |
| POST | `/api/auth/logout` | 로그아웃 |
| GET | `/api/auth/me` | 현재 사용자 정보 |

### 노트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/notes` | 노트 목록 |
| GET | `/api/notes/:id` | 노트 조회 |
| POST | `/api/notes` | 노트 생성 |
| PUT | `/api/notes/:id` | 노트 수정 |
| DELETE | `/api/notes/:id` | 노트 삭제 |

### 파일

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/images` | 이미지 업로드 |
| POST | `/api/files` | 파일 업로드 |
| GET | `/api/git/history/:id` | 버전 히스토리 |
| GET | `/api/git/version/:id/:hash` | 특정 버전 조회 |

### 공유 링크

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/notes/:id/shortlink` | 단축 URL 생성 |
| GET | `/api/notes/:id/shortlink` | 단축 URL 조회 |
| DELETE | `/api/notes/:id/shortlink` | 단축 URL 삭제 |

### 태그

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/tags` | 모든 태그 목록 |

### 데이터 관리

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/stats` | 통계 조회 |
| GET | `/api/notes/export` | 노트 내보내기 |
| POST | `/api/notes/import` | 노트 가져오기 |
| DELETE | `/api/notes` | 모든 노트 삭제 |

### 관리자

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/admin/users` | 사용자 목록 |
| POST | `/api/admin/users` | 사용자 생성 |
| DELETE | `/api/admin/users/:id` | 사용자 삭제 |
| PUT | `/api/admin/users/:id/password` | 비밀번호 변경 |

## 파일 암호화

### 개요

노트 파일을 AES-256-GCM으로 암호화하여 저장합니다. 사용자 비밀번호에서 PBKDF2 키를 파생하여 암호화합니다.

### 활성화

`config.yaml`에서 암호화를 활성화합니다:

```yaml
encryption:
  enabled: true
  salt: ""  # 첫 실행 시 자동 생성
```

### 동작 방식

1. **키 파생**: 사용자 로그인 시 비밀번호와 salt로 PBKDF2 키 생성 (100,000 iterations, SHA-256)
2. **암호화**: 노트 저장 시 AES-256-GCM으로 암호화
3. **저장 형식**: `ENC:base64_encoded_ciphertext` 형태로 파일에 저장
4. **복호화**: 노트 로드 시 세션 키로 복호화

### 특징

- **세션 기반 키**: 암호화 키는 로그인 세션 동안만 메모리에 유지
- **하위 호환성**: 기존 암호화되지 않은 파일도 정상 읽기 가능
- **자동 salt 생성**: 첫 실행 시 보안 난수로 salt 자동 생성

### 주의사항

- 암호화 활성화 후에는 비밀번호 분실 시 데이터 복구 불가
- salt가 변경되면 기존 암호화된 파일 복호화 불가
- 여러 사용자가 같은 암호화된 노트에 접근하려면 같은 비밀번호 필요

## 텔레그램 봇 연동

텔레그램 메시지를 Git Notepad 노트로 자동 저장합니다.

### 동작 방식

봇은 **Long Polling** 방식을 사용합니다 - 봇이 텔레그램 서버로 아웃바운드 연결을 하므로 포트 포워딩이나 공인 IP가 필요 없습니다. NAT/방화벽 뒤에서도 동작합니다.

```
┌─────────────────┐                      ┌─────────────────┐
│   로컬 서버      │  ───(아웃바운드)───▶  │  Telegram API   │
│  (gitnotepad)   │  ◀───(응답)────────  │   (telegram.org)│
└─────────────────┘                      └─────────────────┘
```

### 설정 방법

1. **봇 생성**: 텔레그램에서 [@BotFather](https://t.me/BotFather)에게 메시지
   - `/newbot` 전송
   - 안내에 따라 봇 토큰 획득

2. **텔레그램 ID 확인**: [@userinfobot](https://t.me/userinfobot)에게 메시지
   - 본인의 숫자 ID를 알려줌

3. **config.yaml 설정**:
```yaml
telegram:
  enabled: true
  token: "123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
  allowed_users:
    - 123456789  # 본인 텔레그램 사용자 ID
  default_folder: "Telegram"
  default_username: "admin"
```

4. **gitnotepad 재시작**

### 봇 명령어

| 명령어 | 설명 |
|--------|------|
| `/start` | 도움말 표시 |
| `/info` | 봇 설정 정보 (폴더, 사용자, 본인 ID) |

### 사용법

1. 봇에게 텍스트, 사진, 동영상, 오디오, 문서 전송
2. 첨부파일과 함께 Markdown 노트로 자동 저장
3. 노트 제목 = 메시지 첫 줄 (최대 50자)
4. `telegram` 태그 자동 추가
5. 설정된 폴더에 저장 (기본: `Telegram`)

### 지원 미디어

| 유형 | 포맷 | 설명 |
|------|------|------|
| 사진 | JPG, PNG, GIF, WebP | 최고 해상도 다운로드 |
| 동영상 | MP4 | 원본 파일명 유지 |
| 오디오 | MP3, OGG, WAV, FLAC, M4A | 제목/아티스트 메타데이터 보존 |
| 음성 | OGG | 텔레그램 음성 메시지 |
| 애니메이션 | GIF | 움직이는 GIF |
| 문서 | PDF, ZIP 등 | 원본 파일명 보존 |

- **미디어 그룹 (앨범)**: 여러 미디어를 한꺼번에 보내면 하나의 노트로 저장
- **미디어 프리뷰**: 동영상/오디오 파일을 노트 프리뷰에서 바로 재생 가능

### 특징

- **보안**: 허용된 사용자만 노트 생성 가능
- **Git 자동 커밋**: 노트 + 첨부파일을 단일 커밋으로 저장
- **폴더 정리**: 모든 텔레그램 노트가 한 폴더에
- **제목 자동 생성**: 메시지 첫 줄이 제목이 됨
- **실시간 동기화**: WebSocket으로 브라우저 노트 목록 자동 갱신
- **미디어 다운로드**: UUID 파일명으로 저장, 원본 파일명 메타데이터 보존

## 문제 해결

### 포트 충돌

```bash
# 다른 포트로 실행
./gitnotepad -port 3000
```

또는 `config.yaml`에서 포트 변경

### Git 오류

```bash
# Git이 설치되어 있는지 확인
git --version

# data 디렉토리 초기화
rm -rf data/
./gitnotepad
```

### 데이터베이스 초기화

```bash
# SQLite DB 삭제 후 재시작
rm data/gitnotepad.db
./gitnotepad
```

## 변경 이력

[CHANGELOG.md](CHANGELOG.md)에서 버전별 변경 내역을 확인하세요.

## 라이선스

MIT License

## 기여

버그 리포트 및 기능 제안은 [GitHub Issues](https://github.com/playok/gitNotepad/issues)에서 받습니다.
