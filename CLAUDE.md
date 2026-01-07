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
│   ├── database/database.go # SQLite 초기화 (modernc.org/sqlite)
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
gitnotepad --help           # 도움말
gitnotepad --nginx          # nginx 프록시 설정 가이드 출력
gitnotepad -config my.yaml  # 설정 파일 지정
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
editor:
  default_type: "markdown"
  auto_save: false
auth:
  enabled: true
  session_timeout: 168  # 7일
  admin_username: "admin"
  admin_password: "admin123"
database:
  path: "./data/gitnotepad.db"
```

## 주요 기능

- Markdown/AsciiDoc/텍스트 노트 편집 (CodeMirror 5)
- Git 기반 버전 관리 (자동 커밋)
- 다중 사용자 인증 (SQLite)
- 비밀번호 보호 (bcrypt)
- 단축 URL 생성 (만료일 설정 가능)
- 이미지/파일 첨부
- 라이트/다크 테마
- nginx 리버스 프록시 지원 (base_path)
- 크로스 플랫폼 빌드 (CGO 불필요)
- 키보드 단축키 (Ctrl+S 저장, Ctrl+B 사이드바, F1 도움말)

## 핵심 모듈

- **model/note.go**: 노트 구조체, bcrypt 해싱, YAML frontmatter 파싱
- **git/repository.go**: go-git 래퍼, 커밋/히스토리/파일 조회
  - EOF 에러 처리 (빈 커밋 방지)
  - staged 변경사항 체크 (Added, Modified, Deleted만 커밋)
- **handler/note.go**: 노트 CRUD API, 비밀번호 검증
- **handler/shortlink.go**: 단축 URL 생성/조회, 만료일 관리, 자정 정리 스케줄러
- **handler/admin.go**: 사용자 관리 (목록/생성/삭제/비밀번호 변경)
- **handler/stats.go**: 통계 조회, 노트 내보내기/가져오기
- **server/server.go**: Gin 라우터 설정, base_path 그룹 라우팅, 임베디드 정적 파일 서빙
- **web/static/js/app.js**: CodeMirror 에디터, getEditorContent()/setEditorContent() 헬퍼

## 빌드 및 배포

- **임베디드 리소스**: 템플릿과 정적 파일이 바이너리에 포함됨 (go:embed)
- **GoReleaser**: `.goreleaser.yaml`로 멀티 플랫폼 릴리즈 자동화
- **지원 플랫폼**: Linux (amd64, arm64), macOS (amd64, arm64), Windows (amd64, arm64)

## 보안

- bcrypt 비밀번호 해싱 (cost 10)
- `X-Note-Password` 헤더로 비밀번호 전달
- UUID 기반 파일명으로 충돌 방지
- 경로 탐색 공격 방지
