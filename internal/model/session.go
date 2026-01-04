package model

import (
	"crypto/rand"
	"encoding/hex"
	"time"
)

type Session struct {
	ID        int64     `json:"id"`
	UserID    int64     `json:"user_id"`
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expires_at"`
	CreatedAt time.Time `json:"created_at"`
}

// NewSession creates a new session with a random token
func NewSession(userID int64, duration time.Duration) *Session {
	return &Session{
		UserID:    userID,
		Token:     generateToken(32),
		ExpiresAt: time.Now().Add(duration),
		CreatedAt: time.Now(),
	}
}

// generateToken generates a cryptographically secure random token
func generateToken(length int) string {
	bytes := make([]byte, length)
	if _, err := rand.Read(bytes); err != nil {
		// Fallback to timestamp-based token (not recommended for production)
		return hex.EncodeToString([]byte(time.Now().String()))
	}
	return hex.EncodeToString(bytes)
}

// IsExpired checks if the session has expired
func (s *Session) IsExpired() bool {
	return time.Now().After(s.ExpiresAt)
}
