# Git Notepad

Git 버전 관리가 통합된 웹 기반 노트 애플리케이션.

## 기술 스택

**Backend:** Go 1.21+, Gin Framework, go-git/v5
**Frontend:** Vanilla JavaScript, CodeMirror 5, Marked.js, Highlight.js
**Database:** SQLite (modernc.org/sqlite - CGO 불필요, 크로스 플랫폼)
**Storage:** 파일 기반 (YAML frontmatter + Git)

## 프로젝트 구조

```
├── main.go                 # 애플리케이션 진입점 (--nginx 옵션 지원)
├── config.yaml             # 설정 파일
├── build.cmd               # Windows 빌드 스크립트
├── Makefile                # Linux/macOS 빌드
├── .goreleaser.yaml        # GoReleaser 릴리즈 자동화
├── internal/
│   ├── config/config.go    # 설정 로딩 (base_path 포함)
│   ├── daemon/daemon.go    # 데몬 프로세스 관리, 로그 롤링
│   ├── database/database.go # SQLite 초기화 (modernc.org/sqlite)
│   ├── encryption/         # AES-256 파일 암호화
│   │   ├── encryption.go   # AES-256-GCM 암호화/복호화, PBKDF2 키 파생
│   │   └── keystore.go     # 세션 기반 암호화 키 저장소
│   ├── model/note.go       # 노트 모델 및 파일 I/O
│   ├── git/repository.go   # Git 작업 래퍼
│   ├── handler/            # HTTP 핸들러
│   │   ├── note.go         # 노트 CRUD
│   │   ├── git.go          # 버전 히스토리
│   │   ├── auth.go         # 사용자 인증
│   │   ├── admin.go        # 사용자 관리 (관리자)
│   │   ├── shortlink.go    # 단축 URL (만료 기능 포함)
│   │   ├── image.go        # 이미지 업로드
│   │   ├── file.go         # 파일 업로드
│   │   └── stats.go        # 통계, 내보내기/가져오기
│   ├── encoding/encoding.go # 파일 인코딩 변환 (UTF-8/EUC-KR)
│   ├── middleware/         # 인증 미들웨어
│   ├── repository/         # DB 레포지토리
│   └── server/server.go    # HTTP 서버 및 라우팅
├── web/
│   ├── static/
│   │   ├── css/style.css   # 스타일시트
│   │   ├── js/app.js       # 프론트엔드 앱
│   │   └── lib/            # 외부 라이브러리 (오프라인용)
│   └── templates/
│       ├── index.html      # 메인 페이지
│       ├── login.html      # 로그인 페이지
│       └── expired.html    # 링크 만료 페이지
└── data/                   # 데이터 저장소
    ├── gitnotepad.db       # SQLite DB
    └── {username}/         # 사용자별 노트 (Git 저장소)
```

## 빌드 및 실행

```bash
# 의존성 설치
go mod download

# 실행
go run main.go [-config config.yaml]

# 빌드 (CGO 불필요)
go build -o gitnotepad main.go

# Windows (make 없이)
build.cmd
build.cmd run
```

**CLI 옵션:**
```bash
gitnotepad --help                      # 도움말
gitnotepad --nginx                     # nginx 프록시 설정 가이드 출력
gitnotepad -config my.yaml             # 설정 파일 지정
gitnotepad --reset-password <username> # 사용자 비밀번호 리셋
```

**데몬 명령어:**
```bash
gitnotepad start                       # 백그라운드 데몬 시작
gitnotepad stop                        # 데몬 중지
gitnotepad restart                     # 데몬 재시작
gitnotepad status                      # 데몬 상태 확인
gitnotepad start -config my.yaml       # 설정 파일 지정하여 시작
```

## 개발 워크플로우 (Claude Code)

기능 구현 완료 시 반드시 다음 절차를 수행:

1. **빌드**: `make build` 실행하여 컴파일 확인
2. **커밋**: 변경사항 git commit 및 push
3. **커밋 메시지**: 한글로 작성

```bash
make build && git add -A && git commit -m "feat: 기능 설명" && git push
```

**커밋 메시지 예시:**
- `feat: 사용자 인증 기능 추가`
- `fix: 폰트 파일 손상 문제 수정`
- `refactor: 코드 구조 개선`
- `docs: README 업데이트`

**비밀번호 리셋:**
```bash
# 특정 사용자의 비밀번호 리셋
gitnotepad --reset-password admin

# 다른 설정 파일 사용 시
gitnotepad --reset-password admin -config /path/to/config.yaml
```

기본 포트: `8080`

## 주요 API 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | /api/notes | 노트 목록 |
| GET | /api/notes/:id | 노트 조회 |
| POST | /api/notes | 노트 생성 |
| PUT | /api/notes/:id | 노트 수정 |
| DELETE | /api/notes/:id | 노트 삭제 |
| DELETE | /api/notes | 모든 노트 삭제 |
| GET | /api/notes/:id/history | Git 히스토리 |
| GET | /api/notes/:id/version/:commit | 특정 버전 조회 |
| POST | /api/auth/verify | 비밀번호 검증 |
| POST | /api/notes/:id/shortlink | 단축 URL 생성 |
| GET | /s/:code | 단축 URL 리다이렉트 |
| POST | /api/images | 이미지 업로드 |
| POST | /api/files | 파일 업로드 |
| GET | /api/stats | 통계 조회 |
| GET | /api/notes/export | 노트 내보내기 |
| POST | /api/notes/import | 노트 가져오기 |
| GET | /api/admin/users | 사용자 목록 (관리자) |
| POST | /api/admin/users | 사용자 생성 (관리자) |
| DELETE | /api/admin/users/:id | 사용자 삭제 (관리자) |
| PUT | /api/admin/users/:id/password | 비밀번호 변경 (관리자) |

## 노트 파일 형식

```markdown
---
title: 노트 제목
type: markdown
private: false
password: <bcrypt_hash>
created: 2025-12-30T12:00:00+09:00
modified: 2025-12-30T12:00:00+09:00
---

노트 내용...
```

- `.md` - Markdown 노트
- `.txt` - 텍스트 노트

## 설정 (config.yaml)

```yaml
server:
  port: 8080
  host: "0.0.0.0"
  base_path: ""        # nginx 프록시용 (예: "/note")
storage:
  path: "./data"
  auto_init_git: true
logging:
  encoding: ""         # "utf-8" (기본) 또는 "euc-kr" 콘솔 출력용 (LANG 환경변수에서 자동 감지)
  file: false          # 파일 로깅 활성화
  dir: "./logs"        # 로그 디렉토리 (일단위 롤링: gitnotepad.log.YYYY-MM-DD)
  max_age: 30          # 로그 보관 일수
editor:
  default_type: "markdown"
  auto_save: false
auth:
  enabled: true
  session_timeout: 168  # 7일
  admin_username: "admin"
  admin_password_hash: ""  # SHA-512 해시 (최초 실행 시 설정)
database:
  path: "./data/gitnotepad.db"
encryption:
  enabled: false  # AES-256 파일 암호화 활성화
  salt: ""        # PBKDF2 salt (최초 실행 시 자동 생성)
daemon:
  pid_file: "./gitnotepad.pid"  # PID 파일 경로
```

## 주요 기능

- Markdown/AsciiDoc/텍스트 노트 편집 (CodeMirror 5)
- Git 기반 버전 관리 (자동 커밋)
- 다중 사용자 인증 (SQLite)
- **관리자 비밀번호**: 최초 실행 시 터미널에서 입력, SHA-512 해시로 config.yaml에 저장
- **파일 암호화**: AES-256-GCM으로 노트 파일 암호화 (선택적), PBKDF2 키 파생
- 비밀번호 보호 (bcrypt)
- 단축 URL 생성 (만료일 설정 가능)
- 이미지/파일 첨부 (원본 파일명 복원 지원)
- **4개 테마**: Light, Dark, Dark High Contrast, Dark Cyan
- nginx 리버스 프록시 지원 (base_path)
- 크로스 플랫폼 빌드 (CGO 불필요)
- 키보드 단축키 (Ctrl+S 저장, Ctrl+B 사이드바, F1 도움말)
- **편집 툴바**: Markdown/AsciiDoc 서식 버튼, 표 그리드 선택기
- **AsciiDoc 테이블 에디터**: 드래그로 셀 선택, 병합/해제, span 문법 자동 생성
- **KaTeX 수식 렌더링**: LaTeX 문법 지원 ($...$, $$...$$)
- **캘린더 뷰**: 사이드바 미니 캘린더, 날짜별 노트 관리, Daily 폴더 자동 생성
- **폴더 관리**: 드래그 앤 드롭, 폴더 펼치기/닫기, 아이콘 변경
- **자동 저장**: 에디터 툴바에서 토글 가능 (기본: 비활성화)
- **다국어 지원 (i18n)**: 영어/한국어, Settings 다이얼로그 포함
- **로깅 인코딩**: 콘솔 출력 EUC-KR 지원 (파일은 항상 UTF-8), LANG 환경변수 자동 감지
- **데몬 모드**: 백그라운드 실행 (start/stop/restart/status), PID 파일 관리
- **로그 롤링**: file-rotatelogs 기반 일단위 로깅, 자동 롤링 (`gitnotepad.log.YYYY-MM-DD`)

## 핵심 모듈

- **model/note.go**: 노트 구조체, bcrypt 해싱, YAML frontmatter 파싱
- **git/repository.go**: go-git 래퍼, 커밋/히스토리/파일 조회
  - EOF 에러 처리 (빈 커밋 방지)
  - staged 변경사항 체크 (Added, Modified, Deleted만 커밋)
  - Windows 경로 호환성: `filepath.ToSlash()` 적용 (go-git은 forward slash 필요)
- **handler/note.go**: 노트 CRUD API, 비밀번호 검증
  - 폴더 경로 처리: 타이틀에서 폴더 경로 추출, 파일 이동
  - 절대 경로 사용: `filepath.Abs()` 적용으로 Git 경로 일관성 보장
- **encoding/encoding.go**: 콘솔 로깅 인코딩 유틸리티
  - `Log()`, `Logln()`, `Logf()`: EUC-KR 인코딩 지원 로깅 함수
  - `Init()`: config 또는 LANG 환경변수에서 인코딩 초기화
  - 파일 저장은 항상 UTF-8, 콘솔 출력만 EUC-KR 변환 지원
- **daemon/daemon.go**: 데몬 프로세스 관리
  - `Start()`: 백그라운드 프로세스 시작 (fork, setsid)
  - `Stop()`: SIGTERM 후 SIGKILL 전송, PID 파일 삭제
  - `Restart()`: Stop 후 Start 호출
  - `Status()`: PID 파일 기반 상태 확인
  - `SetupLogging()`: 포그라운드 모드 (콘솔 + 파일)
  - `SetupLoggingFileOnly()`: 데몬 모드 (파일만, 일단위 롤링)
  - 로그 파일 형식: `gitnotepad.log.YYYY-MM-DD`, symlink: `gitnotepad.log`
- **encryption/encryption.go**: AES-256-GCM 암호화 모듈
  - `DeriveKey()`: PBKDF2 키 파생 (100,000 iterations)
  - `Encrypt()` / `Decrypt()`: AES-256-GCM 암호화/복호화
  - `IsEncrypted()`: 암호화 여부 체크 (`ENC:` prefix)
  - `GenerateSalt()`: 보안 난수 salt 생성
- **encryption/keystore.go**: 세션 기반 암호화 키 저장소
  - 로그인 시 키 저장, 로그아웃 시 삭제
  - 스레드 안전 (sync.RWMutex)
- **middleware/auth.go**: 인증 미들웨어
  - `RequireAuth()`: 인증 필수, 미인증 시 401 또는 로그인 리다이렉트
  - `OptionalAuth()`: 인증 선택적, 인증 시 사용자 컨텍스트 설정, 미인증 시에도 진행
  - `RequireAdmin()`: 관리자 권한 필수
  - `GetCurrentUser(c)`: 컨텍스트에서 현재 사용자 조회
  - `GetEncryptionKey(c)`: 컨텍스트에서 암호화 키 조회
- **handler/shortlink.go**: 단축 URL 생성/조회, 만료일 관리, 자정 정리 스케줄러
- **handler/admin.go**: 사용자 관리 (목록/생성/삭제/비밀번호 변경)
- **handler/stats.go**: 통계 조회, 노트 내보내기/가져오기
- **server/server.go**: Gin 라우터 설정, base_path 그룹 라우팅, 임베디드 정적 파일 서빙
- **web/static/js/app.js**: CodeMirror 에디터, getEditorContent()/setEditorContent() 헬퍼
  - 편집 툴바: `applyFormat()`, `applyAsciiDocFormat()` - Markdown/AsciiDoc 서식 적용
  - 표 그리드 선택기: `initTableGridSelector()`, 8x8 드래그로 행/열 선택
  - AsciiDoc 테이블 에디터: `openTableEditor()`, `mergeCells()`, `insertTableFromEditor()`
  - 캘린더 뷰: `initMiniCalendar()`, `renderMiniCalendar()`, Daily 폴더 자동 생성
  - 드래그 앤 드롭: 캘린더 날짜 이동, 폴더 드래그 앤 드롭
  - 자동 저장: `autoSaveEnabled` 플래그, `isSaving` 중복 저장 방지
- **web/static/js/i18n.js**: 다국어 지원 (영어/한국어)
  - Settings 다이얼로그, 툴바, 테이블 에디터 번역 키 포함
- **handler/file.go**, **handler/image.go**: 파일 메타데이터 저장
  - `.filemeta.json`, `.imagemeta.json`: UUID-원본파일명 매핑
  - `?download=true` 파라미터로 원본 파일명 복원

## 빌드 및 배포

- **임베디드 리소스**: 템플릿과 정적 파일이 바이너리에 포함됨 (go:embed)
- **GoReleaser**: `.goreleaser.yaml`로 멀티 플랫폼 릴리즈 자동화
- **지원 플랫폼**: Linux (amd64, arm64), macOS (amd64, arm64), Windows (amd64, arm64)

## 보안

- bcrypt 비밀번호 해싱 (cost 10)
- `X-Note-Password` 헤더로 비밀번호 전달
- UUID 기반 파일명으로 충돌 방지
- 경로 탐색 공격 방지
- **파일 암호화** (선택적):
  - AES-256-GCM 인증 암호화
  - PBKDF2 키 파생 (100,000 iterations, SHA-256)
  - 세션 기반 키 저장 (메모리에만 유지)
  - 암호화된 파일 형식: `ENC:base64_encoded_ciphertext`

## UI/UX

### Settings 다이얼로그
- 컴팩트 디자인 (560px, iOS 스타일 그룹 설정)
- 탭 구성: General, Data, About
- 토글 스위치: 36x20px (iOS 스타일)
- i18n 적용 (`data-i18n` 속성)

### 에디터 툴바
- Markdown/AsciiDoc 서식 버튼 (Bold, Italic, Heading, Link, Image, Code, List, Table 등)
- 표 그리드 선택기: 8x8 그리드에서 드래그로 행/열 선택
- AsciiDoc 테이블 에디터: 셀 병합/해제, span 문법 자동 생성 (2+, .2+, 2.2+)
- 자동 저장 토글 체크박스
- localStorage에 설정 저장
- i18n 툴팁 지원

## 폴더 관리

### 기능
- 드래그 앤 드롭으로 노트를 폴더로 이동
- 폴더 내에서 새 노트 생성
- 트리 구조로 폴더/노트 표시

### 구현 세부사항
- **파일 이동**: Update 핸들러에서 타이틀의 폴더 경로 추출 후 파일 이동
- **경로 정규화**: Windows/Unix 경로 호환성 (`filepath.ToSlash()`)
- **중복 저장 방지**: `isSaving` 플래그로 자동 저장과 수동 저장 충돌 방지
- **트리 렌더링**: `renderTreeLevel()`에서 `isChild` 플래그로 들여쓰기 표시

## 캘린더 뷰

### 기능
- 사이드바 상단 미니 캘린더 (노트 목록 위)
- 날짜별 노트 매핑 (노트의 created 날짜 기준)
- 날짜 선택 시 에디터 영역에 해당 날짜 노트 패널 표시
- 노트 드래그 앤 드롭으로 날짜 이동
- **Daily 폴더 자동 생성**: 캘린더에서 새 노트 생성 시 `Daily/YYYY.MM/` 폴더에 저장

### 구현 세부사항
- **미니 캘린더**: `initMiniCalendar()`, `renderMiniCalendar()` - 사이드바에 표시
- **날짜 노트 패널**: 날짜 클릭 시 에디터 영역에 해당 날짜 노트 목록 표시
- **날짜-노트 매핑**: `buildNotesMapByDate()` - notes 배열에서 created 날짜 기준 맵 생성
- **Daily 폴더 자동 생성**: `createNoteForDate()`, `ensureDailyFolderExists()`
  - Daily 폴더와 년.월 하위 폴더 자동 생성
  - 자동 생성된 폴더는 기본 collapsed 상태
- **드래그 앤 드롭**: HTML5 Drag API 사용
  - PUT `/api/notes/:id`에 `created` 필드 전송하여 날짜 변경
- **CSS 클래스**: `.mini-calendar`, `.date-notes-panel`, `.calendar-day.has-notes`

### API 변경사항
- `NoteListItem`에 `Created` 필드 추가
- `UpdateNoteRequest`에 `Created *time.Time` 필드 추가 (옵셔널)
