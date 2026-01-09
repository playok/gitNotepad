package encoding

import (
	"bytes"
	"io"
	"strings"

	"golang.org/x/text/encoding/korean"
	"golang.org/x/text/transform"
)

// ToUTF8 converts bytes from the specified encoding to UTF-8
func ToUTF8(data []byte, enc string) ([]byte, error) {
	if strings.ToLower(enc) == "euc-kr" {
		reader := transform.NewReader(bytes.NewReader(data), korean.EUCKR.NewDecoder())
		return io.ReadAll(reader)
	}
	// Default: already UTF-8
	return data, nil
}

// FromUTF8 converts UTF-8 bytes to the specified encoding
func FromUTF8(data []byte, enc string) ([]byte, error) {
	if strings.ToLower(enc) == "euc-kr" {
		reader := transform.NewReader(bytes.NewReader(data), korean.EUCKR.NewEncoder())
		return io.ReadAll(reader)
	}
	// Default: keep as UTF-8
	return data, nil
}

// IsEUCKR checks if the encoding is EUC-KR
func IsEUCKR(enc string) bool {
	lower := strings.ToLower(enc)
	return lower == "euc-kr" || lower == "euckr"
}
