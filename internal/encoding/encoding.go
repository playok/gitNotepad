package encoding

import (
	"bytes"
	"fmt"
	"io"
	"log"
	"os"
	"strings"

	"golang.org/x/text/encoding/korean"
	"golang.org/x/text/transform"
)

// Log levels
const (
	LevelDebug = iota
	LevelInfo
	LevelWarn
	LevelError
)

var (
	// LogEncoding is the encoding used for console logging output
	LogEncoding = "utf-8"

	// CurrentLevel is the current log level
	CurrentLevel = LevelInfo

	// levelNames maps level constants to their string names
	levelNames = map[int]string{
		LevelDebug: "DEBUG",
		LevelInfo:  "INFO",
		LevelWarn:  "WARN",
		LevelError: "ERROR",
	}

	// levelFromString maps string names to level constants
	levelFromString = map[string]int{
		"debug": LevelDebug,
		"info":  LevelInfo,
		"warn":  LevelWarn,
		"error": LevelError,
	}
)

// Init initializes the log encoding and level based on config
func Init(configEncoding string) {
	if configEncoding != "" {
		LogEncoding = strings.ToLower(configEncoding)
	} else {
		// Auto-detect from LANG environment variable
		lang := strings.ToLower(os.Getenv("LANG"))
		if strings.Contains(lang, "euckr") || strings.Contains(lang, "euc-kr") {
			LogEncoding = "euc-kr"
		}
	}
}

// SetLevel sets the current log level from string
func SetLevel(level string) {
	if l, ok := levelFromString[strings.ToLower(level)]; ok {
		CurrentLevel = l
	}
}

// GetLevel returns the current log level as string
func GetLevel() string {
	return levelNames[CurrentLevel]
}

// ToEUCKR converts UTF-8 string to EUC-KR bytes
func ToEUCKR(s string) ([]byte, error) {
	reader := transform.NewReader(strings.NewReader(s), korean.EUCKR.NewEncoder())
	return io.ReadAll(reader)
}

// FromEUCKR converts EUC-KR bytes to UTF-8 string
func FromEUCKR(data []byte) (string, error) {
	reader := transform.NewReader(bytes.NewReader(data), korean.EUCKR.NewDecoder())
	result, err := io.ReadAll(reader)
	if err != nil {
		return "", err
	}
	return string(result), nil
}

// logWithLevel logs a message with the specified level
func logWithLevel(level int, format string, args ...interface{}) {
	if level < CurrentLevel {
		return
	}

	prefix := fmt.Sprintf("[%s] ", levelNames[level])
	msg := prefix + fmt.Sprintf(format, args...)

	if strings.ToLower(LogEncoding) == "euc-kr" {
		if encoded, err := ToEUCKR(msg); err == nil {
			log.Print(string(encoded))
			return
		}
	}

	log.Print(msg)
}

// Debug logs a debug level message
func Debug(format string, args ...interface{}) {
	logWithLevel(LevelDebug, format, args...)
}

// Info logs an info level message
func Info(format string, args ...interface{}) {
	logWithLevel(LevelInfo, format, args...)
}

// Warn logs a warning level message
func Warn(format string, args ...interface{}) {
	logWithLevel(LevelWarn, format, args...)
}

// Error logs an error level message
func Error(format string, args ...interface{}) {
	logWithLevel(LevelError, format, args...)
}

// Log prints a message with proper encoding conversion for console output (legacy)
func Log(format string, args ...interface{}) {
	msg := fmt.Sprintf(format, args...)

	if strings.ToLower(LogEncoding) == "euc-kr" {
		if encoded, err := ToEUCKR(msg); err == nil {
			fmt.Print(string(encoded))
			return
		}
	}

	fmt.Print(msg)
}

// Logln prints a message with newline and proper encoding conversion (legacy)
func Logln(args ...interface{}) {
	msg := fmt.Sprintln(args...)

	if strings.ToLower(LogEncoding) == "euc-kr" {
		if encoded, err := ToEUCKR(msg); err == nil {
			fmt.Print(string(encoded))
			return
		}
	}

	fmt.Print(msg)
}

// Logf prints a formatted message with proper encoding conversion (legacy)
func Logf(format string, args ...interface{}) {
	Log(format, args...)
}

// IsEUCKR returns true if the current log encoding is EUC-KR
func IsEUCKR() bool {
	lower := strings.ToLower(LogEncoding)
	return lower == "euc-kr" || lower == "euckr"
}
