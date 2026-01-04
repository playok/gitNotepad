# Git Notepad

Git 버전 관리가 통합된 웹 기반 노트 애플리케이션.

## 기술 스택

**Backend:** Go 1.25.4, Gin Framework, go-git/v5
**Frontend:** Vanilla JavaScript, Marked.js, Highlight.js
**Storage:** 파일 기반 (YAML frontmatter + Git)

## 프로젝트 구조

```
├── main.go                 # 애플리케이션 진입점
├── config.yaml             # 설정 파일
├── internal/
│   ├── config/config.go    # 설정 로딩
│   ├── model/note.go       # 노트 모델 및 파일 I/O
│   ├── git/repository.go   # Git 작업 래퍼
│   ├── handler/            # HTTP 핸들러
│   │   ├── note.go         # 노트 CRUD
│   │   ├── git.go          # 버전 히스토리
│   │   ├── auth.go         # 비밀번호 검증
│   │   ├── shortlink.go    # 단축 URL
│   │   ├── image.go        # 이미지 업로드
│   │   └── file.go         # 파일 업로드
│   └── server/server.go    # HTTP 서버 및 라우팅
├── web/
│   ├── static/
│   │   ├── css/style.css   # 스타일시트
│   │   └── js/app.js       # 프론트엔드 앱
│   └── templates/index.html
└── data/                   # 데이터 저장소 (Git 저장소)
```

## 빌드 및 실행

```bash
# 의존성 설치
go mod download

# 실행
go run main.go [-config config.yaml]

# 빌드
go build -o gitnotepad main.go
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
| GET | /api/notes/:id/history | Git 히스토리 |
| GET | /api/notes/:id/version/:commit | 특정 버전 조회 |
| POST | /api/auth/verify | 비밀번호 검증 |
| POST | /api/notes/:id/shortlink | 단축 URL 생성 |
| GET | /s/:code | 단축 URL 리다이렉트 |
| POST | /api/images | 이미지 업로드 |
| POST | /api/files | 파일 업로드 |

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
storage:
  path: "./data"
  auto_init_git: true
editor:
  default_type: "markdown"
  auto_save: false
```

## 주요 기능

- Markdown/텍스트 노트 편집
- Git 기반 버전 관리 (자동 커밋)
- 비밀번호 보호 (bcrypt)
- 단축 URL 생성
- 이미지/파일 첨부
- 라이트/다크 테마
- 키보드 단축키 (Ctrl+S 저장, Ctrl+B 사이드바, F1 도움말)

## 핵심 모듈

- **model/note.go**: 노트 구조체, bcrypt 해싱, YAML frontmatter 파싱
- **git/repository.go**: go-git 래퍼, 커밋/히스토리/파일 조회
- **handler/note.go**: 노트 CRUD API, 비밀번호 검증
- **server/server.go**: Gin 라우터 설정, 정적 파일 서빙

## 보안

- bcrypt 비밀번호 해싱 (cost 10)
- `X-Note-Password` 헤더로 비밀번호 전달
- UUID 기반 파일명으로 충돌 방지
- 경로 탐색 공격 방지
