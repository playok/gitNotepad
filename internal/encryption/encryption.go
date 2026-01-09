package encryption

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/pbkdf2"
)

const (
	// KeySize is the size of AES-256 key in bytes
	KeySize = 32
	// SaltSize is the size of salt for PBKDF2
	SaltSize = 32
	// NonceSize is the size of GCM nonce
	NonceSize = 12
	// PBKDF2Iterations is the number of iterations for key derivation
	PBKDF2Iterations = 100000
	// EncryptedPrefix is the prefix for encrypted content
	EncryptedPrefix = "ENC:"
)

// GenerateSalt generates a random salt for PBKDF2
func GenerateSalt() (string, error) {
	salt := make([]byte, SaltSize)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("failed to generate salt: %w", err)
	}
	return base64.StdEncoding.EncodeToString(salt), nil
}

// DeriveKey derives a 256-bit key from password using PBKDF2
func DeriveKey(password, salt string) ([]byte, error) {
	saltBytes, err := base64.StdEncoding.DecodeString(salt)
	if err != nil {
		return nil, fmt.Errorf("failed to decode salt: %w", err)
	}

	key := pbkdf2.Key([]byte(password), saltBytes, PBKDF2Iterations, KeySize, sha256.New)
	return key, nil
}

// Encrypt encrypts plaintext using AES-256-GCM
func Encrypt(plaintext, key []byte) (string, error) {
	if len(key) != KeySize {
		return "", errors.New("invalid key size")
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("failed to create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("failed to create GCM: %w", err)
	}

	// Generate random nonce
	nonce := make([]byte, NonceSize)
	if _, err := rand.Read(nonce); err != nil {
		return "", fmt.Errorf("failed to generate nonce: %w", err)
	}

	// Encrypt and append auth tag
	ciphertext := gcm.Seal(nonce, nonce, plaintext, nil)

	// Return as base64 with prefix
	return EncryptedPrefix + base64.StdEncoding.EncodeToString(ciphertext), nil
}

// Decrypt decrypts ciphertext using AES-256-GCM
func Decrypt(encrypted string, key []byte) ([]byte, error) {
	if len(key) != KeySize {
		return nil, errors.New("invalid key size")
	}

	// Check and remove prefix
	if !strings.HasPrefix(encrypted, EncryptedPrefix) {
		return nil, errors.New("invalid encrypted format")
	}
	encoded := strings.TrimPrefix(encrypted, EncryptedPrefix)

	// Decode base64
	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return nil, fmt.Errorf("failed to decode base64: %w", err)
	}

	if len(data) < NonceSize {
		return nil, errors.New("ciphertext too short")
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("failed to create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("failed to create GCM: %w", err)
	}

	// Extract nonce and ciphertext
	nonce := data[:NonceSize]
	ciphertext := data[NonceSize:]

	// Decrypt
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to decrypt: %w", err)
	}

	return plaintext, nil
}

// IsEncrypted checks if content is encrypted
func IsEncrypted(content string) bool {
	return strings.HasPrefix(content, EncryptedPrefix)
}
