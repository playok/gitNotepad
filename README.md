# Git Notepad

Git 버전 관리가 통합된 웹 기반 노트 애플리케이션

## 주요 기능

- Markdown/텍스트 노트 편집
- Git 기반 버전 관리 (자동 커밋)
- 비밀번호 보호 노트
- 단축 URL 생성
- 이미지/파일 첨부
- 라이트/다크 테마

## 요구 사항

- Go 1.21 이상

## 설치 및 실행

```bash
# 저장소 클론
git clone https://github.com/user/gitnotepad.git
cd gitnotepad

# 의존성 설치
make deps

# 빌드 및 실행
make build
./gitnotepad
```

브라우저에서 `http://localhost:8080` 접속

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

## 설정

`config.yaml` 파일로 설정 변경 가능:

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

## 키보드 단축키

| 단축키 | 기능 |
|--------|------|
| `Ctrl+S` | 저장 |
| `Ctrl+B` | 사이드바 토글 |
| `F1` | 도움말 |

## 라이선스

MIT License
