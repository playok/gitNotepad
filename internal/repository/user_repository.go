package repository

import (
	"database/sql"
	"fmt"

	"github.com/user/gitnotepad/internal/model"
)

type UserRepository struct {
	db *sql.DB
}

func NewUserRepository(db *sql.DB) *UserRepository {
	return &UserRepository{db: db}
}

// Create creates a new user
func (r *UserRepository) Create(user *model.User) error {
	result, err := r.db.Exec(
		"INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)",
		user.Username, user.PasswordHash, user.IsAdmin,
	)
	if err != nil {
		return fmt.Errorf("failed to create user: %w", err)
	}

	id, err := result.LastInsertId()
	if err != nil {
		return fmt.Errorf("failed to get user id: %w", err)
	}
	user.ID = id

	return nil
}

// GetByID retrieves a user by ID
func (r *UserRepository) GetByID(id int64) (*model.User, error) {
	user := &model.User{}
	err := r.db.QueryRow(
		"SELECT id, username, password_hash, is_admin, created_at FROM users WHERE id = ?",
		id,
	).Scan(&user.ID, &user.Username, &user.PasswordHash, &user.IsAdmin, &user.CreatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get user: %w", err)
	}
	return user, nil
}

// GetByUsername retrieves a user by username
func (r *UserRepository) GetByUsername(username string) (*model.User, error) {
	user := &model.User{}
	err := r.db.QueryRow(
		"SELECT id, username, password_hash, is_admin, created_at FROM users WHERE username = ?",
		username,
	).Scan(&user.ID, &user.Username, &user.PasswordHash, &user.IsAdmin, &user.CreatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get user: %w", err)
	}
	return user, nil
}

// List retrieves all users
func (r *UserRepository) List() ([]*model.User, error) {
	rows, err := r.db.Query(
		"SELECT id, username, password_hash, is_admin, created_at FROM users ORDER BY created_at DESC",
	)
	if err != nil {
		return nil, fmt.Errorf("failed to list users: %w", err)
	}
	defer rows.Close()

	var users []*model.User
	for rows.Next() {
		user := &model.User{}
		if err := rows.Scan(&user.ID, &user.Username, &user.PasswordHash, &user.IsAdmin, &user.CreatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan user: %w", err)
		}
		users = append(users, user)
	}

	return users, nil
}

// Update updates a user
func (r *UserRepository) Update(user *model.User) error {
	_, err := r.db.Exec(
		"UPDATE users SET username = ?, password_hash = ?, is_admin = ? WHERE id = ?",
		user.Username, user.PasswordHash, user.IsAdmin, user.ID,
	)
	if err != nil {
		return fmt.Errorf("failed to update user: %w", err)
	}
	return nil
}

// Delete deletes a user by ID
func (r *UserRepository) Delete(id int64) error {
	_, err := r.db.Exec("DELETE FROM users WHERE id = ?", id)
	if err != nil {
		return fmt.Errorf("failed to delete user: %w", err)
	}
	return nil
}
