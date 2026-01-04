# Git Notepad Makefile

BINARY_NAME=gitnotepad
MAIN_FILE=main.go
BUILD_DIR=build

# Go 설정
GOCMD=go
GOBUILD=$(GOCMD) build
GORUN=$(GOCMD) run
GOTEST=$(GOCMD) test
GOMOD=$(GOCMD) mod
GOCLEAN=$(GOCMD) clean

# 빌드 플래그
LDFLAGS=-ldflags "-s -w"

.PHONY: all build run clean test deps tidy linux windows darwin

# 기본 타겟
all: build

# 현재 OS용 빌드
build:
	$(GOBUILD) $(LDFLAGS) -o $(BINARY_NAME) $(MAIN_FILE)

# 실행
run:
	$(GORUN) $(MAIN_FILE)

# 개발 모드 실행 (설정 파일 지정)
dev:
	$(GORUN) $(MAIN_FILE) -config config.yaml

# 빌드 결과물 삭제
clean:
	$(GOCLEAN)
	rm -f $(BINARY_NAME)
	rm -rf $(BUILD_DIR)

# 테스트 실행
test:
	$(GOTEST) -v ./...

# 의존성 설치
deps:
	$(GOMOD) download

# go.mod 정리
tidy:
	$(GOMOD) tidy

# 크로스 컴파일 - Linux
linux:
	mkdir -p $(BUILD_DIR)
	GOOS=linux GOARCH=amd64 $(GOBUILD) $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME)-linux-amd64 $(MAIN_FILE)
	GOOS=linux GOARCH=arm64 $(GOBUILD) $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME)-linux-arm64 $(MAIN_FILE)

# 크로스 컴파일 - Windows
windows:
	mkdir -p $(BUILD_DIR)
	GOOS=windows GOARCH=amd64 $(GOBUILD) $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME)-windows-amd64.exe $(MAIN_FILE)

# 크로스 컴파일 - macOS
darwin:
	mkdir -p $(BUILD_DIR)
	GOOS=darwin GOARCH=amd64 $(GOBUILD) $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME)-darwin-amd64 $(MAIN_FILE)
	GOOS=darwin GOARCH=arm64 $(GOBUILD) $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME)-darwin-arm64 $(MAIN_FILE)

# 모든 플랫폼 빌드
release: clean linux windows darwin
	@echo "Release builds completed in $(BUILD_DIR)/"
