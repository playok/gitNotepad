@echo off
setlocal enabledelayedexpansion

set BINARY_NAME=gitnotepad
set MAIN_FILE=main.go
set BUILD_DIR=build
set LDFLAGS=-s -w

if "%1"=="" goto build
if "%1"=="build" goto build
if "%1"=="run" goto run
if "%1"=="dev" goto dev
if "%1"=="clean" goto clean
if "%1"=="test" goto test
if "%1"=="deps" goto deps
if "%1"=="tidy" goto tidy
if "%1"=="linux" goto linux
if "%1"=="windows" goto windows
if "%1"=="darwin" goto darwin
if "%1"=="release" goto release
if "%1"=="help" goto help
goto unknown

:build
echo Building for current OS...
go build -ldflags "%LDFLAGS%" -o %BINARY_NAME%.exe %MAIN_FILE%
if %errorlevel%==0 echo Build successful: %BINARY_NAME%.exe
goto end

:run
echo Running...
go run %MAIN_FILE%
goto end

:dev
echo Running in dev mode...
go run %MAIN_FILE% -config config.yaml
goto end

:clean
echo Cleaning...
go clean
if exist %BINARY_NAME%.exe del %BINARY_NAME%.exe
if exist %BUILD_DIR% rmdir /s /q %BUILD_DIR%
echo Clean completed
goto end

:test
echo Running tests...
go test -v ./...
goto end

:deps
echo Downloading dependencies...
go mod download
goto end

:tidy
echo Tidying go.mod...
go mod tidy
goto end

:linux
echo Building for Linux...
if not exist %BUILD_DIR% mkdir %BUILD_DIR%
set GOOS=linux
set GOARCH=amd64
go build -ldflags "%LDFLAGS%" -o %BUILD_DIR%/%BINARY_NAME%-linux-amd64 %MAIN_FILE%
set GOARCH=arm64
go build -ldflags "%LDFLAGS%" -o %BUILD_DIR%/%BINARY_NAME%-linux-arm64 %MAIN_FILE%
set GOOS=
set GOARCH=
echo Linux builds completed
goto end

:windows
echo Building for Windows...
if not exist %BUILD_DIR% mkdir %BUILD_DIR%
set GOOS=windows
set GOARCH=amd64
go build -ldflags "%LDFLAGS%" -o %BUILD_DIR%/%BINARY_NAME%-windows-amd64.exe %MAIN_FILE%
set GOOS=
set GOARCH=
echo Windows build completed
goto end

:darwin
echo Building for macOS...
if not exist %BUILD_DIR% mkdir %BUILD_DIR%
set GOOS=darwin
set GOARCH=amd64
go build -ldflags "%LDFLAGS%" -o %BUILD_DIR%/%BINARY_NAME%-darwin-amd64 %MAIN_FILE%
set GOARCH=arm64
go build -ldflags "%LDFLAGS%" -o %BUILD_DIR%/%BINARY_NAME%-darwin-arm64 %MAIN_FILE%
set GOOS=
set GOARCH=
echo macOS builds completed
goto end

:release
call :clean
call :linux
call :windows
call :darwin
echo Release builds completed in %BUILD_DIR%/
goto end

:help
echo.
echo Git Notepad Build Script
echo.
echo Usage: build.bat [command]
echo.
echo Commands:
echo   build     Build for current OS (default)
echo   run       Run the application
echo   dev       Run with config.yaml
echo   clean     Remove build artifacts
echo   test      Run tests
echo   deps      Download dependencies
echo   tidy      Tidy go.mod
echo   linux     Cross-compile for Linux
echo   windows   Cross-compile for Windows
echo   darwin    Cross-compile for macOS
echo   release   Build for all platforms
echo   help      Show this help
echo.
goto end

:unknown
echo Unknown command: %1
goto help

:end
endlocal
