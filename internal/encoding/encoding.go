package encoding

import (
	"bytes"
	"fmt"
	"io"
	"os"
	"strings"

	"golang.org/x/text/encoding/korean"
	"golang.org/x/text/transform"
)

var (
	// LogEncoding is the encoding used for console logging output
	LogEncoding = "utf-8"
)

// Init initializes the log encoding based on config or LANG environment variable
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

// Log prints a message with proper encoding conversion for console output
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

// Logln prints a message with newline and proper encoding conversion
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

// Logf prints a formatted message with proper encoding conversion
func Logf(format string, args ...interface{}) {
	Log(format, args...)
}

// IsEUCKR returns true if the current log encoding is EUC-KR
func IsEUCKR() bool {
	lower := strings.ToLower(LogEncoding)
	return lower == "euc-kr" || lower == "euckr"
}
