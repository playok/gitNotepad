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
	token, err := generateToken(32)
	if err != nil {
		// This should never happen; if it does, the system's entropy source is broken
		panic("failed to generate secure session token: " + err.Error())
	}
	return &Session{
		UserID:    userID,
		Token:     token,
		ExpiresAt: time.Now().Add(duration),
		CreatedAt: time.Now(),
	}
}

// generateToken generates a cryptographically secure random token
func generateToken(length int) (string, error) {
	bytes := make([]byte, length)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

// IsExpired checks if the session has expired
func (s *Session) IsExpired() bool {
	return time.Now().After(s.ExpiresAt)
}
