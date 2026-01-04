package repository

import (
	"database/sql"
	"fmt"

	"github.com/user/gitnotepad/internal/model"
)

type SessionRepository struct {
	db *sql.DB
}

func NewSessionRepository(db *sql.DB) *SessionRepository {
	return &SessionRepository{db: db}
}

// Create creates a new session
func (r *SessionRepository) Create(session *model.Session) error {
	result, err := r.db.Exec(
		"INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)",
		session.UserID, session.Token, session.ExpiresAt,
	)
	if err != nil {
		return fmt.Errorf("failed to create session: %w", err)
	}

	id, err := result.LastInsertId()
	if err != nil {
		return fmt.Errorf("failed to get session id: %w", err)
	}
	session.ID = id

	return nil
}

// GetByToken retrieves a session by token
func (r *SessionRepository) GetByToken(token string) (*model.Session, error) {
	session := &model.Session{}
	err := r.db.QueryRow(
		"SELECT id, user_id, token, expires_at, created_at FROM sessions WHERE token = ?",
		token,
	).Scan(&session.ID, &session.UserID, &session.Token, &session.ExpiresAt, &session.CreatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get session: %w", err)
	}
	return session, nil
}

// Delete deletes a session by token
func (r *SessionRepository) Delete(token string) error {
	_, err := r.db.Exec("DELETE FROM sessions WHERE token = ?", token)
	if err != nil {
		return fmt.Errorf("failed to delete session: %w", err)
	}
	return nil
}

// DeleteByUserID deletes all sessions for a user
func (r *SessionRepository) DeleteByUserID(userID int64) error {
	_, err := r.db.Exec("DELETE FROM sessions WHERE user_id = ?", userID)
	if err != nil {
		return fmt.Errorf("failed to delete user sessions: %w", err)
	}
	return nil
}

// DeleteExpired deletes all expired sessions
func (r *SessionRepository) DeleteExpired() error {
	_, err := r.db.Exec("DELETE FROM sessions WHERE expires_at < datetime('now')")
	if err != nil {
		return fmt.Errorf("failed to delete expired sessions: %w", err)
	}
	return nil
}
